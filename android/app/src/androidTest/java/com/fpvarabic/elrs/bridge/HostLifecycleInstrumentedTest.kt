package com.fpvarabic.elrs.bridge

import android.accessibilityservice.AccessibilityService
import android.view.WindowManager
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * What the real Activity does to the bridge as Android moves it through its
 * lifecycle.
 *
 * `BridgeCoreInstrumentedTest` proves what `onHostBackgrounded` does. This
 * proves *when* the host calls it, which is the part an earlier revision got
 * wrong: it called it from `onPause`, and Android pauses this Activity for its
 * own USB permission dialog and for the Storage Access Framework picker this
 * host launches — so the first permission request on a fresh device was
 * refused by the host itself, and a recovery export could never complete.
 *
 * The transitions are driven through [ActivityScenario], which moves the real
 * Activity through the real lifecycle rather than calling the hooks directly.
 * The port under test is a fake device, because the emulator has no USB host;
 * the picker in the last test is the real one.
 */
@RunWith(AndroidJUnit4::class)
class HostLifecycleInstrumentedTest {

    private lateinit var backend: FakeUsbBackend

    @Before
    fun setUp() {
        backend = FakeUsbBackend()
        backend.permissions[FakeUsbBackend.DEFAULT_DEVICE] = UsbDeviceGate.Permission.GRANTED
        MainActivity.testBackendOverride = backend
        // The real document store, so the real picker comes up in front of
        // the host and stops it the way it will for an operator.
        MainActivity.testDocumentsOverride = null
    }

    @After
    fun tearDown() {
        MainActivity.testBackendOverride = null
    }

    @Test
    fun keepsTheScreenOnWhileItIsInFront() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val flags = activity.window.attributes.flags
                assertTrue(
                    "a firmware write must not end in a screen timeout",
                    flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0,
                )
            }
        }
    }

    @Test
    fun aPausedButVisibleHostKeepsItsPortAndAStoppedOneDoesNot() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.awaitApplication()
            scenario.openFakePort()
            val connection = requireNotNull(backend.lastConnection())

            // Android's own USB permission dialog is an Activity in front of
            // this one: this host is paused but still on screen.
            scenario.moveToState(Lifecycle.State.STARTED)
            assertEquals("a pause must not close the port", 0, connection.closeCount.get())
            scenario.moveToState(Lifecycle.State.RESUMED)
            assertEquals(0, connection.closeCount.get())

            // Home, the recents screen, another app, the lock screen: the host
            // has left the screen, and write authority goes with it.
            scenario.moveToState(Lifecycle.State.CREATED)
            assertEquals("a stop must close the port", 1, connection.closeCount.get())
            assertFalse(connection.isOpen)
        }
    }

    @Test
    fun aStopBehindTheHostsOwnPickerKeepsThePortAndThePendingCall() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.awaitApplication()
            scenario.openFakePort()
            val connection = requireNotNull(backend.lastConnection())

            scenario.evaluate(
                """
                window.__documentReply = null;
                window.elrsNativeBridge.documents.create({
                  suggestedName: 'lifecycle.zip', mimeType: 'application/zip',
                }).then(function () {
                  window.__documentReply = JSON.stringify({ ok: true });
                }).catch(function (error) {
                  window.__documentReply = JSON.stringify({ ok: false, name: error.name });
                });
                """.trimIndent(),
            )
            // The Storage Access Framework picker is a full-screen Activity:
            // this host is stopped underneath it while its own call waits.
            scenario.awaitUntil("the picker never took the host off screen") {
                scenario.state == Lifecycle.State.CREATED
            }
            assertEquals(
                "a stop behind the host's own picker must keep the port",
                0,
                connection.closeCount.get(),
            )
            assertEquals(
                "the call that opened the picker must still be pending",
                "null",
                scenario.evaluate("window.__documentReply"),
            )

            // The operator dismisses the picker.
            InstrumentationRegistry.getInstrumentation().uiAutomation
                .performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            scenario.awaitUntil("the host never came back after the picker") {
                scenario.state == Lifecycle.State.RESUMED
            }
            val reply = JSONObject(scenario.awaitValue("window.__documentReply"))
            assertFalse(reply.toString(), reply.getBoolean("ok"))
            assertEquals("PICKER_CANCELLED", reply.getString("name"))
            assertEquals("the port survived the picker", 0, connection.closeCount.get())
            assertTrue(connection.isOpen)
        }
    }

    // ---- helpers ---------------------------------------------------------

    private fun ActivityScenario<MainActivity>.awaitApplication() {
        val deadline = System.currentTimeMillis() + AWAIT_SECONDS * 1_000
        while (System.currentTimeMillis() < deadline) {
            val ready = runCatching {
                evaluate("document.querySelectorAll('button').length")
            }.getOrDefault("0")
            if (ready.toIntOrNull()?.let { it > 0 } == true) return
            Thread.sleep(POLL_MILLIS)
        }
        throw AssertionError("the packaged application never rendered a control in ${AWAIT_SECONDS}s")
    }

    private fun ActivityScenario<MainActivity>.awaitUntil(failure: String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + AWAIT_SECONDS * 1_000
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return
            Thread.sleep(POLL_MILLIS)
        }
        throw AssertionError(
            "$failure | state=$state | reply=${evaluate("window.__documentReply")}",
        )
    }

    /** Opens the fake device through the page's own bridge, as the app would. */
    private fun ActivityScenario<MainActivity>.openFakePort() {
        val reply = bridgeCall(
            """{"callId":"open","operation":"open","deviceId":"${FakeUsbBackend.DEFAULT_DEVICE}"}""",
        )
        assertTrue(reply.toString(), reply.getBoolean("ok"))
        assertEquals(1, backend.openCount.get())
    }

    private fun ActivityScenario<MainActivity>.bridgeCall(request: String): JSONObject {
        evaluate(
            """
            (function () {
              window.__bridgeReply = null;
              var previous = window.elrsNativeHost.onmessage;
              window.elrsNativeHost.onmessage = function (event) {
                window.__bridgeReply = typeof event === 'string' ? event : event.data;
                if (previous) previous(event);
              };
              window.elrsNativeHost.postMessage(${JSONObject.quote(request)});
            })();
            """.trimIndent(),
        )
        return JSONObject(awaitValue("window.__bridgeReply"))
    }

    /** Polls an expression until it stops being null, then returns its decoded value. */
    private fun ActivityScenario<MainActivity>.awaitValue(expression: String): String {
        val deadline = System.currentTimeMillis() + AWAIT_SECONDS * 1_000
        while (System.currentTimeMillis() < deadline) {
            val raw = evaluate(expression)
            if (raw != "null") {
                return if (raw.startsWith("\"")) JSONObject("{\"v\":$raw}").getString("v") else raw
            }
            Thread.sleep(POLL_MILLIS)
        }
        throw AssertionError("$expression stayed null for ${AWAIT_SECONDS}s")
    }

    private fun ActivityScenario<MainActivity>.evaluate(script: String): String {
        val latch = CountDownLatch(1)
        val result = AtomicReference<String?>(null)
        onActivity { activity ->
            activity.hostWebView.evaluateJavascript(script) { value ->
                result.set(value)
                latch.countDown()
            }
        }
        assertTrue("the script never returned", latch.await(AWAIT_SECONDS, TimeUnit.SECONDS))
        return result.get() ?: "null"
    }

    private companion object {
        const val AWAIT_SECONDS = 30L
        const val POLL_MILLIS = 100L
    }
}
