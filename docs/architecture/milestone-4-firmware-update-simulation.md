# Milestone 4 — Provenance-bound Firmware Update Simulation

Status: **Software-only implementation candidate with green official CI; owner
acceptance pending. Physical validation is intentionally deferred.**

## Scope

Milestone 4 strengthens the Firmware Update product contract while preserving
the existing no-hardware-write boundary. It adds:

- a read-only, immutable Firmware Update preview;
- strict rebuilding of the artifact descriptor and provenance record;
- explicit artifact/provenance consistency checks;
- live identity, capability, catalog, integrity, and compatibility gates;
- fixed operation effects and a Core-owned verification plan;
- approval bound to every displayed safety-critical field;
- a fresh Core recheck before deterministic Synthetic write execution;
- an Arabic-first isolated Web lab for preview, approval, and simulation;
- adversarial Core, view-model, and component tests.

It does not add a physical Firmware writer, real Firmware bytes, official Target
artifacts, a toolchain invocation, device reboot on hardware, configuration or
RF mutation, physical recovery evidence, or any support claim.

The M4 fixture is deterministic Synthetic metadata. Its toolchain identity
explicitly records `synthetic-node-24-no-firmware-build`; it is not evidence that
an ExpressLRS Firmware binary was built.

## Software flow

```text
Select deterministic Synthetic artifact/provenance scenario
→ rebuild and validate bounded artifact descriptor
→ rebuild and validate bounded ArtifactProvenance
→ require provenance Target and SHA-256 to bind the artifact
→ require SYNTHETIC_ONLY execution authority
→ validate Synthetic artifact integrity
→ acquire exclusive preview session
→ read identity and capabilities only
→ evaluate approved catalog and compatibility
→ build SIMULATION_ONLY preview
→ display artifact, provenance, effects, blockers, and verification plan
→ explicit approval bound to the displayed preview
→ acquire a fresh execution session
→ revalidate artifact and re-read identity/capabilities
→ rebuild a fresh live preview
→ compare every approval field
→ Synthetic prepare/write/reboot
→ reconnect same device
→ re-identify same Target
→ verify exact expected Firmware version
→ SUCCESS only after verification
```

No write, reboot, reconnect, or post-write verification command is reachable
from the preview preparation function. The execution path invokes
`prepareUpdate` and `writeFirmware` only after the approval matches a fresh live
preview.

## Artifact descriptor and provenance boundary

### Firmware artifact descriptor

The Core rebuilds the descriptor from own data properties only. It requires:

| Field | Requirement |
| --- | --- |
| `targetId` | Non-empty bounded string |
| `firmwareVersion` | Non-empty bounded string |
| `sha256` | Exactly 64 lowercase hexadecimal characters |

### Artifact provenance

The Core rebuilds `ArtifactProvenance` from own data properties only. It
requires:

| Field | Requirement |
| --- | --- |
| `applicationVersion` | Bounded non-empty string |
| `coreVersion` | Bounded non-empty string |
| `upstreamRepository` | Bounded non-empty string |
| `upstreamVersion` | Bounded non-empty string |
| `upstreamCommitSha` | Exactly 40 lowercase hexadecimal characters |
| `patchSetVersion` | Bounded non-empty string |
| `targetId` | Bounded non-empty string; must match the artifact Target |
| `buildConfigurationDigest` | Exactly 64 lowercase hexadecimal characters |
| `toolchainIdentity` | Bounded non-empty string |
| `builtAt` | Canonical UTC timestamp with milliseconds |
| `artifactSha256` | Exactly 64 lowercase hexadecimal characters; must match the artifact SHA-256 |

Getters are not executed. Missing, accessor-backed, malformed, excessive, or
inconsistent values fail closed.

## Preview contract

`FirmwareUpdatePreview` is a frozen value object with schema version 1. Its
security-relevant fields include:

| Field | Purpose |
| --- | --- |
| `previewId` / `operationId` | Prevent cross-operation reuse |
| `validationLevel` | Always `SIMULATION_ONLY` in M4 |
| `executionAuthority` | `SYNTHETIC_ONLY` or fail-closed `NONE` |
| `providerId` / `updateCapabilityId` | Bind the provider and live update path |
| `deviceId` / `transport` | Bind the displayed device context |
| `targetId` / display name | Bind the confirmed Synthetic Target |
| catalog source/revision/schema/digest | Detect catalog drift |
| artifact descriptor | Bind Target, expected Firmware version, and SHA-256 |
| provenance record | Bind source/version/commit/patch/build/toolchain/time/hash metadata |
| compatibility status/reasons | Explain compatibility evidence |
| `changeCodes` | Declare destructive effects before confirmation |
| verification plan | Declare required postconditions before confirmation |
| blocker codes | Explain why confirmation is unavailable |

The preview excludes artifact bytes, Binding Phrase, UID, serial, Wi-Fi
credentials, raw provider payloads, arbitrary provider text, and any claim of
hardware availability.

## Ready gate

A preview is `READY` only when all of these are true:

1. provider execution authority is exactly `SYNTHETIC_ONLY`;
2. the descriptor is connected;
3. artifact and provenance records are structurally valid;
4. provenance Target and artifact SHA-256 match the artifact descriptor;
5. Synthetic provider integrity validation returns true;
6. identity is `CONFIRMED`;
7. the Target Catalog is explicitly redistribution-approved;
8. the selected Target exists in that catalog;
9. the configured update capability is live, available, and evidence-backed;
10. compatibility evaluates to `COMPATIBLE`;
11. a complete verification plan can be constructed.

Otherwise the preview is `BLOCKED`, carries fixed blocker codes, and cannot be
converted into an approval.

## Declared effects and verification plan

Before confirmation the preview declares these effects:

- `FIRMWARE_WILL_BE_REPLACED`;
- `DEVICE_WILL_REBOOT`;
- `LINK_WILL_BE_INTERRUPTED`.

The Core-owned verification plan requires:

- `DEVICE_RECONNECTED` with expected value `true`;
- `DEVICE_IDENTITY_MATCHES` with expected value `true`;
- `TARGET_MATCHES` with the artifact Target ID;
- `FIRMWARE_VERSION_MATCHES` with the artifact Firmware version.

The plan is immutable and its ID is included in the approval.

## Approval and time-of-check/time-of-use defense

`FirmwareUpdateApproval` binds:

- schema version, approved flag, and canonical UTC approval time;
- preview and operation IDs;
- provider, device, Target, catalog digest, and Synthetic authority;
- artifact Target, Firmware version, and SHA-256;
- every rebuilt provenance field;
- verification-plan ID.

The Core does not trust the previously displayed object alone. Immediately
before execution it revalidates the artifact, acquires a fresh exclusive
session, re-reads identity and capabilities, reevaluates compatibility, rebuilds
the live preview, and compares the approval field by field.

A stale provider, device, Target, catalog digest, artifact, provenance field,
authority, or verification plan cannot reach the write stage.

## State and verification semantics

Provider write completion is not operation success. The verified operation
machine still requires:

- explicit write-completion evidence;
- reboot command completion;
- release of the initial session;
- reconnect of the expected device ID;
- a new exclusive session;
- `CONFIRMED` identity for the same Target;
- provider verification result `valid: true` and
  `reason: EXPECTED_FIRMWARE_OBSERVED`;
- observed Target equal to the expected Target;
- observed Firmware version equal to the expected version.

Unknown write outcome ends in `UNKNOWN_STATE`. A completed write followed by
reboot, reconnect, identity, Target, or Firmware verification failure ends in
`RECOVERY_REQUIRED`. No provider completion flag can directly create `SUCCESS`.

## Web composition

The M4 lab is selected with the exact query `?view=firmware-preview`. It remains
separate from the default application, the M2A real read-only panel, and the M3
Binding lab. It uses only:

- `MockDiscoveryProvider`;
- `ScriptedBindingProvider` only to satisfy the Foundation module composition;
- `ScriptedFirmwareUpdateProvider` with `SYNTHETIC_ONLY` authority;
- deterministic Synthetic artifact/provenance metadata;
- the approved Synthetic Target Catalog;
- an in-memory exclusive session manager and deterministic clock.

The lab:

- starts Arabic/RTL with English/LTR fallback;
- prepares the preview automatically without `fetch` or another network API;
- offers compatible, major-version-mismatch, and provenance-mismatch scenarios;
- shows Target, version, artifact SHA-256, catalog digest, provider, authority,
  compatibility, upstream repository/version/commit, patch set, build digest,
  toolchain identity, build timestamp, effects, and verification plan;
- removes the confirmation action for blocked scenarios;
- creates an approval only after explicit user action;
- displays only deterministic Core outcome and bounded audit count;
- rejects a displayed artifact alteration when the fresh Core preview no longer
  matches the approval.

## Package boundaries

```text
apps/web/FirmwarePreviewLab
  → apps/web/view-model/firmwarePreviewLab
  → @elrs-easy/workflows
  → @elrs-easy/device + @elrs-easy/compatibility + @elrs-easy/domain
  → @elrs-easy/platform-mock
```

Core packages remain independent of React, DOM, browser networking, and
localized strings.

## Deferred physical gate

Physical tests are not required to continue the current software-only work.
They remain mandatory before introducing a real Firmware execution authority.
That future gate must define and prove, for exact immutable artifact bytes,
provider, Target, Firmware, browser/host, and reference device:

- complete reproducible source, patch, configuration, toolchain, and artifact
  provenance;
- cryptographic hash verification of the actual bytes;
- authenticated or independently corroborated device/Target identity;
- exact write, reboot, reconnect, cancellation, power-loss, rollback, and
  recovery behavior;
- same-device and same-Target semantics;
- independent observation of the expected Firmware version;
- privacy and audit behavior;
- supported Target/Firmware/provider matrix.

Until that gate is explicitly opened, `SYNTHETIC_ONLY` is the sole Firmware
Update execution authority and every physical write path remains disabled.
