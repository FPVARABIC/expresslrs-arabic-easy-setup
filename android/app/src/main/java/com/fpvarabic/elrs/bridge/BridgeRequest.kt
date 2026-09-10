package com.fpvarabic.elrs.bridge

import org.json.JSONArray
import org.json.JSONObject

/**
 * Validation of everything JavaScript sends.
 *
 * The web layer is trusted to be the bundled application, but it is still the
 * side that can be wrong — a bug there must not become an out-of-bounds read or
 * an unbounded allocation here. Every field is checked natively, and a bad
 * request is a named error rather than a best effort.
 */
object BridgeRequest {

    /** The whole vocabulary. Anything else is refused by name. */
    val OPERATIONS = setOf(
        "list", "requestPermission", "open", "write", "read", "close", "cancel",
        // Durable recovery: a document written outside the application, then
        // reopened so the page can hash it. See DocumentStore.
        "documentCreate", "documentWrite", "documentCommit", "documentRead", "documentPick",
    )

    /** Operations that stream a document, so they must name one. */
    val LOCATION_OPERATIONS = setOf("documentWrite", "documentCommit", "documentRead")

    /** Operations that write bytes, so they carry a payload and an offset. */
    val PAYLOAD_OPERATIONS = setOf("write", "documentWrite")

    /** Operations that read bytes, so they carry a bound. */
    val BOUNDED_READ_OPERATIONS = setOf("read", "documentRead")

    /** A suggested file name is a name, not a path: no separators, bounded. */
    const val MAX_DOCUMENT_NAME = 200

    /** A content Uri is bounded so a malformed one cannot be unbounded. */
    const val MAX_DOCUMENT_LOCATION = 2_048

    /** A single transfer is bounded so a malformed size cannot exhaust memory. */
    const val MAX_TRANSFER_BYTES = 64 * 1024

    /**
     * A transfer offset is bounded well above any ExpressLRS image (the largest
     * is a few megabytes) and well below anything that could overflow.
     */
    const val MAX_TRANSFER_OFFSET = 4_294_967_296L

    /**
     * ExpressLRS speaks CRSF at 420000 and the ESP bootloaders at 115200 or
     * 460800. The range is bounded so a bad value is a named refusal rather
     * than an unexplained CDC control-transfer failure.
     */
    const val DEFAULT_BAUD_RATE = 420_000
    const val MIN_BAUD_RATE = 1_200
    const val MAX_BAUD_RATE = 2_000_000

    /** Bounded so a request cannot pin a USB endpoint indefinitely. */
    const val MIN_TIMEOUT_MILLIS = 1
    const val MAX_TIMEOUT_MILLIS = 60_000

    /** Operations that act on an already-open port, so they must name its session. */
    val SESSION_OPERATIONS = setOf("write", "read", "close", "cancel")

    sealed interface Parsed {
        val callId: String
    }

    data class Invalid(override val callId: String, val reason: String) : Parsed
    data class Valid(
        override val callId: String,
        val operation: String,
        val deviceId: String?,
        val payload: ByteArray?,
        val maxBytes: Int,
        val timeoutMillis: Int,
        val sessionId: String?,
        /**
         * The cumulative byte offset this chunk claims within the current
         * transfer, when the page supplies one. It is checked against what the
         * session has actually written, so a page-side ordering bug is a refused
         * chunk rather than a firmware image with a hole in it.
         */
        val offset: Long?,
        /** The line rate to configure on open. */
        val baudRate: Int,
        /** The file name to suggest to the operator, for `documentCreate`. */
        val suggestedName: String?,
        /** The MIME type, for the two picker operations. */
        val mimeType: String?,
        /** Which document a streaming operation acts on. */
        val location: String?,
    ) : Parsed {
        override fun equals(other: Any?): Boolean = this === other
        override fun hashCode(): Int = System.identityHashCode(this)
    }

    fun parse(raw: String): Parsed {
        val json = runCatching { JSONObject(raw) }.getOrNull()
            ?: return Invalid("", "the request is not a JSON object")
        val callId = json.optString("callId")
        if (callId.isEmpty() || callId.length > 64) {
            return Invalid("", "callId must be 1..64 characters")
        }

        val operation = json.optString("operation")
        if (operation !in OPERATIONS) {
            return Invalid(callId, "unknown operation \"$operation\"")
        }

        val deviceId = json.optString("deviceId").ifEmpty { null }
        if (deviceId != null && (deviceId.length > 128 || !deviceId.all(::isSafeIdChar))) {
            return Invalid(callId, "deviceId must be 1..128 safe characters")
        }
        if (operation in setOf("requestPermission", "open") && deviceId == null) {
            return Invalid(callId, "$operation requires a deviceId")
        }

        val sessionId = json.optString("sessionId").ifEmpty { null }
        if (sessionId != null && (sessionId.length > 64 || !sessionId.all(::isSafeIdChar))) {
            return Invalid(callId, "sessionId must be 1..64 safe characters")
        }
        if (operation in SESSION_OPERATIONS && sessionId == null) {
            return Invalid(callId, "$operation requires the sessionId that opened the port")
        }

        val timeoutMillis = if (json.has("timeoutMillis")) {
            val value = json.optInt("timeoutMillis", -1)
            if (value < MIN_TIMEOUT_MILLIS || value > MAX_TIMEOUT_MILLIS) {
                return Invalid(
                    callId,
                    "timeoutMillis must be $MIN_TIMEOUT_MILLIS..$MAX_TIMEOUT_MILLIS",
                )
            }
            value
        } else {
            1_000
        }

        var payload: ByteArray? = null
        if (operation in PAYLOAD_OPERATIONS) {
            val array = json.optJSONArray("bytes")
                ?: return Invalid(callId, "$operation requires a bytes array")
            if (array.length() == 0 || array.length() > MAX_TRANSFER_BYTES) {
                return Invalid(callId, "bytes must be 1..$MAX_TRANSFER_BYTES long")
            }
            payload = ByteArray(array.length())
            for (index in 0 until array.length()) {
                val value = array.optInt(index, -1)
                if (value < 0 || value > 255) {
                    return Invalid(callId, "bytes[$index] is not a 0..255 byte")
                }
                payload[index] = value.toByte()
            }
        }

        var offset: Long? = null
        if (operation in PAYLOAD_OPERATIONS && json.has("offset")) {
            val value = json.optLong("offset", -1L)
            if (value < 0L || value > MAX_TRANSFER_OFFSET) {
                return Invalid(callId, "offset must be 0..$MAX_TRANSFER_OFFSET")
            }
            offset = value
        }

        var baudRate = DEFAULT_BAUD_RATE
        if (operation == "open" && json.has("baudRate")) {
            val value = json.optInt("baudRate", -1)
            if (value < MIN_BAUD_RATE || value > MAX_BAUD_RATE) {
                return Invalid(callId, "baudRate must be $MIN_BAUD_RATE..$MAX_BAUD_RATE")
            }
            baudRate = value
        }

        var maxBytes = 0
        if (operation in BOUNDED_READ_OPERATIONS) {
            maxBytes = json.optInt("maxBytes", -1)
            if (maxBytes < 1 || maxBytes > MAX_TRANSFER_BYTES) {
                return Invalid(callId, "maxBytes must be 1..$MAX_TRANSFER_BYTES")
            }
        }

        var suggestedName: String? = null
        if (operation == "documentCreate") {
            val value = json.optString("suggestedName")
            // A name, not a path. A separator here would be an attempt to place
            // the file somewhere the operator did not choose.
            if (value.isEmpty() || value.length > MAX_DOCUMENT_NAME ||
                value.contains('/') || value.contains('\\') || value.contains('\u0000') ||
                value == "." || value == ".."
            ) {
                return Invalid(callId, "suggestedName must be a 1..$MAX_DOCUMENT_NAME character file name")
            }
            suggestedName = value
        }

        var mimeType: String? = null
        if (operation == "documentCreate" || operation == "documentPick") {
            val value = json.optString("mimeType").ifEmpty { "application/octet-stream" }
            if (value.length > 128 || !value.all { it.isLetterOrDigit() || it in "/.+-_*" }) {
                return Invalid(callId, "mimeType is not a MIME type")
            }
            mimeType = value
        }

        var location: String? = null
        if (operation in LOCATION_OPERATIONS) {
            val value = json.optString("location")
            if (value.isEmpty() || value.length > MAX_DOCUMENT_LOCATION) {
                return Invalid(callId, "$operation requires a document location")
            }
            location = value
        }

        // A document read is bounded by the same chunk size as a USB read, and
        // its offset can run to the whole archive rather than a single transfer.
        if (operation == "documentRead") {
            val value = json.optLong("offset", -1L)
            if (value < 0L || value > MAX_TRANSFER_OFFSET) {
                return Invalid(callId, "offset must be 0..$MAX_TRANSFER_OFFSET")
            }
            offset = value
        }

        return Valid(
            callId = callId,
            operation = operation,
            deviceId = deviceId,
            payload = payload,
            maxBytes = maxBytes,
            timeoutMillis = timeoutMillis,
            sessionId = sessionId,
            offset = offset,
            baudRate = baudRate,
            suggestedName = suggestedName,
            mimeType = mimeType,
            location = location,
        )
    }

    /** A success reply. */
    fun ok(callId: String, result: Any?): String =
        JSONObject()
            .put("callId", callId)
            .put("ok", true)
            .put("result", result ?: JSONObject.NULL)
            .toString()

    /** A failure reply, carrying a machine-readable reason. */
    fun error(callId: String, reason: String, message: String): String =
        JSONObject()
            .put("callId", callId)
            .put("ok", false)
            .put("reason", reason)
            .put("message", message)
            .toString()

    fun bytesToJson(bytes: ByteArray): JSONArray {
        val array = JSONArray()
        for (byte in bytes) array.put(byte.toInt() and 0xff)
        return array
    }

    private fun isSafeIdChar(character: Char): Boolean =
        character.isLetterOrDigit() || character == '-' || character == '_' ||
            character == '.' || character == ':' || character == '/'
}
