# ADR-0021: Bounded Synthetic build recipe and output comparison

- Status: Accepted for software-only Synthetic evidence
- Date: 2026-08-24
- Hardware validation: None
- Admitted trust root: None
- Production origin: None
- Real toolchain invocation: None
- Catalog entries: None admitted
- Real Firmware writer: Prohibited by the current provider contract

## Context

ADR-0020 links six named build-input records to exact files in an inspected
Synthetic source archive. It deliberately does not show that those records form
a coherent recipe or that any output produced from them matches the signed
Firmware artifact.

Accepting an arbitrary caller-created recipe would break the source link.
Trusting a provider receipt without hashing all emitted output would also allow
a claimed match without byte evidence. Conversely, replaying a Synthetic
fixture through a provider boundary cannot prove that a real toolchain executed
or that a release is reproducible.

## Decision

### Exact canonical recipe in `build-configuration`

`inspectSyntheticFirmwareBuildRecipe()` requires an internally branded
`SYNTHETIC_FIRMWARE_SOURCE_REVIEW_EVIDENCE` result. It locates the one inventory
entry whose build-input ID is `build-configuration`, copies caller bytes, and
requires that entry's exact size and SHA-256 before parsing.

The recipe is at most 64 KiB, strict UTF-8 bounded JSON, and must equal its RFC
8785 canonical form. Its exact version-1 schema names:

- the same Target and release sequence;
- exactly five ordered input records: `upstream-source`, `targets-snapshot`,
  `patch-set`, `toolchain`, and `dependency-lock`; and
- the exact signed Synthetic gzip artifact name, media type, size, and SHA-256.

Each input record must equal the path, size, and SHA-256 already stored for that
build-input ID by the branded source inspection. The recipe file itself is the
sixth input and is self-linked by its inventory path, size, and SHA-256 rather
than recursively declaring its own digest.

Success is `VERIFIED_SYNTHETIC_FIRMWARE_BUILD_RECIPE` with
`FIVE_INPUTS_LINKED_AND_CONFIGURATION_SELF_HASHED`. Recipe bytes and input
contents are not returned.

### Separate Synthetic fixture-output provider

`compareSyntheticFirmwareFixtureBuildOutput()` requires the exact branded
source-review and recipe-inspection objects from the same evidence chain. Clones
and cross-wired results fail closed.

Core passes an immutable request containing only the recipe identity, five
linked input records, and expected output identity to a provider whose exact
assurance is `SYNTHETIC_ONLY`. The operation name is
`SYNTHETIC_FIXTURE_OUTPUT_COMPARISON`; no production-toolchain or writer method
exists in this contract.

The provider may emit at most 4,096 chunks of at most 64 KiB. Core copies every
chunk, stops at the signed expected output size, and requires an exact plain-data
receipt naming the same Target, release, recipe digest, six-input count, and
output identity. Core then independently calculates SHA-256 across the complete
emitted output and compares it with the signed distribution artifact digest.
All transient output copies are cleared or discarded before return.

Success is
`SYNTHETIC_FIRMWARE_BUILD_OUTPUT_COMPARISON_EVIDENCE` with:

- `NOT_ADMITTED_UNTRUSTED_SYNTHETIC`;
- `NOT_INVOKED_PROVIDER_RECEIPT_ONLY` for the toolchain;
- `EXACT_SYNTHETIC_RECEIPT_MATCHED`;
- `CORE_SHA256_MATCHED_SIGNED_SYNTHETIC_ARTIFACT`;
- `SEPARATE_SYNTHETIC_PROVIDER_BOUNDARY_ONLY`;
- `NOT_PROVEN_SINGLE_SYNTHETIC_PROVIDER` for reproducibility; and
- `BLOCKED_SYNTHETIC_FIXTURE`.

The provider boundary is independent from distribution acquisition at the
interface level only. It is not an independently operated builder, a real
toolchain, or a reproducible-build attestation.

## What this does not prove

- The unadmitted root, signer, recipe, inputs, provider, receipt, or output came
  from this project, ExpressLRS, or an authorized release builder.
- Any declaration inside the five input files is true, complete, usable, or
  sufficient.
- A compiler, linker, ExpressLRS build system, container, or other real
  toolchain ran.
- A second independent builder reproduced the result.
- The matched bytes are safe, distributable, catalog-admitted, suitable for a
  real Target, or authorized for writing.
- Legal completeness, production origin/CORS/CSP, Browser behavior, Hardware,
  boot, reconnect, RF link, recovery, Binding, configuration, or update passed.

No result may be described as trusted, reproducible, production-built,
license-complete, catalog-admitted, writable, Hardware-tested, Stable, or
supported Firmware.

## Alternatives

- Accept recipe JSON not present in the source inventory: rejected because a
  caller could attach a recipe to unrelated signed source evidence.
- Require the recipe to declare its own SHA-256: rejected because that creates
  a recursive digest. The source inventory already binds the recipe file.
- Trust a provider-declared output digest: rejected because Core can hash the
  complete bounded byte stream independently.
- Label one Synthetic fixture-provider match as a reproducible build: rejected
  because no independent operator or real toolchain executed.
- Pass emitted output into the current writer path: rejected; the comparison
  result returns no bytes and remains structurally blocked.

## Consequences

- The six exact input identities now form one bounded, canonical Synthetic
  recipe linked to the signed output identity.
- A separate Synthetic provider can produce fixture output only through a
  bounded receipt-and-byte-comparison boundary.
- Receipt mismatch, altered output, excessive chunks, malformed JSON,
  non-canonical JSON, clone/forgery, cross-release linkage, and cancellation
  fail closed.
- The stage closes the remaining software-only action recorded after ADR-0020
  without claiming a real or independently reproducible build.
- Further promotion now requires external decisions or evidence: initial trust
  root and clock policy, atomic persistence, production origin/network policy,
  license review, Catalog admission, and Hardware/provider verification.

## References

- [ADR-0019: Bounded Synthetic distribution acquisition](ADR-0019-bounded-synthetic-distribution-acquisition.md)
- [ADR-0020: Bounded Synthetic source and notice inspection](ADR-0020-bounded-synthetic-source-and-notice-inspection.md)
- [Core API Boundary](../architecture/core-api.md)
- [Validation Levels](../testing/validation-levels.md)
