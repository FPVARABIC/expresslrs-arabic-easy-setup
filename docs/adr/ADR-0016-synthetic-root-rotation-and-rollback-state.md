# ADR-0016: Synthetic Root Rotation and Rollback-state Boundary

- Status: Accepted for software-only Synthetic evidence
- Date: 2026-08-21
- Hardware validation: None
- Trusted signing root: None admitted
- Persistent security storage: None implemented
- Real Firmware writer: Prohibited by the current provider contract

## Context

[ADR-0015](ADR-0015-bounded-synthetic-manifest-verification.md) proved
bounded Manifest parsing, canonical signature bytes, and mathematical Ed25519
verification with one caller-supplied Synthetic key. It did not establish how a
key becomes authorized, how root keys rotate, how a removed key is revoked,
how expiry is checked, or how rollback floors survive an application restart.

These concerns are security state, not UI state. They must remain independent
from Firmware byte integrity, Target compatibility, provider execution, and
post-write verification. A self-signed root downloaded beside an artifact is
not a trust anchor.

The design borrows the relevant invariants from
[The Update Framework specification](https://theupdateframework.github.io/specification/latest/):
root versions advance one at a time, an incoming root is authorized by both the
current and incoming root thresholds, each key counts at most once, root
metadata expires, and accepted versions are persisted to resist rollback. This
project's wire format is a deliberately narrow Synthetic subset; it is not a
claim of TUF compatibility or a replacement for a reviewed TUF implementation.

## Decision

### Bounded Synthetic root wire format

The Workflow package accepts only a version-1 envelope:

```text
schemaVersion: "1"
canonicalization: "RFC8785"
payload:
  rootSchema: "1"
  metadataType: "synthetic-root"
  version: positive safe integer
  notBefore: canonical UTC timestamp
  expiresAt: canonical UTC timestamp
  keys: 1..16 Synthetic Ed25519 public keys
  roles: exactly "root" and "synthetic"
signatures: 1..16 unique detached Ed25519 signatures
```

Each key has an exact `synthetic:` key ID, `ed25519` key type, `Ed25519`
algorithm, and canonical unpadded base64url encoding of exactly 32 raw bytes.
Each role is scoped to the `synthetic` channel, lists unique existing key IDs,
and declares a positive threshold no greater than its key count. Every listed
key must be referenced by at least one role. Signatures are canonical unpadded
base64url encodings of exactly 64 bytes and duplicate signer IDs are rejected.
A rotation signature may refer to a key absent from the incoming payload,
because an old-root signature is deliberately resolved through the current
root's key table.

The parser reuses the bounded JSON limits established by ADR-0015: 64 KiB
UTF-8 input, depth 8, 2,048 UTF-16 code units per string, 64 values per
collection, and 1,024 total values. It rejects duplicate decoded property
names, unsafe numeric forms, malformed Unicode, unknown fields, invalid role
references, impossible thresholds, and an empty or reversed validity interval.
All public results are rebuilt and frozen; decoded keys, signatures, and parser
provenance remain internal.

The root signature input is:

```text
ELRS-EASY-FIRMWARE-ROOT-V1\n
+ RFC 8785({ schemaVersion, canonicalization, payload })
```

The detached `signatures` array is excluded from its own signature input. A
structurally similar caller object cannot enter a verification path because
parser and verification results have internal provenance records.

### Sequential dual-threshold rotation

`verifySyntheticFirmwareRootRotation()` accepts only parser-created current and
incoming roots. The incoming version must be exactly `N + 1`; skipping directly
to a later version and replaying an old/equal version both fail closed.

The incoming root bytes must verify against:

1. the threshold and key set declared by the current root's `root` role; and
2. the threshold and key set declared by the incoming root's `root` role.

One key ID can contribute at most one signature to either threshold. Invalid or
missing signatures do not count. Provider exceptions are sanitized, while
cancellation remains an `AbortError`.

A key ID present in both roots must resolve to identical public-key bytes.
Changing key material under the same identifier is rejected as
`FIRMWARE_ROOT_KEY_ID_REBOUND`; rotation uses a new key ID instead.

A successful result is `ROTATION_VERIFIED_UNTRUSTED`. It proves only the
mathematics and transition invariants between two caller-supplied Synthetic
roots. It does not prove that the current root was admitted out of band.

### Expiry and fixed-time policy

Time evaluation is separate from root rotation. A caller supplies a clock with
the only currently admitted assurance, `SYNTHETIC_ONLY`. The clock is read once
for an evaluation and must return a canonical UTC timestamp. Metadata is usable
only when:

```text
notBefore <= fixed evaluation time < expiresAt
```

Equality with `expiresAt` is expired. Clock accessors, malformed results, and
provider exceptions fail closed. Offline/cache availability cannot bypass
expiry. No Browser system-clock or trusted-time assurance is admitted yet, so
`FRESH_UNTRUSTED` remains software-only evidence.

### Manifest role resolution and revocation

The root's `synthetic` role can resolve a Manifest key only when:

- the parsed Manifest requires exactly this root version;
- the root is fresh under the fixed Synthetic clock;
- the Manifest key ID is present in the role and key table; and
- the role threshold is exactly one, because Manifest envelope v1 carries one
  detached signature.

Mathematical success is `VERIFIED_AGAINST_UNTRUSTED_ROOT` and still carries
`UNVERIFIED_NO_TRUST_ROOT`. It is not connected to the Target Catalog, Firmware
Update workflow, or provider authorization.

Removing a Manifest key from an accepted successor root is the revocation
mechanism. A Manifest signed by that removed key is rejected even if its
Ed25519 signature remains mathematically valid. Raising the Manifest role
threshold above one is rejected until a future multi-signature Manifest wire
version is separately reviewed.

### Monotonic rollback-state codec

Workflow now has a strict, bounded codec for a proposed state record:

```text
schemaVersion: "1"
stateType: "synthetic-firmware-trust-state"
highestRootMetadataVersion: non-negative safe integer
releaseFloors[]:
  channel: "synthetic"
  targetIdentifier
  highestReleaseSequence
  artifactSha256
  acceptedRootMetadataVersion
```

The record is limited to 32 KiB and 128 Target floors. It rejects duplicate
channel/Target entries, unknown fields, impossible root references, unsafe
numbers, and malformed identifiers/digests. Rebuilt floors have deterministic
code-unit ordering and canonical serialization.

Pure transition functions produce a new immutable `ADVANCED_UNPERSISTED`
snapshot only when:

- a parser-created state at root `N` receives an internally verified `N → N+1`
  rotation; or
- a Manifest/root verification uses exactly the state's highest root version
  and has a greater release sequence for its channel/Target.

An older root is `FIRMWARE_ROOT_ROLLBACK`. A Manifest evaluated against a root
newer than stored state is blocked until the root state advances. A lower
release sequence is `FIRMWARE_RELEASE_ROLLBACK`. Reusing the same sequence with
different artifact bytes is `FIRMWARE_RELEASE_SEQUENCE_CONFLICT`; the same
sequence and digest is an unchanged replay rather than an advance.

These functions perform no storage I/O. `UNPERSISTED` is part of every success
status so an in-memory value cannot be reported as durable rollback protection.

### Root ceremony and storage remain review gates

No key, root envelope, certificate, fingerprint, production clock, or initial
root-admission function is included. Before Stable/Beta trust exists, the owner
must separately approve and record:

- the initial root's exact canonical bytes and out-of-band fingerprint;
- offline key custody, signer identities, thresholds, backups, and compromise
  procedure;
- role separation, rotation cadence, expiry duration, and emergency revocation;
- an application release/recovery process for a compromised root threshold;
- a trusted-time policy and supported clock-failure UX; and
- atomic persistence of the admitted root and rollback floors.

The [Storage-key Registry](../security/storage-key-registry.md) contains a
`PROPOSED` IndexedDB bundle name only. No database is opened and no key is read
or written. Storage implementation requires atomic transaction, corruption,
migration, deletion/re-bootstrap, offline, and privacy tests in the same change
that changes the registry status to `ACCEPTED`.

## What this does not prove

- Any current or incoming root belongs to this project, ExpressLRS, GitHub, or
  the owner.
- A private key is protected, available, uncompromised, or controlled by the
  intended signer.
- The Browser or operating-system clock is trustworthy.
- Root metadata or release floors survive reload, eviction, downgrade,
  uninstall, multi-tab races, or storage corruption.
- A Manifest is accepted into a real catalog or authorizes a Firmware writer.
- Artifact source, compression, executable identity, Target compatibility,
  Hardware behavior, or recovery behavior is valid.

No result from this ADR may be described as trusted, persisted, Stable, or
Hardware-tested.

## Alternatives

- Trust any self-signed root delivered with a Manifest: rejected because an
  attacker can replace both.
- Accept only the incoming root's threshold: rejected because compromised new
  repository state could sever continuity from the current root.
- Accept only the current root's threshold: rejected because a rotation could
  install an unusable successor not controlled by its declared new threshold.
- Skip intermediate root versions: rejected because the skipped versions may
  contain revocations or threshold changes required for safe continuity.
- Reuse key IDs after replacing key bytes: rejected because authorization and
  audit evidence would become ambiguous.
- Read `Date.now()` inside each verification step: rejected because one update
  cycle needs one fixed evaluation time and an explicit clock assurance.
- Write rollback floors to `localStorage` immediately: rejected because root
  and floor changes need one reviewed atomic transaction and corruption policy.
- Treat a parsed caller-provided state as durable security evidence: rejected;
  the codec validates shape only and every transition remains `UNPERSISTED`.

## Consequences

- Root wire parsing, dual-threshold rotation, key removal, expiry, Manifest role
  resolution, and monotonic rollback decisions can be tested end to end without
  embedding a key or enabling writes.
- The security-critical distinction between mathematical validity and admitted
  trust remains explicit in types and result names.
- A future owner-approved trust ceremony and Browser/native store can reuse the
  pure parser and transition logic, but must add real assurance values and
  atomic persistence through a separate ADR.
- Compressed-artifact bounds and executable/Target identity remain the next
  Hardware-independent update-safety slice.

## References

- [ADR-0014: Signed-manifest trust design and byte verification](ADR-0014-signed-manifest-trust-and-byte-verification.md)
- [ADR-0015: Bounded Synthetic Manifest verification](ADR-0015-bounded-synthetic-manifest-verification.md)
- [The Update Framework specification](https://theupdateframework.github.io/specification/latest/)
- [Validation Levels](../testing/validation-levels.md)
- [Storage-key Registry](../security/storage-key-registry.md)
