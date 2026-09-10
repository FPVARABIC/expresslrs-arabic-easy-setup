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
 *
 * The WebView here is deliberately **not** added to a view hierarchy. That is
 * not an oversight: it is what caught the bridge delivering its replies through
 * `View.post`, which queues a runnable until the view is attached to a window
 * and runs it never if that does not happen. A page's promise would then hang
 * forever rather than be answered or rejected. Keeping this WebView detached
 * keeps that fixed.
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
        loadOnOrigin("<html><body>ready</body></html>")

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
        loadForeignOrigin("<html><body>hostile</body></html>")

        assertEquals("\"undefined\"", evaluate("typeof window.elrsNativeHost"))
        assertEquals("\"undefined\"", evaluate("typeof window.elrsNativeBridge"))
    }

    @Test
    fun refusesAnythingASameOriginSubframeSends() {
        attach()
        // A genuine same-origin subframe, served from the same loader as the
        // parent, rather than a `srcdoc` frame whose origin inheritance would
        // itself be an assumption. This is the shape a remote page would use to
        // reach a bridge it should not have.
        served["child.html"] = """
            <html><body><script>
              if (window.elrsNativeHost) {
                window.elrsNativeHost.onmessage = function (event) {
                  parent.postMessage(
                    typeof event === 'string' ? event : event.data, '*');
                };
                window.elrsNativeHost.postMessage(
                  JSON.stringify({ callId: 'frame', operation: 'list' }));
              } else {
                parent.postMessage(JSON.stringify({ absent: true }), '*');
              }
            </script></body></html>
        """.trimIndent()
        loadOnOrigin(
            """
            <html><body>
            <script>
              window.fromFrame = null;
              window.addEventListener('message', function (event) {
                window.fromFrame = event.data;
              });
            </script>
            <iframe id="child" src="./child.html"></iframe>
            </body></html>
            """.trimIndent(),
            path = "parent.html",
        )

        val payload = JSONObject(awaitScript("window.fromFrame"))
        // Either the listener was never injected into the subframe, or it was
        // and the host refused it by name. Both are acceptable; a subframe
        // getting a device list is not.
        if (payload.has("absent")) {
            assertTrue(payload.getBoolean("absent"))
        } else {
            assertFalse(payload.toString(), payload.getBoolean("ok"))
            assertEquals(BridgeCore.Reason.NOT_MAIN_FRAME, payload.getString("reason"))
        }
        assertEquals("no device was ever opened", 0, backend.openCount.get())
    }

    // ---- promise mapping --------------------------------------------------

    @Test
    fun resolvesAndRejectsTheSamePromisesTheApplicationAwaits() {
        backend.permissions[FakeUsbBackend.DEFAULT_DEVICE] = UsbDeviceGate.Permission.GRANTED
        attach()
        loadOnOrigin("<html><body>ready</body></html>")

        // A resolved promise: requestPort hands back a Web Serial-shaped port,
        // and the bytes reach the backend. The port is deliberately left open —
        // the refusal below is about a *foreign* session, which only means
        // anything while a real one exists.
        evaluate(
            """
            window.__result = null;
            window.__port = null;
            window.elrsNativeBridge.serial.requestPort().then(function (port) {
              window.__port = port;
              return port.open({ baudRate: 420000 }).then(function () {
                var writer = port.writable.getWriter();
                return writer.write(new Uint8Array([0xec, 0x04, 0x28]));
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

        // The page cannot forge a session by reaching into the port: the shim
        // keeps the id in a closure, so there is no property to overwrite.
        // Asserted rather than assumed, because an earlier revision of the shim
        // did expose it.
        assertEquals(
            "\"undefined\"",
            evaluate("typeof (window.__port && window.__port._sessionId)"),
        )

        // A rejected promise carries the host's machine-readable reason rather
        // than a generic failure the page would have to guess at. Driven
        // through the raw host protocol, which is the only surface a foreign
        // session id could actually arrive on, and while the real port is
        // still open so this is a mismatch and not simply a closed port.
        evaluate(
            """
            window.__refusal = null;
            window.elrsNativeHost.postMessage('not json at all');
            var previous = window.elrsNativeHost.onmessage;
            window.elrsNativeHost.onmessage = function (event) {
              var raw = typeof event === 'string' ? event : event.data;
              var reply = JSON.parse(raw);
              if (reply.callId === 'forged') {
                window.__refusal = JSON.stringify({ ok: reply.ok, name: reply.reason });
              } else if (previous) {
                previous(event);
              }
            };
            window.elrsNativeHost.postMessage(JSON.stringify({
              callId: 'forged',
              operation: 'write',
              sessionId: 'deadbeef',
              bytes: [1],
            }));
            """.trimIndent(),
        )
        val failure = JSONObject(awaitScript("window.__refusal"))
        assertFalse(failure.toString(), failure.getBoolean("ok"))
        assertEquals(BridgeCore.Reason.SESSION_MISMATCH, failure.getString("name"))
        assertEquals("the forged write reached no device", 1, backend.written.size)
    }

    @Test
    fun carriesTheBuildIdentityIntoThePage() {
        attach(
            identity = JSONObject()
                .put("webBuildSha256", "abc123")
                .put("bridge", "AVAILABLE"),
        )
        loadOnOrigin("<html><body>ready</body></html>")

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
                request("$ORIGIN/index.html", isMainFrame = true),
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
                request("$ORIGIN/index.html", isMainFrame = false),
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
    fun servesTheBundledApplicationAndTheAbsolutePathsItReferences() {
        val loader = assetLoader()

        val document = loader.shouldInterceptRequest(Uri.parse("$ORIGIN/index.html"))
        assertNotNull("the packaged index.html must be served from the root", document)
        assertNotNull(document!!.data)

        // The web build references its own bundle absolutely, exactly as it
        // does on the web. Mounting it anywhere but the root would leave every
        // one of these pointing at nothing.
        val bundled = InstrumentationRegistry.getInstrumentation().targetContext.assets
            .list("web/assets")
            ?.firstOrNull { it.endsWith(".js") }
        assertNotNull("the APK carries no bundled web assets", bundled)
        val script = loader.shouldInterceptRequest(Uri.parse("$ORIGIN/assets/$bundled"))
        assertNotNull("an absolute asset reference must resolve", script)
        assertNotNull(script!!.data)
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

    // The same mapping MainActivity uses, so a request that works here works
    // there.
    private fun assetLoader() = androidx.webkit.WebViewAssetLoader.Builder()
        .setDomain(MainActivity.APPLICATION_HOST)
        .addPathHandler(
            "/",
            BundledWebPathHandler(
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

    /**
     * Documents this test serves from the packaged origin, by path.
     *
     * Concurrent because `PathHandler.handle` is `@WorkerThread` — the WebView
     * asks for these from a background thread while the test writes them from
     * its own.
     */
    private val served = java.util.concurrent.ConcurrentHashMap<String, String>()

    /**
     * Loads [html] as a real document on the packaged origin.
     *
     * It goes through a `WebViewAssetLoader` path handler rather than
     * `loadDataWithBaseURL`, so the document's origin is established the same
     * way the shipped host establishes it. Whether a base URL yields the origin
     * the message listener matches on is exactly the thing under test here, and
     * it must not also be the assumption the test rests on.
     */
    private fun loadOnOrigin(html: String, path: String = "page.html") {
        served[path] = html
        val loader = testLoader()
        val latch = CountDownLatch(1)
        onMainThread {
            webView.webViewClient = object : android.webkit.WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

                override fun onPageFinished(view: WebView, url: String) = latch.countDown()
            }
            webView.loadUrl("$ORIGIN/test/$path")
        }
        assertTrue(
            "the page never finished loading",
            latch.await(AWAIT_SECONDS, TimeUnit.SECONDS),
        )
        captureScriptErrors()
    }

    private fun testLoader() = androidx.webkit.WebViewAssetLoader.Builder()
        .setDomain(MainActivity.APPLICATION_HOST)
        .addPathHandler("/test/") { path ->
            served[path]?.let {
                WebResourceResponse("text/html", "utf-8", it.byteInputStream())
            }
        }
        .build()

    /** A document from somewhere else entirely. */
    private fun loadForeignOrigin(html: String) {
        val latch = CountDownLatch(1)
        onMainThread {
            webView.webViewClient = object : android.webkit.WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) = latch.countDown()
            }
            webView.loadDataWithBaseURL(
                "https://evil.example",
                html,
                "text/html",
                "utf-8",
                null,
            )
        }
        assertTrue(
            "the page never finished loading",
            latch.await(AWAIT_SECONDS, TimeUnit.SECONDS),
        )
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

    /**
     * Polls until an asynchronous page value stops being null.
     *
     * On timeout it reports what the page actually knows — the last script
     * error, whether the bridge is installed, and the document's own URL —
     * because "never produced a value" is not something anyone can diagnose
     * from a CI log without the emulator in front of them.
     */
    private fun awaitScript(expression: String): String {
        val deadline = System.currentTimeMillis() + ASYNC_AWAIT_SECONDS * 1_000
        while (System.currentTimeMillis() < deadline) {
            val value = evaluate(expression)
            if (value != "null" && value != "\"null\"" && value != "undefined") {
                // evaluateJavascript returns a JSON-encoded value, so a string
                // result arrives quoted and escaped.
                return if (value.startsWith("\"")) JSONObject("{\"v\":$value}").getString("v") else value
            }
            Thread.sleep(POLL_MILLIS)
        }
        // One line: Gradle's console reporter shows only the first line or two
        // of an assertion message, which is how the previous revision of this
        // reported its location and nothing else.
        throw AssertionError(
            "$expression never produced a value in ${ASYNC_AWAIT_SECONDS}s" +
                " | location=${evaluate("window.location.href")}" +
                " | nativeHost=${evaluate("typeof window.elrsNativeHost")}" +
                " | nativeBridge=${evaluate("typeof window.elrsNativeBridge")}" +
                " | lastError=${evaluate("window.__lastError")}" +
                " | frames=${evaluate("window.frames.length")}" +
                " | body=${evaluate("document.body && document.body.innerHTML")}",
        )
    }

    /**
     * Records the page's own errors, so a timeout can report why rather than
     * only that it happened. Installed at document start on every load.
     */
    private fun captureScriptErrors() {
        evaluate(
            """
            window.__lastError = null;
            window.addEventListener('error', function (event) {
              window.__lastError = String(event.message) + ' @ ' +
                String(event.filename) + ':' + String(event.lineno);
            });
            window.addEventListener('unhandledrejection', function (event) {
              window.__lastError = 'unhandled rejection: ' + String(event.reason);
            });
            """.trimIndent(),
        )
    }

    private fun onMainThread(body: () -> Unit) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(body)
    }

    private companion object {
        const val ORIGIN = MainActivity.APPLICATION_ORIGIN
        const val AWAIT_SECONDS = 10L

        /**
         * Asynchronous page work gets longer than a page load does. A promise
         * that crosses into the host, onto its worker thread and back is not
         * comparable to a document finishing, and 10s was tight enough on a
         * cold emulator to be worth separating rather than guessing about.
         */
        const val ASYNC_AWAIT_SECONDS = 30L
        const val POLL_MILLIS = 50L
    }
}
