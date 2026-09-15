package com.fpvarabic.elrs.bridge

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.util.Log
import android.view.WindowManager
import android.view.accessibility.AccessibilityWindowInfo
import androidx.activity.OnBackPressedCallback
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
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
        // Lets `windowSnapshot` list every window in front, not only the active
        // one, so a keyboard or a second picker level shows in the evidence.
        // Best effort: the evidence records when it is unavailable.
        runCatching {
            val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
            automation.serviceInfo = automation.serviceInfo.apply {
                flags = flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            }
        }
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
        // Runs 42, 43 and 44 went red, green, red on identical bytes: dismissing
        // the real DocumentsUI picker with a single BACK is non-deterministic on
        // the CI emulator. *Why* is not proven. A press dropped by a picker
        // still loading, a keyboard in front of the picker, and a picker that
        // opens a level deep and needs two presses all look the same from one
        // press — and the three cycles of run 46 (one press each) reproduced
        // none of them. So this records, per cycle and per press, the windows
        // in front (kind, package, title, focus), which is what would tell
        // those apart the next time a cycle needs more than one press; and it
        // proves directly the two things that must hold whatever the picker
        // does: the cancel resolves to PICKER_CANCELLED with the port kept, and
        // no BACK reaches this host — counted at the host's own back-press
        // dispatcher rather than inferred from the Activity instance alone —
        // with the page neither navigated nor reloaded.
        // One logcat line per cycle (a single line would outgrow logcat's
        // payload with three cycles of window lists); the cycle in progress is
        // still logged from `finally` if an assertion cuts it short.
        var cycleEvidence = StringBuilder()
        try {
            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                scenario.awaitApplication()
                scenario.openFakePort()
                val connection = requireNotNull(backend.lastConnection())
                var activityId = 0
                val hostBackPresses = AtomicInteger(0)
                scenario.onActivity { activity ->
                    activityId = System.identityHashCode(activity)
                    // Counts every BACK the host receives, then hands it on to
                    // what the host would have done with it anyway (finish), so
                    // the production behaviour is unchanged and the
                    // same-Activity check below still stands on its own.
                    activity.onBackPressedDispatcher.addCallback(
                        activity,
                        object : OnBackPressedCallback(true) {
                            override fun handleOnBackPressed() {
                                hostBackPresses.incrementAndGet()
                                isEnabled = false
                                activity.onBackPressedDispatcher.onBackPressed()
                                isEnabled = true
                            }
                        },
                    )
                }
                val pageBefore = scenario.pageIdentity()

                repeat(PICKER_CYCLES) { cycle ->
                    val evidence = StringBuilder()
                    cycleEvidence = evidence
                    val started = System.currentTimeMillis()
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
                    val stoppedAfter = System.currentTimeMillis() - started
                    val front = awaitForegroundPackage()
                    evidence.append(
                        "cycle ${cycle + 1}: host stopped ${stoppedAfter}ms after the call, " +
                            "in front: $front, windows ${windowSnapshot()}; ",
                    )
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

                    val presses = scenario.dismissOwnPickerAndAwaitResume(evidence, cycle + 1)

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
                    // The direct count: the host's own dispatcher saw no BACK at
                    // all, before or after the resume.
                    assertEquals(
                        "no BACK reached the host's back-press dispatcher",
                        0,
                        hostBackPresses.get(),
                    )
                    // And the page is the one that opened the picker: same URL,
                    // same history depth, same load — not navigated, not reloaded.
                    val pageAfter = scenario.pageIdentity()
                    assertEquals(
                        "the picker round trip must not navigate or reload the page",
                        pageBefore,
                        pageAfter,
                    )
                    evidence.append(
                        "cycle ${cycle + 1}: cancelled with $presses BACK press(es), same Activity, " +
                            "host dispatcher saw ${hostBackPresses.get()} BACK, page $pageAfter unchanged",
                    )
                    // Recorded so a reviewer sees the transitions, the windows
                    // in front before every press and the per-cycle BACK count —
                    // the evidence a cause would have to explain.
                    Log.i("ELRS_PICKER_EVIDENCE", evidence.toString())
                    cycleEvidence = StringBuilder()
                }
            }
        } finally {
            if (cycleEvidence.isNotEmpty()) {
                Log.i("ELRS_PICKER_EVIDENCE", "unfinished $cycleEvidence")
            }
        }
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
     * Dismisses the host's own Storage Access Framework picker with BACK and
     * waits for the Activity to return to RESUMED, recording the windows in
     * front before every press.
     *
     * One BACK did not always do it on the CI emulator (run 42 red, 43 green,
     * 44 red, identical bytes). Which of the candidate causes that was — a
     * press dropped by a picker still loading, a keyboard in front of the
     * picker, or a picker that opened a level deep and needed two — is not
     * proven: run 46's three cycles each needed exactly one press. The
     * per-press window record is what would tell them apart when a cycle does
     * need more than one: an `ime` window before the first press, a
     * DocumentsUI window whose title changes between presses, or the same
     * window and title before both.
     *
     * BACK is only ever sent while the host is not RESUMED, checked before
     * each press, so the dismissal never presses into a host that is back;
     * whether one nonetheless reached it is proven by the caller at the host's
     * own back-press dispatcher, not assumed here. Every assertion after the
     * dismissal is unchanged.
     */
    private fun ActivityScenario<MainActivity>.dismissOwnPickerAndAwaitResume(
        evidence: StringBuilder,
        cycle: Int,
    ): Int {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        val started = System.currentTimeMillis()
        val deadline = started + AWAIT_SECONDS * 1_000
        var presses = 0
        while (System.currentTimeMillis() < deadline) {
            // Checked before each press and never once the host is back, so a
            // BACK is only ever sent while the picker is still in front.
            if (state == Lifecycle.State.RESUMED) {
                evidence.append(
                    "cycle $cycle: host resumed at +${System.currentTimeMillis() - started}ms; ",
                )
                return presses
            }
            evidence.append(
                "cycle $cycle: BACK ${presses + 1} at +${System.currentTimeMillis() - started}ms, " +
                    "state=$state, windows ${windowSnapshot()}; ",
            )
            automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            presses += 1
            Thread.sleep(BACK_RETRY_MILLIS)
        }
        throw AssertionError(
            "the host never came back after the picker | state=$state | " +
                "reply=${evaluate("window.__documentReply")} | evidence=$evidence",
        )
    }

    /**
     * The package that owns the active window while the host is stopped —
     * the DocumentsUI picker, when accessibility can see it. It reports no
     * active window while the picker's window is still coming up (run 46,
     * cycle 1), so this polls for a bounded time; what it still cannot see is
     * recorded as unknown, which is a gap in the evidence and never taken as a
     * window's identity.
     */
    private fun awaitForegroundPackage(): String {
        val deadline = System.currentTimeMillis() + FRONT_WINDOW_MILLIS
        while (true) {
            val front = foregroundPackage()
            if (front != null) return front
            if (System.currentTimeMillis() >= deadline) {
                return "unknown (no active window reported within ${FRONT_WINDOW_MILLIS}ms)"
            }
            Thread.sleep(POLL_MILLIS)
        }
    }

    private fun foregroundPackage(): String? =
        runCatching {
            InstrumentationRegistry.getInstrumentation()
                .uiAutomation.rootInActiveWindow
                ?.packageName
                ?.toString()
        }.getOrNull()

    /**
     * Every window accessibility can see, as `[kind package "title" active
     * focused]`: `app` for the picker or this host, `ime` for a keyboard,
     * `system` for a dialog. Recorded as unavailable, never invented, when the
     * service cannot list them.
     */
    private fun windowSnapshot(): String =
        runCatching {
            val windows = InstrumentationRegistry.getInstrumentation().uiAutomation.windows
            if (windows.isEmpty()) return@runCatching "(none reported)"
            windows.joinToString(" ") { window ->
                val kind = when (window.type) {
                    AccessibilityWindowInfo.TYPE_APPLICATION -> "app"
                    AccessibilityWindowInfo.TYPE_INPUT_METHOD -> "ime"
                    AccessibilityWindowInfo.TYPE_SYSTEM -> "system"
                    else -> "type${window.type}"
                }
                val packageName = window.root?.packageName ?: "?"
                val marks = (if (window.isActive) " active" else "") +
                    (if (window.isFocused) " focused" else "")
                "[$kind $packageName \"${window.title ?: ""}\"$marks]"
            }
        }.getOrElse { "(unavailable: ${it.javaClass.simpleName})" }

    /**
     * What a picker round trip must not change about the page: its URL, its
     * history depth, and a marker set once on this load — a reload would come
     * back without it.
     */
    private fun ActivityScenario<MainActivity>.pageIdentity(): String =
        evaluate(
            "(window.__elrsLoadMark = window.__elrsLoadMark || String(Date.now())) + " +
                "' at ' + location.href + ' history=' + history.length",
        )

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
        // How long to wait for accessibility to name the window in front of a
        // stopped host before recording that it could not.
        const val FRONT_WINDOW_MILLIS = 2_000L
    }
}
