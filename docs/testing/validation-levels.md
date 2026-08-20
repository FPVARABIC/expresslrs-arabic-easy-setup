# Validation Levels

| Label | Meaning |
| --- | --- |
| `CODE_REVIEWED` | Confirmed by reading pinned source and recording paths/symbols |
| `BUILD_TESTED` | Reproducible build executed for a named SHA, target, and toolchain |
| `BENCH_TESTED` | Repeatable non-flight bench procedure and results exist |
| `HARDWARE_TESTED` | Named physical hardware and procedure produced results |
| `FLIGHT_TESTED` | Controlled flight profile, build, configuration, logs, and stop conditions recorded |
| `STABLE` | All release gates for the supported scope passed |

وجود مستوى لا يعني المستويات الأعلى. Milestone 0 لا يرفع نتائج القراءة إلى
Hardware validation، ونجاح الاختبارات الآلية لا يساوي `HARDWARE_TESTED`.

## Evidence and scope labels

These labels describe the kind or boundary of evidence. They are not higher
validation levels:

| Label | Meaning |
| --- | --- |
| `MOCK_EXERCISED` | Deterministic Synthetic/Mock providers executed the contract in memory; no physical device evidence exists |
| `SIMULATION_ONLY` | The operation is deliberately restricted to Synthetic execution authority and cannot authorize a real-device write |
| `UNVALIDATED` | Reported evidence exists, but its reliability has not been established on the required physical matrix |
| `HARDWARE_VALIDATION_PENDING` | A named physical gate remains open or deferred |

`MOCK_EXERCISED` and `SIMULATION_ONLY` may accompany `CODE_REVIEWED` and
`BUILD_TESTED`. They must never be displayed as `BENCH_TESTED`,
`HARDWARE_TESTED`, or `FLIGHT_TESTED`.

## Current candidate interpretation

For the M2A Local HTTP candidate, source review and automated build/tests can
support `CODE_REVIEWED` and `BUILD_TESTED`. A successful `/config` read alone
does not validate the reported Target, device family, browser, or hardware.

For the M3 Binding candidate, automated Core/Web tests can support
`CODE_REVIEWED`, `BUILD_TESTED`, `MOCK_EXERCISED`, and `SIMULATION_ONLY`. A
verified Synthetic `LINK_ESTABLISHED` result proves only the deterministic
contract; it is not physical Binding evidence.
