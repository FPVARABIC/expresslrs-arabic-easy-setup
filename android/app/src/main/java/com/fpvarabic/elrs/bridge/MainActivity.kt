package com.fpvarabic.elrs.bridge

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.VisibleForTesting
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * The Android host for the ExpressLRS setup application.
 *
 * ## Why a WebView with a native bridge, and not a Trusted Web Activity
 *
 * | Shape | Web Serial | Can supply a native USB bridge |
 * | --- | --- | --- |
 * | Trusted Web Activity | yes — it *is* Chrome | **no**, the page runs outside this app |
 * | Plain WebView | **no** — neither Web Serial nor WebUSB | not useful alone |
 * | WebView + native USB host bridge | not needed | **yes** |
 *
 * ## The application is bundled, not fetched
 *
 * A WebView that can talk to USB hardware must never be pointed at a remote
 * document. The web application ships inside the APK and is served from
 * [APPLICATION_ORIGIN] by [WebViewAssetLoader], so the code that can reach a
 * device is exactly the code that was built and tested with this APK. Loading
 * the deployed site here would hand USB access to whatever that site serves
 * next.
 *
 * Firmware still comes from the official mirror, because that is the only place
 * the real artifacts exist. That is a *data* fetch to one pinned host, subject
 * to the document's `connect-src`; it is not a document, and
 * [HostWebViewClient] refuses to navigate there.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var bridge: UsbSerialBridge? = null

    /**
     * The Storage Access Framework, wired to whatever asked for it.
     *
     * Registered once in `onCreate`, because `registerForActivityResult` must
     * be called before the Activity is started. Exactly one request can be in
     * flight, which matches the bridge: one document is written at a time.
     */
    private var pendingDocumentResult: ((Uri?) -> Unit)? = null
    private lateinit var createDocument: ActivityResultLauncher<String>
    private lateinit var openDocument: ActivityResultLauncher<Array<String>>

    /** The WebView's own file chooser, which is a separate Android callback. */
    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null
    private lateinit var chooseFile: ActivityResultLauncher<Array<String>>

    /** The hosting WebView. Internal so the instrumentation tests drive the real one. */
    internal val hostWebView: WebView get() = webView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        registerDocumentLaunchers()

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(APPLICATION_HOST)
            .addPathHandler("/", BundledWebPathHandler(this))
            .build()

        val identity = readSourceIdentity()
        val unavailable = UsbSerialBridge.reasonFor(this)
        identity.put("bridge", unavailable?.name ?: "AVAILABLE")

        webView = WebView(this).apply {
            settings.applyHardening()
            webViewClient = HostWebViewClient(assetLoader, ::openExternally)
            // Without this a WebView silently does nothing when the page opens
            // a file input: no picker, no error, no callback. Every `<input
            // type="file">` in the application was therefore dead on this host,
            // which included choosing a recovery package and choosing a
            // firmware file. It is served by the same SAF launcher the document
            // bridge uses, so there is one path to storage and not two.
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    view: WebView,
                    filePathCallback: ValueCallback<Array<Uri>>,
                    params: WebChromeClient.FileChooserParams,
                ): Boolean {
                    pendingFileChooser?.onReceiveValue(null)
                    pendingFileChooser = filePathCallback
                    val types = params.acceptTypes
                        .filter { it.isNotBlank() }
                        .toTypedArray()
                        .ifEmpty { arrayOf("*/*") }
                    return runCatching { chooseFile.launch(types) }.isSuccess
                }
            }
        }
        setContentView(webView)

        // Debugging exposes the whole WebView, including the bridge, to any
        // process that can reach adb. Debug builds only.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // A service worker could serve a document from cache that this APK
        // never shipped, which is exactly what the asset loader exists to
        // prevent. Nothing is served to one.
        refuseServiceWorkerRequests()

        bridge = UsbSerialBridge.attach(
            context = this,
            webView = webView,
            allowedOrigin = APPLICATION_ORIGIN,
            backend = testBackend,
            identity = identity,
            documents = testDocuments ?: AndroidDocumentStore(this, documentLauncher),
        )
        webView.loadUrl("$APPLICATION_ORIGIN/index.html")
    }

    /**
     * Registers the three Activity results this host can receive.
     *
     * All three are the Storage Access Framework. Registration has to happen
     * before the Activity is started, and it has to happen on every recreation
     * — including one caused by a rotation mid-write, which is why the pending
     * callbacks are cleared rather than assumed to still be valid.
     */
    private fun registerDocumentLaunchers() {
        createDocument = registerForActivityResult(
            ActivityResultContracts.CreateDocument("application/octet-stream"),
        ) { uri -> deliverDocumentResult(uri) }
        openDocument = registerForActivityResult(
            ActivityResultContracts.OpenDocument(),
        ) { uri -> deliverDocumentResult(uri) }
        chooseFile = registerForActivityResult(
            ActivityResultContracts.OpenDocument(),
        ) { uri ->
            val callback = pendingFileChooser
            pendingFileChooser = null
            // Null rather than an empty array: an empty array tells the WebView
            // "no file", which is right, but the callback must be answered
            // either way or the input stays stuck forever.
            callback?.onReceiveValue(if (uri == null) arrayOf() else arrayOf(uri))
        }
    }

    private fun deliverDocumentResult(uri: Uri?) {
        val waiting = pendingDocumentResult
        pendingDocumentResult = null
        waiting?.invoke(uri)
    }

    private val documentLauncher = object : AndroidDocumentStore.DocumentPickerLauncher {
        override fun createDocument(
            suggestedName: String,
            mimeType: String,
            onResult: (Uri?) -> Unit,
        ) {
            runOnUiThread {
                // A second request while one is outstanding would leave the
                // first waiter with no answer, so it is refused here rather
                // than silently replaced.
                if (pendingDocumentResult != null) {
                    onResult(null)
                    return@runOnUiThread
                }
                pendingDocumentResult = onResult
                if (runCatching { createDocument.launch(suggestedName) }.isFailure) {
                    deliverDocumentResult(null)
                }
            }
        }

        override fun openDocument(mimeType: String, onResult: (Uri?) -> Unit) {
            runOnUiThread {
                if (pendingDocumentResult != null) {
                    onResult(null)
                    return@runOnUiThread
                }
                pendingDocumentResult = onResult
                if (runCatching { openDocument.launch(arrayOf(mimeType)) }.isFailure) {
                    deliverDocumentResult(null)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        bridge?.onHostForegrounded()
    }

    override fun onPause() {
        super.onPause()
        // A backgrounded WebView keeps running. Write authority does not follow
        // it there: whatever was open is closed and every pending call is
        // rejected, so a resumed page must ask again.
        bridge?.onHostBackgrounded()
    }

    override fun onDestroy() {
        bridge?.close()
        bridge = null
        // Anything still waiting on a picker is answered, not abandoned: an
        // unanswered ValueCallback leaves the page's file input permanently
        // stuck, and an unanswered document result leaves the bridge's worker
        // thread waiting for a result that can no longer arrive.
        pendingFileChooser?.onReceiveValue(null)
        pendingFileChooser = null
        deliverDocumentResult(null)
        webView.destroy()
        super.onDestroy()
    }

    /**
     * Documentation links open in the user's browser. They must never be loaded
     * in this WebView, which is the one that can reach a device.
     */
    private fun openExternally(uri: Uri) {
        runCatching {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    /**
     * The digests of the web build and native sources this APK was made from,
     * written at build time by `writeSourceIdentity`. The diagnostics screen
     * shows them, so an installed build can be traced back to its source.
     */
    private fun readSourceIdentity(): JSONObject =
        runCatching {
            JSONObject(assets.open(IDENTITY_ASSET).use { it.readBytes().decodeToString() })
        }.getOrElse { JSONObject().put("schemaVersion", 1) }

    private fun refuseServiceWorkerRequests() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) return
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            return
        }
        runCatching {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(
                object : ServiceWorkerClientCompat() {
                    override fun shouldInterceptRequest(
                        request: WebResourceRequest,
                    ): WebResourceResponse = WebResourceResponse(null, null, null)
                },
            )
        }
    }

    companion object {
        const val APPLICATION_HOST = "appassets.androidplatform.net"
        const val APPLICATION_ORIGIN = "https://$APPLICATION_HOST"
        private const val IDENTITY_ASSET = "source-identity.json"

        /**
         * A fake USB backend for instrumentation tests. An emulator has no USB
         * host, so without this seam the bridge's rules — origin, frame,
         * session ownership, lifecycle — could not be tested at all.
         *
         * Honoured only in a debug build. A release APK ignores it, so it
         * cannot become a way to reach the bridge on a shipped build.
         */
        @VisibleForTesting
        @JvmStatic
        var testBackendOverride: UsbBackend? = null

        /**
         * A fake document provider for instrumentation tests. An emulator has
         * no operator to tap a picker, so without this seam none of the durable
         * recovery rules — cancellation, a full disk, a corrupted file, a
         * changed hash, import after a reinstall — could be tested at all.
         *
         * Honoured only in a debug build, like the USB seam above.
         */
        @VisibleForTesting
        @JvmStatic
        var testDocumentsOverride: DocumentStore? = null

        private val testBackend: UsbBackend?
            get() = if (BuildConfig.DEBUG) testBackendOverride else null

        private val testDocuments: DocumentStore?
            get() = if (BuildConfig.DEBUG) testDocumentsOverride else null
    }
}

/** Internal rather than private so the instrumentation tests assert the real thing. */
internal fun WebSettings.applyHardening() {
    // The application is JavaScript; that is the product, not an oversight.
    javaScriptEnabled = true
    domStorageEnabled = true

    // Nothing local, ever. A WebView with USB access must not be able to read
    // the filesystem or content providers.
    allowFileAccess = false
    allowContentAccess = false
    @Suppress("DEPRECATION")
    allowFileAccessFromFileURLs = false
    @Suppress("DEPRECATION")
    allowUniversalAccessFromFileURLs = false

    // Everything is served over the asset loader's https origin, so plaintext
    // has no legitimate use here.
    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW

    // A window this app did not open cannot be reasoned about.
    javaScriptCanOpenWindowsAutomatically = false
    setSupportMultipleWindows(false)

    if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
        WebSettingsCompat.setSafeBrowsingEnabled(this, true)
    }
}

/**
 * Serves the bundled web application from the origin root.
 *
 * The build references its own files absolutely — `/assets/index-<hash>.js` —
 * because that is what it does on the web too, where the document sits at the
 * root. Mounting it under `/assets/web/` inside the APK would leave every one
 * of those references pointing at nothing, and the host would open on a blank
 * page. So the handler is mounted at `/` and adds the `web/` prefix on the way
 * to the APK, which keeps the bundled application in its own directory
 * alongside the injected shim and the identity file without the URLs having to
 * know about it.
 *
 * `PackagedApplicationInstrumentedTest` loads the real `index.html` through
 * this and asserts the application renders, so a layout change that breaks the
 * mapping fails a test rather than shipping a blank host.
 */
internal class BundledWebPathHandler(context: Context) : WebViewAssetLoader.PathHandler {
    private val assets = WebViewAssetLoader.AssetsPathHandler(context)

    override fun handle(path: String): WebResourceResponse? =
        assets.handle("$BUNDLED_PREFIX$path")

    internal companion object {
        /** Where `bundleWebAssets` puts the web build inside the APK. */
        const val BUNDLED_PREFIX = "web/"
    }
}

/**
 * Confines the WebView to the packaged application.
 *
 * Navigation never leaves [MainActivity.APPLICATION_ORIGIN]: an `http(s)` link
 * is handed to the system browser, which cannot reach the bridge, and a
 * subframe may not navigate at all. Subresources are served from the APK,
 * except for data fetched from the pinned firmware mirror — the only remote
 * host this application has ever contacted, and the one the document's
 * `connect-src` already permits.
 */
internal class HostWebViewClient(
    private val assetLoader: WebViewAssetLoader,
    private val openExternally: (Uri) -> Unit,
) : WebViewClient() {

    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest,
    ): WebResourceResponse? {
        val url = request.url
        if (isApplicationOrigin(url)) return assetLoader.shouldInterceptRequest(url)
        // Firmware, the Lua script and the target catalogue live on the
        // official mirror and nowhere else. Returning null lets the WebView
        // fetch it; the document's `script-src 'self'` still stops anything
        // that arrives from executing, and navigation there is refused below.
        if (isArtifactMirror(url)) return null
        // Everything else is not served at all. An empty response rather than
        // null keeps the WebView off the network for it.
        return WebResourceResponse(null, null, null)
    }

    override fun shouldOverrideUrlLoading(
        view: WebView,
        request: WebResourceRequest,
    ): Boolean {
        if (isApplicationOrigin(request.url) && request.isForMainFrame) return false
        if (!request.isForMainFrame) {
            // A subframe must not navigate anywhere: an iframe is exactly how a
            // remote origin would try to reach a bridge it should not have.
            return true
        }
        val scheme = request.url.scheme?.lowercase()
        if (scheme == "https" || scheme == "http") openExternally(request.url)
        return true
    }

    override fun onReceivedSslError(
        view: WebView,
        handler: SslErrorHandler,
        error: SslError,
    ) {
        // Never proceed(). There is no certificate problem worth accepting in an
        // application that can rewrite a device's firmware.
        handler.cancel()
    }

    internal companion object {
        /** The pinned mirror. Kept in step with the document's `connect-src`. */
        const val ARTIFACT_HOST = "expresslrs.github.io"

        fun isApplicationOrigin(uri: Uri): Boolean =
            uri.scheme == "https" && uri.host == MainActivity.APPLICATION_HOST

        fun isArtifactMirror(uri: Uri): Boolean =
            uri.scheme == "https" && uri.host == ARTIFACT_HOST
    }
}
