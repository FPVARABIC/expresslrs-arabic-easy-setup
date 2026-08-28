# Pre-Hardware Software Readiness

## Purpose

This document defines the point at which the project has completed the software work that can be implemented and truthfully validated before reference TX/RX Hardware is introduced.

`READY_FOR_HARDWARE_VALIDATION` does **not** mean Stable Release, Hardware support, real flashing approval, RF improvement, or production trust. It means the software-only construction gates are implemented or explicitly blocked by an external decision/evidence gate that software cannot safely invent.

## Current reviewed candidate

- application candidate: `cb645a12d1668ddd5dc00182bafc9b4c86487b94`
- branch: `feat/read-only-device-foundation`
- GitHub Actions CI: run #105 — passed
- exact-SHA GitHub Pages: run #18 — passed
- Vitest: 46/46 files, 576/576 tests
- Hardware validation: `NONE`
- real device writes: disabled
- performance claims: disabled

## Software-only exit gate

`createSoftwareReadinessReport` defines eleven explicit pre-Hardware gates:

| Gate | Current software state | Boundary |
| --- | --- | --- |
| FOUNDATION | PASS | Core contracts, operations, sessions, evidence, privacy, CI and Arabic/RTL foundation exist. |
| EASY_MODE | PASS | Exactly three primary actions remain visible to ordinary users. |
| READ_ONLY_DEVICE | PASS | Real Browser Local HTTP read-only candidate exists; physical behavior remains unvalidated. |
| BINDING_SIMULATION | PASS | Binding workflow, verification and failure behavior are exercised only on Synthetic/Mock providers. |
| FIRMWARE_UPDATE_SIMULATION | PASS | Transport-neutral update orchestration, artifact checks and post-write verification plans exist with real writers blocked. |
| DIAGNOSTICS | PASS | Privacy-safe read-only health assessment and Advanced presentation are implemented. |
| PWA_OFFLINE | PASS | Installability, versioned static-shell cache, limited-offline status and safe waiting-update behavior are implemented. |
| PLATFORM_PLANNING | PASS | Web desktop, Web Android and native Android readiness contracts exist without choosing a native bridge prematurely. |
| PERFORMANCE_HARNESS | PASS | Paired baseline/candidate analysis exists; Synthetic results can never authorize a performance claim. |
| WEB_PREVIEW | PASS | Exact reviewed SHA is deployed through the quality-gated GitHub Pages workflow. |
| CI_QUALITY_GATES | PASS | Formatting, lint, TypeScript, boundaries, security, PWA, tests, build, licenses and high-severity audit pass. |

With all eleven software gates accounted for, the software-only report is `READY_FOR_HARDWARE_VALIDATION` while still returning:

- `hardwareValidation: NONE`
- `realWritesEnabled: false`
- `performanceClaimsAllowed: false`

## Web Beta software boundary

The Web shell now includes the pre-Hardware resilience work that can be proven without a device:

- Arabic-first Easy Mode and English fallback;
- Advanced read-only diagnostics;
- global Error Boundary with fixed non-secret failure copy;
- repository-scoped PWA manifest;
- build-versioned atomic shell precache;
- no Service Worker interception of the three Local HTTP device origins;
- no Firmware/catalog/update metadata cache;
- production-only Service Worker registration;
- waiting application updates are reported but never force activation or page reload;
- current application session cannot be intentionally replaced by a new worker;
- limited-offline state is visible without treating `navigator.onLine` as proof of device reachability.

The Pages build for run #18 generated a reviewed PWA worker identity `e98c77cdd2e0b865` for nine shell files and passed the dedicated Pages artifact checker before publication.

## Platform and Android boundary

The project does not choose native Android merely because native APIs exist. The software readiness contract ranks already-implemented read candidates and leaves the final platform decision behind physical evidence:

- Web desktop: Local HTTP/Web Serial/WebUSB candidates can be ranked when implemented;
- Web Android: a native bridge is requested only if no validated Web read path remains;
- Android native: native USB is a candidate only after the host is deliberately selected;
- every host remains `BLOCKED_PENDING_HARDWARE_VALIDATION` for writes.

This preserves the shared Core/Workflow architecture and prevents an unnecessary rewrite before browser/device evidence exists.

## Performance boundary

`analyzePerformanceExperiment` provides the software analysis harness required before RF optimization work:

- paired baseline and candidate series;
- higher-is-better and lower-is-better metrics;
- minimum run count;
- required improvement and allowed regression thresholds;
- deterministic median summaries;
- explicit `KEEP`, `MODIFY_OR_RETEST`, and `REJECT` decisions only for Hardware-observed input;
- Synthetic input always returns `SOFTWARE_ONLY_NO_ADMISSION` and cannot permit a claim.

No ExpressLRS RF/timing patch is admitted before controlled measurements. This preserves the Master Plan rule that Range/Stability/Reliability/Latency/Telemetry changes enter the optimized Firmware line only when measurements support them.

## External gates that remain intentionally blocked

The following are not software gaps that can be safely filled by guessing:

- reference TX/RX Browser, Local Network Access, CORS, mixed-content, device-AP and reconnect evidence;
- real Binding, configuration, reboot, Firmware write and recovery evidence;
- owner-approved production trust-root ceremony, key custody, thresholds and compromise recovery;
- owner-approved production clock assurance and atomic trust/rollback persistence contract;
- licensing/legal clearance for any code or Target data whose repository does not grant the required reuse rights;
- exact real release/toolchain/Target evidence needed for production catalog admission;
- independently operated real-toolchain reproducibility evidence;
- controlled RF/Hardware measurements;
- production-host response-header evidence;
- final Android platform decision after real mobile/browser/device tests.

These gates must remain explicit. None may be converted into PASS through Synthetic data or self-reported device values.

## Exit rule

Software work before Hardware is considered closed only while all software gates remain PASS in CI and no newly discovered software defect reopens a gate. The next engineering phase is evidence collection on reference Hardware, not enabling a writer by default.
