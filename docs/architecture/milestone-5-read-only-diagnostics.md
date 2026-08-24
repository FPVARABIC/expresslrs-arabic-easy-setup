# Milestone 5 — Read-only Diagnostics Foundation

## Purpose

Milestone 5 starts with a software-only diagnostic boundary that can summarize reviewed evidence without turning diagnostic output into device authority.

The current M5 slice is intentionally read-only. It does not bind, configure, reboot, flash, update Firmware, alter RF settings, select a physical writer, or claim Hardware validation.

## Implemented boundary

`@elrs-easy/diagnostics` now exposes three read-only capabilities:

1. `createReadOnlyDiagnosticReport` — a privacy-safe support report for one read-only discovery attempt.
2. `createReadOnlyHealthAssessment` — a deterministic health assessment across reviewed evidence categories.
3. `createReadOnlyHealthAssessmentFromDiagnosticReport` — a Core-owned adapter that composes the safe diagnostic report into the health assessment without consuming raw provider values or report findings.

The health assessment evaluates exactly six categories:

- device identity confidence;
- catalog compatibility state;
- verified Binding state;
- approved Firmware state;
- read-only configuration availability;
- observed connection stability.

No raw device value is accepted as a finding. The output uses fixed reviewed IDs and recommendation codes only.

## Diagnostic composition adapter

The adapter accepts the privacy-safe `READ_ONLY_DEVICE_DIAGNOSTIC` envelope plus independently allowlisted compatibility, Binding and Firmware states.

It revalidates the report envelope before using any evidence. A report must identify schema version `1`, type `READ_ONLY_DEVICE_DIAGNOSTIC`, validation level `BUILD_TESTED`, and Hardware validation `NONE`.

Only reviewed categorical fields are rebuilt:

- operation outcome;
- identity confidence;
- verification result;
- reconnect state;
- allowlisted fact categories.

The adapter ignores the report's findings, provider diagnostics, extra properties, raw response data, identifiers and secret-like values.

A configuration read is considered available only after a consistent successful report with verification and the required identity envelope: `TARGET`, `FIRMWARE_VERSION`, and `DEVICE_ROLE`.

Connection stability is not inferred from a single successful read. `STABLE_OBSERVED` requires a report whose own contract has admitted `CONSISTENT`, which in turn requires an available baseline, at least two attempts and a successful comparison. `REQUIRED` or `CHANGED` maps to reconnect attention; no reconnect evidence maps to `UNKNOWN`.

## Advanced-mode presentation boundary

The Web package now contains a separate presentation model, `createReadOnlyHealthPresentation`, and an isolated `ReadOnlyHealthPanel` component intended for Advanced Mode only.

The presentation model accepts the already-rebuilt Core health assessment, revalidates its fixed envelope and converts it into exactly six rows with translation keys and presentation tones. It deliberately ignores findings and every extra runtime property, so raw device values, provider diagnostics, recommendation payloads and secret-like fields cannot become UI data by accident.

A forged assessment that claims a different write disposition fails closed to a blocked presentation with unknown rows. Accessor-backed hostile input is never executed.

The component itself receives only this fixed presentation model. It renders no automatic-repair button and has no callback capable of issuing a device command. Arabic and English use the existing translation catalog, and the focused Arabic test rejects question-form punctuation.

This presentation component is validated in isolation before it is wired into the existing Advanced workspace. The ordinary Easy Mode remains unchanged with exactly three primary actions.

## Fail-closed behavior

Runtime input is treated as untrusted.

- only own data properties are read;
- accessor-backed fields are not executed;
- unknown enum values become reviewed `UNKNOWN` states;
- an identity below `CONFIRMED` blocks the assessment;
- explicit unsupported compatibility blocks the assessment;
- unknown or attention states never become a pass;
- forged diagnostic or health envelopes fall back to blocked/unknown evidence;
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

The health implementation has 9 focused adversarial tests, the diagnostic composition adapter adds 8 tests, the Advanced presentation model adds 6 tests, and the isolated React panel adds 4 tests.

The current reviewed M5 software checkpoint is `5243d1505962df7882b32453db911431dfc7c24e`. GitHub Actions CI run #84 passed the complete clean-install quality, test, build, license, and high-severity advisory gates with 529/529 Vitest cases across 38 test files. It also verified 272 lockfile entries, 9 workspace dependency boundaries, 113 local links across 64 Markdown files, 248 dependency license records with 0 reviewed exceptions, and no known high-severity vulnerability.

## Next software-only slice

The next M5 work is to wire the already-tested `ReadOnlyHealthPanel` into the existing Advanced workspace without expanding the ordinary three-action Easy UI. That wiring must preserve:

- no raw-value propagation;
- no guessed Target or compatibility;
- no automatic repair;
- no device write authority;
- no Hardware validation claim before physical evidence exists.

A later physical diagnostics provider remains a separate gate and must not be inferred from this software-only foundation.
