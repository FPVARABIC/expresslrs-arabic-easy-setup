# ADR-0005: Operation Success Semantics

- Status: Accepted safety gate
- Date: 2026-08-20

## Context

Official inspected flash/bind paths can report command, process, transfer, or write completion without proving that the expected device returned in the expected state. The Master Plan prohibits unverifiable success.

## Decision

Provider completion is evidence only. A sensitive workflow reaches `SUCCESS` solely after an explicit `VERIFYING` stage confirms the operation-specific postcondition. Flash providers return `WRITE_COMPLETED`; Binding providers return execution/configuration evidence. If the required evidence cannot be obtained, the result remains limited, `UNKNOWN_STATE`, or `RECOVERY_REQUIRED`.

## Alternatives

- Treat provider/process exit as success: rejected because it can hide wrong device, failed reboot, mismatch, or disconnected state.
- Let each UI decide: rejected because semantics would diverge across Web/Android/Super-App.
- Ask the user to confirm every result: retained only as clearly labelled guided evidence where no machine surface exists.

## Consequences

- `VerificationProvider`/plan is separate from write/command providers.
- Workflows include reboot/reconnect/verify states.
- Easy Mode never offers wrong-target force paths.
- Tests enforce that no transition reaches `SUCCESS` without verified postconditions.
