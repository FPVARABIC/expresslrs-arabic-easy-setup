# ADR-0006: Target Catalog Boundary

- Status: Accepted architecture — real upstream data remains license-blocked
- Date: 2026-08-20

## Context

ExpressLRS Targets is the canonical hardware catalog used by official tools, while a parallel hand-maintained database would drift. The inspected Targets repository has no explicit repository-level license.

## Decision

Define a versioned `TargetCatalog`/`TargetResolver` boundary and consume an immutable upstream snapshot only after licensing is clarified. Record source, full SHA, schema/snapshot hash and validation results. Store our product support/validation status separately from upstream target facts.

During Foundation, use synthetic fixtures; do not copy the real catalog.

## Alternatives

- Maintain our own full target list: rejected because it duplicates and drifts.
- Fetch floating `master`: rejected for integrity, reproducibility and compatibility.
- Infer target from MCU/USB alone: rejected as unsafe.

## Consequences

- UI never evaluates target compatibility.
- License resolution is a data-materialization gate.
- Runtime evidence and catalog resolution remain separate structured concepts.
- Sensitive writes fail closed on unknown, ambiguous or conflicting identity.
