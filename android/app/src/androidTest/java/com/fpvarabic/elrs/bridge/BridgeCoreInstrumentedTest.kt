package com.fpvarabic.elrs.bridge

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The bridge's rules, driven exactly as the page drives them, against a fake
 * device.
 *
 * These run as instrumentation tests rather than JVM unit tests for one
 * concrete reason: `org.json` on the JVM classpath is a stub that returns
 * defaults, so a JSON-shaped protocol tested there proves nothing. On a device
 * or emulator it is the real implementation the host actually uses.
 */
@RunWith(AndroidJUnit4::class)
class BridgeCoreInstrumentedTest {

    private lateinit var backend: FakeUsbBackend
    private lateinit var core: BridgeCore

    @Before
    fun setUp() {
        backend = FakeUsbBackend()
        core = BridgeCore(backend, ORIGIN)
    }

    @After
    fun tearDown() {
        core.close()
    }

    // ---- origin and frame ----------------------------------------------

    @Test
    fun refusesAnyRequestFromAnotherOrigin() {
        val reply = callFrom("https://evil.example", isMainFrame = true, operation = "list")
        assertEquals(BridgeCore.Reason.FOREIGN_ORIGIN, reply.getString("reason"))
        assertFalse(reply.getBoolean("ok"))
    }

    @Test
    fun refusesAnyRequestFromASubframe() {
        val reply = callFrom(ORIGIN, isMainFrame = false, operation = "list")
        assertEquals(BridgeCore.Reason.NOT_MAIN_FRAME, reply.getString("reason"))
    }

    @Test
    fun refusesAWriteFromASubframeEvenWithAValidSession() {
        val sessionId = openPort()
        val reply = callFrom(
            ORIGIN,
            isMainFrame = false,
            operation = "write",
            extra = { it.put("sessionId", sessionId).put("bytes", bytesOf(1, 2, 3)) },
        )
        assertEquals(BridgeCore.Reason.NOT_MAIN_FRAME, reply.getString("reason"))
        assertTrue("no bytes may reach the device", backend.written.isEmpty())
    }

    // ---- native input validation ----------------------------------------

    @Test
    fun refusesAnUnknownOperationByName() {
        val reply = call("reflashEverything")
        assertEquals(BridgeCore.Reason.INVALID_REQUEST, reply.getString("reason"))
        assertTrue(reply.getString("message").contains("reflashEverything"))
    }

    @Test
    fun refusesAWriteWithAnOversizedPayload() {
        val sessionId = openPort()
        val oversized = (0..BridgeRequest.MAX_TRANSFER_BYTES).joinToString(",") { "0" }
        val reply = raw(
            """{"callId":"x","operation":"write","sessionId":"$sessionId","bytes":[$oversized]}""",
        )
        assertEquals(BridgeCore.Reason.INVALID_REQUEST, reply.getString("reason"))
    }

    @Test
    fun refusesAWriteWithANonByteValue() {
        val sessionId = openPort()
        val reply = raw(
            """{"callId":"x","operation":"write","sessionId":"$sessionId","bytes":[1,2,999]}""",
        )
        assertEquals(BridgeCore.Reason.INVALID_REQUEST, reply.getString("reason"))
        assertTrue(reply.getString("message").contains("bytes[2]"))
    }

    @Test
    fun refusesATimeoutOutsideTheAllowedRange() {
        val reply = raw("""{"callId":"x","operation":"list","timeoutMillis":600000}""")
        assertEquals(BridgeCore.Reason.INVALID_REQUEST, reply.getString("reason"))
    }

    @Test
    fun refusesAReadWithoutASessionId() {
        val reply = raw("""{"callId":"x","operation":"read","maxBytes":16}""")
        assertEquals(BridgeCore.Reason.INVALID_REQUEST, reply.getString("reason"))
        assertTrue(reply.getString("message").contains("sessionId"))
    }

    // ---- permission ------------------------------------------------------

    @Test
    fun reportsPermissionGranted() {
        backend.permissionAnswer = FakeUsbBackend.PermissionAnswer.GRANT
        val result = call("requestPermission") { it.put("deviceId", DEVICE) }.getJSONObject("result")
        assertEquals("GRANTED", result.getString("permission"))
        assertTrue(result.getBoolean("granted"))
    }

    @Test
    fun reportsPermissionDenied() {
        backend.permissionAnswer = FakeUsbBackend.PermissionAnswer.DENY
        val result = call("requestPermission") { it.put("deviceId", DEVICE) }.getJSONObject("result")
        assertEquals("DENIED", result.getString("permission"))
        assertFalse(result.getBoolean("granted"))
    }

    @Test
    fun reportsADismissedPermissionDialogAsUnknownRatherThanDenied() {
        backend.permissionAnswer = FakeUsbBackend.PermissionAnswer.DISMISS
        val result = call("requestPermission") { it.put("deviceId", DEVICE) }.getJSONObject("result")
        assertEquals("UNKNOWN", result.getString("permission"))
        assertFalse(result.getBoolean("granted"))
    }

    @Test
    fun listsAnUndrivableDeviceWithItsReasonRatherThanHidingIt() {
        backend.devices.add(FakeUsbBackend.hidDevice("/dev/bus/usb/001/003"))
        // Permission is granted first, because `refusalFor` reports the
        // permission state *before* it looks at interfaces — an earlier
        // revision of this test left it ungranted and then asserted the
        // interface reason, which is not the answer that input deserves. The
        // ordering is the gate's, and it is right: what a device exposes is
        // not the operator's obstacle while permission is still the obstacle.
        backend.permissions["/dev/bus/usb/001/003"] = UsbDeviceGate.Permission.GRANTED
        val devices = call("list").getJSONArray("result")
        assertEquals(2, devices.length())
        val hid = (0 until devices.length())
            .map(devices::getJSONObject)
            .first { it.getString("deviceId") == "/dev/bus/usb/001/003" }
        assertFalse(hid.getBoolean("usable"))
        assertEquals(UsbDeviceGate.Refusal.NO_CDC_DATA_INTERFACE.name, hid.getString("refusal"))
    }

    @Test
    fun refusesToOpenWithoutPermissionAndNamesTheReason() {
        val reply = call("open") { it.put("deviceId", DEVICE) }
        assertEquals(
            UsbDeviceGate.Refusal.PERMISSION_NOT_GRANTED.name,
            reply.getString("reason"),
        )
    }

    // ---- session ownership ----------------------------------------------

    @Test
    fun refusesASecondOpenWhileAPortIsOpen() {
        openPort()
        val reply = call("open") { it.put("deviceId", DEVICE) }
        assertEquals(BridgeCore.Reason.PORT_ALREADY_OPEN, reply.getString("reason"))
        assertEquals("only one port may ever be opened", 1, backend.openCount.get())
    }

    @Test
    fun refusesAWriteThatPresentsAnotherSessionId() {
        openPort()
        val reply = call("write") {
            it.put("sessionId", "0123456789abcdef").put("bytes", bytesOf(1, 2, 3))
        }
        assertEquals(BridgeCore.Reason.SESSION_MISMATCH, reply.getString("reason"))
        assertTrue(backend.written.isEmpty())
    }

    @Test
    fun refusesAWriteAfterThePortIsClosed() {
        val sessionId = openPort()
        call("close") { it.put("sessionId", sessionId) }
        val reply = call("write") {
            it.put("sessionId", sessionId).put("bytes", bytesOf(9))
        }
        assertEquals(BridgeCore.Reason.SESSION_NOT_OPEN, reply.getString("reason"))
    }

    // ---- transfers -------------------------------------------------------

    @Test
    fun keepsChunkedWritesInTheOrderTheyWereIssued() {
        val sessionId = openPort()
        val chunks = (0 until 24).map { index -> ByteArray(16) { (index and 0xff).toByte() } }
        var offset = 0L
        val pending = chunks.map { chunk ->
            val reply = call("write") {
                it.put("sessionId", sessionId)
                    .put("bytes", bytesOf(*chunk.map { byte -> byte.toInt() and 0xff }.toIntArray()))
                    .put("offset", offset)
            }
            offset += chunk.size
            reply
        }
        pending.forEach { assertTrue(it.toString(), it.getBoolean("ok")) }

        val seen = backend.written.toList()
        assertEquals(chunks.size, seen.size)
        seen.forEachIndexed { index, bytes ->
            assertEquals("chunk $index arrived out of order", (index and 0xff).toByte(), bytes[0])
        }
    }

    @Test
    fun refusesAChunkWhoseOffsetDoesNotFollowTheLastOne() {
        val sessionId = openPort()
        call("write") {
            it.put("sessionId", sessionId).put("bytes", bytesOf(1, 2, 3, 4)).put("offset", 0)
        }
        // 4 bytes are in; a chunk claiming offset 64 would leave a hole.
        val reply = call("write") {
            it.put("sessionId", sessionId).put("bytes", bytesOf(5)).put("offset", 64)
        }
        assertEquals(BridgeCore.Reason.OFFSET_OUT_OF_ORDER, reply.getString("reason"))
        assertEquals("the skipped chunk must not reach the device", 1, backend.written.size)
        assertTrue("the port stays usable for recovery", core.hasOpenPort)
    }

    @Test
    fun readsReturnTheQueuedBytesAndAQuietLinkIsNotAnError() {
        val sessionId = openPort()
        backend.readQueue.add(byteArrayOf(0xec.toByte(), 0x18, 0x29))
        val first = call("read") { it.put("sessionId", sessionId).put("maxBytes", 64) }
            .getJSONObject("result")
        assertEquals(3, first.getInt("length"))
        assertEquals(0xec, first.getJSONArray("bytes").getInt(0))

        val quiet = call("read") { it.put("sessionId", sessionId).put("maxBytes", 64) }
            .getJSONObject("result")
        assertEquals(0, quiet.getInt("length"))
    }

    @Test
    fun releasesThePortWhenATransferThrows() {
        val sessionId = openPort()
        backend.failNextTransfer = IOException("the bulk write stalled")
        val reply = call("write") { it.put("sessionId", sessionId).put("bytes", bytesOf(1)) }
        assertEquals(BridgeCore.Reason.TRANSFER_FAILED, reply.getString("reason"))
        assertFalse("a port that threw must not stay held", core.hasOpenPort)
        assertEquals(1, backend.lastConnection()!!.closeCount.get())

        // And the next open succeeds, which is the point of releasing it.
        val next = call("open") { it.put("deviceId", DEVICE) }
        assertTrue(next.toString(), next.getBoolean("ok"))
    }

    @Test
    fun aCancelOvertakesQueuedWorkAndRejectsIt() {
        val sessionId = openPort()
        val block = CountDownLatch(1)
        backend.blockTransfer = block

        // One write occupies the worker; the rest queue behind it.
        val inFlight = pendingCall("write") {
            it.put("sessionId", sessionId).put("bytes", bytesOf(1))
        }
        val queued = (0 until 3).map { index ->
            pendingCall("write") {
                it.put("sessionId", sessionId).put("bytes", bytesOf(index + 2))
            }
        }

        // Cancel runs on the caller's thread, ahead of everything queued.
        val cancelled = call("cancel") { it.put("sessionId", sessionId) }
        assertTrue(cancelled.toString(), cancelled.getBoolean("ok"))

        queued.forEach { call ->
            val reply = call.await()
            assertEquals(BridgeCore.Reason.CANCELLED, reply.getString("reason"))
        }

        backend.blockTransfer = null
        block.countDown()
        inFlight.await()
        core.awaitIdle(AWAIT_MILLIS)
        assertTrue("cancel leaves the port open for recovery", core.hasOpenPort)
    }

    @Test
    fun refusesFurtherWritesAfterACancelUntilThePortIsReopened() {
        val sessionId = openPort()
        call("cancel") { it.put("sessionId", sessionId) }
        val reply = call("write") { it.put("sessionId", sessionId).put("bytes", bytesOf(7)) }
        assertEquals(BridgeCore.Reason.CANCELLED, reply.getString("reason"))
        // Close is the one thing a cancelled session may still do.
        val closed = call("close") { it.put("sessionId", sessionId) }
        assertTrue(closed.toString(), closed.getBoolean("ok"))
    }

    // ---- lifecycle -------------------------------------------------------

    @Test
    fun backgroundingClosesThePortAndRejectsEveryPendingCall() {
        val sessionId = openPort()
        val block = CountDownLatch(1)
        backend.blockTransfer = block
        val inFlight = pendingCall("write") {
            it.put("sessionId", sessionId).put("bytes", bytesOf(1))
        }
        val queued = pendingCall("write") {
            it.put("sessionId", sessionId).put("bytes", bytesOf(2))
        }

        core.onHostBackgrounded()

        assertEquals(BridgeCore.Reason.HOST_NOT_VISIBLE, queued.await().getString("reason"))
        assertFalse(core.hasOpenPort)
        assertEquals(1, backend.lastConnection()!!.closeCount.get())

        backend.blockTransfer = null
        block.countDown()
        inFlight.await()
    }

    @Test
    fun aBackgroundedHostMayNotOpenOrWrite() {
        core.onHostBackgrounded()
        assertEquals(
            BridgeCore.Reason.HOST_NOT_VISIBLE,
            call("open") { it.put("deviceId", DEVICE) }.getString("reason"),
        )
        assertEquals(
            BridgeCore.Reason.HOST_NOT_VISIBLE,
            call("write") { it.put("sessionId", "abc").put("bytes", bytesOf(1)) }
                .getString("reason"),
        )
        assertEquals("no port may be opened while backgrounded", 0, backend.openCount.get())
    }

    @Test
    fun aResumedHostHasNoSessionUntilItOpensAgain() {
        val stale = openPort()
        core.onHostBackgrounded()
        core.onHostForegrounded()

        val reply = call("write") { it.put("sessionId", stale).put("bytes", bytesOf(1)) }
        assertEquals(BridgeCore.Reason.SESSION_NOT_OPEN, reply.getString("reason"))

        val reopened = openPort()
        assertFalse("a resumed host gets a fresh session", stale == reopened)
    }

    @Test
    fun detachingTheDeviceClosesThePortAndRejectsPendingCalls() {
        val sessionId = openPort()
        val block = CountDownLatch(1)
        backend.blockTransfer = block
        val inFlight = pendingCall("write") {
            it.put("sessionId", sessionId).put("bytes", bytesOf(1))
        }
        val queued = pendingCall("write") {
            it.put("sessionId", sessionId).put("bytes", bytesOf(2))
        }

        core.onDeviceDetached(DEVICE)

        assertEquals(BridgeCore.Reason.DETACHED, queued.await().getString("reason"))
        assertFalse(core.hasOpenPort)
        assertEquals(1, backend.lastConnection()!!.closeCount.get())

        backend.blockTransfer = null
        block.countDown()
        inFlight.await()
    }

    @Test
    fun detachingADifferentDeviceLeavesTheOpenPortAlone() {
        openPort()
        core.onDeviceDetached("/dev/bus/usb/001/099")
        assertTrue(core.hasOpenPort)
    }

    @Test
    fun closingTheBridgeClosesThePortAndRejectsEverythingOutstanding() {
        val sessionId = openPort()
        val block = CountDownLatch(1)
        backend.blockTransfer = block
        val inFlight = pendingCall("write") {
            it.put("sessionId", sessionId).put("bytes", bytesOf(1))
        }
        val queued = pendingCall("write") {
            it.put("sessionId", sessionId).put("bytes", bytesOf(2))
        }

        core.close()

        assertEquals(BridgeCore.Reason.BRIDGE_CLOSED, queued.await().getString("reason"))
        assertFalse(core.hasOpenPort)
        assertEquals(1, backend.lastConnection()!!.closeCount.get())
        assertEquals("nothing may be left waiting", 0, core.pendingCallCount)

        val afterwards = call("list")
        assertEquals(BridgeCore.Reason.BRIDGE_CLOSED, afterwards.getString("reason"))

        backend.blockTransfer = null
        block.countDown()
        inFlight.await()
    }

    // ---- helpers ---------------------------------------------------------

    private class Pending {
        private val latch = CountDownLatch(1)
        @Volatile private var reply: JSONObject? = null
        fun accept(payload: String) {
            reply = JSONObject(payload)
            latch.countDown()
        }
        fun await(): JSONObject {
            assertTrue("no reply arrived", latch.await(AWAIT_MILLIS, TimeUnit.MILLISECONDS))
            return requireNotNull(reply) { "a reply was signalled but not recorded" }
        }
    }

    private fun openPort(): String {
        backend.permissions[DEVICE] = UsbDeviceGate.Permission.GRANTED
        val reply = call("open") { it.put("deviceId", DEVICE) }
        assertTrue(reply.toString(), reply.getBoolean("ok"))
        return reply.getJSONObject("result").getString("sessionId")
    }

    private var nextCallId = 0

    private fun pendingCall(
        operation: String,
        extra: (JSONObject) -> JSONObject = { it },
    ): Pending {
        val callId = "c${nextCallId++}"
        val request = extra(JSONObject().put("callId", callId).put("operation", operation))
        val pending = Pending()
        core.handle(request.toString(), ORIGIN, isMainFrame = true) { pending.accept(it) }
        return pending
    }

    private fun call(operation: String, extra: (JSONObject) -> JSONObject = { it }): JSONObject =
        pendingCall(operation, extra).await()

    private fun callFrom(
        origin: String,
        isMainFrame: Boolean,
        operation: String,
        extra: (JSONObject) -> JSONObject = { it },
    ): JSONObject {
        val request = extra(
            JSONObject().put("callId", "c${nextCallId++}").put("operation", operation),
        )
        val pending = Pending()
        core.handle(request.toString(), origin, isMainFrame) { pending.accept(it) }
        return pending.await()
    }

    private fun raw(json: String): JSONObject {
        val pending = Pending()
        core.handle(json, ORIGIN, isMainFrame = true) { pending.accept(it) }
        return pending.await()
    }

    private fun bytesOf(vararg values: Int): org.json.JSONArray {
        val array = org.json.JSONArray()
        values.forEach(array::put)
        return array
    }

    private companion object {
        const val ORIGIN = "https://appassets.androidplatform.net"
        const val DEVICE = FakeUsbBackend.DEFAULT_DEVICE
        const val AWAIT_MILLIS = 5_000L
    }
}
