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
| Bridge origin, frame, validation, session, lifecycle rules | `EMULATOR_VERIFIED` | `BridgeCoreInstrumentedTest` against `FakeUsbBackend` |
| WebView confinement and bridge injection | `EMULATOR_VERIFIED` | `WebViewHostInstrumentedTest`, on a real WebView |
| The bundled application renders in both locales, in the real Activity | `EMULATOR_VERIFIED` | `PackagedApplicationInstrumentedTest` |

All three suites: **42 tests, 0 skipped, 0 failed**, on an API 34 `google_apis`
x86_64 emulator. Green on three consecutive heads — runs
[34420741483](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/actions/runs/34420741483),
[34421520061](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/actions/runs/34421520061)
and
[34422431912](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/actions/runs/34422431912),
the last of which is the head under review. The suite sources are unchanged
across all three, so the later runs are repeats rather than new coverage; they
are recorded because a green result on the head being reviewed is worth more
than one on its ancestor.

Reaching that took four defects in the job itself and two real defects the
tests then found, all recorded here because each was a genuine fault rather
than a flake:

| Where | Defect |
| --- | --- |
| workflow | `yes \| sdkmanager --licenses` is killed by SIGPIPE, and `pipefail` turned that into a failed step two seconds in |
| workflow | `adb wait-for-device` has no timeout, so a dead emulator spent the job's whole limit looking like a slow one |
| workflow | `avdmanager` writes to `$HOME/.config/.android/avd` and the `emulator` binary reads `$HOME/.android/avd`; the AVD was created and invisible |
| workflow | `${{ runner.temp }}` in a job-level `env:` block fails GitHub's validation — the run had zero jobs and was named by its file path |
| **host** | `BridgeCore` posted replies with `View.post`, which never runs on a view that is not attached to a window; a page's promise would hang forever, neither answered nor rejected |
| test | the refusal-ordering assertion expected the interface reason where the gate correctly reports the permission reason first |
| Debug APK produced with a recorded identity | `IMPLEMENTED` | `android.yml` artifact |
| USB CDC-ACM byte transport | `IMPLEMENTED` | **not executed anywhere** — `AndroidUsbBackend` is the one part a fake stands in for |
| Anything over real USB OTG | **`UNVERIFIED`** | none |

### APK identity

Recomputed on every head and never carried over from a previous commit. CI
writes this record beside the APK as `app-debug.apk.identity.txt`, and refuses
to publish an APK whose two embedded source digests are missing or `absent`.

| Field | Value |
| --- | --- |
| Commit | `a79b19ace1c93ea387f557a3cb8e99c818ce255a` |
| Workflow run | [34422431912](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/actions/runs/34422431912), attempt 1 |
| Artifact | `elrs-android-host-debug-a79b19ace1c93ea387f557a3cb8e99c818ce255a`, ID `10131478794` |
| Artifact ZIP SHA-256 | `9c74140cd5e76db365d11d28d761d74fc231d508c661d710fc8203eaa5246891` |
| Artifact ZIP bytes | 3,453,318 |
| APK filename | `app-debug.apk` |
| APK bytes | 3,760,222 |
| APK SHA-256 | `45204d46a022be57d6424f1628167ebf77e7f00f238f9bc342f2cdf5bde8ec7e` |
| Package id | `com.fpvarabic.elrs.bridge` |
| `versionCode` | 1 |
| `versionName` | `0.1.0-unverified-debug` |
| `minSdk` | 24 |
| `targetSdk` | 35 |
| `compileSdk` | 35 |
| Build tools | 37.0.0 |
| Signing certificate SHA-256 | `d7379486747b4d26d85112de24518b40e055b6b5242459a2dd9d2495cb1f05c0` |
| Embedded web build SHA-256 | `d7fbc61563324ab10112501431245d4bc5e4bd2407e89ec2a45b11c73f61ba7f` |
| Embedded native source SHA-256 | `a9c4b14ac2395c7428bc75a99f00c80f3599bb93ac363cb1b390e0c0c797e4f9` |

Two fields were absent from the first attempt at this record and are worth
naming, because the absence was silent: build-tools 37 renamed the badging
label for `minSdk`, and the signing digest was being matched by the signer
heading rather than by its shape. Both are read robustly now.

The last two rows are written into the APK as `assets/source-identity.json`,
shown in the build banner inside an installed host, and exported in
diagnostics — so a result reported from a phone names the exact sources behind
it.

#### What the APK digest does and does not identify

Comparing four consecutive heads makes the distinction concrete, and it is not
the one you would assume:

| Commit | Changed | APK bytes | APK SHA-256 | Signing certificate | Web build | Native source |
| --- | --- | --- | --- | --- | --- | --- |
| `6a225f3` | test sources | 3,760,158 | `bcfde79c…` | `8bb0af82…` | `d7fbc615…` | `abf487f0…` |
| `73f2e7f` | host sources | 3,760,222 | `e15fe086…` | `be2a7d3e…` | `d7fbc615…` | `a9c4b14a…` |
| `0861c7b` | Markdown | 3,760,222 | `5f011ce3…` | `ea89565c…` | `d7fbc615…` | `a9c4b14a…` |
| `a79b19a` | workflow, gate, Markdown | 3,760,222 | `45204d46…` | `d7379486…` | `d7fbc615…` | `a9c4b14a…` |

The last three commits change nothing that goes into the APK. Every input is
identical across them — both source digests match, as do the byte count, the
version fields and the SDK levels — and all three APK digests differ, because
the **signing certificates differ too**. No debug keystore is configured, so
AGP generates one per runner: four runs, four keys. The APK digest therefore
identifies **one build**, not one commit; building the same tree again yields a
different digest.

So the digest is a download-integrity check against `app-debug.apk.sha256` in
the same artifact, and nothing more. The claim R4 actually asks for — that an
installed APK can be traced back to its source — rests on the two embedded
source digests, and those are stable across builds of the same tree, which the
table above demonstrates rather than asserts.

Two consequences worth knowing before the bench:

- **Builds cannot be installed over one another.** Android rejects an update
  signed by a different key, so a tester moving between candidates must
  uninstall first. `docs/hardware/PHYSICAL_VALIDATION_HANDOFF.md` says so, and
  says what the refusal looks like, because the error text
  (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) reads like a broken APK and is not.
- **A stable identity is a release-signing decision, deliberately not taken
  here.** It would need either a keystore committed to the repository or one
  generated in CI from a secret. The first is rejected: a private key in a
  public repository lets anyone build an APK that Android accepts as an update
  to this one, and for an application with USB write authority over flight
  hardware, throwing away that protection costs more than the one uninstall
  step it saves. The second is the right answer for a published build and needs
  a repository secret that does not exist yet; it is out of scope for bench
  validation, where every candidate is downloaded from a named CI run anyway.

**This record is for the commit and run named above.** A later commit — or a
re-run of this one — produces a different APK; CI records its identity the same
way, and the artifact for a given commit is named after that commit.

This is a **debug** build signed with a generated Android debug key. It is not a
release artifact and must not be treated as one.

The published APK is also not the same binary the instrumentation suite ran
against: the two jobs build independently on separate runners. They are builds
of the same sources, which the identity record is what proves — not the same
file.

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
