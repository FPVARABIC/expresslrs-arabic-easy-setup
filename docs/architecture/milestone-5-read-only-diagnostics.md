# Milestone 5 — Read-only Diagnostics Foundation

## Purpose

Milestone 5 starts with a software-only diagnostic boundary that can summarize reviewed evidence without turning diagnostic output into device authority.

The first M5 slice is intentionally read-only. It does not bind, configure, reboot, flash, update Firmware, alter RF settings, select a physical writer, or claim Hardware validation.

## Implemented boundary

`@elrs-easy/diagnostics` now exposes two independent read-only products:

1. `createReadOnlyDiagnosticReport` — a privacy-safe support report for one read-only discovery attempt.
2. `createReadOnlyHealthAssessment` — a deterministic health assessment across reviewed evidence categories.

The health assessment evaluates exactly six categories:

- device identity confidence;
- catalog compatibility state;
- verified Binding state;
- approved Firmware state;
- read-only configuration availability;
- observed connection stability.

No raw device value is accepted as a finding. The output uses fixed reviewed IDs and recommendation codes only.

## Fail-closed behavior

Runtime input is treated as untrusted.

- only own data properties are read;
- accessor-backed fields are not executed;
- unknown enum values become reviewed `UNKNOWN` states;
- an identity below `CONFIRMED` blocks the assessment;
- explicit unsupported compatibility blocks the assessment;
- unknown or attention states never become a pass;
- all returned structures are immutable.

The overall assessment is one of:

- `READ_ONLY_HEALTHY`;
- `NEEDS_REVIEW`;
- `BLOCKED`.

Even `READ_ONLY_HEALTHY` does **not** grant device authority. Every result carries:

`writeDisposition: BLOCKED_NO_HARDWARE_AUTHORITY`

and every finding carries:

`automaticFixAvailable: false`

## Privacy boundary

The assessment schema cannot include raw values, raw provider field names, device identifiers, credentials, or application persistence. Additional attacker-controlled properties are ignored rather than copied into an exclusion list.

The output declares:

- `rawValuesIncluded: false`;
- `rawFieldNamesIncluded: false`;
- `deviceIdentifiersIncluded: false`;
- `credentialsIncluded: false`;
- `persistedByApplication: false`.

## Validation boundary

Current validation is software-only:

- `validationLevel: BUILD_TESTED`;
- `hardwareValidation: NONE`;
- no real writer is admitted;
- no Hardware, RF, range, reliability, recovery, or safe-update claim is made.

The implementation is covered by adversarial tests for unsupported/unknown states, hostile accessors, attacker-controlled strings, deep immutability, stable registries, and privacy exclusion.

The exact candidate that introduced and hardened this slice is `16f62614f59aa654a096aeb2993ae9eaeb1e8135`. GitHub Actions CI run #68 passed the complete clean-install quality, test, build, license, and high-severity advisory gates with 511/511 Vitest cases across 35 test files.

## Next software-only slice

The next M5 work may compose existing read-only Workflow evidence into this assessment through a Core-owned adapter. That adapter must preserve the same rules:

- no raw-value propagation;
- no guessed Target or compatibility;
- no automatic repair;
- no device write authority;
- no Hardware validation claim before physical evidence exists.

A later physical diagnostics provider remains a separate gate and must not be inferred from this software-only foundation.
