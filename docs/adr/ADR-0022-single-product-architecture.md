# ADR-0022: One Product Architecture Around the Real Device Layer

- Status: Accepted architecture decision
- Date: 2026-09-08

## Context

The repository carried two implementations that each behaved as the source of
truth, and the public build silently followed only one of them.

Measured on the candidate, not assumed:

- `apps/web/src/main.tsx` mounts `ExpressLrsParityWorkbench` and nothing else.
  `App.tsx` and the `view-model/` modules are reachable only from their own
  tests.
- Marker strings for `packages/workflows`, `packages/diagnostics` and the Mock
  platform are absent from the built bundle, so `packages/device`,
  `packages/compatibility`, `packages/workflows`, `packages/diagnostics`,
  `packages/platform-mock` and `packages/platform-browser` do not ship.
  `packages/i18n` ships; `packages/domain` is reached only as a type import.
- No file under `packages/*` references `navigator.serial`, a serial port, a USB
  identifier, or CRSF. All real transport — CRSF framing, Web Serial, ESP
  flashing, STM32 DFU, XMODEM, passthrough, reconnect verification — exists only
  under `apps/web/src/hardware/`.

So the abstract layer is roughly 18,900 lines that model devices without ever
touching one, while the layer that talks to hardware is the one users run. Two
state machines and two definitions of success is the underlying defect; which
one ships is the symptom.

## Decision

The real device layer under `apps/web/src/hardware/` is the single product
architecture. Easy Mode and Advanced Mode are two presentations over that one
layer, sharing one device session, one identity result, one compatibility
decision, and one write authority.

`packages/i18n` remains a product dependency. `packages/domain` remains for
shared types and audit scrubbing. `packages/device`, `packages/compatibility`,
`packages/workflows`, `packages/diagnostics`, `packages/platform-mock` and
`packages/platform-browser` are reclassified as non-product research code: they
stay in the repository with their tests, they are not deleted, and they must not
be described as the shipped architecture.

`App.tsx` is not promoted to the public entry point. Its interaction design is
reused, but it is built on Mock scenarios and would present simulated results as
device results.

## Alternatives

- **Rewrite the UI onto `packages/device` / `compatibility` / `workflows`.**
  Rejected. Those packages have no transport, so every real behaviour —
  identity, target matching, post-write verification, recovery journalling —
  would have to be re-implemented behind them and re-proven. That moves the
  highest-risk code (device writes and identity) onto an unexercised path for no
  user-visible gain.
- **Delete the unused packages now.** Rejected for this change. Removing ~18,900
  lines and 528 passing tests is unrelated churn on a candidate that is about to
  go to hardware, and the research value is real. Reclassification removes the
  ambiguity without the risk; removal can follow separately.
- **Keep both and document the split.** Rejected. That is the current state, and
  it is what allowed a status report to describe an Easy Mode and a Core that no
  user has ever run.

## Consequences

- One state machine and one post-write verification govern the product: a flash
  reaches a success message only after a physical reconnect plus Target and
  firmware-version checks, and failures land on a `RECOVERY_REQUIRED`
  checkpoint.
- Easy Mode gains no independent device logic. It calls the same session and
  identity services as the workbench, so the two modes cannot disagree.
- The Mock platform stays out of the product path, and the public bundle keeps
  proving it: `MockScenario` resolves to zero occurrences in the built output.
- Local HTTP discovery in `packages/platform-browser` stays non-product. Two of
  its three origins (`http://elrs_rx.local`, `http://elrs_tx.local`) are
  rejected by Chromium as invalid CSP source expressions, and all three are
  plain HTTP, which an HTTPS deployment blocks as mixed content. Device contact
  in the product is Web Serial only.
- Documentation that describes the packages as the shipped architecture is
  historical and is marked as such.
