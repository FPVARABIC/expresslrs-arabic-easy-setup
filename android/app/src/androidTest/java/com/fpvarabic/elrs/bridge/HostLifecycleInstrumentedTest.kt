package com.fpvarabic.elrs.bridge

import android.accessibilityservice.AccessibilityService
import android.util.Log
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
        // The flake here was blamed on a dropped BACK. Non-determinism alone did
        // not prove that, so this runs the cycle several times and records, each
        // time, which window is in front (the real DocumentsUI picker vs this
        // host) and how many BACK presses the dismissal took — then proves the
        // two things that must hold whatever the picker's load timing: the
        // cancel resolves to PICKER_CANCELLED with the port kept, and no BACK
        // reaches this host after it resumes (which would finish the Activity,
        // bring up a new instance, and close the port).
        val evidence = StringBuilder()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.awaitApplication()
            scenario.openFakePort()
            val connection = requireNotNull(backend.lastConnection())
            var activityId = 0
            scenario.onActivity { activityId = System.identityHashCode(it) }

            repeat(PICKER_CYCLES) { cycle ->
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
                // The picker is a full-screen Activity: this host stops under it
                // while its own call waits.
                scenario.awaitUntil("the picker never took the host off screen") {
                    scenario.state == Lifecycle.State.CREATED
                }
                val front = foregroundPackage()
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

                val presses = scenario.dismissOwnPickerAndAwaitResume()
                evidence.append(
                    "cycle ${cycle + 1}: stopped behind \"$front\", " +
                        "$presses BACK press(es), resumed; ",
                )

                val reply = JSONObject(scenario.awaitValue("window.__documentReply"))
                assertFalse(reply.toString(), reply.getBoolean("ok"))
                assertEquals("PICKER_CANCELLED", reply.getString("name"))
                assertEquals(
                    "the port survived the picker",
                    0,
                    connection.closeCount.get(),
                )
                assertTrue(connection.isOpen)
                // A BACK that reached the resumed host would have finished it and
                // brought up a new Activity instance; the port would be closed.
                var current = 0
                scenario.onActivity { current = System.identityHashCode(it) }
                assertEquals(
                    "no BACK reached the host after it resumed (same Activity)",
                    activityId,
                    current,
                )
            }
        }
        // Recorded so a reviewer can see the transitions, the picker window and
        // the per-cycle BACK count that the fix is built on.
        Log.i("ELRS_PICKER_EVIDENCE", evidence.toString())
    }

    @Test
    fun aStopThatIsNotBehindAPickerVoidsTheSessionSoAResumedPageMustOpenAgain() {
        // Home or the lock screen, with no picker of the host's own in front:
        // this is the ordinary stop, and write authority ends with it. Proven
        // here end to end through the real Activity and the real page bridge —
        // the port closes and the page, which still holds the old session id,
        // is made to open again.
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.awaitApplication()
            val sessionId = scenario.openFakePort()
            val connection = requireNotNull(backend.lastConnection())

            scenario.moveToState(Lifecycle.State.CREATED)
            assertEquals("a stop closes the port", 1, connection.closeCount.get())
            scenario.moveToState(Lifecycle.State.RESUMED)

            val stale = scenario.bridgeCall(
                """{"callId":"stale","operation":"write","sessionId":"$sessionId","bytes":[1]}""",
            )
            assertFalse(stale.toString(), stale.getBoolean("ok"))
            assertEquals("SESSION_NOT_OPEN", stale.getString("reason"))

            val reopened = scenario.openFakePort()
            assertFalse("a resumed host gets a fresh session", sessionId == reopened)
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

    /**
     * Dismisses the host's own Storage Access Framework picker and waits for the
     * Activity to return to RESUMED.
     *
     * A single BACK is not reliable: the real DocumentsUI picker can still be
     * loading when the event arrives and drop it, and it sometimes opens a level
     * deep. That raced the CI emulator and failed this test intermittently on
     * bytes that were otherwise green (run 42 red, run 43 green, identical
     * instrumentation). So BACK is re-sent each time the host has not yet
     * resumed. This makes only the *dismissal* robust — every assertion after it
     * (the pending call resolves PICKER_CANCELLED, the port survived) is
     * unchanged, so the lifecycle guarantee under test is not weakened, only the
     * picker-load race is taken out of it. BACK is never sent once the host is
     * back, so it cannot leak through to the application.
     */
    private fun ActivityScenario<MainActivity>.dismissOwnPickerAndAwaitResume(): Int {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        val deadline = System.currentTimeMillis() + AWAIT_SECONDS * 1_000
        var presses = 0
        while (System.currentTimeMillis() < deadline) {
            // Checked before each press and never once the host is back, so a
            // BACK is only ever sent while the picker is still in front.
            if (state == Lifecycle.State.RESUMED) return presses
            automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            presses += 1
            Thread.sleep(BACK_RETRY_MILLIS)
        }
        throw AssertionError(
            "the host never came back after the picker | state=$state | " +
                "reply=${evaluate("window.__documentReply")}",
        )
    }

    /** The package that owns the active window, for recording which app is in
     *  front — the DocumentsUI picker while the host is stopped, the host after
     *  it resumes. Best effort: accessibility may not answer, hence "unknown". */
    private fun foregroundPackage(): String =
        runCatching {
            InstrumentationRegistry.getInstrumentation()
                .uiAutomation.rootInActiveWindow
                ?.packageName
                ?.toString()
        }.getOrNull() ?: "unknown"

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

    /**
     * Opens the fake device through the page's own bridge, as the app would,
     * and returns the session id the bridge assigned. A fresh call id each time
     * so a second open in one test is not confused with the first.
     */
    private fun ActivityScenario<MainActivity>.openFakePort(): String {
        val reply = bridgeCall(
            """{"callId":"open${openCallId++}","operation":"open","deviceId":"${FakeUsbBackend.DEFAULT_DEVICE}"}""",
        )
        assertTrue(reply.toString(), reply.getBoolean("ok"))
        return reply.getJSONObject("result").getString("sessionId")
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

    private var openCallId = 0

    private companion object {
        const val AWAIT_SECONDS = 30L
        const val POLL_MILLIS = 100L
        // Long enough for the DocumentsUI picker to finish loading between
        // BACK presses, short enough to retry several times within the window.
        const val BACK_RETRY_MILLIS = 1_000L
        // How many open/stop/dismiss/resume cycles one run exercises, so the
        // picker-load non-determinism is met more than once per CI run.
        const val PICKER_CYCLES = 3
    }
}
