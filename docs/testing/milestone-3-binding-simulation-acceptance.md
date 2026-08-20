# Milestone 3 Binding Simulation — Acceptance Evidence

Status: **Build-tested software-only candidate with green official CI; owner
acceptance pending. Physical validation is intentionally deferred.**

This record accepts only the preview-bound Synthetic Binding architecture and
its isolated Web lab. It does not authorize real Binding, device configuration,
reboot, Firmware update, RF modification, or any hardware support claim.

## Candidate contract

```text
Synthetic device facts
→ read-only Core preview
→ explicit SIMULATION_ONLY label
→ fixed effect and verification requirements
→ approval bound to operation/provider/device/Target/catalog digest
→ fresh live identity/capability recheck
→ field-for-field approval match
→ deterministic Synthetic command
→ same-device reconnect
→ same-Target re-identification
→ LINK_ESTABLISHED verification
→ SUCCESS
```

The candidate code checkpoint is
`eb902b521110a87609a18635919bc056b558450e`.

## Automated acceptance matrix

| Gate | Evidence | Status |
| --- | --- | --- |
| No hardware authority | `BindingProvider.executionAuthority` admits only `SYNTHETIC_ONLY`; every other value becomes `NONE` plus `HARDWARE_WRITE_DISABLED` | Passed |
| Preview is read-only | Preview preparation calls identity/capability readers only and releases its session; provider prepare/execute/reconnect/verify methods are not called | Passed |
| Connected identity gate | Disconnected or non-`CONFIRMED` identity produces a blocked preview | Passed |
| Catalog gate | Unapproved catalog, missing Target, or Target without guided Binding blocks confirmation | Passed |
| Runtime capability gate | Missing/unavailable/evidence-free guided Binding capability blocks confirmation | Passed |
| Explicit effects | Preview declares `BINDING_RELATIONSHIP_WILL_CHANGE` before approval | Passed |
| Explicit verification | Preview declares same-device reconnect, same-Target re-identification, and link establishment | Passed |
| Bound approval | Approval binds preview, operation, provider, device, Target, catalog digest, authority, and canonical UTC timestamp | Passed |
| Fresh live recheck | Execution rebuilds a new preview from current identity/capabilities before any command method | Passed |
| Stale preview rejection | Altered device, Target, catalog digest, provider, operation, or authority fails before command execution | Passed |
| Accessor safety | Accessor-backed approval data is not executed and does not satisfy the gate | Passed |
| Verified success | Command completion alone cannot produce success; reconnect, re-identification, and `LINK_ESTABLISHED` remain mandatory | Passed |
| UI confirmation boundary | The confirm action exists only for `READY`; blocked scenarios show fixed blocker codes and no confirm button | Passed |
| Arabic/English UX | Arabic/RTL initial render and English/LTR switch are tested | Passed |
| No Web network use | The isolated lab asserts that `fetch` is untouched while preparing and displaying a preview | Passed |
| Route isolation | Only the exact `?view=binding-preview` query selects the M3 lab; the normal application remains default | Passed |
| Tampered Web preparation | A Target-altered displayed preparation reaches the Core and is rejected with `PERMISSION_DENIED`, without success data | Passed |

## Official CI evidence

Candidate commit
`eb902b521110a87609a18635919bc056b558450e` passed
[GitHub Actions run #17](https://github.com/melyanneahmed-rgb/expresslrs-arabic-easy-setup/actions/runs/32413640550)
on 2026-08-20.

```text
Frozen install / supply-chain policy: 272 lockfile entries passed
Prettier: passed
ESLint with zero warnings: passed
TypeScript: passed
Dependency boundaries: 9 workspace packages passed
Production browser security-header policy: passed
Markdown links: 53 links across 51 Markdown files passed
MASTER_PLAN contract: passed
Vitest: 25 files, 350/350 tests passed
Production Web build: passed; source and built security headers verified
Dependency license policy: 248 package/version records, 0 exceptions
High-severity advisory audit: no known vulnerabilities
```

The M3 code and UI add no external dependency. The documentation commit that
contains this acceptance record must receive its own green CI before the PR can
be treated as a fully documented candidate.

## Validation labels

Achieved:

- `CODE_REVIEWED` for the implemented contracts and tests;
- `BUILD_TESTED` for the software candidate;
- `SIMULATION_ONLY` for every M3 Binding preview and execution;
- deterministic `MOCK_EXERCISED` evidence only.

Not achieved or claimed:

- `HARDWARE_TESTED`;
- authenticated physical identity;
- supported commercial device or Target;
- real Binding/update/write capability;
- RF range, stability, latency, telemetry, or performance improvement;
- release readiness.

## Owner acceptance checklist

- [x] The M3 provider authority is Synthetic-only.
- [x] Preview preparation cannot call a Binding command.
- [x] The displayed effect and postconditions are explicit.
- [x] Approval is bound to every current safety-critical fact.
- [x] Core rechecks live facts immediately before execution.
- [x] Stale, altered, or accessor-backed approvals fail closed.
- [x] Success still requires reconnect, re-identification, and link verification.
- [x] The isolated Arabic-first Web lab exercises the same Core contract.
- [x] Official CI is green for the immutable code checkpoint.
- [ ] Owner acceptance review of Draft PR #4.

## Deferred physical work

No physical test is required for accepting this software-only slice. Before a
future real Binding provider is enabled, a separate hardware gate must be
opened and completed for the exact provider/device/Firmware matrix. Until then:

- the M2A Local HTTP adapter remains read-only;
- its real Target Catalog remains empty;
- all real Binding, configuration, reboot, update, Firmware, and RF paths remain
  disabled;
- `SYNTHETIC_ONLY` remains the sole Binding execution authority.
