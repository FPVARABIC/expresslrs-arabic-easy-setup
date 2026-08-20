# Core API Boundary — Foundation + M2A Read-only Candidate

Status: **Implemented as a provisional contract**. It is not yet a stable
external API. M2A adds one unvalidated, read-only Browser provider; no real
Binding, update, or Firmware-write provider exists.

## Dependency direction

```text
Web host
  → FoundationExpressLrsModule (Synthetic Binding/Update lab)
  → ReadOnlyExpressLrsModule (real M2A read only)
    → Workflows
      → Device / Compatibility / Domain
        ← injected provider contracts
          ← Synthetic providers
          ← Browser Local HTTP provider (`GET /config` only)
```

The Core packages compile with the `ES2023` library and no DOM library. They do
not import React, navigation, dialogs, or Arabic strings. A minimal structural
`CancellationSignal` accepts a native Browser/Node `AbortSignal` without making
the Core contract depend on DOM declarations. `scripts/check-dependency-boundaries.mjs`
also enforces the reviewed workspace graph, declarations, public exports,
`workspace:` protocol, cycles, UI imports, and browser/DOM runtime APIs in CI.

## Provisional host facade

`FoundationExpressLrsModule` exposes three calls:

```text
discover({ operationId, signal?, onProgress? })
bind({ operationId, descriptor, userConfirmed, signal?, onProgress? })
update({ operationId, descriptor, artifact, userConfirmed, signal?, onProgress? })
```

The constructor receives:

- a shared `DeviceSessionManager`;
- an injected, versioned `TargetCatalog`;
- Discovery, Binding, and Firmware Update providers;
- an optional deterministic clock.

`onProgress` receives an immutable `OperationRecord` for `IDLE` and every real
state transition through the terminal result. Observer failures are isolated
and cannot change the physical operation outcome. Operation IDs are single-use
within a module instance so host progress/audit streams cannot collide.

Each invocation captures caller-controlled references and primitive intent
before the initial `IDLE` observer runs. Device descriptors and Firmware
artifact metadata are copied and frozen, so a caller cannot change the device,
artifact, or confirmation after validation begins. Workflow cancellation is
also checked centrally before and after Provider awaits; a Provider ignoring
the signal cannot promote a stale result to `SUCCESS`.

This proves that Web, Android, or a future host can invoke the same logic
without making the UI the owner of safety decisions. Contract versioning and a
production `ExpressLrsAdapter` remain later gates.

M2A also exposes `ReadOnlyExpressLrsModule.discover()`. That facade accepts only
a `DiscoveryProvider`, session manager, Target Catalog, and evidence policy. It
has no `bind()`, `update()`, generic command, or endpoint-selection method. The
Web candidate composes it with an empty Target Catalog, so a device-reported
Target stays `UNKNOWN` and cannot unlock a sensitive workflow.

## Returned operation contract

Every call returns `OperationRecord<TResult>` with:

- stable operation ID/type/state;
- structured progress and error code;
- result only when available;
- `verificationPassed`;
- ordered state history;
- privacy-scrubbed, sequenced `AuditEvent` records.

`SUCCESS` is not accepted through the general transition method. The only
success path is `VERIFYING → verificationSucceeded(result)`. In M2A read-only
Discovery, `verificationPassed` means the bounded response was parsed and the
allowlisted facts were rebuilt while the session remained held. It does **not**
mean Target confirmation, authenticated device identity, supported Hardware,
or permission to write.

`UNKNOWN_STATE` and `RECOVERY_REQUIRED` require a structured error through
`endUncertain()`. This prevents unexplained terminal states.

`ArtifactProvenance` and `VerificationPlan` currently exist as provisional
standalone Domain shapes. The M1 module/update inputs do not yet require or
populate them, so their presence is not evidence that provenance enforcement or
a generic verification-plan executor is implemented.

## Provider ports

`BindingProvider` separates:

```text
read identity/capabilities
→ prepare
→ execute command
→ reconnect
→ verify usable link
```

`FirmwareUpdateProvider` separates:

```text
validate artifact
→ read identity/capabilities
→ prepare
→ write
→ reboot
→ reconnect
→ verify target and version
```

A provider receipt proves only that its command/write call completed. It does
not prove the postcondition and cannot directly create `SUCCESS`.

## Platform status

| Provider | Current implementation | Validation |
| --- | --- | --- |
| Synthetic Discovery | Deterministic fixtures | Synthetic only |
| Browser Local HTTP Discovery | Explicit, bounded `GET /config` candidate | `UNVALIDATED`; no Hardware |
| Binding | Scripted Synthetic | No RF/link Hardware |
| Firmware Update | Scripted Synthetic state transitions | No real artifact or device I/O |
| Android | None | Deferred to Android real-device spike |

No package contains an actual WebSerial, WebUSB, native USB, Firmware build, or
real-device Flash implementation. The Browser Local HTTP package exposes only
the pinned read route and discards raw/private fields. Synthetic providers still
exercise in-memory `writeFirmware`/reconnect/verify contracts separately.
