# Phase 0 Exit Review

Review date: **2026-08-20**
Decision: **ACCEPTED FOR M1 FOUNDATION — hardware/write/release gates deferred**
Scope status: The owner authorized model-agnostic Mock/Foundation implementation on 2026-08-20 without owned reference hardware. No hardware write or support claim is authorized.

## Deferred gates

Source-level architecture is now sufficiently mapped to propose a safe product boundary. However, the Master Plan forbids crossing Phase 0 while safety-critical facts remain unknown. The current blockers are not documentation polish:

1. exact license permission for Web Flasher and Targets is unresolved;
2. the browser/Android capability matrix has not been tested on reference hardware;
3. post-bind/post-flash verification availability is not yet proven per provider;
4. some target identities remain inherently ambiguous outside runtime `/config` or exact target responses;
5. official 4.1.0 artifact provenance does not identify every build input;
6. release manifest/signing/source-bundle and project license are not approved;
7. reference RF hardware and legal controlled test setup are not selected.

The owner explicitly amended the execution order: these unknowns do not block framework-independent Core, synthetic fixtures, Cairo/RTL Web shell, CI or Mock workflows. They still block real provider writes, supported-device claims, Beta/Release and performance validation.

## Deliverable review

| Deliverable | Status | Evidence / limitation |
| --- | --- | --- |
| Upstream baseline | PASS | Stable 4.1.0 and current development/reference SHAs pinned separately |
| Official repository inventory | PASS | Firmware, Configurator, Web Flasher, Targets and Docs recorded |
| ExpressLRS architecture map | PASS (`CODE_REVIEWED`) | TX/RX/shared/build/config/device interfaces mapped |
| Binding report | PASS (`CODE_REVIEWED`) | Identity and traditional methods, triggers, strategy, evidence ladder and recovery mapped |
| Build/configuration trace | PASS (`CODE_REVIEWED`) | Source → target/options/toolchain → artifact/trailer/provenance traced |
| Flashing trace | PASS (`CODE_REVIEWED`) | Wi-Fi/UART/BF/ETX/XMODEM/STLink/provider semantics mapped |
| Target/device detection | PASS for source map; PARTIAL for runtime matrix | Strong/weak evidence classified; hardware coverage unknown |
| Web capability study | PASS for published/source evidence; BLOCKED for support claim | Chrome 148 Android change/LNA/WebUSB mapped; real matrix pending |
| Android risk recommendation | PASS as risk report; no architecture decision | PWA/wrapper/native bridge remains spike-dependent |
| RF code map | PASS (`CODE_REVIEWED`) | Shared/2.4/Sub-GHz/LR1121 and development-only boundaries mapped |
| Reuse matrix | PASS | Wrap/adapt/do-not-use decisions documented; license gates enforced |
| Upstream strategy | ACCEPTED FOR FOUNDATION | Hybrid pin + patch queue + source bundle; release procedure still requires proof |
| Licensing report | PARTIAL / RELEASE BLOCKER | GPL/trademark duties mapped; Web Flasher/Targets/project license unresolved |
| Security reconnaissance | PASS as initial threat map | Signed manifest and device HTTP/hardware validation still open |
| Performance measurement plan | PASS as design | No harness/hardware/baseline runs yet |
| Performance hypothesis backlog | PASS | All entries explicitly `UNTESTED` |
| ADR set | PASS for Foundation | Architecture, verification, catalog boundary, model-agnostic support and Cairo decisions recorded |
| GitHub repository | PASS / empty | `melyanneahmed-rgb/expresslrs-arabic-easy-setup` verified empty and linked as `origin` |

## Answers to the twelve Phase 0 exit questions

### 1. What will be reused?

- Pinned official Firmware and its build/configuration behavior.
- Official runtime device APIs/protocol semantics.
- Existing tests and build/flash tooling through wrappers where licensed.
- Official Targets as source-of-truth concept and future pinned catalog, after license clearance.

### 2. What will we build?

- Domain/Core services, identity evidence/confidence, compatibility, workflows, verification/recovery, structured errors/logs, Arabic UX, and platform adapters.
- Provenance/integrity layer missing from inspected end-user flows.

### 3. How will Easy Binding work?

Strategy Engine selects identity configuration or traditional bind based on device/version/capabilities/transports. Execution is followed by normal RF reacquisition and connected + no-mismatch evidence. Automatic availability per provider still requires hardware spike.

### 4. How will Flash work?

`Identify → Resolve target → Validate artifact → Compatibility → Confirm → Provider write → Reboot → Reconnect → Verify`. Provider completion is `WRITE_COMPLETED`, not `SUCCESS`.

### 5. How will Target be determined?

Evidence is normalized and cross-checked against an immutable catalog. `/config` is the strongest inspected HTTP runtime source. Generic MCU/USB/serial evidence is insufficient. Ambiguity stops the write.

### 6. What can Web do?

Chromium can expose Web Serial/WebUSB and local HTTP under permissions; standard file/PWA capabilities are useful. Browser support is fragmented and Chrome Android changed materially through 148. Real support remains unvalidated.

### 7. What needs Native?

Potentially mDNS discovery, some Android USB/serial/STLink flows, background/lifecycle safety and reconnect handling. No native decision until spike.

### 8. How will upstream be synchronized?

Independent product repo + full-SHA pin + ordered patch queue + disposable integration worktree + release source bundle. Never floating `master` or auto-merge RF-sensitive changes.

### 9. How will licensing be preserved?

GPL notices/corresponding source and third-party notices are release gates; distinct brand/trademark disclaimer required. Copying Web Flasher/Targets is blocked until explicit license.

### 10. How is Core separated from UI?

UI calls workflows/public API. Domain, compatibility, device session, provenance and verification do not import React/DOM/Arabic strings or hardware APIs.

### 11. How will future integration work?

Versioned module contracts, structured progress/errors and one-owner Device Session. A later proof will call workflows outside the Web UI.

### 12. How will performance be measured?

Separate exact official-artifact and controlled-source baselines; raw event harness; matched conditions; paired/repeated runs; latency/telemetry/resource regressions; bench/controlled RF/hardware before flight.

## Safety findings that shape the product

- Traditional bind has no final ACK in the traced 4.1.0 path.
- TX `connected` derives from valid downlink telemetry; Model Match is a separate condition.
- Device Wi-Fi stops RF, so config readback cannot prove a live link.
- Official inspected flash flows stop at provider/write completion rather than post-reboot identity readback.
- Web Flasher can offer mismatch force/blind paths; Easy Mode will not.
- Device Wi-Fi target-string scan is not an independent guarantee for compressed uploads; pre-validation is mandatory.
- Generic USB/MCU identity is not a safe Target resolver.

## Required work to pass the gate

| Priority | Closure task | Output |
| --- | --- | --- |
| P0 | Obtain explicit Web Flasher/Targets license clarification or design a no-copy lawful alternative | Updated licensing report and ADR-0003 disposition |
| P0 | Select reference hardware for one 2.4 and one Sub-GHz path | Identified hardware registry and provider coverage |
| P0 | Run desktop browser matrix for read-only identity, permissions, disconnect/reconnect | Evidence table and fixtures |
| P0 | Run Android Chrome 148+ USB/serial/LNA read-only spike | PWA/wrapper/native decision input |
| P0 | Prove post-bind/post-flash verification surface for the first supported providers | Provider-specific Verification Plans |
| P1 | Recover or explicitly mark unknown official 4.1.0 Targets/toolchain provenance | Baseline metadata update |
| P1 | Approve product license, brand/trademark wording and upstream strategy ADR | Release/governance decisions |
| P1 | Define signed manifest/source-bundle design | Security/release ADR |
| P1 | Define legal RF bench plan and reference equipment | Performance laboratory entry gate |

## Owner decision recorded

The plan is amended to allow Mock-only M1 Foundation now. The implementation must remain model-agnostic and use injected catalog/evidence/capability contracts. Hardware/browser/verification matrices will be added when devices become available and remain mandatory before any write path or support claim.
