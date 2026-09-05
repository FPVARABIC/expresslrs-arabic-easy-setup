# ADR-0020: Bounded Synthetic source and notice inspection

- Status: Accepted for software-only Synthetic evidence
- Date: 2026-08-24
- Hardware validation: None
- Admitted trust root: None
- Production origin: None
- Catalog entries: None admitted
- Real Firmware writer: Prohibited by the current provider contract

## Context

ADR-0019 proves the exact byte identities and bounded acquisition of one
Synthetic Firmware object, its corresponding-source archive, and its notice
bundle. The source and notice contents remained explicitly `UNINSPECTED`.

A matching archive digest alone cannot show which files it contains. A JSON
file named as notices also cannot establish a schema or a relationship to
license files. Accepting caller-created inventory results would allow hidden,
unlisted, or cross-release files to be joined to genuine distribution evidence.

## Decision

### Restricted Synthetic source archive

`inspectSyntheticCorrespondingSourceArchive()` accepts bytes only for the
corresponding-source object named by an internally branded distribution/root
verification. Core first copies the input, requires the signed size and SHA-256,
and admits only the restricted gzip profile with compression method 8 and no
optional header fields.

A `SYNTHETIC_ONLY` decompression provider emits at most 4,096 chunks of at most
64 KiB. Core caps total output at 64 MiB, copies chunks, and independently checks
the signed gzip trailer's CRC32 and ISIZE against the complete output. CRC32 is
not a cryptographic digest; this is only a deterministic Synthetic decompression
link and is never presented as authenticity or production decompressor proof.

The output must be an exact restricted USTAR archive:

- at most 128 entries;
- regular files only, with canonical relative ASCII paths;
- no absolute path, `.`/`..` segment, repeated separator, prefix extension,
  link, owner/group name, device field, or duplicate path;
- fixed Synthetic mode/UID/GID/time fields;
- valid header checksum and zero data padding; and
- exactly two terminal zero blocks with no trailing archive data.

The strict profile deliberately rejects general TAR extensions. Supporting a
production corresponding-source archive requires a later archive-format and
platform decision.

### Canonical inventory and declared build inputs

The first archive entry must be
`ELRS-EASY-SOURCE-INVENTORY.json`, no larger than 64 KiB. It is strict bounded
JSON and must equal its RFC 8785 canonical form. The exact schema binds:

- Target, release sequence, and Firmware artifact SHA-256;
- a unique path, role, positive size, and SHA-256 for every remaining archive
  entry; and
- `SOURCE`, `LICENSE`, or `BUILD_INPUT` as the only roles.

Archive order must equal the inventory's strictly path-sorted order. Core
requires no hidden or missing entries and hashes every listed file.

Exactly these six declared build-input IDs must occur once and point to hashed
`BUILD_INPUT` entries:

| Build-input ID | Meaning of the declaration |
| --- | --- |
| `upstream-source` | Exact upstream-source record supplied by the fixture |
| `targets-snapshot` | Exact Target snapshot record |
| `patch-set` | Exact patch-set record |
| `toolchain` | Exact toolchain identity record |
| `dependency-lock` | Exact dependency-lock record |
| `build-configuration` | Exact non-secret build-configuration record |

Success is `VERIFIED_SYNTHETIC_SOURCE_INVENTORY` with
`EXACT_DECLARED_INPUTS_LINKED_TO_ARCHIVE_ENTRIES`. It proves that the declared
records are present and hash-linked; it does not prove that their claims are
true, sufficient, buildable, or reproducible.

### Canonical notice schema and source links

`inspectSyntheticFirmwareNotices()` accepts only the exact notice bytes named
by the same branded distribution result and a branded source inspection from
that exact result. Core checks the signed notice size and SHA-256, strict UTF-8,
bounded JSON, exact fields, and RFC 8785 form.

The notice schema binds the same Target, release, Firmware SHA-256, and source
archive SHA-256. Every notice entry has a unique component ID, a
`LicenseRef-Synthetic-*` expression, and one path/SHA-256 pair. Those pairs must
match all and only the inventory's `LICENSE` entries.

Success is `VERIFIED_SYNTHETIC_NOTICE_SCHEMA` with
`EXACT_LICENSE_ENTRIES_LINKED_BY_PATH_AND_SHA256`. It does not establish license
validity, attribution completeness, legal compliance, or permission to
distribute.

### Internally branded final join

`createSyntheticFirmwareSourceReviewEvidence()` requires the existing branded
distribution candidate, branded source inspection, and branded notice
inspection from the same distribution/root object. Target, release, and all
three object digests must match. Clones and cross-wired results fail closed.

Success is `SYNTHETIC_FIRMWARE_SOURCE_REVIEW_EVIDENCE` with:

- `NOT_ADMITTED_UNTRUSTED_SYNTHETIC`;
- `HASHED_INSPECTED_AND_DISCARDED`;
- `NOT_PROVEN` reproducibility; and
- `BLOCKED_SYNTHETIC_FIXTURE`.

All Core copies of compressed source, decompressed archive, entries, and notices
are cleared or discarded before return. No bytes or copy closure is returned.

## Verification evidence

The adversarial suite directly covers empty, truncated, false-header, and
digest-mismatched gzip input; invalid, failing, cancelled, late, exception-
suppressing, oversized, and over-count decompression output; invalid USTAR
headers, paths, duplicate paths, padding, terminators, entry counts, and entry
digests; all bounded inventory/notice JSON failure mappings; release and source
linkage mismatch; and cloned or cross-root evidence joins.

The measured `firmware-source-evidence.ts` module reaches 95.26% statements,
95.12% lines, and 93.44% branches. These are software-only Synthetic tests and
do not change any trust, Hardware, distribution, or writer claim.

## What this does not prove

- The unadmitted root, signer, archive, notices, or declarations belong to this
  project, ExpressLRS, or an authorized builder.
- The source archive is complete corresponding source under any license.
- The six declared records are accurate or sufficient to reproduce a build.
- The source produced the named executable, or an independent rebuild matched.
- Notice expressions or files meet legal obligations.
- A production decompressor, origin, CORS policy, Browser, Target, executable,
  Catalog entry, real device, writer, boot, reconnect, RF link, or recovery path
  passed.

No result may be described as trusted, reproducible, license-complete,
catalog-admitted, writable, Hardware-tested, Stable, or supported Firmware.

## Alternatives

- Accept a sidecar inventory without inspecting the archive: rejected because
  hidden, missing, or cross-wired entries would remain possible.
- Support general TAR/PAX/GNU extensions now: rejected because the parser and
  path traversal surface would expand before a production archive policy.
- Treat gzip CRC32 as a cryptographic content identity: rejected; only the
  signed compressed SHA-256 is cryptographic, while CRC32/ISIZE checks the
  Synthetic decompressor output for this stage.
- Mark a six-field declaration as a reproducible build: rejected until an
  independent bounded build and exact output comparison exist.
- Treat a matching `LicenseRef` as legal clearance: rejected because legal
  completeness requires owner review and actual applicable licenses/notices.

## Consequences

- Exact signed Synthetic source bytes now have a bounded, no-hidden-file
  inventory inspection rather than a name-only association.
- Six build-input declarations are joined to exact archive entries without
  claiming their truth or reproducibility.
- Exact signed notice bytes now have a canonical schema and complete path/hash
  linkage to the archive's declared license entries.
- Catalog admission, production networking, durable trust, and every writer
  remain structurally blocked.
- The subsequent ADR-0021 slice models a bounded Synthetic build recipe and
  independent fixture-output comparison without invoking a real toolchain or
  admitting production Firmware.

## References

- [ADR-0017: Bounded Synthetic gzip and executable identity](ADR-0017-bounded-synthetic-gzip-and-executable-identity.md)
- [ADR-0018: Synthetic dual-form Manifest linkage](ADR-0018-synthetic-dual-form-manifest-linkage.md)
- [ADR-0019: Bounded Synthetic distribution acquisition](ADR-0019-bounded-synthetic-distribution-acquisition.md)
- [ADR-0021: Bounded Synthetic build recipe and output comparison](ADR-0021-bounded-synthetic-build-recipe-and-output-comparison.md)
- [Core API Boundary](../architecture/core-api.md)
- [Validation Levels](../testing/validation-levels.md)
