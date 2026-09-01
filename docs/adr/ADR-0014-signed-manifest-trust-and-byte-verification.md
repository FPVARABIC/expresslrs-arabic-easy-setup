# ADR-0014: Signed-manifest Trust Design and Byte Verification Boundary

- Status: Accepted for wire design, Core byte gate, and Browser crypto adapter
- Date: 2026-08-21
- Hardware validation: None
- Trusted signing root: None admitted
- Real Firmware writer: Prohibited by the current provider contract

## Context

ADR-0013 made Synthetic artifact metadata immutable and internally coherent,
but it deliberately stopped at `COHERENCE_ONLY`. The SHA-256 value was still a
string repeated across two metadata fields; Core neither received nor hashed
the Firmware bytes. There was also no precise signed-manifest format, trust
root, rotation/revocation policy, or rollback rule.

Shape validation, byte integrity, artifact authenticity, compatibility, write
completion, and post-write verification are distinct claims. They must remain
separate in code and operation evidence.

## Decision

### Signed-manifest wire design

Version 1 uses an envelope with these fixed top-level members:

```text
schemaVersion: "1"
canonicalization: "RFC8785"
payload: FirmwareManifestPayloadV1
signature:
  algorithm: "Ed25519"
  keyId: canonical signing-key identifier
  signatureBase64Url: unpadded base64url signature
```

The signature input is the UTF-8 sequence
`ELRS-EASY-FIRMWARE-MANIFEST-V1\n` followed by RFC 8785 canonical JSON of the
object containing `schemaVersion`, `canonicalization`, and `payload`. The
detached `signature` member is not included in its own signature input.

The v1 payload must cover every field in the
[Security Reconnaissance provenance list](../research/security-reconnaissance.md),
plus:

- a monotonically increasing release sequence scoped to channel and Target;
- publication time and minimum supported application/Core versions;
- artifact media type, compression form, and exact bytes-to-write identity;
- signing role and channel;
- root-metadata version required to evaluate the signature.

An implementation must parse JSON with duplicate-key rejection, bounded depth,
bounded strings/arrays, safe integers only, and an exact field allowlist before
canonicalization. A TypeScript object matching the envelope interface is not
evidence that these checks or signature verification occurred.

### Trust root, rotation, revocation, and rollback

No key is embedded or trusted in this milestone. Every current operation
therefore carries `UNVERIFIED_NO_TRUST_ROOT`, even when metadata and bytes
match.

A future Stable channel may admit keys only through separately versioned root
metadata. Root metadata must define key IDs, roles, channel scope, validity,
thresholds, and expiry. Root rotation requires authorization by the current
root threshold and the incoming root threshold. Removing or revoking a key is
a root-metadata action; a manifest signed only by a revoked, expired, unknown,
or wrong-role key is rejected.

The application must persist the highest accepted root version and release
sequence per channel/Target. Older root metadata or manifests are rollback,
not updates. Cache/offline availability must never weaken expiry, revocation,
or rollback decisions. Recovery images require an explicit root-authorized
recovery role and cannot be inferred from an ordinary older Stable manifest.

Trust-root admission, storage records, clock policy, and recovery UX require a
later ADR and reviewed key ceremony. They are not silently supplied by this
design.

### Implemented byte-verification boundary

Core now requires exact bytes for every Firmware Update attempt. It:

1. accepts only an exact non-empty `Uint8Array`;
2. copies it before the operation machine publishes `IDLE`;
3. enforces a conservative 64 MiB in-memory ceiling;
4. requires byte length to equal provenance `artifactSizeBytes`;
5. requests SHA-256 from an injected digest provider;
6. accepts only a canonical lowercase 64-hex digest equal to both descriptor
   and provenance;
7. gives validation, preparation, and writing fresh copies of the already
   verified bytes, so one provider stage cannot mutate the next stage's input.

The Browser adapter reads immutable `Blob`/`File` data without retaining a file
name or path and computes SHA-256 through Web Crypto. Its assurance is
`CRYPTOGRAPHIC`. The Mock adapter recognizes only its complete deterministic
fixture and is labeled `SYNTHETIC_ONLY`; it is not cryptographic evidence.

Digest-provider metadata, digest failures, and byte mismatches fail before any
update-provider call. Cancellation remains cancellation rather than being
converted into an integrity error.

### Real-writer gate

The only admitted `FirmwareUpdateProvider` assurance is `SYNTHETIC_ONLY`.
Provider selection rejects any unknown or real-write assurance before invoking
the provider. Admitting a real writer requires a new reviewed assurance value,
trusted-manifest verification, exact Target/provider rules, recovery semantics,
and reference-Hardware evidence.

## What this does not prove

- The current Synthetic manifest metadata came from ExpressLRS or an official
  build service.
- Any signing key is trusted, protected, current, or non-revoked.
- A compressed artifact's decompressed Target or executable payload is valid.
- The selected Firmware works on Hardware.
- A provider wrote, booted, or verified a real device.

`COHERENCE_ONLY`, byte-verification assurance, manifest trust, provider
assurance, and post-write Verification Plan remain separate result fields.

## Alternatives

- Let the provider download or reopen the artifact after Core hashes it:
  rejected because the bytes checked and the bytes written could differ.
- Treat SHA-256 equality as authenticity: rejected because an attacker able to
  replace both artifact and metadata can produce a matching digest.
- Embed an unreviewed development public key now: rejected because that would
  create a de facto trust root without ceremony, rotation, or revocation.
- Use ordinary `JSON.stringify()` as the signature format: rejected because
  property ordering and serialization differences make signed bytes ambiguous.
- Admit a real provider behind a disabled UI button: rejected because hidden UI
  is not a Core authorization boundary.

## Consequences

- Synthetic updates now exercise actual byte flow and cannot start provider
  work when size or digest disagree.
- Browser Web Crypto is ready as a platform adapter without enabling a File
  chooser or real update path in Easy Mode.
- Firmware bytes are memory-bounded and never added to Audit or support output.
- The signed-manifest format can be implemented without changing its algorithm
  or canonicalization decision, but trust remains deliberately unavailable.
- A real catalog, trust root, compressed-artifact parser, writer, and Hardware
  validation remain blocked.

## References

- [ADR-0013: Synthetic artifact provenance and Core-owned Verification Plan](ADR-0013-synthetic-artifact-provenance-and-verification-plan.md)
- [Security Reconnaissance](../research/security-reconnaissance.md)
- [Build and Configuration Trace](../research/build-and-configuration.md)
- [Flashing and Update Trace](../research/flashing.md)
- [Storage-key Registry](../security/storage-key-registry.md)
