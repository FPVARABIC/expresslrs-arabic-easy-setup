# ADR-0007: Model-Agnostic Device Support

- Status: Accepted
- Date: 2026-08-20

## Context

The owner does not currently have reference TX/RX models and explicitly requires broad, smooth device handling as a core product strength. Hard-coding a few owned models would contradict that goal and create a drifting compatibility implementation.

## Decision

Core device logic is model-agnostic. It consumes normalized `IdentityEvidence`, resolves a target through an injected versioned `TargetCatalog`, and derives capabilities through adapters. Manufacturer/model names are data, never control-flow identifiers.

During M1, synthetic fixtures cover multiple roles, radios, bands, confidence levels and failure modes. Real catalog material is not copied until licensing is cleared. Hardware validation later promotes individual provider/target combinations without changing the Core contract.

## Alternatives

- Support only devices physically owned by the team: rejected because it limits architecture and user value.
- Encode vendor/model conditionals in UI: rejected because it couples business rules to presentation and drifts.
- Guess from MCU/USB identifiers: rejected because those signals rarely prove an exact target.

## Consequences

- New devices normally enter through catalog/evidence/adapter data, not UI rewrites.
- `UNKNOWN` and `AMBIGUOUS` are normal safe outcomes.
- Broad architecture does not imply universal validated support.
- Hardware remains mandatory before a provider/target combination receives `HARDWARE_TESTED` or write authorization.
