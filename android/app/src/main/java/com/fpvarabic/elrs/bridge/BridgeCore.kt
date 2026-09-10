package com.fpvarabic.elrs.bridge

import java.io.IOException
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONArray
import org.json.JSONObject

/**
 * Everything the USB bridge decides, with no WebView types in it.
 *
 * [UsbSerialBridge] is the twenty lines that receive a `postMessage` and hand it
 * here. This class holds the rules a reviewer actually cares about — which
 * origin may speak, which frame may write, who owns the open port, what happens
 * when the host is backgrounded or the device is pulled — and it takes its USB
 * access through [UsbBackend], so all of it runs against a fake with no
 * hardware attached.
 *
 * ## Ordering
 *
 * USB transfers block, so they run on a single worker thread. One thread is not
 * a performance compromise here, it is the ordering guarantee: chunk *n* of a
 * firmware write reaches the device before chunk *n+1*, because there is nowhere
 * else for it to run. [cancel] is deliberately *not* queued — it sets a flag on
 * the calling thread, which is the only way a cancel can overtake the work it is
 * cancelling.
 */
class BridgeCore(
    private val backend: UsbBackend,
    private val allowedOrigin: String,
    private val executor: ExecutorService = Executors.newSingleThreadExecutor(),
    /**
     * Storage outside the application, for the durable recovery copy. Defaults
     * to a store that refuses by name, so a host that cannot reach any tells
     * the page exactly that instead of appearing to have no recovery at all.
     */
    private val documents: DocumentStore = UnavailableDocumentStore,
) {

    /** Machine-readable refusals. The web layer maps these to operator text. */
    object Reason {
        const val FOREIGN_ORIGIN = "FOREIGN_ORIGIN"
        const val NOT_MAIN_FRAME = "NOT_MAIN_FRAME"
        const val BRIDGE_CLOSED = "BRIDGE_CLOSED"
        const val HOST_NOT_VISIBLE = "HOST_NOT_VISIBLE"
        const val INVALID_REQUEST = "INVALID_REQUEST"
        const val PORT_ALREADY_OPEN = "PORT_ALREADY_OPEN"
        const val SESSION_NOT_OPEN = "SESSION_NOT_OPEN"
        const val SESSION_MISMATCH = "SESSION_MISMATCH"
        const val CANCELLED = "CANCELLED"
        const val OFFSET_OUT_OF_ORDER = "OFFSET_OUT_OF_ORDER"
        const val DEVICE_REFUSED = "DEVICE_REFUSED"
        const val TRANSFER_FAILED = "TRANSFER_FAILED"
        const val DETACHED = "DETACHED"
    }

    private class Session(
        val id: String,
        val connection: UsbConnection,
        @Volatile var cancelled: Boolean = false,
        @Volatile var written: Long = 0,
    )

    /** A reply that can be sent exactly once, from any thread. */
    private class PendingCall(val callId: String, private val sink: (String) -> Unit) {
        private val answered = AtomicBoolean(false)
        fun answer(payload: String): Boolean {
            if (!answered.compareAndSet(false, true)) return false
            sink(payload)
            return true
        }
    }

    private val pending = ConcurrentHashMap<String, PendingCall>()
    private val random = SecureRandom()

    @Volatile private var closed = false
    @Volatile private var visible = true
    @Volatile private var session: Session? = null

    /**
     * Handles one message from the page.
     *
     * [sourceOrigin] and [isMainFrame] come from the WebView, not from the
     * message, so a page cannot claim to be somewhere it is not.
     */
    fun handle(raw: String, sourceOrigin: String, isMainFrame: Boolean, reply: (String) -> Unit) {
        // The call id is read first, and only the call id. These three checks
        // still refuse without acting on anything the request asked for — but a
        // refusal the page cannot match to a pending call is one it drops, and
        // the promise behind it then never settles. That is a worse failure than
        // any of them on a bridge that can rewrite firmware, and it is reachable
        // by the trusted page itself: an iframe, or a call in flight when the
        // Activity goes away.
        val callId = BridgeRequest.callIdOf(raw)
        if (sourceOrigin != allowedOrigin) {
            reply(BridgeRequest.error(callId, Reason.FOREIGN_ORIGIN, "origin $sourceOrigin may not use this bridge"))
            return
        }
        if (!isMainFrame) {
            reply(BridgeRequest.error(callId, Reason.NOT_MAIN_FRAME, "only the top-level document may use this bridge"))
            return
        }
        if (closed) {
            reply(BridgeRequest.error(callId, Reason.BRIDGE_CLOSED, "the host is no longer accepting requests"))
            return
        }

        when (val parsed = BridgeRequest.parse(raw)) {
            is BridgeRequest.Invalid -> reply(
                BridgeRequest.error(parsed.callId, Reason.INVALID_REQUEST, parsed.reason),
            )
            is BridgeRequest.Valid -> accept(parsed, reply)
        }
    }

    private fun accept(request: BridgeRequest.Valid, reply: (String) -> Unit) {
        val call = PendingCall(request.callId, reply)
        pending[request.callId] = call

        // Write authority does not survive the host leaving the screen. The
        // session is already gone by then; this refuses the request by the
        // reason the operator needs to see rather than by a stale-session error.
        if (!visible && request.operation in VISIBLE_ONLY_OPERATIONS) {
            finish(call, BridgeRequest.error(request.callId, Reason.HOST_NOT_VISIBLE, "the application is not on screen"))
            return
        }

        // Cancellation runs here, on the caller's thread, so that it can reach a
        // session whose queued work has not started yet.
        if (request.operation == "cancel") {
            cancelOn(request, call)
            return
        }

        val submitted = runCatching {
            executor.execute { dispatch(request, call) }
        }
        if (submitted.isFailure) {
            finish(call, BridgeRequest.error(request.callId, Reason.BRIDGE_CLOSED, "the host is shutting down"))
        }
    }

    private fun cancelOn(request: BridgeRequest.Valid, call: PendingCall) {
        val active = session
        if (active == null) {
            finish(call, BridgeRequest.error(request.callId, Reason.SESSION_NOT_OPEN, "no port is open"))
            return
        }
        if (active.id != request.sessionId) {
            finish(call, BridgeRequest.error(request.callId, Reason.SESSION_MISMATCH, "that session does not own the open port"))
            return
        }
        active.cancelled = true
        // Everything queued behind the cancel is refused now rather than run.
        // The port stays open: a cancelled firmware write is exactly when the
        // recovery image needs to go down the same port.
        rejectPending(Reason.CANCELLED, "the operation was cancelled", except = request.callId)
        finish(call, BridgeRequest.ok(request.callId, JSONObject().put("cancelled", true)))
    }

    private fun dispatch(request: BridgeRequest.Valid, call: PendingCall) {
        if (closed) {
            finish(call, BridgeRequest.error(request.callId, Reason.BRIDGE_CLOSED, "the host is no longer accepting requests"))
            return
        }
        when (request.operation) {
            "list" -> finish(call, BridgeRequest.ok(request.callId, describeDevices()))
            "requestPermission" -> requestPermission(request, call)
            "open" -> open(request, call)
            "write" -> transfer(request, call, ::write)
            "read" -> transfer(request, call, ::read)
            "close" -> closePort(request, call)
            // Document operations run on the same worker thread as USB
            // transfers, which is what keeps a chunked document write in order
            // for the same reason a chunked firmware write stays in order.
            "documentCreate" -> document(request, call) {
                documents.create(request.suggestedName.orEmpty(), request.mimeType.orEmpty())
            }
            "documentWrite" -> document(request, call) {
                documents.write(
                    request.location.orEmpty(),
                    request.payload ?: ByteArray(0),
                    request.offset ?: 0L,
                )
            }
            "documentCommit" -> document(request, call) {
                documents.commit(request.location.orEmpty())
            }
            "documentRead" -> document(request, call) {
                documents.read(request.location.orEmpty(), request.offset ?: 0L, request.maxBytes)
            }
            "documentPick" -> document(request, call) {
                documents.pick(request.mimeType.orEmpty())
            }
            else -> finish(call, BridgeRequest.error(request.callId, Reason.INVALID_REQUEST, "unhandled operation"))
        }
    }

    /**
     * Runs one document operation and turns its outcome into a reply.
     *
     * Refusals keep the store's own reason name rather than being flattened
     * into a generic failure: the page shows the operator different text for a
     * dismissed picker, a full disk and a file it could not reopen, and it
     * decides which by that name.
     */
    private fun document(
        request: BridgeRequest.Valid,
        call: PendingCall,
        operation: () -> DocumentStore.Outcome,
    ) {
        val outcome = runCatching { operation() }.getOrElse { error ->
            DocumentStore.Refused(
                DocumentStore.Reason.WRITE_FAILED,
                error.message ?: "the document operation failed",
            )
        }
        val reply = when (outcome) {
            is DocumentStore.Created -> BridgeRequest.ok(
                request.callId,
                JSONObject()
                    .put("location", outcome.location)
                    .put("displayName", outcome.displayName),
            )
            is DocumentStore.Progress -> BridgeRequest.ok(
                request.callId,
                JSONObject().put("offset", outcome.offset),
            )
            is DocumentStore.Committed -> BridgeRequest.ok(
                request.callId,
                JSONObject()
                    .put("location", outcome.location)
                    .put("displayName", outcome.displayName)
                    .put("byteLength", outcome.byteLength),
            )
            is DocumentStore.Chunk -> BridgeRequest.ok(
                request.callId,
                JSONObject()
                    .put("bytes", BridgeRequest.bytesToJson(outcome.bytes))
                    .put("length", outcome.bytes.size)
                    .put("eof", outcome.eof),
            )
            is DocumentStore.Refused -> BridgeRequest.error(
                request.callId,
                outcome.reason,
                outcome.message,
            )
        }
        finish(call, reply)
    }

    private fun describeDevices(): JSONArray {
        val array = JSONArray()
        for (device in backend.listDevices()) {
            val refusal = UsbDeviceGate.refusalFor(
                permission = backend.permissionFor(device.deviceId),
                attached = true,
                interfaces = device.interfaces,
            )
            array.put(
                JSONObject()
                    .put("deviceId", device.deviceId)
                    .put("vendorId", device.vendorId)
                    .put("productId", device.productId)
                    .put("productName", device.productName ?: JSONObject.NULL)
                    // A device this host cannot drive stays in the list with the
                    // reason attached. Hiding it would leave the operator
                    // looking at an empty screen with a device plugged in.
                    .put("usable", refusal == null)
                    .put("refusal", refusal?.name ?: JSONObject.NULL),
            )
        }
        return array
    }

    private fun requestPermission(request: BridgeRequest.Valid, call: PendingCall) {
        val deviceId = request.deviceId ?: return finish(
            call,
            BridgeRequest.error(request.callId, Reason.INVALID_REQUEST, "requestPermission requires a deviceId"),
        )
        backend.requestPermission(deviceId) { permission ->
            finish(
                call,
                BridgeRequest.ok(
                    request.callId,
                    JSONObject()
                        .put("permission", permission.name)
                        // A dismissed dialog is not a denial, and the page must
                        // be able to tell the difference before it tells the
                        // operator to change a system setting.
                        .put("granted", permission == UsbDeviceGate.Permission.GRANTED),
                ),
            )
        }
    }

    private fun open(request: BridgeRequest.Valid, call: PendingCall) {
        val deviceId = request.deviceId ?: return finish(
            call,
            BridgeRequest.error(request.callId, Reason.INVALID_REQUEST, "open requires a deviceId"),
        )
        if (session != null) {
            // Two owners of one port cannot both be right about its state.
            finish(call, BridgeRequest.error(request.callId, Reason.PORT_ALREADY_OPEN, "a port is already open; close it first"))
            return
        }
        val opened = runCatching { backend.open(deviceId, request.baudRate) }
        val connection = opened.getOrElse { failure ->
            val refusal = (failure as? UsbBackendException)?.refusal
            finish(
                call,
                BridgeRequest.error(
                    request.callId,
                    refusal?.name ?: Reason.DEVICE_REFUSED,
                    failure.message ?: "the device could not be opened",
                ),
            )
            return
        }
        val fresh = Session(id = newSessionId(), connection = connection)
        session = fresh
        finish(
            call,
            BridgeRequest.ok(
                request.callId,
                JSONObject()
                    .put("sessionId", fresh.id)
                    .put("deviceId", connection.deviceId)
                    .put("baudRate", request.baudRate),
            ),
        )
    }

    private fun transfer(
        request: BridgeRequest.Valid,
        call: PendingCall,
        body: (BridgeRequest.Valid, Session) -> Any,
    ) {
        val active = ownedSession(request, call) ?: return
        val result = runCatching { body(request, active) }
        val value = result.getOrElse { failure ->
            if (failure is OutOfOrderException) {
                // Nothing was sent, so the port is still in a state both sides
                // agree on. Refuse the chunk and leave the session alone.
                finish(call, BridgeRequest.error(request.callId, Reason.OFFSET_OUT_OF_ORDER, failure.message!!))
                return
            }
            // A port that has thrown is a port in an unknown state. It is
            // released here rather than left open for the next call to inherit.
            releaseSession(active)
            val reason = (failure as? UsbBackendException)?.refusal?.name ?: Reason.TRANSFER_FAILED
            finish(call, BridgeRequest.error(request.callId, reason, failure.message ?: "the transfer failed"))
            return
        }
        finish(call, BridgeRequest.ok(request.callId, value))
    }

    private fun write(request: BridgeRequest.Valid, active: Session): Any {
        val payload = request.payload ?: throw IOException("write has no payload")
        // An offset, when the page supplies one, must be exactly what this
        // session has already written. That turns a page-side ordering bug into
        // a refused chunk instead of a corrupted firmware image.
        val offset = request.offset
        if (offset != null && offset != active.written) {
            throw OutOfOrderException("chunk declares offset $offset but the session has written ${active.written} bytes")
        }
        val written = active.connection.write(payload, request.timeoutMillis)
        active.written += written.toLong()
        return JSONObject().put("written", written).put("offset", active.written)
    }

    private fun read(request: BridgeRequest.Valid, active: Session): Any {
        val bytes = active.connection.read(request.maxBytes, request.timeoutMillis)
        return JSONObject().put("bytes", BridgeRequest.bytesToJson(bytes)).put("length", bytes.size)
    }

    private fun closePort(request: BridgeRequest.Valid, call: PendingCall) {
        val active = ownedSession(request, call) ?: return
        releaseSession(active)
        finish(call, BridgeRequest.ok(request.callId, JSONObject().put("closed", true)))
    }

    /** Resolves the session a request claims, or answers [call] and returns null. */
    private fun ownedSession(request: BridgeRequest.Valid, call: PendingCall): Session? {
        val active = session
        if (active == null) {
            finish(call, BridgeRequest.error(request.callId, Reason.SESSION_NOT_OPEN, "no port is open"))
            return null
        }
        if (active.id != request.sessionId) {
            finish(call, BridgeRequest.error(request.callId, Reason.SESSION_MISMATCH, "that session does not own the open port"))
            return null
        }
        if (active.cancelled && request.operation != "close") {
            finish(call, BridgeRequest.error(request.callId, Reason.CANCELLED, "the operation was cancelled"))
            return null
        }
        if (!active.connection.isOpen) {
            releaseSession(active)
            finish(call, BridgeRequest.error(request.callId, Reason.DETACHED, "the device is no longer open"))
            return null
        }
        return active
    }

    // ---- host lifecycle -------------------------------------------------

    /**
     * The host left the screen. Write authority goes with it: the port is
     * closed, the session is void and every promise still outstanding is
     * rejected, so a resumed page has to open again.
     */
    fun onHostBackgrounded() {
        visible = false
        session?.let(::releaseSession)
        // A half-written recovery archive at the place the operator will later
        // look for their only copy of a firmware image is worse than no file at
        // all, so it is abandoned rather than left looking complete.
        documents.abandon()
        rejectPending(Reason.HOST_NOT_VISIBLE, "the application left the screen")
    }

    /** The host is back on screen. It has no port and no session until it opens one. */
    fun onHostForegrounded() {
        if (!closed) visible = true
    }

    /**
     * The device was unplugged. Android will not reclaim the interface for us,
     * and a held interface is what makes the next attempt fail, so the port is
     * released and the page is told why.
     */
    fun onDeviceDetached(deviceId: String) {
        val active = session ?: return
        if (active.connection.deviceId != deviceId) return
        releaseSession(active)
        rejectPending(Reason.DETACHED, "the device was disconnected")
    }

    /** The Activity is going away. Nothing survives it. */
    fun close() {
        closed = true
        visible = false
        session?.let(::releaseSession)
        documents.abandon()
        rejectPending(Reason.BRIDGE_CLOSED, "the host was destroyed")
        executor.shutdownNow()
    }

    /** Whether a port is open right now. Used by tests and by diagnostics. */
    val hasOpenPort: Boolean get() = session?.connection?.isOpen == true

    /** Calls still waiting for an answer. Used by tests. */
    val pendingCallCount: Int get() = pending.size

    /** Waits for queued USB work to drain. Used by tests; never called by the host. */
    fun awaitIdle(timeoutMillis: Long): Boolean {
        val latch = CountDownLatch(1)
        val queued = runCatching { executor.execute { latch.countDown() } }
        if (queued.isFailure) return true
        return latch.await(timeoutMillis, TimeUnit.MILLISECONDS)
    }

    // ---- plumbing -------------------------------------------------------

    private fun releaseSession(active: Session) {
        if (session === active) session = null
        runCatching { active.connection.close() }
    }

    private fun finish(call: PendingCall, payload: String) {
        pending.remove(call.callId, call)
        call.answer(payload)
    }

    private fun rejectPending(reason: String, message: String, except: String? = null) {
        for ((callId, call) in pending) {
            if (callId == except) continue
            if (pending.remove(callId, call)) {
                call.answer(BridgeRequest.error(callId, reason, message))
            }
        }
    }

    private fun newSessionId(): String {
        val bytes = ByteArray(16)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private class OutOfOrderException(message: String) : IOException(message)

    private companion object {
        /**
         * The operations that move bytes or take ownership of a port. These are
         * the ones a backgrounded host may not perform.
         */
        val AUTHORITY_OPERATIONS = setOf("open", "write", "read")

        /**
         * Everything that may only run while the host is on screen.
         *
         * The USB operations because write authority does not follow a
         * backgrounded WebView, and the document operations because a picker
         * needs a visible Activity and a background write would be finishing a
         * file whose stream has already been abandoned.
         */
        val VISIBLE_ONLY_OPERATIONS = AUTHORITY_OPERATIONS + setOf(
            "documentCreate", "documentWrite", "documentCommit", "documentPick",
        )
    }
}
