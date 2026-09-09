package com.fpvarabic.elrs.bridge

import android.os.Bundle
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity

/**
 * The host for the ExpressLRS setup application on Android.
 *
 * ## Why a WebView and not a Trusted Web Activity
 *
 * There are three shapes an Android host could take, and only one of them can
 * actually drive a device:
 *
 * | Shape | Web Serial | Can inject a native bridge |
 * | --- | --- | --- |
 * | Trusted Web Activity / Custom Tab | yes, it *is* Chrome | **no** — the page runs in Chrome, out of this app's reach |
 * | Plain WebView | **no** — WebView implements neither Web Serial nor WebUSB | not useful without one |
 * | WebView + native USB host bridge | not needed | **yes** |
 *
 * A Trusted Web Activity would add an icon and nothing else: the operator is
 * already better served by installing the PWA. A plain WebView would be worse
 * than the browser, because every device operation would fail. So this host is
 * a WebView that supplies `elrsNativeBridge` from Android's USB Host API,
 * which is the seam `apps/web/src/hardware/native-bridge.ts` was written for.
 *
 * ## What is and is not proven
 *
 * Nothing here has been run against a physical Android device or a real USB
 * OTG cable. The rules this host applies are unit-tested in [UsbDeviceGate];
 * the USB transport itself is not, and an emulator cannot exercise it because
 * an emulator has no USB host. Until a real device test exists, this APK is
 * `IMPLEMENTED` and nothing more.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // No file or content access: this host loads one known application
            // and must not be reachable as a general browser.
            settings.allowFileAccess = false
            settings.allowContentAccess = false
        }
        setContentView(webView)
        webView.loadUrl(APPLICATION_URL)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        /**
         * The reviewed deployment. A build that pointed at a local file would
         * ship a different application than the one that was tested.
         */
        const val APPLICATION_URL =
            "https://fpvarabic.github.io/expresslrs-arabic-easy-setup/"
    }
}
