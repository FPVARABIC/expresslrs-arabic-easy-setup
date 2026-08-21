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

## Gate states are not validation levels

`UNVALIDATED` describes evidence whose reliability has not been established on
the required physical matrix. `HARDWARE_VALIDATION_PENDING` describes an open
gate. Neither label is an achieved level and neither may be presented as
`HARDWARE_TESTED`.

For the M2A Local HTTP candidate, source review and automated build/tests can
support `CODE_REVIEWED` and `BUILD_TESTED`. A successful `/config` read alone
does not validate the reported Target, device family, browser, or Hardware.

## Artifact evidence is also separated

| Artifact label | Exact meaning |
| --- | --- |
| `COHERENCE_ONLY` | Descriptor and provenance have a safe shape and agree internally |
| Digest `SYNTHETIC_ONLY` | Complete deterministic fixture bytes matched the Mock boundary; not cryptographic evidence |
| Digest `CRYPTOGRAPHIC` | A reviewed platform digest adapter calculated SHA-256 over the copied bytes |
| Signature `VALID_UNTRUSTED` | Ed25519 matched bounded canonical Manifest bytes using a caller-supplied Synthetic key; no root authorized that key |
| Root `ROTATION_VERIFIED_UNTRUSTED` | One parsed Synthetic root advanced exactly `N → N+1`, and the incoming bytes met both caller-supplied old/new root thresholds; the old root was not admitted |
| Root `FRESH_UNTRUSTED` | A parsed Synthetic root was inside its validity interval at one fixed time from a `SYNTHETIC_ONLY` clock |
| Manifest `VERIFIED_AGAINST_UNTRUSTED_ROOT` | A fresh parsed Synthetic root resolved the single-signature Manifest role and Ed25519 matched; the root itself was not admitted |
| State `ADVANCED_UNPERSISTED` | A parser-created in-memory Synthetic rollback snapshot advanced monotonically after internally proven rotation/Manifest evidence; no durable write occurred |
| Artifact `VERIFIED_SYNTHETIC_FIXTURE` | Bounded gzip fixture input and output matched separately named digests, and an exact Synthetic executable container carried the expected Target; the descriptor was unsigned and no writable bytes were returned |
| Manifest `VERIFIED_DUAL_FORM_AGAINST_UNTRUSTED_ROOT` | A fresh parsed Synthetic root resolved an exact version-2 signature that names compressed and decompressed sizes and SHA-256 values; the root itself was not admitted |
| Candidate `SYNTHETIC_CATALOG_CANDIDATE_EVIDENCE` | Internally branded dual-form Manifest/root, artifact-validation, and unpersisted rollback results all refer to the same Target, release, and bytes |
| Catalog `NOT_ADMITTED_UNTRUSTED_SYNTHETIC` | Candidate evidence exists for software tests only; no Target Catalog record or release authority was created |
| Write `BLOCKED_SYNTHETIC_FIXTURE` | The evidence is structurally unable to authorize or feed a current Firmware writer |
| `UNVERIFIED_NO_TRUST_ROOT` | No admitted key established who produced or authorized the matching bytes |

A cryptographic digest proves integrity against the expected digest, not the
authenticity of that expectation. None of these labels implies
`HARDWARE_TESTED`, and no current label admits a real writer.
