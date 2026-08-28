# Pre-Hardware Software Readiness Acceptance

## Scope

This acceptance checkpoint covers the software work that can be implemented and validated before reference Hardware is introduced. It accepts software architecture, Mock/Synthetic workflows, read-only Browser code, Diagnostics, Web/PWA resilience, platform-readiness contracts, performance-analysis tooling, CI gates, and the public exact-SHA preview.

It does not accept real-device writes, Hardware compatibility, RF performance, production Firmware trust, or Stable Release readiness.

## Candidate and evidence

- reviewed application SHA: `cb645a12d1668ddd5dc00182bafc9b4c86487b94`
- branch CI: GitHub Actions run #105 — passed
- exact-SHA Pages: run #18 — passed
- main deployment pin: `34cf3b74db17fb1225f3f60d750d1d3cb14d9fef`
- Tests: 46/46 files, 576/576 cases
- Pages PWA worker: `e98c77cdd2e0b865`, nine shell files
- dependency license inventory: 248 package/version records, 11 observed expressions, 0 exceptions
- high-severity dependency audit: no known vulnerabilities
- Hardware validation: `NONE`

## Accepted software gates

The pre-Hardware readiness gate has eleven software categories. At this checkpoint all eleven are `PASS` as software construction gates:

1. Foundation
2. Easy Mode
3. read-only device path
4. Binding simulation
5. Firmware Update simulation
6. Diagnostics
7. PWA/offline foundation
8. platform planning
9. Performance Laboratory analysis harness
10. Web preview
11. CI quality gates

The resulting software status is `READY_FOR_HARDWARE_VALIDATION` and still requires:

- `hardwareValidation: NONE`
- `realWritesEnabled: false`
- `performanceClaimsAllowed: false`

## CI evidence

CI run #105 passed:

- frozen lockfile installation and configured supply-chain policies;
- Prettier;
- ESLint with zero warnings;
- strict TypeScript;
- dependency boundaries for nine workspace packages;
- Browser security-header policy;
- PWA source and production-output policy;
- 115 local Markdown links across 66 files;
- complete `MASTER_PLAN.md` heading contract 1–449;
- 576/576 Vitest cases across 46 files;
- production Web build;
- dependency license policy;
- high-severity dependency audit.

The Web build generated a versioned shell worker and passed both Browser-header and PWA checks against `dist`.

## Exact-SHA deployment evidence

Pages run #18 did not build from `main` application code. It checked out exact reviewed SHA `cb645a12d1668ddd5dc00182bafc9b4c86487b94`, verified HEAD equality, repeated the full software quality gate, built specifically for `/expresslrs-arabic-easy-setup/`, and then ran the dedicated Pages artifact checker.

The Pages build generated worker `e98c77cdd2e0b865`, included exactly the reviewed shell artifact family, and verified repository-scoped assets plus the partial meta CSP. The packaging and publish jobs both passed.

GitHub Pages remains a development preview and is not production-host response-header evidence.

## New pre-Hardware contracts accepted

### Platform readiness

The platform-readiness model prevents platform selection from becoming an implicit write authorization. It models Web desktop, Web Android and Android native separately, ranks implemented read candidates only, and leaves every write path blocked pending Hardware validation.

### Performance analysis

The Performance Laboratory harness consumes already-collected paired measurements and provides deterministic metric summaries. Synthetic measurements can exercise the software but always return `SOFTWARE_ONLY_NO_ADMISSION`. A performance claim can become eligible only from Hardware-observed evidence that satisfies the configured improvement and regression thresholds.

### Software exit report

The software-readiness model prevents a vague percentage from replacing explicit gates. Missing software work returns `SOFTWARE_GAPS_REMAIN`; duplicate/malformed inputs return `INVALID_INPUT`; external blocks remain visible instead of being silently marked PASS.

### Web Beta shell hardening

The Web shell now has a fixed Error Boundary and a safe update-ready notice. Neither displays attacker-controlled error text. A waiting Service Worker is reported but not force-activated, and the update UI has no reload/activation command that can replace the current client mid-operation.

## Non-claims and deferred evidence

This checkpoint does not claim:

- any TX/RX model is Hardware validated;
- Browser Local Network Access, CORS, mixed-content, AP switching or reconnect behavior is validated on reference devices;
- real Binding/configuration/update/reboot/recovery is enabled;
- a production Target Catalog, signing root, trusted clock, persisted rollback store, or real Firmware acquisition provider is admitted;
- real toolchain reproducibility is proven;
- any Range, Stability, Reliability, Recovery, Latency, Telemetry or RF improvement exists;
- Android native is the selected final platform;
- GitHub Pages is a trusted production host;
- Stable Release readiness.

## Acceptance result

The currently executable pre-Hardware software construction is accepted as complete at `BUILD_TESTED` / exact-SHA preview level. Remaining work requires owner/legal decisions or physical/external evidence and must not be filled with inferred trust or simulated Hardware claims.
