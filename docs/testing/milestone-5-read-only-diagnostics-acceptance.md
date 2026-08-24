# Milestone 5 — Read-only Diagnostics Acceptance

## Scope

This checkpoint accepts only the software-only read-only Diagnostics foundation. It does not accept a physical diagnostics provider, Hardware writes, automatic repair, Firmware flashing, RF changes, or Hardware validation.

## Candidate

- implementation candidate: `16f62614f59aa654a096aeb2993ae9eaeb1e8135`
- GitHub Actions: CI run #68
- validation level: `BUILD_TESTED`
- Hardware validation: `NONE`
- write disposition: `BLOCKED_NO_HARDWARE_AUTHORITY`

## Accepted behavior

The Diagnostics package now has a deterministic health assessment over six fixed evidence categories:

1. device identity;
2. compatibility;
3. Binding state;
4. Firmware status;
5. configuration read availability;
6. connection stability.

Acceptance requires all of the following:

- a fully healthy software evidence set may return `READ_ONLY_HEALTHY` but still cannot authorize any write;
- identity below `CONFIRMED` returns a blocking result;
- explicitly unsupported compatibility returns a blocking result;
- update/reconnect/read-attention states return `NEEDS_REVIEW`, not success-by-default;
- unknown runtime values fail closed to reviewed `UNKNOWN` states;
- accessor-backed hostile fields are not executed;
- attacker-controlled strings are not reflected into output;
- output collections and nested findings are immutable;
- no raw device values, identifiers, credentials, or persistence are included;
- every finding has `automaticFixAvailable: false`.

## Automated evidence

The M5 slice adds 9 focused tests in `packages/diagnostics/src/read-only-health.test.ts`.

CI run #68 passed:

- frozen dependency install and supply-chain policy for 272 lockfile entries;
- Prettier;
- ESLint with zero warnings;
- TypeScript strict checking;
- dependency-boundary verification for 9 workspace packages;
- Browser security-header verification;
- Markdown-link verification;
- complete `MASTER_PLAN.md` contract verification;
- Vitest: 35/35 files, 511/511 tests;
- production Web build;
- dependency license policy for 248 package/version records across 11 observed expressions with 0 reviewed exceptions;
- high-severity dependency audit with no known vulnerabilities.

## Non-claims

This acceptance does not claim:

- Hardware-tested diagnostics;
- real-device Binding state verification beyond existing evidence boundaries;
- an admitted production Target Catalog;
- a trusted Firmware catalog or signing root;
- physical Firmware update or recovery;
- automatic fixes;
- RF, range, latency, telemetry, stability, or performance improvement;
- production release readiness.

## Exit status

The software-only M5 Diagnostics foundation is accepted at `BUILD_TESTED` for continued construction. Physical validation and every real write path remain separate future gates.
