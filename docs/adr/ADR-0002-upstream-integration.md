# ADR-0002: Upstream Integration Strategy

- Status: Accepted for Foundation; release mechanics require validation
- Date: 2026-08-20

## Context

The product must remain independent and integration-ready while minimizing its long-term delta from official ExpressLRS.

## Decision

Adopt a hybrid model: immutable upstream pin, auditable ordered patch queue, disposable integration worktree, and self-contained release source bundle. Do not use a permanent Firmware fork as the product repository.

## Alternatives

- Permanent fork as product repository.
- Vendored source tree.
- Build-time fetch only.
- Submodule only without a patch/provenance layer.

## Consequences

- Firmware changes stay identifiable and removable.
- Build tooling must materialize, verify, patch, and record exact inputs.
- Releases must publish source and provenance alongside binaries.
- Patches are retired when upstream incorporates an equivalent or better change.
