package com.fpvarabic.elrs.bridge

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The durable-recovery document path, driven exactly as the page drives it.
 *
 * A recovery checkpoint that lives only inside the application is as durable as
 * the installation, and the moment it is needed is the moment an operator is
 * most likely to have reinstalled the app trying to fix things. So the package
 * is written outside the app and then reopened and hashed. Every way that can
 * fail is a state the destructive-write gate has to refuse, and each one is
 * exercised here against [FakeDocumentStore] — no picker, no storage, no
 * hardware.
 *
 * The end-to-end hash comparison lives in the page, and is proven through the
 * real shim in `DurableRecoveryWebViewInstrumentedTest`. What is proven here is
 * that the bridge reports every outcome faithfully and by name, which is what
 * the page decides on.
 */
@RunWith(AndroidJUnit4::class)
class DocumentBridgeInstrumentedTest {

    private lateinit var backend: FakeUsbBackend
    private lateinit var documents: FakeDocumentStore
    private lateinit var core: BridgeCore

    @Before
    fun setUp() {
        backend = FakeUsbBackend()
        documents = FakeDocumentStore()
        core = BridgeCore(backend, ORIGIN, documents = documents)
    }

    @After
    fun tearDown() {
        core.close()
    }

    // ---- the success path ------------------------------------------------

    @Test
    fun writesAPackageInChunksAndReadsBackExactlyWhatWasWritten() {
        // Three chunks and a remainder: ordering and the final short chunk are
        // exercised rather than assumed.
        val payload = ByteArray(CHUNK * 3 + 17) { index -> (index % 251).toByte() }
        val location = createDocument("module-4.1.0-recovery.zip")

        var offset = 0
        while (offset < payload.size) {
            val slice = payload.copyOfRange(offset, minOf(offset + CHUNK, payload.size))
            val reply = call("documentWrite") {
                it.put("location", location).put("bytes", bytesOf(slice)).put("offset", offset)
            }
            assertTrue(reply.toString(), reply.getBoolean("ok"))
            offset += slice.size
        }

        val committed = call("documentCommit") { it.put("location", location) }
        assertTrue(committed.toString(), committed.getBoolean("ok"))
        assertEquals(
            payload.size.toLong(),
            committed.getJSONObject("result").getLong("byteLength"),
        )
        assertEquals(1, documents.committedCount)
        assertArrayEquals(payload, documents.committedBytes())
        assertArrayEquals("the file must read back byte for byte", payload, readBack(location))
    }

    // ---- cancellation -----------------------------------------------------

    @Test
    fun reportsADismissedSavePickerAsACancellation() {
        documents.dismissCreate = true
        val reply = call("documentCreate") { it.put("suggestedName", "recovery.zip") }
        assertFalse(reply.getBoolean("ok"))
        assertEquals(DocumentStore.Reason.PICKER_CANCELLED, reply.getString("reason"))
        assertEquals("nothing may be left behind", 0, documents.committedCount)
    }

    @Test
    fun reportsADismissedOpenPickerAsACancellation() {
        documents.dismissPick = true
        val reply = call("documentPick") { it.put("mimeType", "application/zip") }
        assertFalse(reply.getBoolean("ok"))
        assertEquals(DocumentStore.Reason.PICKER_CANCELLED, reply.getString("reason"))
    }

    // ---- insufficient storage ---------------------------------------------

    @Test
    fun reportsAFullDestinationByNameRatherThanAsAGenericFailure() {
        documents.spaceLimit = 8
        val location = createDocument("recovery.zip")
        val reply = call("documentWrite") {
            it.put("location", location)
                .put("bytes", bytesOf(ByteArray(16)))
                .put("offset", 0)
        }
        assertFalse(reply.getBoolean("ok"))
        // The operator has to be told to free space, not to retry.
        assertEquals(DocumentStore.Reason.NO_SPACE, reply.getString("reason"))
    }

    // ---- corruption and truncation, as the page sees them -----------------

    @Test
    fun handsBackTheCorruptedBytesFaithfullySoThePageCanCatchThem() {
        val payload = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8)
        val location = writeWhole("recovery.zip", payload)
        documents.corruptOnRead = true

        val readBack = readBack(location)
        // The bridge does not silently repair or re-request. It reports what
        // storage returned, at the right length, and the page's hash comparison
        // is what refuses the write.
        assertEquals(payload.size, readBack.size)
        assertFalse("the bytes must differ", payload.contentEquals(readBack))
    }

    @Test
    fun reportsAShortFileAtItsRealLength() {
        val payload = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8)
        val location = writeWhole("recovery.zip", payload)
        documents.truncateOnRead = true
        assertEquals(payload.size - 1, readBack(location).size)
    }

    // ---- import after a reinstall -----------------------------------------

    @Test
    fun opensAPackageTheApplicationNeverWroteInThisInstallation() {
        // A fresh installation: nothing was written by this process. The file
        // exists because a previous installation put it there, which is the
        // whole point of writing it outside the application.
        val archive = ByteArray(CHUNK + 5) { index -> (index % 97).toByte() }
        documents.importable = archive

        val picked = call("documentPick") { it.put("mimeType", "application/zip") }
        assertTrue(picked.toString(), picked.getBoolean("ok"))
        val location = picked.getJSONObject("result").getString("location")
        assertEquals(
            "imported-recovery.zip",
            picked.getJSONObject("result").getString("displayName"),
        )
        assertArrayEquals(archive, readBack(location))
    }

    // ---- the rules that keep a written file trustworthy -------------------

    @Test
    fun refusesAChunkThatWouldLeaveAHoleInTheFile() {
        val location = createDocument("recovery.zip")
        val reply = call("documentWrite") {
            it.put("location", location).put("bytes", bytesOf(byteArrayOf(1, 2))).put("offset", 64)
        }
        assertFalse(reply.getBoolean("ok"))
        assertEquals(DocumentStore.Reason.OFFSET_OUT_OF_ORDER, reply.getString("reason"))
    }

    @Test
    fun refusesASecondDocumentWhileOneIsStillBeingWritten() {
        createDocument("first.zip")
        val reply = call("documentCreate") { it.put("suggestedName", "second.zip") }
        assertFalse(reply.getBoolean("ok"))
        assertEquals(DocumentStore.Reason.WRITE_ALREADY_OPEN, reply.getString("reason"))
    }

    @Test
    fun refusesAWriteForADocumentNothingOpened() {
        val reply = call("documentWrite") {
            it.put("location", "fake://document/999")
                .put("bytes", bytesOf(byteArrayOf(1)))
                .put("offset", 0)
        }
        assertFalse(reply.getBoolean("ok"))
        assertEquals(DocumentStore.Reason.DOCUMENT_NOT_FOUND, reply.getString("reason"))
    }

    @Test
    fun refusesASuggestedNameThatIsAPath() {
        val reply = call("documentCreate") { it.put("suggestedName", "../../etc/passwd") }
        assertFalse(reply.getBoolean("ok"))
        // Refused natively, before any picker is shown: a separator here is an
        // attempt to place the file somewhere the operator did not choose.
        assertEquals(BridgeCore.Reason.INVALID_REQUEST, reply.getString("reason"))
        assertEquals(0, documents.committedCount)
    }

    // ---- lifecycle --------------------------------------------------------

    @Test
    fun abandonsAHalfWrittenFileWhenTheHostLeavesTheScreen() {
        val location = createDocument("recovery.zip")
        val first = call("documentWrite") {
            it.put("location", location).put("bytes", bytesOf(byteArrayOf(1, 2, 3))).put("offset", 0)
        }
        assertTrue(first.getBoolean("ok"))
        assertTrue(documents.hasPendingWrite)

        core.onHostBackgrounded()

        // A partial archive that looks complete is the worst outcome here, so
        // it is gone rather than committed.
        assertFalse(documents.hasPendingWrite)
        assertEquals(0, documents.committedCount)
    }

    @Test
    fun refusesDocumentWorkWhileTheHostIsOffScreen() {
        core.onHostBackgrounded()
        val reply = call("documentCreate") { it.put("suggestedName", "recovery.zip") }
        assertFalse(reply.getBoolean("ok"))
        // A picker needs a visible Activity; asking for one from the background
        // would either fail obscurely or surprise the operator later.
        assertEquals(BridgeCore.Reason.HOST_NOT_VISIBLE, reply.getString("reason"))
    }

    @Test
    fun letsTheHostWriteAgainAfterItComesBack() {
        core.onHostBackgrounded()
        core.onHostForegrounded()
        val location = createDocument("recovery.zip")
        val reply = call("documentWrite") {
            it.put("location", location).put("bytes", bytesOf(byteArrayOf(9))).put("offset", 0)
        }
        assertTrue(reply.toString(), reply.getBoolean("ok"))
    }

    @Test
    fun aHostWithNoDocumentAccessSaysSoRatherThanAppearingToHaveNoRecovery() {
        val bare = BridgeCore(FakeUsbBackend(), ORIGIN)
        try {
            val pending = Pending()
            bare.handle(
                JSONObject()
                    .put("callId", "c0")
                    .put("operation", "documentCreate")
                    .put("suggestedName", "recovery.zip")
                    .toString(),
                ORIGIN,
                isMainFrame = true,
            ) { pending.accept(it) }
            val reply = pending.await()
            assertFalse(reply.getBoolean("ok"))
            assertEquals(
                DocumentStore.Reason.DOCUMENTS_UNAVAILABLE,
                reply.getString("reason"),
            )
        } finally {
            bare.close()
        }
    }

    @Test
    fun refusesEveryDocumentOperationFromAnotherOrigin() {
        for (operation in DOCUMENT_OPERATIONS) {
            val pending = Pending()
            core.handle(
                JSONObject().put("callId", "x").put("operation", operation).toString(),
                "https://evil.example",
                isMainFrame = true,
            ) { pending.accept(it) }
            val reply = pending.await()
            assertEquals(
                "$operation must be refused by origin",
                BridgeCore.Reason.FOREIGN_ORIGIN,
                reply.getString("reason"),
            )
        }
        assertEquals(0, documents.committedCount)
    }

    // ---- helpers ----------------------------------------------------------

    private fun createDocument(name: String): String {
        val reply = call("documentCreate") { it.put("suggestedName", name) }
        assertTrue(reply.toString(), reply.getBoolean("ok"))
        return reply.getJSONObject("result").getString("location")
    }

    private fun writeWhole(name: String, payload: ByteArray): String {
        val location = createDocument(name)
        var offset = 0
        while (offset < payload.size) {
            val slice = payload.copyOfRange(offset, minOf(offset + CHUNK, payload.size))
            assertTrue(
                call("documentWrite") {
                    it.put("location", location)
                        .put("bytes", bytesOf(slice))
                        .put("offset", offset)
                }.getBoolean("ok"),
            )
            offset += slice.size
        }
        assertTrue(call("documentCommit") { it.put("location", location) }.getBoolean("ok"))
        return location
    }

    private fun readBack(location: String): ByteArray {
        val collected = ArrayList<Byte>()
        var offset = 0
        while (true) {
            val reply = call("documentRead") {
                it.put("location", location).put("offset", offset).put("maxBytes", CHUNK)
            }
            assertTrue(reply.toString(), reply.getBoolean("ok"))
            val result = reply.getJSONObject("result")
            val bytes = result.getJSONArray("bytes")
            for (index in 0 until bytes.length()) collected.add(bytes.getInt(index).toByte())
            offset += bytes.length()
            if (result.getBoolean("eof") || bytes.length() == 0) break
        }
        return collected.toByteArray()
    }

    private class Pending {
        private val latch = CountDownLatch(1)
        @Volatile private var payload: String? = null

        fun accept(value: String) {
            payload = value
            latch.countDown()
        }

        fun await(): JSONObject {
            assertTrue(
                "the bridge never answered within ${AWAIT_MILLIS}ms",
                latch.await(AWAIT_MILLIS, TimeUnit.MILLISECONDS),
            )
            return JSONObject(payload ?: error("no payload"))
        }
    }

    private var nextCallId = 0

    private fun call(operation: String, extra: (JSONObject) -> JSONObject = { it }): JSONObject {
        val request = extra(
            JSONObject().put("callId", "c${nextCallId++}").put("operation", operation),
        )
        val pending = Pending()
        core.handle(request.toString(), ORIGIN, isMainFrame = true) { pending.accept(it) }
        return pending.await()
    }

    private fun bytesOf(bytes: ByteArray): JSONArray {
        val array = JSONArray()
        for (byte in bytes) array.put(byte.toInt() and 0xff)
        return array
    }

    private companion object {
        const val ORIGIN = "https://appassets.androidplatform.net"
        const val AWAIT_MILLIS = 5_000L
        const val CHUNK = 64 * 1024
        val DOCUMENT_OPERATIONS = listOf(
            "documentCreate", "documentWrite", "documentCommit", "documentRead", "documentPick",
        )
    }
}
