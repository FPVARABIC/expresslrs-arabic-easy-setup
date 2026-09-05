# Contributing

This repository is developed milestone by milestone. `main` represents a
reviewed integration state; contributors work on focused feature, research, or
experiment branches and submit changes through Pull Requests.

## Before changing code

1. Read `MASTER_PLAN.md`, `STATUS.md`, and the relevant ADR/research report.
2. Confirm that the task belongs to the current milestone.
3. Record a newly discovered idea as `PROPOSED`; do not silently expand scope.
4. Do not copy upstream code or Target data whose reuse has not passed the
   documented license gate.

The current M2 branch contains a software candidate for real CRSF identity,
reversible settings, Binding commands, package preparation, update transports,
recovery, and physical-acceptance recording. This is not Hardware evidence.
Keep read-only identity usable without a remote catalog, keep destructive
writers fail-closed in ordinary builds, and do not convert an acknowledgement
or Mock result into a Hardware, RF-link, recovery, or performance claim.

The isolated Local HTTP read remains limited by ADR-0010 to explicit requests
to reviewed ExpressLRS local origins. Do not add network scanning, unreviewed
origins, automatic release publishing, Firmware/RF changes, or performance
claims outside their documented gates.

## Branches and commits

Use a narrow branch such as `feat/*`, `fix/*`, `research/*`, or `experiment/*`.
Each commit must be reviewable and testable, and must not mix an unrelated
refactor with a feature. Examples:

```text
feat(binding): add device identification stage
fix(update): reject mismatched firmware target
test(link): add recovery-time baseline scenario
docs(upstream): record ExpressLRS baseline
```

Never work directly on `main`. RF/performance experiments stay on Research or
Experiment branches until their evidence and promotion gates are satisfied.

## Required local checks

Run the checks supported by the selected stack before requesting review:

```bash
pnpm check
pnpm licenses:report
pnpm licenses:check
pnpm security:audit
```

`pnpm check` includes repository hygiene, the permanent physical-acceptance
package gate, formatting, lint, strict TypeScript, policy checks, tests, and the
production build. A GitHub Pages candidate must additionally be built with its
exact 40-character `VITE_BUILD_SHA` and pass `pnpm check:pages-build`.

If the environment cannot run an official dependency-backed check, state that
explicitly. A custom/local smoke runner is supporting evidence, not a substitute
for the pinned CI toolchain.

## Pull Request evidence

Every material PR must document:

- goal, change, and reason;
- principal files/components affected;
- tests executed and exact results;
- risks and what remains untested;
- Hardware validation level (normally `NONE` unless evidence exists);
- impact on upstream compatibility;
- screenshots for UI changes;
- baseline/benchmark comparison for performance-sensitive changes.

Compilation alone is not acceptance. Sensitive Firmware changes additionally
require the protocol, bench, regression, Hardware, and recovery gates defined
in the Master Plan.

## Safety, privacy, and security

- Never report `SUCCESS` before independent verification.
- Never guess a Target when identity evidence is ambiguous or unknown.
- Never put Binding Phrase/UID, credentials, MAC/serial identifiers, tokens, or
  raw adapter payloads in logs, errors, fixtures, screenshots, or exports.
- Never commit secrets or user/device data.
- Follow `SECURITY.md` for vulnerability reporting. Until it publishes a
  private route, do not post sensitive exploit details or secrets in a public
  Issue.

## Documentation and claims

Use the validation labels in `docs/testing/validation-levels.md`. Keep
`CODE_REVIEWED`, `BUILD_TESTED`, `BENCH_TESTED`, `HARDWARE_TESTED`, and
`FLIGHT_TESTED` distinct. Range, stability, latency, and reliability claims
require a pinned official baseline, repeatable raw measurements, and regression
analysis.
