# ADR-0019: Bounded Synthetic distribution acquisition and source evidence

- Status: Accepted for software-only Synthetic evidence
- Date: 2026-08-23
- Hardware validation: None
- Admitted trust root: None
- Production origin: None
- Catalog entries: None admitted
- Real Firmware writer: Prohibited by the current provider contract

## Context

ADR-0018 linked a signed dual-form Manifest, bounded gzip/executable
validation, and unpersisted rollback evidence for one exact Synthetic Firmware
object. It did not identify an acquisition URL, prove that the named object was
obtained without a redirect, or associate exact corresponding-source and notice
bundle bytes with that release.

Adding URLs directly to Manifest v2 would change its fixed signed meaning.
Accepting caller-constructed download or source receipts would also allow a
forged or cross-wired object to appear related to an otherwise valid candidate.

## Decision

### Separate signed distribution statement

Workflow admits a separate exact 16 KiB envelope with schema version `"1"`,
RFC 8785 canonical JSON, Ed25519, and this signature domain:

```text
ELRS-EASY-SYNTHETIC-DISTRIBUTION-MANIFEST-V1\n
```

Its fixed payload names the Synthetic Target, release sequence, required root
version, and three objects:

| Object | Fixed identity |
| --- | --- |
| Firmware artifact | v2 `.gz` name, canonical HTTPS URL, `application/gzip`, size, SHA-256 |
| Corresponding source | `.tar.gz` name, canonical HTTPS URL, `application/gzip`, size, SHA-256 |
| Notices | `.notices.json` name, canonical HTTPS URL, `application/json`, size, SHA-256 |

All three names and URLs must be unique. URLs must use one exact same origin,
contain no credentials, query, or fragment, and end in the signed object name.
This software-only schema admits only the reserved `.invalid` namespace. It
therefore cannot silently become a production downloader or contact a local
device. A production origin policy requires a later decision and schema.

The parser retains the bounded-JSON protections for duplicate decoded keys,
unsafe numbers, invalid Unicode, depth, collections, unknown fields, and exact
field sets. Firmware input remains capped at 16 MiB, source at 64 MiB, and
notices at 4 MiB.

The existing unadmitted `synthetic` root role resolves the exact statement
signer only at threshold one, for the exact required root version and one fresh
`SYNTHETIC_ONLY` clock reading. Success is
`VERIFIED_DISTRIBUTION_AGAINST_UNTRUSTED_ROOT`; it remains
`UNVERIFIED_NO_TRUST_ROOT`.

### Core-owned bounded acquisition

`acquireSyntheticFirmwareDistributionObject()` accepts only an internally
branded distribution/root result. It builds an immutable exact request for one
of the three signed object roles and accepts only a provider with assurance
`SYNTHETIC_ONLY`.

Core, not the provider:

- copies every exact `Uint8Array` chunk;
- rejects empty, subclassed, excessive, or late-relevant data;
- permits at most 4,096 chunks of at most 64 KiB each;
- stops when the signed object size would be exceeded;
- requires an exact plain-data receipt with status 200, unchanged source/final
  URL, exact media type, and measured size;
- hashes the complete reconstructed object against the signed SHA-256; and
- clears transient Core copies and returns no bytes or copy closure.

Success is `VERIFIED_SYNTHETIC_ACQUISITION` with
`byteDisposition: HASHED_AND_DISCARDED`, exact-URL redirect blocking, and
`writeDisposition: BLOCKED_SYNTHETIC_FIXTURE`.

This stage implements the Core boundary and deterministic providers used by
tests. It deliberately adds no Browser/network adapter because the only admitted
origin namespace is non-resolving and no production trust or origin policy
exists.

### Internally branded final join

The existing catalog-candidate result now receives a private producer record.
`createSyntheticFirmwareDistributionCandidateEvidence()` requires:

1. that exact branded catalog candidate;
2. a branded distribution statement verified through the same parsed root;
3. exact matching Target, release, artifact name, compressed size, and digest;
4. a branded acquisition for the Firmware object; and
5. branded acquisitions for its corresponding-source and notice objects.

Clones, forged results, different parsed-root objects, different releases, and
cross-wired acquisitions fail closed. Success is
`SYNTHETIC_DISTRIBUTION_CANDIDATE_EVIDENCE`, still
`NOT_ADMITTED_UNTRUSTED_SYNTHETIC` and `BLOCKED_SYNTHETIC_FIXTURE`.

## What this does not prove

- The Synthetic root, signer, bytes, or provider belongs to this project,
  ExpressLRS, or an authorized builder.
- Any production URL was contacted or any Browser CORS/hosting behavior passed.
- The source archive actually contains complete, buildable corresponding
  source for the Firmware. Only its signed byte identity and presence are
  evidenced; contents remain `UNINSPECTED`.
- The notice JSON is syntactically or legally complete. Only exact bytes are
  evidenced.
- Build inputs are reproducible or the source bundle produced the executable.
- A real executable format, compatible Target, update method, device, writer,
  boot, reconnect, RF link, or recovery path passed.

No result from this ADR may be described as trusted, catalog-admitted,
license-complete, writable, Hardware-tested, Stable, or supported Firmware.

## Alternatives

- Extend Manifest v2 with URLs and source fields: rejected because it would
  change an already fixed signature namespace.
- Trust response headers or a provider receipt without hashing all bytes:
  rejected because neither establishes exact object identity.
- Return acquired bytes for later writing: rejected because this stage must
  remain structurally disconnected from every writer.
- Admit public production origins now: rejected until root admission, origin
  ownership, CORS, hosting, and incident-response policy are reviewed.
- Claim corresponding-source completeness from a matching archive digest:
  rejected because content and build correspondence require separate checks.

## Consequences

- One signed statement now links the exact v2 artifact to exact source and
  notice byte identities without changing Manifest v2.
- Acquisition is bounded, exact-URL, digest-checked, cancellation-aware, and
  byte-discarding at the Core boundary.
- Final evidence cannot be assembled from structurally similar caller objects.
- The next safe slice can inspect a bounded Synthetic source inventory and
  notice schema, then link declared build inputs, while catalog admission and
  every writer remain blocked.

## References

- [ADR-0016: Synthetic root rotation and rollback state](ADR-0016-synthetic-root-rotation-and-rollback-state.md)
- [ADR-0017: Bounded Synthetic gzip and executable identity](ADR-0017-bounded-synthetic-gzip-and-executable-identity.md)
- [ADR-0018: Synthetic dual-form Manifest linkage](ADR-0018-synthetic-dual-form-manifest-linkage.md)
- [Core API Boundary](../architecture/core-api.md)
- [Validation Levels](../testing/validation-levels.md)
