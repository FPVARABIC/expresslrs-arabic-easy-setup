package com.fpvarabic.elrs.bridge

import android.content.pm.ActivityInfo
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject
import org.json.JSONTokener
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

    /**
     * That the recovery envelope's primitives actually exist in this WebView.
     *
     * The envelope is PBKDF2-HMAC-SHA-256 and AES-256-GCM through WebCrypto,
     * and its logic is proven in the JVM suite. What that suite cannot prove
     * is the platform claim: `crypto.subtle` is only defined in a secure
     * context, and this host serves the application from
     * `https://appassets.androidplatform.net/` through `WebViewAssetLoader`
     * rather than from a real origin. If that arrangement did not count as
     * secure, every recovery export on Android would fail at the moment of
     * saving — which is the moment an operator is relying on it.
     *
     * So this seals and opens a short payload with the same construction the
     * envelope uses, inside the packaged WebView, and requires the plaintext
     * back and a tampered tag refused. It asserts the primitives, not the
     * module.
     */
    @Test
    fun theRecoveryEnvelopesPrimitivesWorkInsideThePackagedWebView() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.awaitApplication()

            assertEquals(
                "crypto.subtle must exist: without a secure context there is no envelope",
                "true",
                scenario.evaluate("typeof crypto !== 'undefined' && !!crypto.subtle"),
            )
            assertEquals(
                "the packaged origin must be treated as a secure context",
                "true",
                scenario.evaluate("window.isSecureContext"),
            )

            scenario.evaluate(
                """
                window.__vaultProbe = { state: 'pending' };
                (async function () {
                  const clock = () => performance.now();
                  // A heartbeat on the event loop, started before the
                  // derivation and stopped after it. If WebCrypto blocked the
                  // main thread here, none of these would run while the key
                  // was being derived, and every progress message, cancel
                  // button and animation in the application would freeze for
                  // however long the derivation takes. Counting them is the
                  // only way to know which of the two it is on this platform.
                  let beats = 0;
                  let lastBeat = clock();
                  let worstGap = 0;
                  const heart = setInterval(function () {
                    const now = clock();
                    worstGap = Math.max(worstGap, now - lastBeat);
                    lastBeat = now;
                    beats += 1;
                  }, 25);
                  try {
                    const encoder = new TextEncoder();
                    const salt = crypto.getRandomValues(new Uint8Array(16));
                    const nonce = crypto.getRandomValues(new Uint8Array(12));
                    const material = await crypto.subtle.importKey(
                      'raw', encoder.encode('a-real-recovery-passphrase'),
                      'PBKDF2', false, ['deriveKey'],
                    );
                    // The production work factor, not a reduced one. This is
                    // the measurement: an operator waits exactly this long,
                    // twice, every time they export a recovery package.
                    const derivationStarted = clock();
                    const beatsBeforeDerivation = beats;
                    const key = await crypto.subtle.deriveKey(
                      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 },
                      material, { name: 'AES-GCM', length: 256 }, false,
                      ['encrypt', 'decrypt'],
                    );
                    const pbkdf2Ms = clock() - derivationStarted;
                    const beatsDuringDerivation = beats - beatsBeforeDerivation;

                    const plaintext = encoder.encode('wifi-password=hunter2-hunter2');
                    const prefix = encoder.encode('ELRSRCV1-header');
                    const sealStarted = clock();
                    const sealed = new Uint8Array(await crypto.subtle.encrypt(
                      { name: 'AES-GCM', iv: nonce, additionalData: prefix, tagLength: 128 },
                      key, plaintext,
                    ));
                    const sealMs = clock() - sealStarted;
                    // The secret must not survive in the ciphertext.
                    const asText = String.fromCharCode(...sealed);
                    if (asText.includes('hunter2')) {
                      window.__vaultProbe = { state: 'leaked' };
                      return;
                    }
                    const openStarted = clock();
                    const opened = new Uint8Array(await crypto.subtle.decrypt(
                      { name: 'AES-GCM', iv: nonce, additionalData: prefix, tagLength: 128 },
                      key, sealed,
                    ));
                    const openMs = clock() - openStarted;
                    if (new TextDecoder().decode(opened) !== 'wifi-password=hunter2-hunter2') {
                      window.__vaultProbe = { state: 'round-trip-mismatch' };
                      return;
                    }
                    // And a flipped bit in the tag must be refused rather than
                    // returning plaintext.
                    const tampered = sealed.slice();
                    tampered[tampered.length - 1] ^= 1;
                    let tamperRefused = false;
                    try {
                      await crypto.subtle.decrypt(
                        { name: 'AES-GCM', iv: nonce, additionalData: prefix, tagLength: 128 },
                        key, tampered,
                      );
                    } catch {
                      tamperRefused = true;
                    }
                    if (!tamperRefused) {
                      window.__vaultProbe = { state: 'tamper-accepted' };
                      return;
                    }
                    window.__vaultProbe = {
                      state: 'ok',
                      pbkdf2Ms: Math.round(pbkdf2Ms),
                      sealMs: Math.round(sealMs * 1000) / 1000,
                      openMs: Math.round(openMs * 1000) / 1000,
                      beatsDuringDerivation,
                      worstGapMs: Math.round(worstGap),
                      sealedBytes: sealed.length,
                    };
                  } catch (error) {
                    window.__vaultProbe = { state: 'threw: ' + String(error) };
                  } finally {
                    clearInterval(heart);
                  }
                })();
                """.trimIndent(),
            )

            // Deliberately generous. 600,000 PBKDF2 iterations on an emulated
            // ARM-on-x86 core is far slower than on the phone this will run
            // on, and a tight bound here would turn a slow CI runner into a
            // red build about nothing. The timeout is a liveness check; the
            // measurement below is the result.
            val deadline = System.currentTimeMillis() + 120_000
            var last = "null"
            while (System.currentTimeMillis() < deadline) {
                last = scenario.evaluate("JSON.stringify(window.__vaultProbe)")
                if (!last.contains("pending")) break
                Thread.sleep(250)
            }

            // `evaluateJavascript` hands back a JSON value, and the value here
            // is itself a JSON string, so it is unwrapped once before parsing
            // rather than by trimming quotes by hand. A probe that never ran
            // at all comes back as the literal `null`, which is a different
            // failure from a probe that ran and reported a problem.
            val encoded = JSONTokener(last).nextValue()
            assertTrue(
                "the probe never reported: the page returned $last within 120s",
                encoded is String,
            )
            val probe = JSONObject(encoded as String)
            assertEquals(
                "the envelope's construction must work in the packaged WebView",
                "ok",
                probe.optString("state"),
            )

            val pbkdf2Ms = probe.getInt("pbkdf2Ms")
            val sealMs = probe.getDouble("sealMs")
            val openMs = probe.getDouble("openMs")
            val beats = probe.getInt("beatsDuringDerivation")
            val worstGapMs = probe.getInt("worstGapMs")

            // Recorded rather than only asserted: the numbers are the point of
            // this test, and a report that says "it works" without them tells
            // an operator nothing about how long they will be waiting.
            //
            // This is one emulator image on one CI runner. It is evidence
            // about this platform build, not a figure that transfers to any
            // particular phone — a low-end device will be slower and a recent
            // flagship faster, and neither has been measured.
            val measurement =
                "ELRS_WEBCRYPTO_MEASUREMENT " + JSONObject()
                    .put("device", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
                    .put("fingerprint", android.os.Build.FINGERPRINT)
                    .put("sdkInt", android.os.Build.VERSION.SDK_INT)
                    .put("abis", android.os.Build.SUPPORTED_ABIS.joinToString(","))
                    .put("cores", Runtime.getRuntime().availableProcessors())
                    .put("webViewVersion", webViewVersion())
                    .put("pbkdf2Iterations", 600_000)
                    .put("pbkdf2Ms", pbkdf2Ms)
                    .put("aesGcmSealMs", sealMs)
                    .put("aesGcmOpenMs", openMs)
                    .put("eventLoopBeatsDuringDerivation", beats)
                    .put("worstEventLoopGapMs", worstGapMs)
                    .toString()
            // Both, deliberately. `println` reaches the instrumentation result
            // XML; `Log.i` reaches logcat. Which of the two a given Gradle
            // version keeps is not worth depending on for the one output this
            // test exists to produce.
            println(measurement)
            android.util.Log.i("ElrsWebCrypto", measurement)

            // The one thing worth failing on besides correctness: whether the
            // interface can still respond while a key is being derived. An
            // export derives twice — once to seal, once to open what it wrote
            // — so a blocking implementation would freeze the application for
            // the whole of both, with no way to say so and no way to cancel.
            assertTrue(
                "the event loop must keep running while PBKDF2 is pending, " +
                    "or the interface freezes for the whole derivation " +
                    "(pbkdf2Ms=$pbkdf2Ms, beats=$beats, worstGapMs=$worstGapMs)",
                beats > 0,
            )
            // A sanity floor on the measurement itself. A derivation that
            // reports near-zero milliseconds did not run 600,000 iterations,
            // and a measurement that cannot be trusted is worse than none.
            assertTrue(
                "600,000 iterations cannot take $pbkdf2Ms ms; the measurement is wrong",
                pbkdf2Ms >= 20,
            )
        }
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
    private fun ActivityScenario<MainActivity>.diagnose(): String {
        fun probe(script: String) = runCatching { evaluate(script) }.getOrElse { "?" }
        // One line: Gradle's console reporter shows only the first line or two
        // of an assertion message.
        return " | location=${probe("window.location.href")}" +
            " | readyState=${probe("document.readyState")}" +
            " | bridge=${probe("typeof window.elrsNativeBridge")}" +
            " | buttons=${probe("document.querySelectorAll('button').length")}" +
            " | lang=${probe("document.documentElement.lang")}" +
            " | head=${probe("document.head && document.head.innerHTML.slice(0, 300)")}"
    }

    /**
     * Which WebView actually rendered the page.
     *
     * WebView is a separately updatable system component, so "API 34" does not
     * pin it: the same emulator image can run a two-year-old WebView or
     * yesterday's. A timing measurement that does not name the engine that
     * produced it cannot be compared with anything later.
     */
    private fun webViewVersion(): String =
        runCatching {
            android.webkit.WebView.getCurrentWebViewPackage()
                ?.let { "${it.packageName} ${it.versionName}" }
                ?: "unknown"
        }.getOrElse { "unavailable" }

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
