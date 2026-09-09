package com.fpvarabic.elrs.bridge

import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The WebView half: what actually gets injected, into which frames, and what
 * the WebView is allowed to load.
 *
 * These use a real WebView rather than a mock, because the properties under
 * test — origin matching on the message listener, main-frame reporting,
 * navigation interception — are enforced by Chromium and cannot be proved by
 * asserting that a setter was called.
 */
@RunWith(AndroidJUnit4::class)
class WebViewHostInstrumentedTest {

    private lateinit var webView: WebView
    private lateinit var backend: FakeUsbBackend
    private var bridge: UsbSerialBridge? = null

    @Before
    fun setUp() {
        backend = FakeUsbBackend()
        onMainThread {
            webView = WebView(InstrumentationRegistry.getInstrumentation().targetContext)
            webView.settings.javaScriptEnabled = true
        }
    }

    @After
    fun tearDown() {
        onMainThread {
            bridge?.close()
            bridge = null
            webView.destroy()
        }
    }

    // ---- injection -------------------------------------------------------

    @Test
    fun installsTheBridgeInTheTrustedTopLevelDocument() {
        attach()
        loadAt(ORIGIN, "<html><body>ready</body></html>")

        assertEquals("\"object\"", evaluate("typeof window.elrsNativeHost"))
        // The shim runs at document start, so the page-facing bridge is present
        // before any application code looks for it.
        assertEquals("\"object\"", evaluate("typeof window.elrsNativeBridge"))
        assertEquals("1", evaluate("window.elrsNativeBridge.version"))
        assertEquals(
            "\"function\"",
            evaluate("typeof window.elrsNativeBridge.serial.requestPort"),
        )
    }

    @Test
    fun doesNotInstallTheBridgeInADocumentFromAnotherOrigin() {
        attach()
        loadAt("https://evil.example", "<html><body>hostile</body></html>")

        assertEquals("\"undefined\"", evaluate("typeof window.elrsNativeHost"))
        assertEquals("\"undefined\"", evaluate("typeof window.elrsNativeBridge"))
    }

    @Test
    fun refusesAnythingASameOriginSubframeSends() {
        attach()
        loadAt(
            ORIGIN,
            """
            <html><body>
            <iframe id="child" srcdoc="&lt;script&gt;
              if (window.elrsNativeHost) {
                window.elrsNativeHost.onmessage = function (event) {
                  parent.postMessage(event.data, '*');
                };
                window.elrsNativeHost.postMessage(
                  JSON.stringify({ callId: 'frame', operation: 'list' }));
              } else {
                parent.postMessage(JSON.stringify({ absent: true }), '*');
              }
            &lt;/script&gt;"></iframe>
            <script>
              window.fromFrame = null;
              window.addEventListener('message', function (event) {
                window.fromFrame = event.data;
              });
            </script>
            </body></html>
            """.trimIndent(),
        )

        val seen = awaitScript("window.fromFrame")
        val payload = JSONObject(seen)
        // Either the listener was never injected into the subframe, or it was
        // and the host refused it by name. Both are acceptable; a subframe
        // getting a device list is not.
        if (payload.has("absent")) {
            assertTrue(payload.getBoolean("absent"))
        } else {
            assertFalse(payload.getBoolean("ok"))
            assertEquals(BridgeCore.Reason.NOT_MAIN_FRAME, payload.getString("reason"))
        }
        assertEquals("no device was ever opened", 0, backend.openCount.get())
    }

    // ---- promise mapping --------------------------------------------------

    @Test
    fun resolvesAndRejectsTheSamePromisesTheApplicationAwaits() {
        backend.permissions[FakeUsbBackend.DEFAULT_DEVICE] = UsbDeviceGate.Permission.GRANTED
        attach()
        loadAt(ORIGIN, "<html><body>ready</body></html>")

        // A resolved promise: requestPort hands back a Web Serial-shaped port.
        evaluate(
            """
            window.__result = null;
            window.elrsNativeBridge.serial.requestPort().then(function (port) {
              return port.open({ baudRate: 420000 }).then(function () {
                var writer = port.writable.getWriter();
                return writer.write(new Uint8Array([0xec, 0x04, 0x28])).then(function () {
                  return port.close();
                });
              }).then(function () {
                window.__result = JSON.stringify({ ok: true, info: port.getInfo() });
              });
            }).catch(function (error) {
              window.__result = JSON.stringify({ ok: false, name: error.name });
            });
            """.trimIndent(),
        )
        val success = JSONObject(awaitScript("window.__result"))
        assertTrue(success.toString(), success.getBoolean("ok"))
        assertEquals(0x10c4, success.getJSONObject("info").getInt("usbVendorId"))
        assertEquals(1, backend.written.size)
        assertEquals(0xec, backend.written.first()[0].toInt() and 0xff)

        // A rejected promise carries the host's machine-readable reason, not a
        // generic failure the page would have to guess at.
        evaluate(
            """
            window.__result = null;
            window.elrsNativeHost.postMessage('not json at all');
            window.__reject = null;
            var port = null;
            window.elrsNativeBridge.serial.requestPort().then(function (opened) {
              port = opened;
              return port.open({ baudRate: 420000 });
            }).then(function () {
              var writer = port.writable.getWriter();
              port._sessionId = 'deadbeef';
              return writer.write(new Uint8Array([1]));
            }).then(function () {
              window.__result = JSON.stringify({ ok: true });
            }, function (error) {
              window.__result = JSON.stringify({ ok: false, name: error.name });
            });
            """.trimIndent(),
        )
        val failure = JSONObject(awaitScript("window.__result"))
        assertFalse(failure.toString(), failure.getBoolean("ok"))
        assertEquals(BridgeCore.Reason.SESSION_MISMATCH, failure.getString("name"))
    }

    @Test
    fun carriesTheBuildIdentityIntoThePage() {
        attach(identity = JSONObject().put("webBuildSha256", "abc123").put("bridge", "AVAILABLE"))
        loadAt(ORIGIN, "<html><body>ready</body></html>")

        assertEquals("\"abc123\"", evaluate("window.elrsNativeBridge.host.webBuildSha256"))
        assertEquals("\"AVAILABLE\"", evaluate("window.elrsNativeBridge.host.bridge"))
    }

    // ---- navigation and resource confinement ------------------------------

    @Test
    fun refusesToNavigateAwayFromThePackagedApplication() {
        val opened = AtomicReference<Uri?>(null)
        val client = HostWebViewClient(assetLoader()) { uri -> opened.set(uri) }

        assertFalse(
            "the packaged application may navigate within itself",
            client.shouldOverrideUrlLoading(
                webView,
                request("$ORIGIN/assets/web/index.html", isMainFrame = true),
            ),
        )
        assertNull(opened.get())

        assertTrue(
            "a documentation link must leave this WebView",
            client.shouldOverrideUrlLoading(
                webView,
                request("https://www.expresslrs.org/quick-start/", isMainFrame = true),
            ),
        )
        assertEquals("https://www.expresslrs.org/quick-start/", opened.get().toString())

        opened.set(null)
        assertTrue(
            "a subframe may not navigate at all",
            client.shouldOverrideUrlLoading(
                webView,
                request("$ORIGIN/assets/web/index.html", isMainFrame = false),
            ),
        )
        assertNull("and it is not handed to the browser either", opened.get())

        assertTrue(
            "the deployed site must never load in the bridged WebView",
            client.shouldOverrideUrlLoading(
                webView,
                request("https://fpvarabic.github.io/expresslrs-arabic-easy-setup/", isMainFrame = true),
            ),
        )
        assertEquals(
            "https://fpvarabic.github.io/expresslrs-arabic-easy-setup/",
            opened.get().toString(),
        )
    }

    @Test
    fun servesOnlyPackagedAssetsAndThePinnedFirmwareMirror() {
        val client = HostWebViewClient(assetLoader()) { }

        val foreign = client.shouldInterceptRequest(
            webView,
            request("https://evil.example/payload.js", isMainFrame = false),
        )
        assertNotNull("a foreign subresource must not reach the network", foreign)
        assertNull("and it must carry no body", foreign!!.data)

        // The firmware mirror is data, not a document. It is the one remote host
        // the application has ever contacted, and `connect-src` already names it.
        assertNull(
            "the pinned mirror must stay reachable or firmware cannot be fetched",
            client.shouldInterceptRequest(
                webView,
                request(
                    "https://expresslrs.github.io/web-flasher/assets/index.json",
                    isMainFrame = false,
                ),
            ),
        )

        // Plaintext, even to the mirror's host, is not the mirror.
        val plaintext = client.shouldInterceptRequest(
            webView,
            request("http://expresslrs.github.io/web-flasher/assets/index.json", isMainFrame = false),
        )
        assertNotNull(plaintext)
        assertNull(plaintext!!.data)
    }

    @Test
    fun appliesTheReviewedWebViewSettings() {
        onMainThread {
            val host = WebView(InstrumentationRegistry.getInstrumentation().targetContext)
            try {
                // The exact function MainActivity applies, not a copy of it.
                host.settings.applyHardening()

                val settings = host.settings
                assertTrue("the application is JavaScript", settings.javaScriptEnabled)
                assertFalse("no filesystem", settings.allowFileAccess)
                assertFalse("no content providers", settings.allowContentAccess)
                @Suppress("DEPRECATION")
                assertFalse(settings.allowFileAccessFromFileURLs)
                @Suppress("DEPRECATION")
                assertFalse(settings.allowUniversalAccessFromFileURLs)
                assertEquals(
                    WebSettings.MIXED_CONTENT_NEVER_ALLOW,
                    settings.mixedContentMode,
                )
                assertFalse(settings.javaScriptCanOpenWindowsAutomatically)
            } finally {
                host.destroy()
            }
        }
    }

    // ---- helpers ---------------------------------------------------------

    private fun attach(identity: JSONObject = JSONObject()) {
        onMainThread {
            bridge = UsbSerialBridge.attach(
                context = InstrumentationRegistry.getInstrumentation().targetContext,
                webView = webView,
                allowedOrigin = ORIGIN,
                backend = backend,
                identity = identity,
            )
        }
        assertNotNull(
            "this WebView cannot host the bridge: " +
                UsbSerialBridge.reasonFor(
                    InstrumentationRegistry.getInstrumentation().targetContext,
                ),
            bridge,
        )
    }

    private fun assetLoader() = androidx.webkit.WebViewAssetLoader.Builder()
        .setDomain(MainActivity.APPLICATION_HOST)
        .addPathHandler(
            "/assets/",
            androidx.webkit.WebViewAssetLoader.AssetsPathHandler(
                InstrumentationRegistry.getInstrumentation().targetContext,
            ),
        )
        .build()

    private fun request(url: String, isMainFrame: Boolean): WebResourceRequest =
        object : WebResourceRequest {
            override fun getUrl(): Uri = Uri.parse(url)
            override fun isForMainFrame(): Boolean = isMainFrame
            override fun isRedirect(): Boolean = false
            override fun hasGesture(): Boolean = false
            override fun getMethod(): String = "GET"
            override fun getRequestHeaders(): MutableMap<String, String> = mutableMapOf()
        }

    private fun loadAt(origin: String, html: String) {
        val latch = CountDownLatch(1)
        onMainThread {
            webView.webViewClient = object : android.webkit.WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) = latch.countDown()
            }
            webView.loadDataWithBaseURL(origin, html, "text/html", "utf-8", null)
        }
        assertTrue("the page never finished loading", latch.await(AWAIT_SECONDS, TimeUnit.SECONDS))
    }

    private fun evaluate(script: String): String {
        val latch = CountDownLatch(1)
        val result = AtomicReference<String?>(null)
        onMainThread {
            webView.evaluateJavascript(script) { value ->
                result.set(value)
                latch.countDown()
            }
        }
        assertTrue("the script never returned", latch.await(AWAIT_SECONDS, TimeUnit.SECONDS))
        return result.get() ?: "null"
    }

    /** Polls until an asynchronous page value stops being null. */
    private fun awaitScript(expression: String): String {
        val deadline = System.currentTimeMillis() + AWAIT_SECONDS * 1_000
        while (System.currentTimeMillis() < deadline) {
            val value = evaluate(expression)
            if (value != "null" && value != "\"null\"" && value != "undefined") {
                // evaluateJavascript returns a JSON-encoded value, so a string
                // result arrives quoted and escaped.
                return if (value.startsWith("\"")) JSONObject("{\"v\":$value}").getString("v") else value
            }
            Thread.sleep(POLL_MILLIS)
        }
        throw AssertionError("$expression never produced a value")
    }

    private fun onMainThread(body: () -> Unit) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(body)
    }

    private companion object {
        const val ORIGIN = MainActivity.APPLICATION_ORIGIN
        const val AWAIT_SECONDS = 10L
        const val POLL_MILLIS = 50L
    }
}
