package com.fpvarabic.elrs.bridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * The WebView half of the USB bridge.
 *
 * ## Why not `addJavascriptInterface`
 *
 * `addJavascriptInterface` cannot be restricted to an origin. It is injected
 * into every frame the WebView loads, including subframes, and the callee
 * cannot tell which frame called it. For an object that can rewrite a
 * transmitter's firmware, that is not a bridge, it is an open door.
 *
 * [WebViewCompat.addWebMessageListener] takes an allowed-origin rule and hands
 * every message the origin it came from and whether it came from the main
 * frame. Both are supplied by the WebView, not by the message, so the page
 * cannot claim to be somewhere it is not. This host uses that and nothing else;
 * `addJavascriptInterface` is not called anywhere in this application.
 *
 * ## When the platform cannot provide it
 *
 * The listener needs a WebView that supports [WebViewFeature.WEB_MESSAGE_LISTENER]
 * (Chromium 88 and later). On an older, un-updated WebView the bridge is simply
 * not installed — it does not silently degrade to a weaker one — and the page is
 * told the exact reason so it can say so instead of showing an empty device
 * list. That is the same rule this application applies to an unsupported Target
 * or a browser without Web Serial.
 */
class UsbSerialBridge private constructor(
    private val context: Context,
    private val core: BridgeCore,
) {

    private var detachReceiver: BroadcastReceiver? = null

    private fun listenForDetach() {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action != UsbManager.ACTION_USB_DEVICE_DETACHED) return
                val device = usbDeviceFrom(intent) ?: return
                core.onDeviceDetached(device.deviceName)
            }
        }
        val filter = IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(receiver, filter)
        }
        detachReceiver = receiver
    }

    fun onHostBackgrounded() = core.onHostBackgrounded()

    fun onHostForegrounded() = core.onHostForegrounded()

    fun close() {
        detachReceiver?.let { receiver ->
            runCatching { context.unregisterReceiver(receiver) }
            detachReceiver = null
        }
        core.close()
    }

    companion object {
        /** The name the shim finds this host under. */
        const val HOST_OBJECT = "elrsNativeHost"

        /**
         * Why the bridge could not be installed, when it could not be. The page
         * shows this rather than an empty device list.
         */
        enum class Unavailable {
            WEB_MESSAGE_LISTENER_UNSUPPORTED,
            DOCUMENT_START_SCRIPT_UNSUPPORTED,
            NO_USB_SERVICE,
        }

        /**
         * Installs the bridge into [webView], restricted to [allowedOrigin].
         *
         * Returns null when the platform cannot support it; [reasonFor] says
         * which condition failed, and the host passes that to the page.
         */
        fun attach(
            context: Context,
            webView: WebView,
            allowedOrigin: String,
            backend: UsbBackend? = null,
            identity: JSONObject = JSONObject(),
        ): UsbSerialBridge? {
            if (reasonFor(context) != null) return null

            val resolved = backend ?: AndroidUsbBackend(context)
            val core = BridgeCore(resolved, allowedOrigin)
            val bridge = UsbSerialBridge(context, core)

            // Replies go through the main looper rather than `webView.post`.
            // `View.post` on a view that is not attached to a window queues the
            // runnable until it *is* attached, and runs it never if that does
            // not happen — so a reply would be silently withheld and the page's
            // promise would hang forever rather than being answered or
            // rejected. `JavaScriptReplyProxy.postMessage` needs the UI thread,
            // which this guarantees without depending on the view hierarchy.
            val ui = Handler(Looper.getMainLooper())
            val origins = setOf(allowedOrigin)
            WebViewCompat.addWebMessageListener(
                webView,
                HOST_OBJECT,
                origins,
            ) { _: WebView, message: WebMessageCompat, sourceOrigin: android.net.Uri,
                isMainFrame: Boolean, replyProxy: JavaScriptReplyProxy ->
                val raw = message.data
                if (raw != null) {
                    core.handle(
                        raw = raw,
                        // The origin comes from the WebView. A page cannot
                        // spoof it, which is the whole reason this is not
                        // addJavascriptInterface.
                        sourceOrigin = "${sourceOrigin.scheme}://${sourceOrigin.host}",
                        isMainFrame = isMainFrame,
                    ) { reply -> ui.post { replyProxy.postMessage(reply) } }
                }
            }

            WebViewCompat.addDocumentStartJavaScript(
                webView,
                shimSource(context, identity),
                origins,
            )

            bridge.listenForDetach()
            return bridge
        }

        /** The condition that stops this platform hosting a bridge, or null. */
        fun reasonFor(context: Context): Unavailable? = when {
            !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ->
                Unavailable.WEB_MESSAGE_LISTENER_UNSUPPORTED
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT) ->
                Unavailable.DOCUMENT_START_SCRIPT_UNSUPPORTED
            context.getSystemService(Context.USB_SERVICE) !is UsbManager ->
                Unavailable.NO_USB_SERVICE
            else -> null
        }

        /**
         * The shim, with the build identity prepended.
         *
         * The identity is the same pair the diagnostics screen shows and the
         * APK records, so an installed build can be traced back to the sources
         * it was made from.
         */
        internal fun shimSource(context: Context, identity: JSONObject): String {
            val shim = context.assets.open(SHIM_ASSET).use { it.readBytes().decodeToString() }
            return "window.__elrsNativeHostIdentity = ${JSONObject.quote(identity.toString())};\n$shim"
        }

        private const val SHIM_ASSET = "native-bridge-shim.js"

        @Suppress("DEPRECATION")
        private fun usbDeviceFrom(intent: Intent): UsbDevice? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
            } else {
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
            }
    }
}
