# ADR-0001: Milestone 0 Upstream Baseline

- Status: Accepted for Discovery
- Date: 2026-08-20

## Context

“Latest ExpressLRS” is not reproducible. Discovery also needs awareness of post-release development without confusing it with released behavior.

## Decision

Use ExpressLRS release `4.1.0`, full tag commit `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6`, as the Milestone 0 stable behavior/build baseline. Record development `master` at `73ce820ba51437f73f31686233b607c58e188e7b` separately as an awareness reference only.

## Alternatives

- Follow `master`: rejected because results would move and could describe unreleased behavior.
- Use only the latest release label: rejected because the label can move or be interpreted ambiguously.
- Use an older 3.x release: rejected because it is not the current stable product line at inspection.

## Consequences

- Every finding identifies whether it describes stable or development code.
- New upstream releases require a new baseline, not silent replacement.
- The exact Targets/toolchain inputs of official 4.1.0 artifacts remain a separate provenance question.
