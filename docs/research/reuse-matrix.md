# Reuse Matrix

This matrix distinguishes architectural reuse from copying. “Wrap” means invoke or communicate with an official component behind our adapter; “Adapt” means independently implement the product-facing contract from verified behavior/source evidence; “Copy” is never implied.

| Component | Official location | Approach | Reason / constraint |
| --- | --- | --- | --- |
| Firmware source and build environments | `ExpressLRS/ExpressLRS/src` | Pin and build unchanged; later patch queue only | Official source of truth; stay close to upstream |
| PlatformIO build pipeline | `src/platformio.ini`, `src/targets`, `src/python` | Wrap in Build Service | Avoid reimplementing target/toolchain behavior; pin every input |
| Binary configuration logic | `src/python/binary_configurator.py`, `UnifiedConfiguration.py` | Prefer invoking pinned official script initially | Handles version/platform-specific layout; GPL/provenance boundary must be explicit |
| Runtime Firmware metadata | `src/lib/OPTIONS`, device Web UI `/config` | Adapt into `DeviceIdentityEvidence` | Strong read-only input; preserve raw source/confidence |
| Device Wi-Fi configuration/update API | `src/lib/WIFI/devWIFI.cpp` | Wrap through `LocalHttpProvider` | Exposes config/update/reboot surfaces; browser/LNA and security tests required |
| CRSF/MSP runtime bind configuration | `src/lib/CrsfProtocol/RxTxEndpoint.cpp` | Adapt behind `BindingProvider` | 4.1.0 can get/set UID and set bind phrase; transport differs by platform |
| Traditional RF binding implementation | `tx_main.cpp`, `rx_main.cpp`, OTA/CONFIG | Reuse Firmware behavior; orchestrate it | Do not rewrite RF binding; simplify entry/verification workflow |
| Radio/FHSS/OTA/telemetry code | Firmware `src/lib` + main loops | Upstream unchanged in product MVP | Performance work requires separate baseline/experiment gates |
| Firmware unit tests | Firmware `src/test` | Run against pinned upstream and patched candidates | Existing protocol/FHSS/OTA coverage is valuable, but not sufficient for product workflow |
| Configurator flashing-strategy concept | `src/api/src/services/*FlashingStrategy*` | Adapt concept, not Electron implementation | Good separation of provider selection from UI; implementation is desktop/GPL coupled |
| Configurator target/user-define loaders | `src/api/src/services/TargetsLoader`, `UserDefinesLoader` | Study schema; build independent adapter only after license decision | Target data license unresolved; desktop filesystem/git assumptions |
| Configurator mDNS device model | `MulticastDns` service/model | Adapt evidence fields | Confirms official runtime fields; browser cannot use Node mDNS directly |
| Configurator progress/log parser fixtures | `FlashOutputParser` | Recreate typed operation events; consider fixtures only under GPL boundary | Product needs structured states, not log text as Core API |
| Configurator UI | `src/ui` | Do not use | Technical/desktop UX and React coupling do not match Arabic workflow-first product |
| Web Flasher serial/USB flow | `web-flasher/src/js` | Study; independently implement or use licensed upstream dependencies after review | Demonstrates feasibility; repository license is unresolved |
| Web Flasher UI/state | `web-flasher/src/pages`, `state.js` | Do not use | Manual target-first UX, verification gap, and unresolved license |
| Web Flasher PWA caching concept | `vite.config.js` | Adapt with stricter version/integrity policy | Cache capability useful; current `CacheFirst` artifact policy is insufficient for our safety gate |
| Targets metadata/layouts | `ExpressLRS/Targets` | Blocked pending explicit license; pin exact snapshot when cleared | Canonical hardware mapping but floating use is unsafe and redistribution permission unclear |
| Targets validators | `.github/targets_validator.py`, `hardware.py` | Study validation rules; copying blocked pending license | Required fields/pin constraints inform our compatibility schema |
| Official Docs | `ExpressLRS/Docs` | Reference/link and carefully derive attributed help | Official behavior source; use versioned links and preserve GPL obligations for derived content |
| Device-hosted Web UI frontend | Firmware `src/html` | Do not make it product UI; use its API and guided handoff | Useful fallback/recovery surface, but not our Core/UX architecture |

## Build versus runtime reuse

Two integration modes are deliberately separate:

- **Build-time integration:** pinned Firmware source, official Python/PlatformIO machinery, exact target snapshot, patch queue, artifact provenance.
- **Runtime integration:** browser/Android providers communicate with the device through serial, USB, CRSF/MSP, or local HTTP and convert evidence into stable Core contracts.

The UI only calls workflows. It never imports upstream Python, target JSON, or hardware protocol code directly.

## Immediate decisions

- Reuse official Firmware behavior; do not build an ELRS replacement.
- Do not fork Configurator or Web Flasher into the product UI.
- Treat the official build scripts and runtime device APIs as integration surfaces.
- Block Web Flasher code and Targets data copying until licenses are explicit.
- Delay all RF changes until the measurement laboratory exists.
