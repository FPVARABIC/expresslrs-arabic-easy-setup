package com.fpvarabic.elrs.bridge

import java.util.concurrent.atomic.AtomicInteger

/**
 * A document provider in memory, able to misbehave on purpose.
 *
 * An emulator has no operator to tap a Storage Access Framework picker, so this
 * stands in for one — and, more importantly, it can do the things real storage
 * does that the durable-recovery gate has to refuse: dismiss the picker, run out
 * of room, hand back fewer bytes than it was given, or hand back different ones.
 * A store that could only succeed would prove none of that.
 */
class FakeDocumentStore(
    /** Dismiss the create picker, the way an operator tapping Back does. */
    var dismissCreate: Boolean = false,
    /** Dismiss the open picker. */
    var dismissPick: Boolean = false,
    /** Refuse the write with NO_SPACE after this many bytes. */
    var spaceLimit: Long = Long.MAX_VALUE,
    /** Flip the first byte on the way back out, without changing the length. */
    var corruptOnRead: Boolean = false,
    /** Drop the last byte on the way back out. */
    var truncateOnRead: Boolean = false,
    /** What the open picker hands back, for the import path. */
    var importable: ByteArray? = null,
) : DocumentStore {

    private class Document(val displayName: String, var bytes: ByteArray, var open: Boolean)

    private val documents = LinkedHashMap<String, Document>()
    private val counter = AtomicInteger(0)

    /** How many documents were committed. A create that was never committed is not one. */
    val committedCount: Int get() = documents.values.count { !it.open }

    /** The bytes of the most recently committed document, or null. */
    fun committedBytes(): ByteArray? =
        documents.values.lastOrNull { !it.open }?.bytes

    /** Whether a half-written document is still sitting there. */
    val hasPendingWrite: Boolean get() = documents.values.any { it.open }

    override fun create(suggestedName: String, mimeType: String): DocumentStore.Outcome {
        if (dismissCreate) {
            return DocumentStore.Refused(
                DocumentStore.Reason.PICKER_CANCELLED,
                "no location was chosen",
            )
        }
        if (hasPendingWrite) {
            return DocumentStore.Refused(
                DocumentStore.Reason.WRITE_ALREADY_OPEN,
                "another document is already being written",
            )
        }
        val location = "fake://document/${counter.incrementAndGet()}"
        documents[location] = Document(suggestedName, ByteArray(0), open = true)
        return DocumentStore.Created(location, suggestedName)
    }

    override fun write(location: String, bytes: ByteArray, offset: Long): DocumentStore.Outcome {
        val document = documents[location]
            ?: return DocumentStore.Refused(
                DocumentStore.Reason.DOCUMENT_NOT_FOUND,
                "no such document",
            )
        if (!document.open) {
            return DocumentStore.Refused(
                DocumentStore.Reason.NO_PENDING_WRITE,
                "that document is already committed",
            )
        }
        if (offset != document.bytes.size.toLong()) {
            return DocumentStore.Refused(
                DocumentStore.Reason.OFFSET_OUT_OF_ORDER,
                "expected offset ${document.bytes.size}, received $offset",
            )
        }
        if (document.bytes.size + bytes.size > spaceLimit) {
            return DocumentStore.Refused(
                DocumentStore.Reason.NO_SPACE,
                "the destination is full",
            )
        }
        document.bytes = document.bytes + bytes
        return DocumentStore.Progress(document.bytes.size.toLong())
    }

    override fun commit(location: String): DocumentStore.Outcome {
        val document = documents[location]
            ?: return DocumentStore.Refused(
                DocumentStore.Reason.DOCUMENT_NOT_FOUND,
                "no such document",
            )
        document.open = false
        return DocumentStore.Committed(
            location = location,
            displayName = document.displayName,
            byteLength = document.bytes.size.toLong(),
        )
    }

    override fun read(location: String, offset: Long, maxBytes: Int): DocumentStore.Outcome {
        val document = documents[location]
            ?: return DocumentStore.Refused(
                DocumentStore.Reason.DOCUMENT_NOT_FOUND,
                "no such document",
            )
        var stored = document.bytes
        if (corruptOnRead && stored.isNotEmpty()) {
            stored = stored.copyOf()
            stored[0] = (stored[0].toInt() xor 0xff).toByte()
        }
        if (truncateOnRead && stored.isNotEmpty()) {
            stored = stored.copyOf(stored.size - 1)
        }
        if (offset >= stored.size) return DocumentStore.Chunk(ByteArray(0), eof = true)
        val end = minOf(stored.size.toLong(), offset + maxBytes).toInt()
        val slice = stored.copyOfRange(offset.toInt(), end)
        return DocumentStore.Chunk(slice, eof = end >= stored.size)
    }

    override fun pick(mimeType: String): DocumentStore.Outcome {
        if (dismissPick) {
            return DocumentStore.Refused(
                DocumentStore.Reason.PICKER_CANCELLED,
                "no document was chosen",
            )
        }
        val bytes = importable
            ?: return DocumentStore.Refused(
                DocumentStore.Reason.PICKER_CANCELLED,
                "no document was chosen",
            )
        val location = "fake://imported/${counter.incrementAndGet()}"
        documents[location] = Document("imported-recovery.zip", bytes, open = false)
        return DocumentStore.Created(location, "imported-recovery.zip")
    }

    override fun abandon() {
        // Exactly what SAF-backed storage does when the host leaves the screen:
        // the half-written document does not become a complete-looking file.
        documents.entries.removeAll { (_, document) -> document.open }
    }
}
