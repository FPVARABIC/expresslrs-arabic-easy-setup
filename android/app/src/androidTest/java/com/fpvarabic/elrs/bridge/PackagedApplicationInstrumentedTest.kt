package com.fpvarabic.elrs.bridge

import android.content.pm.ActivityInfo
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
 * The real Activity, loading the real bundled application.
 *
 * Everything else in this suite tests a piece. This tests the thing that
 * actually ships: the APK's own `index.html`, served from
 * `https://appassets.androidplatform.net/`, under the document's own Content
 * Security Policy, with the bridge attached to a fake device.
 */
@RunWith(AndroidJUnit4::class)
class PackagedApplicationInstrumentedTest {

    private lateinit var backend: FakeUsbBackend

    @Before
    fun setUp() {
        backend = FakeUsbBackend()
        backend.permissions[FakeUsbBackend.DEFAULT_DEVICE] = UsbDeviceGate.Permission.GRANTED
        MainActivity.testBackendOverride = backend
    }

    @After
    fun tearDown() {
        MainActivity.testBackendOverride = null
    }

    @Test
    fun theBundledApplicationRendersAndReachesTheBridge() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.awaitApplication()

            // The application mounted from packaged bytes, not from the network.
            assertEquals(
                "the packaged origin must be what the document reports",
                "\"${MainActivity.APPLICATION_ORIGIN}\"",
                scenario.evaluate("window.location.origin"),
            )
            assertTrue(
                "the application must render its own UI",
                scenario.evaluate("document.querySelectorAll('button').length")
                    .toInt() > 0,
            )
            // The strict document policy is in force and did not stop the
            // host's document-start script from installing the bridge.
            assertTrue(
                "the document must carry its Content-Security-Policy",
                scenario.evaluate(
                    "document.querySelector('meta[http-equiv=\\'Content-Security-Policy\\']')" +
                        ".getAttribute('content')",
                ).contains("script-src 'self'"),
            )
            assertEquals("1", scenario.evaluate("window.elrsNativeBridge.version"))
        }
    }

    @Test
    fun everyControlIsRenderedInBothArabicAndEnglish() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.awaitApplication()

            val arabic = scenario.describeControls()
            assertEquals("the default document is Arabic", "ar", arabic.getString("lang"))
            assertEquals("rtl", arabic.getString("dir"))
            assertTrue("Arabic must render controls", arabic.getInt("controls") > 0)
            assertEquals(
                "no control may be rendered with no accessible name",
                0,
                arabic.getInt("unnamed"),
            )

            scenario.switchLocale()

            val english = scenario.describeControls()
            assertEquals("en", english.getString("lang"))
            assertEquals("ltr", english.getString("dir"))
            assertEquals(
                "the same controls must exist in both locales",
                arabic.getInt("controls"),
                english.getInt("controls"),
            )
            assertEquals(0, english.getInt("unnamed"))
            // Switching locale must actually change the text, not just the
            // attribute: identical labels would mean one locale is untranslated.
            assertFalse(
                "the two locales must not render identical text",
                arabic.getString("labels") == english.getString("labels"),
            )
        }
    }

    @Test
    fun rotationRecreatesTheActivityWithNoPortStillHeld() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.awaitApplication()
            val sessionId = scenario.openFakePort()
            assertEquals(1, backend.openCount.get())

            // The manifest declares `configChanges`, so a rotation alone does
            // not recreate the Activity. Both are exercised: the rotation the
            // host handles itself, then the recreation it does not.
            scenario.onActivity { activity ->
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            }
            scenario.recreate()
            scenario.awaitApplication()

            // The old Activity's bridge was closed, so the port it held is
            // released and the session it minted is void.
            assertEquals(
                "the port must not survive the Activity that opened it",
                1,
                backend.connections.first().closeCount.get(),
            )
            val reply = scenario.bridgeCall(
                """{"callId":"stale","operation":"write","sessionId":"$sessionId","bytes":[1]}""",
            )
            assertFalse(reply.getBoolean("ok"))
            assertTrue(
                reply.getString("reason") in
                    setOf(BridgeCore.Reason.SESSION_NOT_OPEN, BridgeCore.Reason.SESSION_MISMATCH),
            )
        }
    }

    @Test
    fun leavingTheScreenRevokesWriteAuthorityAndReturningDoesNotRestoreIt() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.awaitApplication()
            val sessionId = scenario.openFakePort()

            scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED)
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED)
            scenario.awaitApplication()

            assertEquals(
                "the port must be released when the host leaves the screen",
                1,
                backend.connections.first().closeCount.get(),
            )
            val reply = scenario.bridgeCall(
                """{"callId":"stale","operation":"write","sessionId":"$sessionId","bytes":[1]}""",
            )
            assertFalse(reply.getBoolean("ok"))
            assertEquals(BridgeCore.Reason.SESSION_NOT_OPEN, reply.getString("reason"))

            // A resumed host can open again — authority is re-earned, not restored.
            val fresh = scenario.openFakePort()
            assertFalse(fresh == sessionId)
        }
    }

    @Test
    fun destroyingTheActivityClosesEveryEndpoint() {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        scenario.awaitApplication()
        scenario.openFakePort()
        scenario.close()

        // ActivityScenario.close() drives the Activity to DESTROYED, so this is
        // the real onDestroy path rather than a direct call to the bridge.
        assertTrue("a destroyed host may hold nothing open", backend.connections.all { !it.isOpen })
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
        throw AssertionError(
            "the packaged application never rendered a control in ${AWAIT_SECONDS}s" +
                diagnose(),
        )
    }

    /** Opens the fake device through the page's own bridge, as the app would. */
    private fun ActivityScenario<MainActivity>.openFakePort(): String {
        val reply = bridgeCall(
            """{"callId":"open","operation":"open","deviceId":"${FakeUsbBackend.DEFAULT_DEVICE}"}""",
        )
        assertTrue(reply.toString(), reply.getBoolean("ok"))
        return reply.getJSONObject("result").getString("sessionId")
    }

    /** Sends one raw request through the page and returns the host's reply. */
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
        val deadline = System.currentTimeMillis() + AWAIT_SECONDS * 1_000
        while (System.currentTimeMillis() < deadline) {
            val value = evaluate("window.__bridgeReply")
            if (value != "null" && value.startsWith("\"")) {
                return JSONObject(JSONObject("{\"v\":$value}").getString("v"))
            }
            Thread.sleep(POLL_MILLIS)
        }
        throw AssertionError("the bridge never replied to $request" + diagnose())
    }

    private fun ActivityScenario<MainActivity>.describeControls(): JSONObject {
        val raw = evaluate(
            """
            JSON.stringify({
              lang: document.documentElement.lang,
              dir: document.documentElement.dir,
              controls: document.querySelectorAll(
                'button, [role="button"], input, select, textarea, a[href]').length,
              unnamed: Array.prototype.filter.call(
                document.querySelectorAll('button, [role="button"]'),
                function (node) {
                  var name = (node.getAttribute('aria-label') || node.textContent || '').trim();
                  return name.length === 0;
                }).length,
              labels: Array.prototype.map.call(
                document.querySelectorAll('button'),
                function (node) { return (node.textContent || '').trim(); }).join('|'),
            })
            """.trimIndent(),
        )
        return JSONObject(JSONObject("{\"v\":$raw}").getString("v"))
    }

    /**
     * Uses the application's own language control rather than reloading with a
     * different setting, so this exercises the switch an operator would use.
     */
    private fun ActivityScenario<MainActivity>.switchLocale() {
        evaluate(
            """
            (function () {
              // The switcher marks each choice with its own `lang`, so this
              // finds the control by what it is rather than by its text.
              var control = document.querySelector('.language-switch button[lang="en"]');
              if (!control) return 'not-found';
              control.click();
              return 'clicked';
            })();
            """.trimIndent(),
        )
        val deadline = System.currentTimeMillis() + AWAIT_SECONDS * 1_000
        while (System.currentTimeMillis() < deadline) {
            if (evaluate("document.documentElement.lang") == "\"en\"") return
            Thread.sleep(POLL_MILLIS)
        }
        throw AssertionError("the application never switched to English" + diagnose())
    }

    /**
     * What the page knows when something did not happen.
     *
     * A bare "never rendered" cannot be diagnosed from a CI log without the
     * emulator in front of you, and the emulator is gone by the time anyone
     * reads it.
     */
    private fun ActivityScenario<MainActivity>.diagnose(): String = buildString {
        append("\n  location:     ${runCatching { evaluate("window.location.href") }.getOrElse { "?" }}")
        append("\n  readyState:   ${runCatching { evaluate("document.readyState") }.getOrElse { "?" }}")
        append("\n  bridge:       ${runCatching { evaluate("typeof window.elrsNativeBridge") }.getOrElse { "?" }}")
        append("\n  buttons:      ${runCatching { evaluate("document.querySelectorAll('button').length") }.getOrElse { "?" }}")
        append("\n  lang/dir:     ${runCatching { evaluate("document.documentElement.lang + '/' + document.documentElement.dir") }.getOrElse { "?" }}")
        append("\n  head:         ${runCatching { evaluate("document.head && document.head.innerHTML.slice(0, 400)") }.getOrElse { "?" }}")
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
