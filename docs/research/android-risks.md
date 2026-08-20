# Android Risk Study

This is a Phase 0 recommendation, not a framework decision or implementation.

## Evidence

[Android's USB host API](https://developer.android.com/develop/connectivity/usb/host) can enumerate devices, receive attach events, request explicit user permission, claim interfaces, and transfer data through endpoints. USB host support is device-dependent and must be declared in the manifest.

Web capability data changed recently. Chrome 138 introduced Android Bluetooth RFCOMM support, while [Chrome 148](https://developer.chrome.com/release-notes/148) announced Web Serial on Android for removable USB and Bluetooth serial devices. MDN reports API-level support from 138, and Chrome's older guide still describes a WebUSB polyfill. These version/transport differences make real-device testing mandatory.

## Risk matrix

| Area | Risk | Required spike |
| --- | --- | --- |
| USB host/OTG | Phone, cable, power, bridge, and driver differences | Enumerate and communicate on several real phones/cables |
| Web Serial/WebUSB | API may exist but not support a particular bridge/claimed interface | Direct UART and passthrough runs on exact Chrome versions including 148+ |
| WebView/wrapper | Embedded WebView may not expose browser hardware APIs/chooser | Minimal wrapper test before selecting Capacitor/other shell |
| Native bridge | Serial/STLink implementation and lifecycle complexity | Small Kotlin provider implementing one read-only session |
| Wi-Fi device AP | Android may prefer cellular/other Wi-Fi because ELRS AP has no internet | Network binding, “use network as is,” reconnect, and captive-portal tests |
| Local HTTP/LNA | Browser/wrapper permission and mixed-content behavior varies | `/config` read and CORS tests from hosted/PWA/wrapper contexts |
| Background/screen lock | OS may pause JS/network/USB during a sensitive write | Background, lock, sleep, rotation, and process-death scenarios |
| Permissions | USB grants can disappear on detach; unnecessary permissions harm trust | Just-in-time request, denial, revoke, detach, and regrant tests |
| File access | Storage Access Framework and downloaded artifact handling differ | Select, validate, cache, and remove artifact tests |
| Reconnect | USB identity/port object may change after device reboot | Correlate logical session without guessing |
| Power | Phone/OTG may not reliably power every module | Document powered hub/external-power cases and safety limits |

## Architecture recommendation

Preserve one shared Core/workflow implementation and put device access behind:

```text
PlatformAdapter
├── BrowserAdapter
│   ├── WebSerialProvider
│   ├── WebUsbProvider
│   └── LocalHttpProvider
└── AndroidAdapter
    ├── NativeUsbSerialProvider (only if spike requires it)
    ├── NativeNetworkProvider (only if required)
    └── File/Lifecycle bridge
```

The likely robust result is Web UI/shared TypeScript Core plus a narrow native Android bridge for unsupported hardware/lifecycle functions. That is a hypothesis, not a selected framework.

## Decision criteria

Choose PWA only if target hardware paths, reconnect, and interrupted-operation handling all pass on supported Android devices. Choose a wrapper only if its WebView exposes the same capabilities safely. Add a native bridge only for demonstrated gaps, with the smallest contract possible.

The Android decision ADR must compare:

- supported operation matrix;
- amount of shared Core/UI;
- real-device reliability;
- background/recovery safety;
- permission UX;
- maintenance burden;
- offline behavior;
- release/security implications.

## Minimum test matrix

- At least two Android versions and multiple manufacturers.
- Reference ESP TX and RX, one common USB-UART path, and one passthrough path.
- Device Wi-Fi AP and home-network modes.
- Permission allow/deny/revoke.
- Cable removal before/during/after operation.
- Device reboot and re-enumeration.
- Screen lock, background, rotation, app/process termination, and return.

No Android flash claim is valid from emulator testing alone.
