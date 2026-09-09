# ADR-0013: Synthetic Artifact Provenance and Core-owned Verification Plan

- Status: Accepted for Core and Synthetic execution only
- Date: 2026-08-21
- Hardware validation: None
- Signed-manifest validation: Not implemented

## Context

The Firmware Update Workflow previously accepted only a Target, version, and
SHA-256 descriptor. `ArtifactProvenance` and `VerificationPlan` existed as
standalone Domain interfaces but no execution path required or populated them.
That left two Hardware-independent gaps:

1. caller mutation or incoherent metadata could separate the artifact digest
   and Target from the claimed build provenance;
2. post-write checks were expressed as local conditions rather than one
   inspectable set of required postconditions.

This repository still has no Firmware bytes, signed manifest verifier, build
service, or real write provider. The next step therefore must improve Core
contracts without implying artifact authenticity or Hardware safety.

## Decision

Compatibility may continue to evaluate the minimal
`FirmwareArtifactDescriptor`. Any Firmware execution Workflow must instead
receive a `FirmwareUpdateArtifact`, which adds a versioned provenance envelope.

Before the first operation observer runs, Core reads only fixed own data
properties and rebuilds a new immutable artifact snapshot. Accessors and
unknown keys are not executed or enumerated. Version 1 validates:

- bounded canonical descriptor and provenance strings;
- canonical lowercase artifact SHA-256 and full Git SHA forms;
- an HTTPS repository URL without credentials, query, or fragment;
- canonical UTC build time and a positive integer artifact size;
- a canonical build-configuration digest;
- exact Target and artifact-digest agreement between descriptor and
  provenance.

This is explicitly labeled `COHERENCE_ONLY`. It does not hash Firmware bytes,
verify a signature, prove a repository revision, or authorize a real write.
The current fixture deliberately identifies itself as Synthetic metadata and
does not contain an actual binary.

Core also constructs the fixed `firmware-update-post-write-v1` plan for every
attempt. Its four required facts are:

```text
DEVICE_RECONNECTED
DEVICE_IDENTITY_MATCHES
TARGET_MATCHES
FIRMWARE_VERSION_MATCHES
```

The expected device is the snapshotted session-local descriptor ID. Expected
Target and Firmware version come from the snapshotted artifact. Observations
use strict primitive equality; missing, mismatched, duplicate, or malformed
requirements cannot produce `SUCCESS`. Provider verification must still return
the exact reviewed result shape, and provider write completion remains only
`WRITE_COMPLETED`.

The successful operation result contains the immutable provenance snapshot,
the `COHERENCE_ONLY` label, and the exact Verification Plan used for the
decision.

## Alternatives

- Keep both Domain interfaces documentary until real Hardware work: rejected
  because mutation and postcondition-policy gaps can be closed safely in Mock.
- Let each provider create or weaken its Verification Plan: rejected because a
  provider cannot define the product's success semantics.
- Treat a well-formed provenance object as trusted source evidence: rejected;
  shape and coherence are not authenticity.
- Implement a signature scheme immediately: deferred until the signed-manifest
  design names the trust root, revocation/update policy, byte hashing, build
  inputs, corresponding source, and recovery behavior.
- Infer missing postconditions from provider completion: rejected because an
  accepted write does not prove the running device or Firmware.

## Consequences

- Synthetic update tests now exercise the same immutable provenance and
  declarative postcondition boundaries that future providers must satisfy.
- Artifact/provenance disagreement blocks before any provider call.
- Observer mutation of nested provenance cannot alter the validated write
  input or result.
- Audit/support code may use reviewed provenance fields later, but must keep its
  existing privacy allowlist.
- A real artifact catalog remains blocked until byte-level validation and a
  signed-manifest trust design exist.
- A real update provider remains blocked until provider-specific recovery and
  reference-Hardware verification exist.

## References

- [Security Reconnaissance](../research/security-reconnaissance.md)
- [Build and Configuration Trace](../research/build-and-configuration.md)
- [Flashing and Update Trace](../research/flashing.md)
- [ADR-0005: Operation success semantics](ADR-0005-operation-success-semantics.md)
- [ADR-0012: Automatic multi-method selection](ADR-0012-automatic-multi-method-update-selection.md)
