# Milestone 1 Mock Workflows

Status: **Synthetic execution only**. These state machines prove orchestration
and failure semantics; they do not claim ExpressLRS hardware support.

The workflow boundary snapshots the selected descriptor, operation intent,
Firmware artifact, and provider registry before its first observer/await.
Adversarial tests mutate the caller's original values during progress callbacks
and prove that method selection, validation, write, reconnect, verification,
and result metadata keep using one immutable snapshot. Cancellation checkpoints
are owned by Core rather than delegated to Providers.

## Easy Binding

```text
PREPARING
→ IDENTIFYING
→ WAITING_FOR_CONFIRMATION
→ EXECUTING
→ RECONNECTING
→ VERIFYING
→ SUCCESS
```

The workflow:

1. acquires the exclusive Device Session;
2. reads identity evidence and capabilities;
3. requires `CONFIRMED` identity and `guided-bind` capability;
4. waits for explicit intent;
5. prepares and executes the Binding command;
6. releases the old session and reconnects;
7. reacquires a session and re-reads identity;
8. requires the same confirmed Target;
9. verifies a usable link independently;
10. reports success only after that evidence.

A completed command with no link or `MODEL_MISMATCH` ends in `FAILED` with
`VERIFICATION_FAILED`. A different Target returning ends in `UNKNOWN_STATE`.

## Firmware Update

```text
PREPARING
→ IDENTIFYING
→ WAITING_FOR_CONFIRMATION
→ EXECUTING
→ WRITE_COMPLETED
→ REBOOTING
→ RECONNECTING
→ VERIFYING
→ SUCCESS
```

Before the synthetic write, the workflow requires:

- an immutable schema-v1 provenance envelope whose Target and SHA-256 agree
  with the artifact descriptor;
- a copied, bounded byte payload whose exact size and SHA-256 agree with that
  provenance;
- artifact integrity from the provider;
- confirmed identity;
- exact artifact/Target match;
- supported Firmware major;
- one automatically selected Target-supported update method and its observed
  runtime capability;
- explicit user intent.

After the write, it reacquires and re-identifies the returned device, then
evaluates the Core-owned `firmware-update-post-write-v1` requirements for
reconnect, session-local identity, Target, and Firmware version. Missing,
duplicate, or mismatched observations cannot pass. `WRITE_COMPLETED` is an
intermediate fact, never a success state.

The deterministic fixture now contains bytes as well as provenance. Core
snapshots both before observers, checks exact size, and passes SHA-256 through a
fixture-only digest boundary explicitly labeled `SYNTHETIC_ONLY`. There is no
verified signature or trust root, so this is not artifact authenticity,
reproducible-build evidence, or permission for a real provider. Provider
selection itself admits only `SYNTHETIC_ONLY`.

Synthetic Targets now contain an ordered method list rather than a platform
provider name. The test host registers Wi-Fi and UART providers together. Core
selects Wi-Fi for the synthetic TX when available, falls back to UART when it
is the next supported method, and selects UART for the synthetic Sub-GHz RX.
Provider registration order is deliberately irrelevant, and duplicate or
ambiguous mappings fail before any provider call.

## Failure disposition

| Evidence | Final state | Meaning |
| --- | --- | --- |
| Permission denied or failure before write | `FAILED` | No write began |
| Connection lost while write result is unknown | `UNKNOWN_STATE` | Do not assume written or unchanged |
| Write completed but device does not return | `RECOVERY_REQUIRED` | Recovery/reconnect workflow needed |
| Different Target returns after write | `RECOVERY_REQUIRED` | Expected device identity not proved |
| Wrong/unverified Firmware version | `RECOVERY_REQUIRED` | Postcondition failed |
| Binding command completes but link is absent | `FAILED` | Safe retry may be offered after recheck |
| User declines before execution | `CANCELLED` | No command/write runs |

## Deterministic fixtures

The Synthetic layer covers:

- known TX 2.4 GHz, known RX Sub-GHz, and LR1121 dual-band families;
- unknown, ambiguous, conflicting, and duplicate identity evidence;
- unsupported Firmware major and invalid artifact;
- permission denial;
- disconnect at each Binding and Update provider stage;
- reconnect to the same device, wrong Target, wrong version, or no device;
- Binding without a link and with Model Mismatch;
- deterministic clock and complete provider-call histories;
- automatic Wi-Fi preference, UART fallback, absent-method, ambiguous-provider,
  accessor-backed metadata, duplicate-provider, registry-mutation, byte-size,
  byte-digest, and caller-byte-mutation cases;
- canonical provenance shape, descriptor/provenance disagreement, hostile
  accessors, unknown-field non-enumeration, nested observer mutation, and
  declarative-plan missing/mismatch/duplicate cases;
- privacy-classified Synthetic discovery replay traces for regression cases;
- retry as a fresh invocation that always starts by re-reading identity and
  capabilities.

Every fixture is invented for the test suite and contains no copied ExpressLRS
Target database material.
