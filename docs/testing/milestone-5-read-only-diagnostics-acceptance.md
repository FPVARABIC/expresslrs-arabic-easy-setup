# Milestone 5 — Read-only Diagnostics Acceptance

## Scope

This checkpoint accepts the software-only read-only Diagnostics foundation, its safe report-to-health composition adapter, and its explicit-read-gated Advanced-mode application wiring. It does not accept a physical diagnostics provider, Hardware writes, automatic repair, Firmware flashing, RF changes, or Hardware validation.

## Candidate

- current reviewed software checkpoint: `f1128b3d288113967e7d1377e377c01a2bf5f2dd`
- GitHub Actions: [CI run #88](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/actions/runs/32778550160)
- validation level: `BUILD_TESTED`
- Hardware validation: `NONE`
- write disposition: `BLOCKED_NO_HARDWARE_AUTHORITY`

## Accepted behavior

The Diagnostics package has a deterministic health assessment over six fixed evidence categories:

1. device identity;
2. compatibility;
3. Binding state;
4. Firmware status;
5. configuration read availability;
6. connection stability.

It also has a Core-owned adapter that composes the existing privacy-safe diagnostic report into the assessment while independently allowlisting supplemental compatibility, Binding and Firmware states.

The Web package has a fixed Advanced-mode presentation model and React panel. The application wires them only after an explicit Local HTTP read, composes only the privacy-safe report plus deliberately unknown compatibility/Binding/Firmware states, and clears the panel when the origin changes. The presenter revalidates the Core assessment envelope and exposes only six fixed rows, translation keys, status labels and presentation tones. The panel receives only this presentation model and has no device-command or automatic-repair callback.

Acceptance requires all of the following:

- a fully healthy software evidence set may return `READ_ONLY_HEALTHY` but still cannot authorize any write;
- identity below `CONFIRMED` returns a blocking result;
- explicitly unsupported compatibility returns a blocking result;
- update/reconnect/read-attention states return `NEEDS_REVIEW`, not success-by-default;
- unknown runtime values fail closed to reviewed `UNKNOWN` states;
- accessor-backed hostile fields are not executed;
- attacker-controlled strings are not reflected into output;
- output collections and nested findings are immutable;
- no raw device values, identifiers, credentials, persistence, or raw findings are included in the presentation boundary;
- every finding has `automaticFixAvailable: false`;
- a forged diagnostic report envelope falls back to unknown evidence;
- a forged health assessment that changes the write disposition falls back to a blocked presentation;
- a successful read does not imply stable connection by itself;
- `STABLE_OBSERVED` is derived only from a diagnostic report that has already admitted a consistent reconnect comparison;
- failed reads map configuration availability to attention, while cancellation remains unknown rather than falsely unsupported;
- extra raw/secret-like properties on report, assessment, or supplemental input are ignored;
- the presentation remains absent from Easy Mode and before an explicit Advanced-mode device read;
- the wired presentation renders exactly six health rows and no repair/action button;
- a self-reported Target never becomes a guessed compatibility or approved Firmware result;
- changing the selected origin clears the previous assessment;
- a stable connection result appears only after the existing manual reconnect comparison becomes consistent;
- the Arabic presentation uses existing translations and contains no question-form punctuation;
- the ordinary Easy UI remains unchanged with exactly three primary actions.

## Automated evidence

The M5 health slice adds 9 focused tests in `packages/diagnostics/src/read-only-health.test.ts`.

The composition adapter adds 8 focused tests in `packages/diagnostics/src/read-only-health-adapter.test.ts`.

The Advanced presentation model adds 6 focused tests in `apps/web/src/view-model/readOnlyHealthPresentation.test.ts`.

The React panel adds 4 focused tests in `apps/web/src/components/ReadOnlyHealthPanel.test.tsx`. The existing application integration suite now also asserts Advanced-only visibility, explicit-read gating, safe composition, origin reset, and reconnect-category updates.

[CI run #88](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/actions/runs/32778550160) passed on the exact wiring candidate:

- frozen dependency install and supply-chain policy for 272 lockfile entries;
- Prettier;
- ESLint with zero warnings;
- TypeScript strict checking;
- dependency-boundary verification for 9 workspace packages;
- Browser security-header verification;
- Markdown-link verification: 95 local links across 64 Markdown files;
- complete `MASTER_PLAN.md` contract verification;
- Vitest: 38/38 files, 529/529 tests;
- production Web build;
- dependency license policy for 248 package/version records across 11 observed expressions with 0 reviewed exceptions;
- high-severity dependency audit with no known vulnerabilities.

## Non-claims

This acceptance does not claim:

- continuous monitoring or an automatic live-connection claim;
- Hardware-tested diagnostics;
- real-device Binding state verification beyond existing evidence boundaries;
- an admitted production Target Catalog;
- a trusted Firmware catalog or signing root;
- physical Firmware update or recovery;
- automatic fixes;
- RF, range, latency, telemetry, stability, or performance improvement;
- production release readiness.

## Exit status

The software-only M5 Diagnostics foundation, safe diagnostic composition adapter, and explicit-read-gated Advanced application wiring are accepted at `BUILD_TESTED`. Physical validation, production trust, and every real write path remain separate future gates. The next promotion gate is the documented read-only Hardware/Browser matrix.
