# Milestone 4 Firmware Update Simulation — Acceptance Evidence

Status: **Build-tested software-only candidate with green official CI; owner
acceptance pending. Physical validation is intentionally deferred.**

This record accepts only the provenance-bound Synthetic Firmware Update
architecture and its isolated Web lab. It does not authorize a physical write,
real Firmware artifact, device reboot, configuration change, RF mutation,
hardware support claim, merge, or release.

## Candidate contract

```text
Synthetic artifact descriptor and provenance metadata
→ strict Core rebuild and internal consistency checks
→ Synthetic integrity validation
→ live identity/capability/catalog/compatibility gates
→ explicit SIMULATION_ONLY preview
→ declared destructive effects and verification plan
→ approval bound to every displayed safety-critical field
→ fresh artifact and live-device recheck
→ field-for-field approval match
→ deterministic Synthetic write and reboot
→ same-device reconnect
→ same-Target re-identification
→ exact expected Firmware-version verification
→ SUCCESS
```

The immutable code and Web checkpoint is
`6033a44a48cd1c65431d58e57c03f3be23a0a7d4`.

The included artifact/provenance fixture is synthetic metadata only. It does not
contain Firmware bytes, and its toolchain identity explicitly records
`synthetic-node-24-no-firmware-build`.

## Automated acceptance matrix

| Gate | Evidence | Status |
| --- | --- | --- |
| No hardware authority | `FirmwareUpdateProvider.executionAuthority` admits only `SYNTHETIC_ONLY`; every other value fails before provider methods | Passed |
| Preview cannot write | Preview preparation can call artifact validation plus identity/capability reads only; prepare/write/reboot/reconnect/verify are unreachable | Passed |
| Artifact shape | Target and Firmware version are bounded; SHA-256 must be exactly 64 lowercase hexadecimal characters | Passed |
| Provenance shape | All source/version/commit/patch/Target/build/toolchain/time/hash fields are rebuilt and validated | Passed |
| Provenance binds artifact | Provenance Target and artifact SHA-256 must equal the artifact descriptor before device reads | Passed |
| Accessor safety | Accessor-backed artifact, provenance, and approval data is not executed and cannot satisfy a gate | Passed |
| Integrity gate | Failed Synthetic artifact validation blocks before identity/capability reads | Passed |
| Connected identity gate | Disconnected or non-`CONFIRMED` identity cannot produce a ready preview | Passed |
| Catalog gate | Unapproved catalog or missing Target blocks confirmation | Passed |
| Runtime capability gate | Missing, unavailable, or evidence-free update capability blocks confirmation | Passed |
| Compatibility gate | Only `COMPATIBLE` can become ready; unsupported major Firmware is blocked with deterministic reasons | Passed |
| Explicit effects | Preview declares Firmware replacement, reboot, and link interruption before approval | Passed |
| Verification plan | Preview declares reconnect, identity, Target, and exact Firmware-version postconditions | Passed |
| Bound approval | Approval binds operation, provider, device, Target, catalog, artifact, every provenance field, authority, and plan ID | Passed |
| Fresh live recheck | Execution revalidates artifact and rebuilds identity/capability/compatibility preview before prepare or write | Passed |
| Stale approval rejection | Changed artifact, provenance, provider, device, Target, catalog, authority, or plan fails before prepare/write | Passed |
| Mixed confirmation rejection | Boolean confirmation and preview approval cannot be supplied together | Passed |
| Verified success | Write completion alone cannot produce success; reboot, reconnect, same Target, and exact version remain mandatory | Passed |
| Uncertain-state semantics | Unknown write outcome becomes `UNKNOWN_STATE`; post-write uncertainty becomes `RECOVERY_REQUIRED` | Passed |
| UI confirmation boundary | Confirm exists only for `READY`; blocked compatibility/provenance scenarios show fixed reasons and no confirm action | Passed |
| Arabic/English UX | Arabic/RTL initial render and English/LTR switch are tested | Passed |
| No Web network use | The isolated lab asserts that `fetch` is untouched while preparing and displaying a preview | Passed |
| Route isolation | Only exact `?view=firmware-preview` selects the M4 lab; default application and M3 lab remain separate | Passed |
| Tampered Web preparation | A displayed artifact-SHA alteration reaches the Core and is rejected with `PERMISSION_DENIED`, without success data | Passed |

## Official CI evidence

Candidate commit
`6033a44a48cd1c65431d58e57c03f3be23a0a7d4` passed
[GitHub Actions run #22](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/actions/runs/32417030765)
on 2026-08-20.

```text
Frozen install / supply-chain policy: 272 lockfile entries passed
Prettier: passed
ESLint with zero warnings: passed
TypeScript: passed
Dependency boundaries: 9 workspace packages passed
Production browser security-header policy: passed
Markdown links: 62 local links across 54 Markdown files passed
MASTER_PLAN contract: passed
Vitest Core: 22 files, 360/360 tests passed
Vitest Web: 6 files, 9/9 tests passed
Vitest total: 28 files, 369/369 tests passed
Production Web build: passed; source and built security headers verified
Dependency license policy: 248 package/version records, 0 exceptions
High-severity advisory audit: no known vulnerabilities
```

M4 adds no external dependency. The documentation commit containing this record
must receive its own green CI before Draft PR #5 can be treated as a fully
documented software-only candidate.

## Validation labels

Achieved:

- `CODE_REVIEWED` for the implemented contracts and tests;
- `BUILD_TESTED` for the named software checkpoint;
- `SIMULATION_ONLY` for every M4 preview and execution;
- deterministic `MOCK_EXERCISED` evidence only.

Not achieved or claimed:

- `BENCH_TESTED`, `HARDWARE_TESTED`, or `FLIGHT_TESTED`;
- a real or official Firmware artifact;
- a reproducible physical Firmware build;
- authenticated physical identity;
- physical write, reboot, recovery, rollback, or update safety;
- supported commercial device or Target;
- RF range, stability, latency, telemetry, or performance improvement;
- release readiness.

## Owner acceptance checklist

- [x] The M4 provider authority is Synthetic-only.
- [x] Preview preparation cannot call a write or reboot method.
- [x] Artifact and provenance inputs are strictly rebuilt and internally bound.
- [x] Integrity, identity, catalog, capability, and compatibility gates fail closed.
- [x] Destructive effects and postconditions are explicit before confirmation.
- [x] Approval is bound to every current safety-critical fact and plan.
- [x] Core rechecks artifact and live facts immediately before execution.
- [x] Stale, altered, malformed, or accessor-backed data fails before write.
- [x] Success still requires reboot, reconnect, re-identification, and exact-version verification.
- [x] The isolated Arabic-first Web lab exercises the same Core contract without network access.
- [x] Official CI is green for the immutable code/Web checkpoint.
- [ ] Official CI is green for the final documentation checkpoint.
- [ ] Owner acceptance review of Draft PR #5.

## Deferred physical work

No physical test is required for accepting this software-only slice. Before a
future real Firmware writer is enabled, a separate physical gate must be opened
and completed for exact artifact bytes, provenance, Target, provider, Firmware,
host, and reference hardware. Until then:

- the M2A Local HTTP adapter remains read-only;
- its real Target Catalog remains empty;
- all physical Binding, configuration, reboot, update, Firmware, and RF paths
  remain disabled;
- `SYNTHETIC_ONLY` remains the sole Firmware Update execution authority;
- the Synthetic provenance fixture must never be presented as a real build or
  release artifact.
