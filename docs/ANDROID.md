# Android: what is supported, what is unverified, and why

Status vocabulary is the one used across this repository:
`IMPLEMENTED` / `EMULATOR_VERIFIED` / `BROWSER_VERIFIED` / `HARDWARE_VERIFIED` /
`UNSUPPORTED_WITH_EVIDENCE`.

## The short answer

**No Android claim in this repository is `HARDWARE_VERIFIED`.** Nothing has been
run against a physical Android device, and nothing here should be read as
saying Android "works". A narrow viewport in a desktop browser is not Android
and is never used as evidence for it.

## What decides whether Android can work at all

Every device path in this application needs one of two things:

| Path | Requires |
| --- | --- |
| CRSF identify, settings, binding | Web Serial |
| ESP flashing, XMODEM, passthrough | Web Serial |
| STM32 DFU | WebUSB |

So the Android question is not about layout. It is entirely about whether the
browser exposes `navigator.serial`.

## The evidence available in this environment

`caniuse-lite@1.0.30001809`, read locally from the repository's own dependency
tree:

```
web-serial   chrome(desktop)=154:y | and_chr=151:"y #1" | android=4.4.3-4.4.4:n
             | ios_saf=26.5:n | samsung=19.0:n | and_ff=153:n
webusb       chrome(desktop)=154:y | and_chr=151:y      | android=4.4.3-4.4.4:n
             | ios_saf=26.5:n | samsung=7.2-7.4:n | and_ff=153:n
```

Read exactly: Chrome for Android is recorded as supporting Web Serial **with a
caveat** (`y #1`). `caniuse-lite` ships the support matrix but strips the
footnote text, and the hosts that carry it are blocked by this environment's
egress policy, so **the caveat's content is unknown here**. It is not treated
as either a yes or a no.

Everything else in that table is a plain `n`: Samsung Internet, Firefox for
Android, the legacy Android Browser, and every iOS browser expose neither API.

## The first path is the web, not a package

The plan is deliberate, not a fallback from a blocked download:

1. **Open the deployed page in Chrome for Android on a real phone.** That is
   the first test, and it may be the last one needed. Nothing about the
   application assumes a desktop.
2. **Read the diagnostics report on that phone.** It states the browser and
   version, whether the platform is Android, whether `navigator.serial` and
   `navigator.usb` exist, whether the document's permissions policy allows
   them, whether the context is secure, and how many devices this origin has
   already been granted.
3. **Only if that report shows the transport is genuinely missing** does a
   host application become the answer.

A packaged application is **not** on the critical path and must not be started
on a guess. Building one before a phone has been tested would be building
around a problem nobody has observed.

### What the diagnostics report can and cannot see

| Observable | How |
| --- | --- |
| Browser and version | `navigator.userAgentData.brands`, ignoring Chromium's decoy brand; the user-agent string only as a fallback |
| Android | the reported platform, or the user-agent string |
| `navigator.serial`, `navigator.usb` | the objects themselves |
| Secure context | `isSecureContext` |
| Permissions-policy allowance | `document.permissionsPolicy.allowsFeature("serial" / "usb")`, reported as `null` where the browser will not answer |
| Devices already granted | `serial.getPorts()` and `usb.getDevices()` |

**OTG or physical attachment is not observable from a page.** Neither Web
Serial nor WebUSB exposes cable state or an unprompted device list; both return
only what the user has already permitted. So "0 granted" is the normal state
before a first grant and is never reported as a fault. The closest honest
signal the application can give is: the API exists, the policy allows it, the
context is secure — press connect and the browser will show whatever the OS
enumerates.

## If a package is ever needed

The Android SDK is not installed in the development environment used here, and
it cannot be fetched from it:

```
$ curl -sS --max-time 25 https://dl.google.com/android/repository/repository2-3.xml
curl: (56) CONNECT tunnel failed, response 403
```

`adb` is absent (`adb: not found`); Java 21 and Gradle 8.14.3 are present.

That is a limit of one sandbox, **not a reason to stop**. GitHub Actions runners
ship the Android SDK, so a package would be built there and published as a
downloadable artifact. The blocked host above is a note about where a build
must run, and nothing more.

## What was built instead, and what it is worth

Two things, both real code with tests:

1. **Runtime capability detection** — `apps/web/src/hardware/platform-capabilities.ts`.
   It reads `navigator.serial`, `navigator.usb`, `isSecureContext` and the
   injected bridge, and nothing else. No user-agent sniffing, no viewport
   guessing. `devicePathBlocker()` turns that into one of three specific
   reasons, which the UI shows verbatim: `INSECURE_CONTEXT`,
   `NO_SERIAL_TRANSPORT`, `USB_ONLY`. On a phone where Web Serial is missing,
   the operator is told which API is missing and what to use instead — the
   connect button is disabled with a reason, not silently broken.
   Status: `IMPLEMENTED`, unit tested.

2. **The native bridge seam** — `apps/web/src/hardware/native-bridge.ts`.
   An **architectural fallback, and nothing more.** A host injects
   `globalThis.elrsNativeBridge`, a validated object exposing a Web
   Serial-shaped `requestPort()`; the controller passes it as the session
   layer's `navigatorObject`, so every existing device code path would run
   unchanged over it. The point of shipping the seam now is that choosing this
   route later costs no rewrite.

   It is **not complete and not tested as a bridge.** No host implements it, no
   package exists, and nothing has spoken to a device through it. What is
   tested is the web half: that a well-formed bridge is accepted, that a
   wrong-version or malformed one is ignored rather than half-trusted, and that
   an accepted one is presented as the serial API. Do not describe it as
   working. Status: the web-side contract is `IMPLEMENTED` and unit tested; the
   bridge as a whole is unbuilt.

The bridge is deliberately the narrowest contract that works. A host
implementing it needs Android's `UsbManager` plus a USB-serial driver for the
usual CP210x / CH340 / FTDI bridges, and a WebView that loads this application.
Writing and signing that host is the remaining work, and it cannot start in
this environment for the reason recorded above.

## What would move Android to `HARDWARE_VERIFIED`

In order, each producing evidence rather than an opinion:

1. Open the deployed page in Chrome for Android on a real phone and read the
   diagnostics report. That single report settles the `y #1` caveat for that
   phone and browser version, and it is the only thing that should be done
   first.
2. If Web Serial is present — the expected case — connect a real TX over OTG
   and run the identify step. A CRSF identity read on the phone is
   `HARDWARE_VERIFIED` for the read path on that device, and no package is
   needed at all.
3. Only if step 1 shows the transport is genuinely absent: build a host
   application against the bridge contract on a runner that has the Android
   SDK, publish it as an artifact, and repeat step 2 through it.

Until one of those produces a report, the honest status for Android is
`UNSUPPORTED_WITH_EVIDENCE` for every browser in the table that reports `n`,
and **unverified** for Chrome for Android — not "supported".

## The Android host APK

`android/` is a real Gradle project that CI builds into a debug APK
(`.github/workflows/android.yml`), with Gradle lint and JVM unit tests.

### Why it is a WebView with a native bridge

Three shapes were possible and only one can drive a device:

| Shape | Web Serial | Can supply a native bridge |
| --- | --- | --- |
| Trusted Web Activity / Custom Tab | yes — it *is* Chrome | **no**, the page runs outside this app |
| Plain WebView | **no** — WebView implements neither Web Serial nor WebUSB | not useful alone |
| WebView + native USB host bridge | not needed | **yes** |

A Trusted Web Activity would add a launcher icon and nothing else; an operator
is already better served by installing the PWA in Chrome. A plain WebView would
be strictly *worse* than the browser, because every device operation would
fail. So the host is a WebView that supplies `elrsNativeBridge` from Android's
USB Host API — the seam `apps/web/src/hardware/native-bridge.ts` exists for.

### How the WebView is confined

The WebView that can reach a device must never be pointed at a document this
APK did not ship. `MainActivity` enforces that, and
`scripts/check-ci-hygiene.mjs` fails the build if any of it is undone.

| Property | How | Where |
| --- | --- | --- |
| Only APK-bundled assets are the document | `WebViewAssetLoader` serving `https://appassets.androidplatform.net/assets/web/` | `MainActivity.onCreate` |
| The web build is inside the APK, not fetched | `bundleWebAssets` copies `apps/web/dist`, and fails the build if it is empty | `android/app/build.gradle.kts` |
| No filesystem, no content providers | `allowFileAccess`, `allowContentAccess`, `allowFileAccessFromFileURLs`, `allowUniversalAccessFromFileURLs` all false | `applyHardening` |
| No plaintext | `MIXED_CONTENT_NEVER_ALLOW` | `applyHardening` |
| No navigation off the packaged origin | `shouldOverrideUrlLoading`: an `http(s)` link goes to the system browser, which cannot reach the bridge | `HostWebViewClient` |
| No subframe navigation at all | `shouldOverrideUrlLoading` returns true for every non-main-frame request | `HostWebViewClient` |
| No foreign subresources | `shouldInterceptRequest` serves the APK, permits **only** `https://expresslrs.github.io` (where the firmware is, and what `connect-src` already names), and returns an empty response for everything else | `HostWebViewClient` |
| Every certificate error refused | `onReceivedSslError` calls `handler.cancel()`; `proceed()` appears nowhere in the project | `HostWebViewClient` |
| Debugging only in debug builds | `WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)` | `MainActivity.onCreate` |
| Safe Browsing on where available | `WebSettingsCompat.setSafeBrowsingEnabled` | `applyHardening` |
| A strict CSP with no `unsafe-eval` | the same policy `_headers` sends, carried in the document because the asset loader sets no headers | `apps/web/index.html` |

### How the bridge is confined

`addJavascriptInterface` is not called anywhere in this project. It cannot be
restricted to an origin: it reaches every frame the WebView loads and the callee
cannot tell which frame called it. The bridge is
`WebViewCompat.addWebMessageListener`, which supplies the origin and the
main-frame flag from the WebView rather than from the message.

On a WebView without `WEB_MESSAGE_LISTENER` or `DOCUMENT_START_SCRIPT`
(Chromium below 88) the bridge is **not installed** — it does not fall back to a
weaker one — and the page is told the exact reason, which the build banner shows.

| Property | Where |
| --- | --- |
| Only the allowed origin may speak | `BridgeCore.handle`, checked before the message is parsed |
| Only the top-level frame may speak | `BridgeCore.handle`, from the WebView's own `isMainFrame` |
| Every field validated natively — operation, device id, session id, byte values, transfer size, offset, timeout | `BridgeRequest.parse` |
| One owner per port | `BridgeCore.open` refuses a second open; `write`/`read`/`close`/`cancel` must present the session that opened it |
| Chunk ordering | a single worker thread, plus an offset that must equal what the session has written |
| Cancellation overtakes queued work | `BridgeCore.cancel` runs on the caller's thread, not the queue |
| A thrown transfer releases the port | `BridgeCore.transfer` |
| Backgrounding revokes write authority | `MainActivity.onPause` → `onHostBackgrounded`: the port closes and every pending promise is rejected |
| Detach releases the port | a `RECEIVER_NOT_EXPORTED` receiver for `ACTION_USB_DEVICE_DETACHED` |
| A destroyed Activity keeps nothing open | `MainActivity.onDestroy` → `close` |

### What the APK proves, and what it does not

| Item | State | Evidence |
| --- | --- | --- |
| Project compiles, lint clean | `IMPLEMENTED` | `gradle lintDebug` in CI |
| USB permission and interface rules | `EMULATOR_VERIFIED` | `UsbDeviceGateTest`, JVM unit tests in CI |
| Bridge origin, frame, validation, session, lifecycle rules | `EMULATOR_VERIFIED` | `BridgeCoreInstrumentedTest` against `FakeUsbBackend`, on an emulator in CI |
| WebView confinement and bridge injection | `EMULATOR_VERIFIED` | `WebViewHostInstrumentedTest`, on a real WebView |
| The bundled application renders in both locales, in the real Activity | `EMULATOR_VERIFIED` | `PackagedApplicationInstrumentedTest` |
| Debug APK produced with a recorded identity | `IMPLEMENTED` | `android.yml` artifact |
| USB CDC-ACM byte transport | `IMPLEMENTED` | **not executed anywhere** — `AndroidUsbBackend` is the one part a fake stands in for |
| Anything over real USB OTG | **`UNVERIFIED`** | none |

### APK identity

Recomputed on every head. A workflow-only change still produces different APK
bytes, so a digest is never carried over from a previous commit.

| Field | Value |
| --- | --- |
| Commit | `b4ed6c75078ba83308c48adb44ed458aadea42dc` |
| Workflow run | [34414473713](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/actions/runs/34414473713), attempt 1 |
| Artifact | `elrs-android-host-debug-b4ed6c75078ba83308c48adb44ed458aadea42dc`, ID `10128607884` |
| Artifact ZIP SHA-256 | `7d29c1d354effffb0752550cc85084d39037a7464e9618c06e604c3112037374` |
| Artifact ZIP bytes | 3,451,739 |
| APK filename | `app-debug.apk` |
| APK bytes | 3,758,670 |
| APK SHA-256 | `bb73e2784a498f98aa3d26814a6041271cbc415cc4b20f32053ed2200be699d9` |
| Package id | `com.fpvarabic.elrs.bridge` |
| `versionCode` | 1 |
| `versionName` | `0.1.0-unverified-debug` |
| `minSdk` | 24 (declared in `app/build.gradle.kts`; the badging label changed in build-tools 37 and the workflow now reads both spellings) |
| `targetSdk` | 35 |
| `compileSdk` | 35 |
| Build tools | 37.0.0 |
| Signing certificate SHA-256 | not yet captured — `apksigner verify --print-certs` produced no match against the pattern used on this run; the workflow now reads the digest by shape rather than by the signer heading |
| Embedded web build SHA-256 | `47c9c58577c83ca4cce4529ebedb9d123d30644b710843a98406b2781f7f18cc` |
| Embedded native source SHA-256 | `15c8f608fa04b55caad3f4c7f8383bee54af37d7a2e4f43131fc08998ed48692` |

The last two are written into the APK as `assets/source-identity.json`, shown in
the build banner inside an installed host, and exported in diagnostics — so a
result reported from a phone names the exact sources behind it.

This is a **debug** build signed with the Android debug key. It is not a release
artifact and must not be treated as one.

An emulator cannot close this gap: it has no USB host, so no emulator run can
exercise an OTG path. Only a physical phone or tablet with an OTG cable can.

### Still open — needs a physical Android device

Not one of these has been run. None may be marked passed from CI.

| # | Case | State |
| --- | --- | --- |
| A1 | Install the debug APK on a phone or tablet with USB OTG | UNVERIFIED |
| A2 | Attach an ExpressLRS device; the attach intent offers the app | UNVERIFIED |
| A3 | USB permission **granted** — a port opens and identity is read | UNVERIFIED |
| A4 | USB permission **denied** — a named refusal, no port held | UNVERIFIED |
| A5 | USB permission **revoked** after being granted — the stale handle is refused, not used | UNVERIFIED |
| A6 | Detach during identify / settings write / binding / firmware write / recovery — each closes the port | UNVERIFIED |
| A7 | Background and resume mid-operation | UNVERIFIED |
| A8 | Screen rotation mid-operation | UNVERIFIED |
| A9 | Cancel an operation and confirm the port is released, not left open | UNVERIFIED |
| A10 | Firmware file selection through the Android picker | UNVERIFIED |
| A11 | Recovery after an interrupted write, on Android | UNVERIFIED |
| A12 | Arabic and English, RTL and LTR, at phone width | UNVERIFIED |
| A13 | No feature is hidden merely because the platform is Android | UNVERIFIED |

See [PHYSICAL_VALIDATION_HANDOFF.md](hardware/PHYSICAL_VALIDATION_HANDOFF.md)
for how to install this APK, verify it, and run these rows.

### Hardware required to close them

| Need | Precise requirement |
| --- | --- |
| Phone or tablet | Android 7.0 (API 24) or newer **with USB host/OTG support** — many budget devices omit it; check the device's `android.hardware.usb.host` feature before buying |
| Cable | USB-C OTG cable, or USB-C to USB-A adapter plus the device's own cable |
| Device under test | An ExpressLRS TX or RX presenting a **USB CDC-ACM** serial interface — for example an ESP32-S3 or ESP32-C3 based module with native USB |
| Not yet supported | A module behind a CP210x, CH340 or FTDI bridge chip. The USB filter matches CDC-ACM only, and the application says so rather than appearing to support it. |
