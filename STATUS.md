# Project Status

| Field | Value |
| --- | --- |
| Date | 2026-08-20 |
| Current phase | Milestone 3 — Preview-bound Easy Binding simulation |
| Current branch | `feat/m3-binding-preview-simulation` |
| Current review | [Draft PR #4](https://github.com/melyanneahmed-rgb/expresslrs-arabic-easy-setup/pull/4), stacked on M2A [Draft PR #3](https://github.com/melyanneahmed-rgb/expresslrs-arabic-easy-setup/pull/3) |
| Stable upstream | ExpressLRS 4.1.0 / `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6` |
| Development reference | `73ce820ba51437f73f31686233b607c58e188e7b` |
| Hardware validation | **None; explicitly deferred by the owner** |
| Real-device writes | **Disabled** |
| Firmware modifications | None |
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

- `BindingProvider` currently admits only `SYNTHETIC_ONLY` execution authority.
- A read-only Core preview now declares the exact Synthetic Target, provider,
  device, catalog digest, operation effect, verification requirements, and
  fixed blockers.
- Confirmation is unavailable unless the descriptor is connected, identity is
  confirmed, the catalog and Target are approved, guided Binding is declared,
  runtime capability evidence exists, and authority is Synthetic.
- Approval is immutable and bound to operation, preview, provider, device,
  Target, catalog digest, authority, and canonical UTC timestamp.
- Immediately before execution, Core re-reads live identity/capabilities,
  rebuilds the preview, and compares every approval field. Stale, altered,
  malformed, or accessor-backed approval data fails before any Binding command.
- Command completion is still not success. The same device must reconnect, the
  same Target must be re-identified, and `LINK_ESTABLISHED` must be verified.
- An isolated Arabic-first Web lab at `?view=binding-preview` exercises the same
  contract using only Mock/Synthetic providers and no network request.
- M3 code checkpoint
  `eb902b521110a87609a18635919bc056b558450e` passed official
  [GitHub Actions run #17](https://github.com/melyanneahmed-rgb/expresslrs-arabic-easy-setup/actions/runs/32413640550):
  25 test files, 350/350 tests, formatting, ESLint, TypeScript, nine-package
  boundaries, security headers, production build, 272-entry frozen lockfile,
  248-record license policy, and high-severity advisory audit all passed.

## Current documentation

- [M3 architecture](docs/architecture/milestone-3-binding-simulation.md).
- [ADR-0011: preview-bound Synthetic Binding approval](docs/adr/ADR-0011-preview-bound-binding-approval.md).
- [M3 acceptance evidence](docs/testing/milestone-3-binding-simulation-acceptance.md).
- [M2A architecture](docs/architecture/milestone-2-read-only-device.md).
- [M2A acceptance evidence](docs/testing/milestone-2-read-only-acceptance.md).
- [Deferred M2A Hardware/Browser runbook](docs/testing/milestone-2-hardware-browser-runbook.md).

## In progress

- Complete official CI for the M3 documentation checkpoint and update Draft PR
  #4 with the final immutable evidence.
- Conduct owner review of the M1, M2A, and M3 software candidates when desired.
- Continue software-only product construction without requiring physical tests.
- Generalize the preview/approval pattern for the next sensitive simulated
  workflow while preserving artifact provenance and verified postconditions.

## Deferred physical gates

These items are intentionally deferred until the owner is ready. They do not
block Core, Mock, simulation, UX, documentation, or CI work:

- M2A reference TX/RX Browser, Local Network Access, mixed-content, CORS,
  device-AP, disconnect/reconnect, and mobile matrix;
- authenticated or independently corroborated real Target identity;
- real Binding provider and provider-specific link verification;
- real Firmware artifact/toolchain provenance and write verification;
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

1. Keep Draft PR #4 green and documented; do not merge or release from this
   checkpoint.
2. Extend the preview-bound contract to the simulated Firmware Update path,
   requiring artifact provenance, compatibility, explicit effects, and a
   verification plan before confirmation.
3. Improve the normal Arabic-first product navigation so software-only labs are
   discoverable without weakening route and provider isolation.
4. Preserve `SYNTHETIC_ONLY` as the sole Binding authority and keep every real
   write path disabled until a separate physical-validation gate is explicitly
   opened.

## Non-claims

This project does not currently claim hardware support, successful physical
Binding, safe physical Firmware update, authenticated device identity, RF
improvement, range, stability, latency, telemetry benefit, or release readiness.
