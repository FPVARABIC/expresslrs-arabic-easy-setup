package com.fpvarabic.elrs.bridge

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.webkit.SslErrorHandler
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.annotation.VisibleForTesting
import androidx.appcompat.app.AppCompatActivity
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

    /** The hosting WebView. Internal so the instrumentation tests drive the real one. */
    internal val hostWebView: WebView get() = webView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(APPLICATION_HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        val identity = readSourceIdentity()
        val unavailable = UsbSerialBridge.reasonFor(this)
        identity.put("bridge", unavailable?.name ?: "AVAILABLE")

        webView = WebView(this).apply {
            settings.applyHardening()
            webViewClient = HostWebViewClient(assetLoader, ::openExternally)
        }
        setContentView(webView)

        // Debugging exposes the whole WebView, including the bridge, to any
        // process that can reach adb. Debug builds only.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        bridge = UsbSerialBridge.attach(
            context = this,
            webView = webView,
            allowedOrigin = APPLICATION_ORIGIN,
            backend = testBackend,
            identity = identity,
        )
        webView.loadUrl("$APPLICATION_ORIGIN/assets/web/index.html")
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

        private val testBackend: UsbBackend?
            get() = if (BuildConfig.DEBUG) testBackendOverride else null
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
