# Project Status

| Field | Value |
| --- | --- |
| Date | 2026-08-20 |
| Canonical repository | `FPVARABIC/expresslrs-arabic-easy-setup` |
| Current phase | Milestone 4 — Provenance-bound Firmware Update simulation |
| Current branch | `feat/m4-firmware-update-preview-simulation` |
| Current review | [Draft PR #5](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/pull/5), stacked on M3 [Draft PR #4](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/pull/4) and M2A [Draft PR #3](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/pull/3) |
| Stable upstream | ExpressLRS 4.1.0 / `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6` |
| Development reference | `73ce820ba51437f73f31686233b607c58e188e7b` |
| Hardware validation | **None; explicitly deferred by the owner** |
| Physical writes | **Disabled** |
| Real Firmware artifact | **None** |
| Firmware source modifications | None |
| Performance claims | None |
| Current validation | `CODE_REVIEWED`, `BUILD_TESTED`, `MOCK_EXERCISED`, `SIMULATION_ONLY` |

Git history and the milestone acceptance records preserve earlier detailed
checkpoints. This file is the current operational snapshot.

## Milestone overview

### Phase 0 / Milestone 1 Foundation

- Independent repository, upstream pins, research reports, ADRs, threat model,
  dependency policy, privacy/audit boundary, and Arabic-first React/Vite shell
  are implemented.
- Core packages remain independent of React, DOM, platform APIs, and localized
  strings.
- Evidence-based identity, exclusive device sessions, fail-closed
  compatibility, verified operation states, deterministic Mock/Replay
  providers, Easy Binding simulation, and Firmware Update simulation are
  implemented.
- M1 build evidence is green; final owner acceptance remains pending.

### Milestone 2A read-only real-device candidate

- The browser candidate performs only an explicit `GET /config` against three
  pinned ExpressLRS local origins.
- It does not scan, redirect, send credentials, or expose Binding,
  configuration, reboot, update, Firmware, or RF write methods.
- Bounded strict JSON/UTF-8 parsing, fail-closed origin ownership, Core-owned
  immutable facts, privacy-negative filtering, fixed-category diagnostics,
  snapshot-only reconnect comparison, and checked production security headers
  are implemented.
- Real device-reported facts remain `UNVALIDATED`; the real Target Catalog is
  empty and identity remains `UNKNOWN`.
- M2A final documentation head
  `2159e1b442f3962334a4bcac9a8703fe26e6c839` passed official GitHub Actions
  runs #10 and #11. Owner acceptance and the physical Browser/Hardware matrix
  are deferred, not erased.

### Milestone 3 software-only Binding candidate

- `BindingProvider` admits only `SYNTHETIC_ONLY` execution authority.
- A read-only Core preview declares the exact Synthetic Target, provider,
  device, catalog digest, operation effect, verification requirements, and
  fixed blockers.
- Approval is bound to operation, preview, provider, device, Target, catalog,
  authority, and canonical UTC timestamp.
- Core re-reads live identity/capabilities and rebuilds the preview before any
  Synthetic Binding command.
- Success still requires same-device reconnect, same-Target re-identification,
  and `LINK_ESTABLISHED` verification.
- The isolated Arabic-first Web lab at `?view=binding-preview` uses only
  Mock/Synthetic providers and no network request.
- M3 documented head
  `d66fce582620a21700ef69febb4b2160f6083157` passed official GitHub Actions run
  #18 with 350/350 tests and all build, dependency, license, security, and
  documentation gates green.

### Milestone 4 software-only Firmware Update candidate

- `FirmwareUpdateProvider` admits only `SYNTHETIC_ONLY` execution authority.
- Artifact descriptors and `ArtifactProvenance` are rebuilt through a safe
  own-data-property boundary with bounded values, strict SHA formats, and a
  canonical UTC build timestamp.
- Provenance Target and artifact SHA-256 must bind the exact artifact before
  device reads.
- Preview preparation can validate only the deterministic Synthetic artifact
  and read identity/capabilities; it cannot prepare, write, reboot, reconnect,
  or verify Firmware.
- Confirmation is unavailable unless authority is Synthetic, the descriptor is
  connected, integrity is confirmed, identity is `CONFIRMED`, catalog/Target
  are approved, update capability is evidence-backed, compatibility is
  `COMPATIBLE`, and a complete verification plan exists.
- The preview declares Firmware replacement, reboot, and link interruption
  before confirmation.
- Approval is bound to operation, provider, device, Target, catalog digest,
  artifact Target/version/SHA-256, every provenance field, Synthetic authority,
  and verification-plan ID.
- Immediately before execution, Core revalidates the artifact, re-reads live
  identity/capabilities, reevaluates compatibility, rebuilds the preview, and
  compares every approval field. Stale, altered, malformed, or accessor-backed
  data fails before prepare/write.
- Write completion is not success. Reboot, same-device reconnect, same-Target
  identity, and exact expected Firmware version remain mandatory.
- The isolated Arabic-first Web lab at `?view=firmware-preview` offers
  compatible, major-version-mismatch, and provenance-mismatch scenarios, uses
  only Mock/Synthetic providers, and performs no network request.
- The fixture is Synthetic metadata only. It contains no Firmware bytes and
  records `synthetic-node-24-no-firmware-build` as its toolchain identity.
- M4 code/Web checkpoint
  `6033a44a48cd1c65431d58e57c03f3be23a0a7d4` passed official
  [GitHub Actions run #22](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/actions/runs/32417030765):
  28 test files, 369/369 tests, formatting, ESLint, TypeScript, nine-package
  boundaries, security headers, production build, 272-entry frozen lockfile,
  248-record license policy, and high-severity advisory audit all passed.

## Current documentation

- [M4 architecture](docs/architecture/milestone-4-firmware-update-simulation.md).
- [ADR-0012: provenance-bound Synthetic Firmware Update approval](docs/adr/ADR-0012-provenance-bound-firmware-update-approval.md).
- [M4 acceptance evidence](docs/testing/milestone-4-firmware-update-simulation-acceptance.md).
- [M3 architecture](docs/architecture/milestone-3-binding-simulation.md).
- [ADR-0011: preview-bound Synthetic Binding approval](docs/adr/ADR-0011-preview-bound-binding-approval.md).
- [M3 acceptance evidence](docs/testing/milestone-3-binding-simulation-acceptance.md).
- [M2A architecture](docs/architecture/milestone-2-read-only-device.md).
- [M2A acceptance evidence](docs/testing/milestone-2-read-only-acceptance.md).
- [Deferred M2A Hardware/Browser runbook](docs/testing/milestone-2-hardware-browser-runbook.md).

## In progress

- Commit and run official CI for the complete M4 documentation checkpoint.
- Update Draft PR #5 with the immutable documentation head and official run.
- Conduct owner review of the M1, M2A, M3, and M4 software candidates when
  desired.
- Continue software-only product construction without requiring physical tests.

## Deferred physical gates

These items are intentionally deferred until the owner is ready. They do not
block Core, Mock, simulation, UX, documentation, or CI work:

- M2A reference TX/RX Browser, Local Network Access, mixed-content, CORS,
  device-AP, disconnect/reconnect, and mobile matrix;
- authenticated or independently corroborated real Target identity;
- real Binding provider and provider-specific link verification;
- exact real Firmware bytes plus reproducible source/patch/configuration/
  toolchain provenance;
- physical Firmware write, reboot, power-loss, rollback, recovery, reconnect,
  Target, and version verification;
- Android USB/serial/permission behavior;
- controlled RF/bench/flight performance measurement.

## External blockers and unresolved decisions

- Web Flasher/Targets reuse remains blocked by the absence of an explicit
  repository-level license at the inspected SHAs.
- Product repository license and distinct public brand remain pending review.
- Official 4.1.0 artifact inputs and exact Target/toolchain identity are not yet
  complete enough for a real update provider.
- The eventual production host must serve and verify the reviewed security
  headers; a repository `_headers` artifact alone is not deployed-host evidence.
- The public repository still needs a private vulnerability-reporting route
  before users can safely submit sensitive exploit details.

## Next software-only work

1. Keep Draft PR #5 green and documented; do not merge or release from this
   checkpoint.
2. Integrate discoverable navigation to the isolated M3/M4 software labs in the
   normal Arabic-first shell without weakening route, provider, or safety-label
   isolation.
3. Extract a versioned artifact-intake and provenance-validation boundary for
   deterministic fixtures, still without accepting real Firmware bytes or
   physical execution authority.
4. Preserve `SYNTHETIC_ONLY` as the sole Binding and Firmware Update execution
   authority until separate physical-validation gates are explicitly opened.

## Non-claims

This project does not currently claim hardware support, successful physical
Binding, a real Firmware artifact, a reproducible physical Firmware build, safe
physical Firmware update, authenticated device identity, RF improvement, range,
stability, latency, telemetry benefit, or release readiness.
