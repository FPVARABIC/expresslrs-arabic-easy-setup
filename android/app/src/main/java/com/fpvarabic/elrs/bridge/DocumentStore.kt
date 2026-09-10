package com.fpvarabic.elrs.bridge

/**
 * Storage the operator owns, which this application does not.
 *
 * A recovery checkpoint kept in app-private storage, in the WebView's cache or
 * in `localStorage` is exactly as durable as the installation. All of those go
 * away with an uninstall, a "Clear storage", or a reinstall signed by a
 * different key — and that is the moment a bricked transmitter needs the image
 * back. So before any destructive firmware write, the recovery package is
 * written through the Storage Access Framework to a location the operator
 * chooses, and then **reopened and hashed by the page**. Writing it is not the
 * proof; reading it back is.
 *
 * The contract is deliberately five operations rather than a filesystem: create
 * a document, stream bytes into it, commit it, read one back, and pick an
 * existing one. [AndroidDocumentStore] implements it over SAF; the
 * instrumentation suite implements it over a map, which is how every refusal
 * below gets exercised with no picker and no storage.
 */
interface DocumentStore {

    /** Machine-readable refusals. The page maps these to operator text. */
    object Reason {
        /** The operator dismissed the picker. Their choice, not a fault. */
        const val PICKER_CANCELLED = "PICKER_CANCELLED"
        /** The destination has no room. Named separately: it is actionable. */
        const val NO_SPACE = "NO_SPACE"
        const val WRITE_FAILED = "WRITE_FAILED"
        const val READ_FAILED = "READ_FAILED"
        const val DOCUMENT_NOT_FOUND = "DOCUMENT_NOT_FOUND"
        /** A write arrived for a document nothing had opened. */
        const val NO_PENDING_WRITE = "NO_PENDING_WRITE"
        /** Chunks must be contiguous; a gap would silently corrupt the file. */
        const val OFFSET_OUT_OF_ORDER = "OFFSET_OUT_OF_ORDER"
        /** Only one document may be open for writing at a time. */
        const val WRITE_ALREADY_OPEN = "WRITE_ALREADY_OPEN"
        /** This host has no document access at all. */
        const val DOCUMENTS_UNAVAILABLE = "DOCUMENTS_UNAVAILABLE"
    }

    sealed interface Outcome

    data class Created(val location: String, val displayName: String) : Outcome

    data class Progress(val offset: Long) : Outcome

    data class Committed(
        val location: String,
        val displayName: String,
        val byteLength: Long,
    ) : Outcome

    class Chunk(val bytes: ByteArray, val eof: Boolean) : Outcome

    data class Refused(val reason: String, val message: String) : Outcome

    /**
     * Asks the operator where to put a new document and opens it for writing.
     *
     * Returns [Created] with the location the later calls name. The document is
     * not readable until [commit] closes it.
     */
    fun create(suggestedName: String, mimeType: String): Outcome

    /** Appends one contiguous chunk. [offset] must equal what was written so far. */
    fun write(location: String, bytes: ByteArray, offset: Long): Outcome

    /** Closes the document and reports its final size. */
    fun commit(location: String): Outcome

    /** Reads back a bounded slice of a committed document. */
    fun read(location: String, offset: Long, maxBytes: Int): Outcome

    /** Asks the operator to choose an existing document. */
    fun pick(mimeType: String): Outcome

    /**
     * Abandons any half-written document.
     *
     * Called when the host is backgrounded or destroyed. A partially written
     * file at the place the operator will later look for their only copy of a
     * firmware image is worse than no file, so it is not left behind as though
     * it were complete.
     */
    fun abandon()
}

/**
 * The store a host with no document access exposes.
 *
 * It refuses by name rather than being absent, so the page can say *why* a
 * durable copy cannot be made instead of appearing to have no recovery
 * feature at all.
 */
object UnavailableDocumentStore : DocumentStore {
    private fun refuse() = DocumentStore.Refused(
        DocumentStore.Reason.DOCUMENTS_UNAVAILABLE,
        "this host cannot reach storage outside itself",
    )

    override fun create(suggestedName: String, mimeType: String) = refuse()
    override fun write(location: String, bytes: ByteArray, offset: Long) = refuse()
    override fun commit(location: String) = refuse()
    override fun read(location: String, offset: Long, maxBytes: Int) = refuse()
    override fun pick(mimeType: String) = refuse()
    override fun abandon() = Unit
}
