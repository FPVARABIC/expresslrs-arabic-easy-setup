# ADR-0018: Synthetic dual-form Manifest and catalog-candidate evidence linkage

- Status: Accepted for software-only Synthetic evidence
- Date: 2026-08-21
- Hardware validation: None
- Admitted trust root: None
- Persisted rollback state: None
- Catalog entries: None admitted
- Real Firmware writer: Prohibited by the current provider contract

## Context

Signed Manifest v1 has one fixed meaning: an uncompressed
`RAW_TO_WRITE` object with one size and one SHA-256 value. ADR-0017 deliberately
left that schema unchanged and introduced an unsigned Synthetic descriptor for
separately hashing a gzip object and its decompressed executable fixture.

The compressed validator could therefore prove byte coherence and embedded
Target identity, but it could not prove that a signed Manifest named both byte
forms. Root verification and the unpersisted rollback transition also existed
as separate software-only evidence. A structurally similar caller object must
not be able to join those independent results into a catalog claim.

## Decision

### Separate version-2 wire namespace

Workflow admits a new exact four-field envelope:

```text
schemaVersion: "2"
canonicalization: "RFC8785"
payload
signature: Ed25519 / Synthetic key ID / canonical unpadded base64url
```

The detached signature is excluded from its own input. The signature input is
the UTF-8 encoding of:

```text
ELRS-EASY-SYNTHETIC-DUAL-FORM-MANIFEST-V2\n
<RFC 8785 canonical JSON of schemaVersion, canonicalization, and payload>
```

This domain and schema are distinct from Manifest v1. Neither parser accepts
the other wire format, and v1 remains raw-only.

The v2 payload has exactly these fields:

```text
manifestSchema: "2"
manifestType: "synthetic-dual-form-firmware-manifest"
channel: "synthetic"
targetIdentifier
artifactName: canonical .gz name
artifactMediaType: "application/gzip"
compression: "gzip"
decompressedByteForm: "SYNTHETIC_EXECUTABLE_FIXTURE"
executableFormat: "ELRS_EASY_SYNTHETIC_EXECUTABLE_V1"
compressedSizeBytes
compressedSha256
decompressedSizeBytes
decompressedSha256
releaseSequence
signingRole: "synthetic"
requiredRootMetadataVersion
```

This is a narrow linkage Manifest, not the future Stable/Beta release Manifest.
It does not claim artifact acquisition, corresponding-source availability,
device compatibility, or production build provenance.

The parser is capped at 16 KiB and retains the existing bounded JSON rules for
duplicate decoded keys, unsafe numbers, invalid Unicode, depth, collections,
and unknown fields. It also enforces the existing 16 MiB compressed and 64 MiB
decompressed ceilings. Only canonical lower-case SHA-256 and Target identifiers
are admitted.

### Existing Synthetic root role, still untrusted

The existing parsed `synthetic-root` metadata may resolve the exact v2 signer
only when:

- the Manifest names that exact root version;
- the root is fresh at one fixed `SYNTHETIC_ONLY` clock reading;
- the `synthetic` role threshold is exactly one;
- the key remains present and authorized; and
- Ed25519 verifies the v2 domain-separated bytes.

Success is `VERIFIED_DUAL_FORM_AGAINST_UNTRUSTED_ROOT`. It carries both sizes
and hashes but remains `UNVERIFIED_NO_TRUST_ROOT` because no initial root is
admitted.

### Rollback identity

The existing per-Target release floor now accepts an internally proven v2 root
verification. Its `artifactSha256` floor stores the compressed SHA-256. This is
the identity of the exact downloaded/decompression input: changing the archive
changes that identity, while an identical compressed byte stream has one
deterministic decompressed stream. The separately signed and validated
decompressed SHA-256 remains an independent mandatory linkage check.

Equal release sequence with a different compressed digest is therefore a
conflict. Lower release or root versions remain rollback failures. The result
is still only `ADVANCED_UNPERSISTED` or `UNCHANGED_UNPERSISTED`; this ADR adds no
storage adapter or atomic commit.

### Internally branded evidence join

`createSyntheticFirmwareCatalogCandidateEvidence()` accepts only three results
created by the corresponding Workflow implementations:

1. v2 Manifest verification against the parsed Synthetic root;
2. bounded compressed/decompressed artifact validation; and
3. the release-floor transition created from that exact root-verification
   object.

Private `WeakMap` records tie each result to its producer. Cloned, forged, stale,
or cross-wired objects fail closed. Target, both sizes, and both SHA-256 values
must match exactly across Manifest and artifact evidence. The rollback record
must name the same root version, Target, release sequence, compressed digest,
and exact verification object.

Success is evidence with:

```text
status: SYNTHETIC_CATALOG_CANDIDATE_EVIDENCE
validationLevel: SYNTHETIC_ONLY
trustStatus: UNVERIFIED_NO_TRUST_ROOT
catalogDisposition: NOT_ADMITTED_UNTRUSTED_SYNTHETIC
writeDisposition: BLOCKED_SYNTHETIC_FIXTURE
```

It returns identifiers, sizes, and hashes only. It returns no Firmware bytes,
byte-copy closure, catalog record, provider, or write authorization.

## What this does not prove

- The Synthetic root or signer belongs to this project, ExpressLRS, or an
  authorized builder.
- Root metadata or rollback state survives reload, eviction, rollback,
  multi-tab races, or corruption.
- The named gzip object was acquired from an approved immutable origin.
- Corresponding source, notices, build inputs, or reproducibility evidence were
  downloaded and verified.
- The Synthetic executable format recognizes any real ESP, STM32, bootloader,
  or ExpressLRS image.
- The Target is compatible with a connected device or update method.
- Any Browser/device matrix, write, boot, reconnect, RF link, or recovery path
  passed on Hardware.

No result from this ADR may be described as trusted, admitted, writable,
Hardware-tested, Stable, or supported Firmware.

## Alternatives

- Extend Manifest v1 in place: rejected because it would change the signed
  meaning of existing v1 bytes.
- Sign only the compressed digest: rejected because the exact decompressed
  executable would remain unnamed.
- Sign only the decompressed digest: rejected because the acquired object and
  decompression input would remain unnamed.
- Accept structurally equal result objects: rejected because callers could
  forge or cross-wire evidence without executing the required gates.
- Return decompressed bytes with candidate evidence: rejected because this
  stage is intentionally disconnected from every writer.
- Admit a catalog entry after the join: deferred until owner-approved root,
  production clock, atomic rollback persistence, acquisition, corresponding
  source, real executable parsing, compatibility, and Hardware gates exist.

## Consequences

- Both byte forms now have one separately versioned signed identity without
  weakening Manifest v1.
- Root authorization, artifact validation, and rollback decisions can be
  joined without trusting caller-constructed objects.
- Equal-sequence archive replacement fails closed before catalog-candidate
  evidence.
- The next safe slice can add bounded acquisition and corresponding-source
  evidence while the catalog and every writer remain blocked.

## References

- [ADR-0014: Signed-manifest trust design and byte verification](ADR-0014-signed-manifest-trust-and-byte-verification.md)
- [ADR-0015: Bounded Synthetic Manifest verification](ADR-0015-bounded-synthetic-manifest-verification.md)
- [ADR-0016: Synthetic root rotation and rollback state](ADR-0016-synthetic-root-rotation-and-rollback-state.md)
- [ADR-0017: Bounded Synthetic gzip and executable identity](ADR-0017-bounded-synthetic-gzip-and-executable-identity.md)
- [Core API Boundary](../architecture/core-api.md)
- [Validation Levels](../testing/validation-levels.md)
