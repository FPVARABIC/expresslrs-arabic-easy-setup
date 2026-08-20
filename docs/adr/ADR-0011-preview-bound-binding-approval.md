# ADR-0011: Preview-bound Synthetic Binding Approval

- Status: Accepted for the Milestone 3 software-only slice
- Date: 2026-08-20
- Supersedes: no prior ADR; narrows the new M3 UI path beyond the legacy M1
  Boolean confirmation contract

## Context

Milestone 1 proved a deterministic Synthetic Easy Binding workflow. Its original
entry point accepted a Boolean confirmation after identity and capability
checks. That was sufficient to exercise state transitions, reconnect,
re-identification, and postcondition verification in memory, but it did not
prove that a user's approval referred to the exact preview they had seen.

A safe product flow must prevent a stale or altered preview from authorizing a
sensitive operation. Device, Target, provider, catalog revision, or runtime
capability facts can change between preview and execution. UI-owned checks are
not enough because every future host must receive the same fail-closed Core
behavior.

The owner has explicitly deferred physical tests while software construction
continues. M3 therefore needs a stronger authorization contract without adding
a real Binding provider or any hardware-write authority.

## Decision

The M3 Binding path uses a Core-owned, preview-bound approval with the following
rules:

- `BindingProvider` currently admits only the literal execution authority
  `SYNTHETIC_ONLY`;
- preparing a preview acquires an exclusive device session and performs only
  identity and capability reads;
- the immutable preview is labelled `SIMULATION_ONLY` and contains only bounded,
  value-safe fields: operation, provider, device, transport, confirmed Synthetic
  Target, approved catalog metadata/digest, declared change codes, verification
  requirements, and fixed blocker codes;
- the preview becomes `READY` only when the descriptor is connected, identity is
  `CONFIRMED`, the catalog is redistribution-approved, the Target exists and
  declares guided Binding, runtime guided-Binding capability has evidence, and
  execution authority is Synthetic;
- the approval binds the exact preview ID, operation ID, provider ID, device ID,
  Target ID, catalog content digest, Synthetic authority, and canonical UTC
  approval timestamp;
- execution reconstructs a fresh live preview from newly read identity and
  capability facts before calling `prepareBinding` or `executeBinding`;
- every approval field is compared against that live preview through a safe data
  property boundary; accessor-backed, missing, malformed, mismatched, or stale
  values fail with `PERMISSION_DENIED` before a Binding command starts;
- provider command completion remains evidence only. Success still requires the
  same device to return, the same Target to be re-identified, and independent
  `LINK_ESTABLISHED` verification;
- the new M3 Web lab uses only this approval path and has no network or hardware
  provider.

The legacy M1 `userConfirmed` Boolean remains temporarily available only for
existing deterministic Synthetic compatibility tests and callers. It is not
exposed by the M3 Web lab and cannot be extended to a real execution authority.
It must be removed or replaced before any physical Binding provider can be
admitted.

## Alternatives

- Keep a Boolean confirmation: rejected for the new UI because it is not bound
  to the displayed device, Target, provider, or catalog revision.
- Validate only in React: rejected because Web, Android, and future hosts must
  share the same authorization boundary.
- Sign the preview without re-reading live facts: rejected because an authentic
  but stale preview can still authorize the wrong current state.
- Add a provisional real-device authority now: rejected because no reference
  hardware or provider-specific verification evidence exists.
- Reuse the M2A Local HTTP reader as a Binding provider: rejected because M2A is
  deliberately read-only, uses an empty real Target Catalog, and returns only
  self-reported `UNVALIDATED` facts.

## Consequences

- M3 can build and test the complete approval shape, stale-preview rejection,
  state machine, and UX without touching physical hardware.
- The new flow performs an additional identity/capability read before execution;
  this is intentional defense against time-of-check/time-of-use drift.
- Approval is operation-specific and cannot be replayed for another provider,
  device, Target, or catalog digest.
- A blocked preview cannot produce an approval, and a mismatched approval cannot
  reach a command method.
- This ADR does not claim real Binding support, authenticated hardware identity,
  device compatibility, RF behavior, or performance.
- Any future hardware authority requires a separate ADR, provider-specific
  verification contract, reference-hardware evidence, and explicit owner gate.
