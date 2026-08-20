# ADR-0012: Provenance-bound Synthetic Firmware Update Approval

- Status: Accepted for the Milestone 4 software-only slice
- Date: 2026-08-20
- Supersedes: no prior ADR; narrows the new M4 UI path beyond the legacy M1
  Boolean confirmation contract

## Context

Milestone 1 proved a deterministic Synthetic Firmware Update workflow. Its
original entry point accepted a Boolean confirmation after artifact validation,
device identification, capability inspection, and compatibility checks. That
was sufficient to exercise write, reboot, reconnect, re-identification, and
postcondition verification in memory, but it did not prove that approval
referred to the exact artifact, provenance record, compatibility result, and
verification plan shown to the user.

A safe product flow must fail closed when an artifact descriptor, Target,
provider, catalog revision, provenance field, or live device fact changes
between preview and execution. UI-owned checks are insufficient because Web,
Android, and future hosts must share the same Core authorization boundary.

The owner has explicitly deferred physical testing while software construction
continues. M4 therefore strengthens the authorization and evidence contract
without adding a physical Firmware writer, a real Firmware binary, or any
hardware-write authority.

## Decision

The M4 Firmware Update path uses a Core-owned, provenance-bound preview and
approval with the following rules:

- `FirmwareUpdateProvider` currently admits only the literal execution
  authority `SYNTHETIC_ONLY`;
- preview preparation validates only the deterministic Synthetic artifact
  descriptor, then reads identity and capabilities through an exclusive device
  session;
- preview preparation cannot call `prepareUpdate`, `writeFirmware`, `reboot`,
  `reconnect`, or `verifyFirmware`;
- the immutable preview is labelled `SIMULATION_ONLY` and contains only bounded,
  value-safe fields for the operation, provider, device, confirmed Synthetic
  Target, catalog metadata/digest, artifact descriptor, provenance record,
  compatibility result, declared effects, verification plan, and fixed blocker
  codes;
- an artifact descriptor requires a bounded Target ID and Firmware version plus
  a lowercase 64-hex SHA-256 value;
- a provenance record requires bounded application/Core versions, upstream
  repository and version, a lowercase 40-hex upstream commit SHA, patch-set
  version, Target ID, lowercase 64-hex build-configuration digest, bounded
  toolchain identity, canonical UTC build timestamp, and artifact SHA-256;
- provenance Target and artifact SHA-256 must match the artifact descriptor;
- a preview becomes `READY` only when execution authority is Synthetic, the
  descriptor is connected, artifact integrity is confirmed by the Synthetic
  provider, identity is `CONFIRMED`, the catalog is redistribution-approved,
  the Target exists, live update capability is available with evidence, and
  compatibility is `COMPATIBLE`;
- before confirmation, the preview declares that Firmware will be replaced, the
  device will reboot, and the link will be interrupted;
- the Core-owned verification plan requires the expected device to reconnect,
  device identity to match, Target to match, and the expected Firmware version
  to be observed;
- approval binds the exact preview and operation IDs, provider and device IDs,
  Target, catalog content digest, Synthetic authority, artifact Target/version/
  SHA-256, every provenance field, verification-plan ID, and canonical UTC
  approval timestamp;
- execution reconstructs a fresh live preview from the canonical artifact and
  provenance inputs plus newly read identity/capability facts before calling
  `prepareUpdate` or `writeFirmware`;
- every approval field is compared through a safe own-data-property boundary;
  accessor-backed, missing, malformed, altered, mismatched, or stale values fail
  with `PERMISSION_DENIED` before a Synthetic write starts;
- provider write completion remains evidence only. Success still requires
  reboot, reconnect of the expected device, confirmed identity for the same
  Target, and independent observation of the exact expected Firmware version;
- the M4 Web lab uses only this approval path, Mock/Synthetic providers, and
  deterministic metadata fixtures. It does not import or build a real Firmware
  binary and does not call the network.

The legacy M1 `userConfirmed` Boolean remains temporarily available only for
existing deterministic Synthetic compatibility tests and callers. It is not
exposed by the M4 Web lab. When provenance is supplied, the new approval is
mandatory, and the Boolean path cannot authorize any future real execution
authority.

## Alternatives

- Keep a Boolean confirmation: rejected for the new UI because it is not bound
  to the displayed artifact, provenance, compatibility result, or verification
  plan.
- Validate only in React: rejected because authorization must remain identical
  across every host.
- Trust provenance as an opaque caller object: rejected because malformed,
  accessor-backed, or internally inconsistent metadata could cross the Core
  boundary.
- Bind only the artifact SHA-256: rejected because Target, upstream commit,
  patch set, build configuration, toolchain identity, and verification plan can
  change independently.
- Sign the displayed preview without re-reading live facts: rejected because an
  authentic but stale preview can still authorize an incorrect current device
  state.
- Add a provisional physical Firmware writer now: rejected because no exact
  real artifact/toolchain chain, provider recovery proof, or reference-hardware
  evidence exists.
- Treat the Synthetic provenance fixture as a real build record: rejected. It
  exists only to exercise the schema and authorization contract and explicitly
  identifies that no Firmware build occurred.

## Consequences

- Software construction can prove the complete preview, approval,
  time-of-check/time-of-use defense, state machine, and UX without physical
  hardware.
- Approval is operation-specific and cannot be replayed for another provider,
  device, Target, catalog digest, artifact, provenance record, or verification
  plan.
- Invalid provenance or artifact binding fails before device reads whenever
  possible; failed integrity blocks before identity/capability reads.
- The new flow performs an additional identity/capability read before execution;
  this is intentional defense against live-state drift.
- A blocked preview cannot produce an approval, and a mismatched approval cannot
  reach a prepare/write method.
- This ADR does not claim a real Firmware artifact, physical flash support,
  authenticated hardware identity, recovery safety on hardware, Target support,
  RF behavior, performance improvement, or release readiness.
- Any future physical Firmware writer requires a separate ADR, exact immutable
  build inputs and bytes, provider-specific recovery and verification contracts,
  reference-hardware evidence, and an explicit owner gate.
