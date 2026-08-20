# Validation Levels

| Label | Meaning |
| --- | --- |
| `CODE_REVIEWED` | Confirmed by reading pinned source and recording paths/symbols |
| `BUILD_TESTED` | Reproducible build executed for named SHA/target/toolchain |
| `BENCH_TESTED` | Repeatable non-flight bench procedure and results exist |
| `HARDWARE_TESTED` | Named physical hardware and procedure produced results |
| `FLIGHT_TESTED` | Controlled flight profile, build, configuration, logs, and stop conditions recorded |
| `STABLE` | All release gates for the supported scope passed |

وجود مستوى لا يعني المستويات الأعلى. Milestone 0 لا يرفع نتائج القراءة إلى Hardware validation.
