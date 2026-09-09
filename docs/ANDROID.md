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

## Why no APK was built here

Building an Android package needs the Android SDK. It is not installed, and it
cannot be fetched:

```
$ curl -sS --max-time 25 https://dl.google.com/android/repository/repository2-3.xml
curl: (56) CONNECT tunnel failed, response 403
```

`adb` is absent (`adb: not found`). Java 21 and Gradle 8.14.3 are present, but
without the SDK and without a device, an APK could be neither built nor run.
This is an environment limit, stated as one — not a design decision.

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
   A native host injects `globalThis.elrsNativeBridge`, a validated object
   exposing a Web Serial-shaped `requestPort()`. The controller then passes it
   as the session layer's `navigatorObject`, so **every existing device code
   path runs unchanged over it**: CRSF framing, identity, parameter reads and
   writes, ESP flashing, XMODEM, passthrough, recovery. The native side only
   has to open a USB serial device and move bytes.
   Status: `IMPLEMENTED` (web half), unit tested. `HARDWARE_VERIFIED`: none.

The bridge is deliberately the narrowest contract that works. A host
implementing it needs Android's `UsbManager` plus a USB-serial driver for the
usual CP210x / CH340 / FTDI bridges, and a WebView that loads this application.
Writing and signing that host is the remaining work, and it cannot start in
this environment for the reason recorded above.

## What would move Android to `HARDWARE_VERIFIED`

In order, each producing evidence rather than an opinion:

1. Open the deployed page in Chrome for Android on a real phone and read the
   diagnostics report. It states `Web Serial`, `WebUSB`, `Native bridge` and
   `Secure context` as the APIs actually report them. That single report
   settles the `y #1` caveat for that phone and browser version.
2. If Web Serial is present: connect a real TX over OTG and run the identify
   step. A CRSF identity read on the phone is `HARDWARE_VERIFIED` for the read
   path on that device.
3. If Web Serial is absent: build the host application against the bridge
   contract above and repeat step 2 through it.

Until one of those produces a report, the honest status for Android is
`UNSUPPORTED_WITH_EVIDENCE` for every browser in the table that reports `n`,
and **unverified** for Chrome for Android — not "supported".
