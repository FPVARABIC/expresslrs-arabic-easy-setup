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

### What the APK proves, and what it does not

| Item | State | Evidence |
| --- | --- | --- |
| Project compiles, lint clean | `IMPLEMENTED` | `gradle lintDebug` in CI |
| USB permission and interface rules | `EMULATOR_VERIFIED` | `UsbDeviceGateTest`, JVM unit tests in CI |
| Debug APK produced with a recorded SHA-256 | `IMPLEMENTED` | `android.yml` artifact |
| USB CDC-ACM byte transport | `IMPLEMENTED` | **not executed anywhere** |
| Anything over real USB OTG | **`UNVERIFIED`** | none |

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

### Hardware required to close them

| Need | Precise requirement |
| --- | --- |
| Phone or tablet | Android 7.0 (API 24) or newer **with USB host/OTG support** — many budget devices omit it; check the device's `android.hardware.usb.host` feature before buying |
| Cable | USB-C OTG cable, or USB-C to USB-A adapter plus the device's own cable |
| Device under test | An ExpressLRS TX or RX presenting a **USB CDC-ACM** serial interface — for example an ESP32-S3 or ESP32-C3 based module with native USB |
| Not yet supported | A module behind a CP210x, CH340 or FTDI bridge chip. The USB filter matches CDC-ACM only, and the application says so rather than appearing to support it. |
