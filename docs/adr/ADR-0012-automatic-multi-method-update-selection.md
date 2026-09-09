# ADR-0012: Automatic Multi-method Firmware Update Selection

- Status: Accepted for Core and Synthetic providers only
- Date: 2026-08-21
- Hardware validation: None

## Context

ExpressLRS targets do not share one flashing path. The inspected official
sources and metadata include Wi-Fi OTA, direct UART, Betaflight passthrough,
EdgeTX passthrough, XMODEM, STLink, DFU, and prepared artifacts used through an
external tool. Browser, Android, and future desktop/native hosts will also
provide different implementations of those mechanisms.

The first real-device spike happens to read over device Wi-Fi, but that cannot
make Wi-Fi the product's update architecture. Easy Mode must remain three
direct actions and must not ask an ordinary user to understand bootloaders,
passthrough, or upload protocols. At the same time, Core may not choose a
provider from array order or continue through an ambiguous provider mapping.

## Decision

Core defines these canonical update methods independently of platform provider
names:

```text
WIFI_OTA
UART
BETAFLIGHT_PASSTHROUGH
EDGETX_PASSTHROUGH
XMODEM
STLINK
DFU
EXTERNAL_TOOL
```

Each Target Catalog entry contains an ordered `updateMethods` preference.
Each platform provider separately declares one canonical `updateMethod`, its
own provider ID, and the runtime capability required before it may write.

The Firmware Update Workflow:

1. snapshots the complete provider registry before the first observer runs;
2. checks the artifact Target against the injected catalog;
3. walks the Target's ordered methods, independent of provider array order;
4. selects exactly one registered provider for the first available method;
5. blocks on missing, malformed, duplicate, or ambiguous provider metadata;
6. re-identifies the device and requires the selected runtime capability;
7. runs the existing artifact, compatibility, confirmation, write, reconnect,
   and post-write verification gates.

Easy Mode receives the automatic result and does not expose a method selector.
Advanced diagnostics may later display the selected method without granting a
manual override. A provider completing a write remains only `WRITE_COMPLETED`;
`SUCCESS` still requires the expected Target and Firmware after reconnect.

This decision adds no real flashing provider. Current execution remains
Synthetic, and the Browser Local HTTP adapter remains read-only.

## Alternatives

- Build around Wi-Fi first and add exceptions later: rejected because it would
  couple Workflow and UI behavior to one transport.
- Let the user choose a flashing method in Easy Mode: rejected because the
  Target and platform should decide, and a novice choice can be unsafe.
- Select the first provider registered by the host: rejected because container
  order is not reviewed compatibility policy.
- Pick arbitrarily when two providers claim the same preferred method:
  rejected; ambiguous composition fails closed.
- Automatically try another provider after writing starts: rejected because a
  second write cannot safely follow an unknown first-write outcome.

## Consequences

- Browser, Android, and future desktop providers can be added without changing
  the three-action UI or the Firmware state machine.
- Target data, not React branches, controls method preference.
- A platform must compose at most one active provider for a method or add an
  explicit future policy that resolves the ambiguity before execution.
- Every real method still requires licensing, artifact provenance, permissions,
  recovery behavior, and reference-hardware validation before activation.
- The current Synthetic matrix proves Wi-Fi preference and UART fallback only;
  it is not evidence that either real path works on Hardware.

## References

- [Flashing and Update Trace](../research/flashing.md)
- [ExpressLRS Architecture Trace](../research/expresslrs-architecture.md)
- [ADR-0005: Operation success semantics](ADR-0005-operation-success-semantics.md)
- [ADR-0006: Target Catalog boundary](ADR-0006-target-catalog-boundary.md)
