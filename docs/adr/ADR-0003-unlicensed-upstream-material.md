# ADR-0003: Unlicensed Upstream Material Boundary

- Status: Accepted safety gate
- Date: 2026-08-20

## Context

At the inspected SHAs, `ExpressLRS/web-flasher` and `ExpressLRS/Targets` contain no observed repository-level license declaration.

## Decision

Study their public behavior and interfaces, but do not copy, vendor, modify, or redistribute their code/data until explicit licensing is established. Independently written adapters may be designed from observed behavior and official protocol/source evidence.

## Alternatives

- Assume the organization-wide GPL statement covers both repositories: rejected as insufficiently explicit for a distribution gate.
- Ignore these repositories: rejected because their behavior is important to Phase 0 architecture.

## Consequences

- Reuse Matrix entries for these repositories remain blocked.
- Target data sourcing needs a license clarification or a lawful runtime/fetch strategy reviewed before release.
- No Product `LICENSE` is selected solely from inference.
