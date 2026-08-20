# Web Capability Study

Inspected 2026-08-20. Published API support is not equivalent to ExpressLRS hardware validation.

## Capability matrix

| Need | Browser mechanism | What is feasible | Main constraints | Phase 0 disposition |
| --- | --- | --- | --- | --- |
| Serial device chooser/session | Web Serial | Direct UART and passthrough protocols can be implemented in JavaScript | Secure context, user gesture/permission, browser/OS/device-driver behavior | Viable adapter; real-device matrix required |
| Raw USB/STLink | WebUSB | USB descriptors/endpoints and STLink-style protocols | Limited browser support, secure context, user gesture, OS driver ownership | Advanced provider only; validate narrowly |
| Device Wi-Fi configuration/update | Fetch to device HTTP API or top-level device Web UI | `/config`, `/update`, file handling, reboot commands | Local Network Access permission, mixed content, CORS, mDNS, AP network switch | Strong path, but hosted-app integration needs spike |
| Local device discovery | Known `.local`/IP plus LNA; no general browser mDNS enumeration API | Probe known ELRS hostnames after permission or guide user | Cannot assume network enumeration; mDNS varies by OS/network | Use capability-driven guided discovery |
| Firmware file input/output | File input, Blob, download, optionally File System Access | Validate and configure prebuilt artifacts locally | File System Access is not universal; downloads are sufficient fallback | Use standard file APIs first |
| Client-side prebuilt binary configuration | JavaScript/typed arrays | Demonstrated in official Web Flasher architecture | License gate, schema/version drift, artifact integrity | Reimplement only after interface/license review |
| Source build | Browser/WASM or remote build service | Technically possible only with substantial new infrastructure | PlatformIO/Python/toolchain, supply chain, privacy, compute | Do not promise for MVP; prefer verified prebuilt catalog first |
| Offline app shell/catalog | Service Worker/PWA | UI, rules, cached metadata/artifacts can work offline | Stale cache, storage quotas, atomic version changes | Viable with signed/versioned manifests |
| Post-write verification | Reconnect and read runtime identity | Wi-Fi `/config` and some serial paths can provide evidence | Permission may be lost; device may return under different transport | Mandatory workflow stage where provider supports it |

## Current published browser evidence

- [Chrome 138 release notes](https://developer.chrome.com/release-notes/138) introduced Web Serial over Bluetooth RFCOMM on Android and explicitly deferred wired serial system support.
- [Chrome 148 release notes](https://developer.chrome.com/release-notes/148) now announce Web Serial on Android for removable USB and Bluetooth serial devices. Chrome's older general guide still describes a WebUSB/polyfill path, while [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) reports API-level Android support from 138. Because these sources describe different versions/transports, our matrix must record the exact Chrome version, device, USB-UART chipset, and whether the OS claims the interface.
- [WebUSB](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API) remains limited availability, secure-context only, and absent from some major browser families. `requestDevice()` requires transient user activation.
- [Chrome's WebUSB guide](https://developer.chrome.com/docs/capabilities/usb) confirms HTTPS, explicit chooser permission, descriptor filtering, connect/disconnect handling, and possible Linux device-rule requirements.
- [Local Network Access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access) gates public-site requests to local/loopback destinations behind secure-context permissions. In supporting browsers, granted permission can relax mixed-content checks for private IP and `.local` device HTTP endpoints.

Published compatibility is only a planning signal. The supported-browser matrix remains `UNVALIDATED` until the project runs its own reference-hardware tests.

## What official Web Flasher proves

At pinned SHA `4125a4e07d37ce1e872bb562ebd4286e6fd143f9`, its architecture demonstrates that a browser can:

- select and patch prebuilt Firmware artifacts;
- flash ESP devices through Web Serial/esptool-js;
- run Betaflight and EdgeTX passthrough flows;
- transfer to supported STM32 bootloaders over XMODEM;
- use WebUSB for STLink;
- cache a PWA shell and Firmware assets.

It also exposes product gaps our workflow must address:

- target/version selection is primarily manual;
- mismatch can expose “Flash Anyway”;
- serial flow marks completion after the writer resolves and closes, without a post-reboot identity read in `SerialFlash.vue`;
- Firmware cache uses `CacheFirst` without our required signed-manifest/version gate;
- code reuse is blocked until its repository license is explicit.

The inspected passthrough path can continue without an exact reported target and describes that case as blind flashing; mismatch handling can enable “Flash Anyway.” Neither behavior is allowed in Easy Mode.

## Device-hosted Web UI integration

Stable Firmware exposes:

- `GET /config`: configuration plus product, target, version, commit, module type, radio type, bands, and domains;
- JSON update/configuration handlers;
- `POST /update`: Firmware upload with target-string check;
- `/reboot`, `/reset`, `/options.json`, and other advanced endpoints;
- mDNS TXT data with ELRS vendor, target, product, version, type, and options.

This is the strongest read-only browser identity surface discovered. However:

- the device serves plain HTTP;
- a hosted HTTPS app needs Local Network Access permission and compatible mixed-content/CORS behavior;
- the device AP removes ordinary internet connectivity and may trigger captive-portal behavior;
- a browser cannot generally enumerate mDNS devices;
- the endpoint is not cryptographically authenticated.

The practical spike must compare three UX patterns:

1. Hosted/PWA app fetches the local device after LNA permission.
2. PWA stays loaded offline while the user switches to the ELRS device AP.
3. Guided handoff to device-hosted Web UI, followed by app re-entry and verification.

The device HTTP surface sets broad CORS headers but does not expose application authentication in the inspected route layer. LNA permission, CORS, local-network authenticity, CSRF-like state changes, and malicious-origin access therefore belong in the threat model.

## Recommended Web architecture

Use a TypeScript monorepo with framework-independent Core and explicit providers:

```text
Domain contracts and rules
→ Workflow/state-machine layer
→ ExpressLRS adapter interfaces
→ Browser providers (Serial, USB, local HTTP, file, mock)
→ Arabic-first Web UI
```

The UI framework should be selected for maintainability, RTL/i18n/accessibility, and test tooling—not because Configurator uses React or Web Flasher uses Vue. A pragmatic Phase 1 recommendation is React + TypeScript + Vite in a workspace, because the existing product team plan already anticipates React boundaries and the ecosystem supports state-machine, i18n, testing, and PWA tooling well. This is a recommendation for newly written code, not a plan to copy Configurator UI.

Core must not import DOM, React, Arabic strings, `navigator.serial`, or `navigator.usb`. Those remain behind `PlatformAdapter`/provider interfaces.

## Browser matrix spike

For each candidate browser/OS, record:

- API presence and secure-context requirements;
- chooser behavior and permission retention/revocation;
- USB bridge/driver ownership;
- connect, disconnect, reboot, and reconnect behavior;
- direct UART, Betaflight passthrough, EdgeTX passthrough, STLink as relevant;
- LNA permission and device HTTP fetch;
- `.local` resolution and device-AP switching;
- tab close, refresh, sleep/background, and PWA update behavior;
- artifact download/upload and offline cache behavior.

No browser is “supported” until the relevant rows pass on reference hardware.
