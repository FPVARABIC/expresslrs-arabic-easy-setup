# Milestone 3 — Preview-bound Easy Binding Simulation

Status: **Software-only implementation candidate with green official CI; owner
acceptance pending. Hardware validation is intentionally deferred.**

## Scope

Milestone 3 strengthens the Easy Binding product contract while preserving the
existing no-hardware-write boundary. It adds:

- a read-only, immutable Binding preview;
- fixed blocker, change, and verification codes;
- approval bound to the exact displayed operation and safety facts;
- a fresh Core recheck before Synthetic execution;
- an Arabic-first isolated Web lab for preview, approval, and deterministic
  simulation;
- adversarial Core, view-model, and component tests.

It does not add a real Binding provider, write endpoint, Firmware change,
reboot, configuration mutation, RF operation, target-support claim, or physical
validation result.

## Software flow

```text
Select Synthetic fixture
→ acquire exclusive preview session
→ read identity and capabilities only
→ Core rebuilds immutable live facts
→ build SIMULATION_ONLY preview
→ display Target/effect/verification/catalog digest
→ explicit user approval bound to the preview
→ acquire a fresh execution session
→ re-read identity and capabilities
→ rebuild a fresh live preview
→ compare every approval field
→ Synthetic prepare/execute
→ reconnect same device
→ re-identify same Target
→ verify LINK_ESTABLISHED
→ SUCCESS only after verification
```

No Binding command is reachable from the preview preparation function. The
execution path invokes `prepareBinding` and `executeBinding` only after the
approval matches the fresh live preview.

## Preview contract

`EasyBindingPreview` is a frozen value object with schema version 1. Its
security-relevant fields include:

| Field | Purpose |
| --- | --- |
| `previewId` / `operationId` | Prevent cross-operation reuse |
| `validationLevel` | Always `SIMULATION_ONLY` in M3 |
| `executionAuthority` | `SYNTHETIC_ONLY` or fail-closed `NONE` |
| `providerId` / `deviceId` / `transport` | Bind the displayed execution context |
| `targetId` / display name | Bind the confirmed Synthetic Target |
| catalog source/revision/schema/digest | Detect catalog drift |
| `changeCodes` | Declare the effect before confirmation |
| verification requirements | Declare required postconditions |
| blocker codes | Explain why confirmation is unavailable |

The preview excludes Binding Phrase, UID, serial, Wi-Fi credentials, raw
provider data, arbitrary error text, and any claim of hardware availability.

### Ready gate

A preview is `READY` only when all of these are true:

1. the descriptor is connected;
2. identity is `CONFIRMED`;
3. the Target Catalog is explicitly redistribution-approved;
4. the selected Target exists in that catalog;
5. the Target declares `guided-bind`;
6. the live device capability reports `guided-bind` as available with evidence;
7. the provider authority is exactly `SYNTHETIC_ONLY`.

Otherwise the preview is `BLOCKED`, carries fixed blocker codes, and cannot be
converted into an approval.

## Approval and time-of-check/time-of-use defense

`EasyBindingApproval` binds:

- schema version and approved flag;
- canonical UTC approval time;
- preview and operation IDs;
- provider and device IDs;
- Target ID;
- catalog content digest;
- Synthetic execution authority.

The Core does not trust the previously displayed object alone. Immediately
before execution it reconstructs a new preview from current identity and
capability reads and compares the approval field by field. Property getters are
not executed; accessor-backed or malformed objects are treated as absent and
fail closed.

A stale device, Target, catalog digest, provider, operation, or authority cannot
reach the command stage.

## State and verification semantics

Provider command completion is not operation success. The existing verified
operation machine still requires:

- command completion evidence;
- release of the initial session;
- reconnect of the expected device ID;
- a new exclusive session;
- `CONFIRMED` identity for the same Target;
- provider verification result `linked: true` and
  `reason: LINK_ESTABLISHED`.

Unknown command outcome ends in `UNKNOWN_STATE`. A completed command followed by
loss/reconnect failure ends in `RECOVERY_REQUIRED`. Link verification failure is
a verified failure, never `SUCCESS`.

## Web composition

The M3 lab is selected with the exact query `?view=binding-preview`. It is kept
separate from the M2A real read-only panel and uses only:

- `MockDiscoveryProvider`;
- `ScriptedBindingProvider` with `SYNTHETIC_ONLY` authority;
- `ScriptedFirmwareUpdateProvider` only to satisfy the existing Foundation
  module composition; the lab never calls update;
- the approved Synthetic Target Catalog;
- an in-memory exclusive session manager and deterministic clock.

The lab:

- starts Arabic/RTL with English/LTR fallback;
- prepares the preview automatically without `fetch` or any network call;
- shows validation level, readiness, Target, provider, operation, authority,
  effect code, verification requirements, and catalog digest;
- removes the confirmation action for blocked scenarios;
- creates an approval only after explicit user action;
- displays only the deterministic Core outcome and bounded audit count.

The normal application remains the default route. No real-device state is
copied into the M3 lab.

## Package boundaries

```text
apps/web/BindingPreviewLab
  → apps/web/view-model/bindingPreviewLab
  → @elrs-easy/workflows
  → @elrs-easy/device + @elrs-easy/compatibility + @elrs-easy/domain
  → @elrs-easy/platform-mock
```

Core packages remain independent of React, DOM, browser networking, and
localized strings.

## Deferred physical gate

Physical tests are not required to continue the current software-only work.
They remain mandatory before introducing a real Binding authority. That future
gate must define and prove, per provider and reference device:

- authenticated or independently corroborated device/Target identity;
- exact Binding command and rollback/recovery behavior;
- same-device reconnect semantics;
- independent link establishment verification;
- cancellation and power-loss outcomes;
- privacy and audit behavior;
- supported Firmware/Target matrix.

Until that gate is explicitly opened, `SYNTHETIC_ONLY` is the only Binding
execution authority and all hardware-write paths remain disabled.
