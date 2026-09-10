package com.fpvarabic.elrs.bridge

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import java.io.IOException
import java.io.OutputStream
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * [DocumentStore] over Android's Storage Access Framework.
 *
 * This is the part a fake stands in for, in the same way [AndroidUsbBackend] is
 * for USB: an emulator has no operator to tap a picker, so every rule this class
 * obeys is tested through `FakeDocumentStore` and only the SAF plumbing itself
 * waits for a physical run.
 *
 * ## Why it blocks
 *
 * The picker is an Activity result, which arrives on the main thread. Every call
 * here runs on [BridgeCore]'s single worker thread — never the main thread — so
 * waiting on a queue for that result is correct and is what keeps the bridge's
 * chunk ordering intact. The waits are bounded so a lost result cannot pin the
 * worker forever, and [abandon] releases them when the host leaves the screen.
 */
class AndroidDocumentStore(
    private val context: Context,
    private val launcher: DocumentPickerLauncher,
) : DocumentStore {

    /**
     * Whatever can actually start a picker. An interface so this class does not
     * depend on an Activity, and so a test can drive it without one.
     */
    interface DocumentPickerLauncher {
        /** Starts `ACTION_CREATE_DOCUMENT` and delivers the chosen Uri, or null. */
        fun createDocument(suggestedName: String, mimeType: String, onResult: (Uri?) -> Unit)

        /** Starts `ACTION_OPEN_DOCUMENT` and delivers the chosen Uri, or null. */
        fun openDocument(mimeType: String, onResult: (Uri?) -> Unit)
    }

    private class PendingWrite(
        val uri: Uri,
        val stream: OutputStream,
        var written: Long = 0,
    )

    @Volatile private var pending: PendingWrite? = null

    private fun awaitUri(start: ((Uri?) -> Unit) -> Unit): Uri? {
        // Capacity one, and the result is offered rather than put, so a
        // duplicate callback cannot block the main thread.
        val results = ArrayBlockingQueue<Array<Uri?>>(1)
        start { uri -> results.offer(arrayOf(uri)) }
        val answer = results.poll(PICKER_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        return answer?.get(0)
    }

    override fun create(suggestedName: String, mimeType: String): DocumentStore.Outcome {
        if (pending != null) {
            return DocumentStore.Refused(
                DocumentStore.Reason.WRITE_ALREADY_OPEN,
                "another document is already being written",
            )
        }
        val uri = awaitUri { onResult -> launcher.createDocument(suggestedName, mimeType, onResult) }
            ?: return DocumentStore.Refused(
                DocumentStore.Reason.PICKER_CANCELLED,
                "no location was chosen",
            )
        val stream = runCatching { context.contentResolver.openOutputStream(uri, "wt") }
            .getOrNull()
            ?: return DocumentStore.Refused(
                DocumentStore.Reason.WRITE_FAILED,
                "the chosen location could not be opened for writing",
            )
        pending = PendingWrite(uri, stream)
        return DocumentStore.Created(uri.toString(), displayNameOf(uri))
    }

    override fun write(location: String, bytes: ByteArray, offset: Long): DocumentStore.Outcome {
        val active = pending
            ?: return DocumentStore.Refused(
                DocumentStore.Reason.NO_PENDING_WRITE,
                "no document is open for writing",
            )
        if (active.uri.toString() != location) {
            return DocumentStore.Refused(
                DocumentStore.Reason.NO_PENDING_WRITE,
                "that document is not the one being written",
            )
        }
        // A gap or a repeat would corrupt the file silently, which is the one
        // outcome a recovery archive must never have.
        if (offset != active.written) {
            return DocumentStore.Refused(
                DocumentStore.Reason.OFFSET_OUT_OF_ORDER,
                "expected offset ${active.written}, received $offset",
            )
        }
        return try {
            active.stream.write(bytes)
            active.written += bytes.size
            DocumentStore.Progress(active.written)
        } catch (error: IOException) {
            discard()
            DocumentStore.Refused(reasonFor(error), error.message ?: "the write failed")
        }
    }

    override fun commit(location: String): DocumentStore.Outcome {
        val active = pending
            ?: return DocumentStore.Refused(
                DocumentStore.Reason.NO_PENDING_WRITE,
                "no document is open for writing",
            )
        if (active.uri.toString() != location) {
            return DocumentStore.Refused(
                DocumentStore.Reason.NO_PENDING_WRITE,
                "that document is not the one being written",
            )
        }
        return try {
            active.stream.flush()
            active.stream.close()
            pending = null
            DocumentStore.Committed(
                location = active.uri.toString(),
                displayName = displayNameOf(active.uri),
                byteLength = active.written,
            )
        } catch (error: IOException) {
            discard()
            DocumentStore.Refused(reasonFor(error), error.message ?: "the document could not be closed")
        }
    }

    override fun read(location: String, offset: Long, maxBytes: Int): DocumentStore.Outcome {
        val uri = runCatching { Uri.parse(location) }.getOrNull()
            ?: return DocumentStore.Refused(
                DocumentStore.Reason.DOCUMENT_NOT_FOUND,
                "that location is not a document",
            )
        return try {
            context.contentResolver.openInputStream(uri).use { input ->
                if (input == null) {
                    return DocumentStore.Refused(
                        DocumentStore.Reason.DOCUMENT_NOT_FOUND,
                        "the document could not be opened",
                    )
                }
                var skipped = 0L
                while (skipped < offset) {
                    val step = input.skip(offset - skipped)
                    if (step <= 0) break
                    skipped += step
                }
                if (skipped < offset) {
                    return DocumentStore.Chunk(ByteArray(0), eof = true)
                }
                val buffer = ByteArray(maxBytes)
                var filled = 0
                while (filled < maxBytes) {
                    val read = input.read(buffer, filled, maxBytes - filled)
                    if (read < 0) break
                    filled += read
                }
                DocumentStore.Chunk(buffer.copyOf(filled), eof = filled < maxBytes)
            }
        } catch (error: IOException) {
            DocumentStore.Refused(
                DocumentStore.Reason.READ_FAILED,
                error.message ?: "the document could not be read",
            )
        } catch (error: SecurityException) {
            // The grant can be gone by the time it is read back — a revoked
            // permission, a removed SD card, a provider that died.
            DocumentStore.Refused(
                DocumentStore.Reason.DOCUMENT_NOT_FOUND,
                error.message ?: "access to the document was withdrawn",
            )
        }
    }

    override fun pick(mimeType: String): DocumentStore.Outcome {
        val uri = awaitUri { onResult -> launcher.openDocument(mimeType, onResult) }
            ?: return DocumentStore.Refused(
                DocumentStore.Reason.PICKER_CANCELLED,
                "no document was chosen",
            )
        return DocumentStore.Created(uri.toString(), displayNameOf(uri))
    }

    override fun abandon() {
        discard()
    }

    private fun discard() {
        val active = pending ?: return
        pending = null
        runCatching { active.stream.close() }
    }

    /**
     * A full destination is reported by message rather than by type: Android
     * surfaces it as a plain [IOException], and the operator needs to be told
     * to free space rather than to retry.
     */
    private fun reasonFor(error: IOException): String {
        val text = error.message?.lowercase().orEmpty()
        return if (text.contains("space") || text.contains("enospc") || text.contains("quota")) {
            DocumentStore.Reason.NO_SPACE
        } else {
            DocumentStore.Reason.WRITE_FAILED
        }
    }

    private fun displayNameOf(uri: Uri): String {
        val projection = arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
        val name = runCatching {
            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        }.getOrNull()
        // Falling back to the last path segment keeps the operator told *where*
        // it is even when the provider will not answer for a name.
        return name ?: uri.lastPathSegment ?: uri.toString()
    }

    private companion object {
        /**
         * A picker the operator never answers must not pin the bridge's worker
         * thread for the life of the process. Long enough for someone to find a
         * folder, short enough to be a refusal rather than a hang.
         */
        const val PICKER_TIMEOUT_SECONDS = 300L
    }
}
