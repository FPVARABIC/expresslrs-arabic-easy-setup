# ADR-0017: Bounded Synthetic Gzip and Executable Identity

- Status: Accepted for software-only Synthetic evidence
- Date: 2026-08-21
- Hardware validation: None
- Signed compressed-artifact metadata: None admitted
- Real executable parser: None admitted
- Real Firmware writer: Prohibited by the current provider contract

## Context

The pinned ExpressLRS Wi-Fi upload handler scans an uncompressed image for the
running Target but treats gzip magic as sufficient at that layer. Device-side
checking is therefore defense in depth, not an independent Target guarantee for
a compressed upload. The application must bound decompression and inspect the
decompressed executable before any future provider can write it.

Signed Manifest v1 intentionally admits only `artifactCompression: "none"` and
`artifactByteForm: "RAW_TO_WRITE"`. It names one length and digest and cannot
unambiguously bind both a compressed download and its decompressed form. Mutating
that fixed schema in place would make existing signature semantics ambiguous.

## Decision

### Separate Synthetic descriptor

Workflow admits an exact ten-field lab descriptor only:

```text
schemaVersion: "1"
artifactType: "synthetic-compressed-firmware-artifact"
compression: "gzip"
decompressedByteForm: "SYNTHETIC_EXECUTABLE_FIXTURE"
executableFormat: "ELRS_EASY_SYNTHETIC_EXECUTABLE_V1"
targetIdentifier
compressedSizeBytes
compressedSha256
decompressedSizeBytes
decompressedSha256
```

The descriptor is not a Manifest, is not signed, and is not accepted into the
Target Catalog or Firmware Update workflow. Unknown fields, accessors, custom
prototypes, non-canonical Target identifiers, unsafe numbers, and non-canonical
SHA-256 values fail closed. Signed Manifest v1 remains unchanged and continues
to reject compression.

### Fixed resource bounds

| Resource | Limit |
| --- | --- |
| Compressed input | 16 MiB |
| Decompressed form | 64 MiB and exactly the declared size |
| One emitted output chunk | 64 KiB |
| Emitted output chunks | 4,096 |

Core snapshots the exact non-empty `Uint8Array`, verifies the compressed length
and SHA-256 before decompression, and checks gzip magic. The platform provider
receives a fresh copy and emits chunks into a Core-owned sink. The sink copies
each exact `Uint8Array`, rejects empty/subclassed/oversized/excess chunks, and
stops before accepting bytes beyond the declared output length. Only after
normal stream completion does Core concatenate the bounded chunks and verify the
decompressed length and SHA-256.

Provider metadata and methods are inspected without executing accessor-backed
properties. Provider exceptions become one fixed failure category while
`AbortError` remains cancellation. Late emissions after provider completion are
ignored and cannot mutate a completed result.

### Browser gzip primitive

The Browser Platform implements streaming `gzip` through
[`DecompressionStream`](https://compression.spec.whatwg.org/). The Compression
Standard requires checksum/size validation, one gzip member, and rejection of
trailing data. The adapter copies input into a private `Blob`, splits platform
output before crossing the Core sink boundary, and independently enforces the
global byte/chunk ceilings.

The adapter is still labeled `SYNTHETIC_ONLY`. A standardized decompression
primitive does not establish artifact source, Target compatibility, browser
support on the required matrix, or permission to write.

### Synthetic executable identity container

The decompressed fixture is deliberately not a real ExpressLRS image. Its exact
big-endian wire layout is:

```text
offset  size  meaning
0       16    ASCII "ELRSEASYFWIMAGE!"
16      1     schema version 0x01
17      1     Target identifier length, 1..128
18      4     executable payload length, unsigned big-endian
22      N     canonical ASCII Target identifier
22+N    M     non-empty opaque Synthetic payload
```

The declared lengths must consume the container exactly; zero-length payloads,
trailing bytes, invalid magic/version, non-ASCII identifiers, and identifiers
outside `[a-z0-9][a-z0-9._-]{0,127}` are rejected. The embedded Target must equal
the descriptor Target.

Success is `VERIFIED_SYNTHETIC_FIXTURE` and carries separate compressed and
decompressed digest evidence, immutable executable identity, explicit
`UNVERIFIED_NO_TRUST_ROOT`, and
`writeDisposition: BLOCKED_SYNTHETIC_FIXTURE`. No payload or byte-copy closure is
returned, and this validator is not connected to a writer-facing facade.

## What this does not prove

- The descriptor or either digest came from the project, ExpressLRS, GitHub, or
  an authorized builder.
- A gzip file is a supported Firmware artifact merely because it decompresses.
- The Synthetic container parser recognizes ESP, STM32, bootloader, or official
  ExpressLRS executable formats.
- The embedded Target is compatible with a connected device or a selected
  update method.
- `DecompressionStream` works on any required desktop/mobile browser or device
  access path.
- A trusted root, signed dual-form Manifest, persistent rollback state,
  corresponding source, real provider, recovery path, or Hardware result exists.

No result from this ADR may be described as trusted, writable, Hardware-tested,
Stable, or supported Firmware.

## Alternatives

- Let the device validate compressed uploads: rejected because the inspected
  Wi-Fi layer does not independently scan the decompressed Target.
- Name only the compressed digest: rejected because a decompressor or archive
  substitution could produce unnamed output bytes.
- Name only the decompressed digest: rejected because acquisition integrity and
  the exact downloaded object would be unaccounted for.
- Buffer the complete decompressed response through `Response.arrayBuffer()`:
  rejected because the output must be stopped at a Core-owned bound while it is
  streaming.
- Extend Manifest v1 in place: rejected because its signed field set names one
  raw byte form and existing canonical signatures must retain one meaning.
- Parse real upstream executable layouts now: deferred until each MCU/update
  family has pinned source evidence, licensed inputs, fixtures, and Hardware
  verification criteria.

## Consequences

- Gzip checksum/trailing-data behavior, resource exhaustion, mutation,
  malformed chunks, digest mismatch, framing, and Target mismatch can be tested
  without a device or real Firmware.
- The distinction between compressed/download bytes and decompressed/identity
  bytes is explicit and independently hashed.
- The next safe slice can define a separately versioned Synthetic Manifest that
  signs both byte forms and links internally proven root/rollback evidence to
  this validator, without admitting a catalog entry or writer.
- Real executable parsers, artifact acquisition, corresponding-source evidence,
  browser/hardware matrices, and every real write remain separate gates.

## References

- [ADR-0014: Signed-manifest trust design and byte verification](ADR-0014-signed-manifest-trust-and-byte-verification.md)
- [ADR-0015: Bounded Synthetic Manifest verification](ADR-0015-bounded-synthetic-manifest-verification.md)
- [ADR-0016: Synthetic root rotation and rollback state](ADR-0016-synthetic-root-rotation-and-rollback-state.md)
- [WHATWG Compression Standard](https://compression.spec.whatwg.org/)
- [Flashing and Update Trace](../research/flashing.md)
- [Validation Levels](../testing/validation-levels.md)
