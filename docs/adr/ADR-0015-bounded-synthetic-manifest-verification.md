# ADR-0015: Bounded Synthetic Manifest Verification

- Status: Accepted for software-only Synthetic evidence
- Date: 2026-08-21
- Hardware validation: None
- Trusted signing root: None admitted
- Real Firmware writer: Prohibited by the current provider contract

## Context

[ADR-0014](ADR-0014-signed-manifest-trust-and-byte-verification.md)
fixed the version-1 envelope, RFC 8785 canonicalization, Ed25519 algorithm,
domain separator, and future trust policy. It did not implement a JSON parser,
signature-input builder, or signature primitive. Passing an ordinary
TypeScript object to a verifier would not satisfy the required duplicate-key,
resource-limit, I-JSON, or field-allowlist checks.

This slice must prove those mechanics without creating a development trust
root, accepting a Stable artifact, enabling compression, or authorizing a
Firmware writer.

## Decision

### Bounded wire parser

The Workflow package implements a dedicated JSON parser with these limits:

| Limit | Current value |
| --- | ---: |
| UTF-8 input | 64 KiB |
| Nesting depth | 8 |
| One decoded string | 2,048 UTF-16 code units |
| One array | 64 elements |
| One object | 64 members |
| Total parsed values | 1,024 |

The parser rejects duplicate decoded property names at every depth, including
escape-equivalent names. It accepts only safe integers, rejects fractions,
exponents, negative zero, lone surrogates, invalid escapes, trailing input, and
non-JSON whitespace. Objects are initially created with a null prototype.

After parsing, Workflow requires exact member sets for the envelope, signature,
payload, patch, platform, build-option, and notice-bundle objects. It rebuilds
and freezes a fixed `FirmwareManifestPayloadV1` covering the complete required
provenance list plus publication, release-sequence, byte-form, media,
compression, role, and root-version claims.

The current allowlist is intentionally narrower than the future v1 wire design:

- `channel` and `signingRole` must both be `synthetic`;
- `keyId` must use the `synthetic:` namespace;
- media type must be `application/octet-stream`;
- compression must be `none` and byte form must be `RAW_TO_WRITE`;
- artifact size must be non-zero and at most 64 MiB;
- build-option names must use the `synthetic.` namespace;
- the Ed25519 signature must be exactly 64 bytes in canonical unpadded
  base64url.

Stable, Beta, Development, Recovery, compressed, unknown-field, and oversized
claims fail before cryptographic work.

### Canonical signature input

Only values produced by the bounded parser enter canonicalization. The builder
implements the admitted safe-integer subset of RFC 8785: strings use ECMAScript
JSON serialization after Unicode-scalar validation, object properties are
sorted recursively by UTF-16 code units, array order is retained, and no
whitespace is emitted.

The exact output is UTF-8:

```text
ELRS-EASY-FIRMWARE-MANIFEST-V1\n
+ RFC 8785({ schemaVersion, canonicalization, payload })
```

The detached `signature` member is excluded. The parser result returns only a
fresh copy of these bytes, and Workflow retains an internal unforgeable record
of results it created so a structurally similar caller object cannot enter the
verification function.

### Synthetic Ed25519 verification

The Browser Platform adds a Web Crypto Ed25519 adapter. Workflow accepts only
an exact 32-byte public key labeled `SYNTHETIC_ONLY`, requires its `keyId` to
match the parsed envelope, copies all byte inputs, and invokes an
assurance-labeled signature provider without executing accessor properties.

A mathematically valid signature returns:

```text
status: VALID_UNTRUSTED
keyAssurance: SYNTHETIC_ONLY
trustStatus: UNVERIFIED_NO_TRUST_ROOT
```

This result is not connected to the Firmware catalog or update workflow and
cannot satisfy the provider contract. Provider exceptions are sanitized;
cancellation remains cancellation.

## What this does not prove

- The key belongs to this project, ExpressLRS, a release service, or an owner.
- A key is current, protected, non-revoked, authorized for a role/channel, or
  part of threshold root metadata.
- Release-sequence and root-version claims are persisted or rollback-checked.
- The artifact bytes match the parsed manifest; the existing separate byte gate
  remains the only implemented digest comparison.
- A compressed artifact can be decompressed safely or contains the claimed
  Target.
- Any Firmware was built, downloaded, written, booted, or tested on Hardware.

No valid Synthetic signature may be described as a trusted manifest.

## Alternatives

- Use `JSON.parse()` plus a reviver: rejected because duplicate keys have
  already been collapsed before the reviver runs.
- Canonicalize arbitrary caller objects: rejected because getters, prototypes,
  unsupported values, and unbounded graphs would enlarge the trust boundary.
- Embed the generated test public key: rejected because it would become an
  accidental development root.
- Admit Stable manifests while returning an untrusted label: rejected because
  accepting Stable wire claims before root metadata creates a misleading and
  difficult-to-remove compatibility surface.
- Add a third-party canonicalization or Ed25519 dependency: rejected because
  the admitted JCS subset is small and Web Crypto already supplies the
  primitive; no dependency-graph change is required.

## Consequences

- Synthetic fixtures can prove deterministic parsing, canonicalization, and
  signature verification end to end.
- Adversarial tests cover duplicate keys, field injection, unsafe numbers,
  malformed Unicode/base64url, resource exhaustion, post-signature tampering,
  forged parser results, key mismatch, and accessor-backed inputs.
- Root ceremony, versioned threshold metadata, revocation/expiry, persistent
  rollback state, artifact acquisition, decompression/Target parsing, and every
  real writer remain separate reviewed steps.

## References

- [ADR-0014: Signed-manifest Trust Design and Byte Verification Boundary](ADR-0014-signed-manifest-trust-and-byte-verification.md)
- [Security Reconnaissance](../research/security-reconnaissance.md)
- [Validation Levels](../testing/validation-levels.md)
- [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html)
