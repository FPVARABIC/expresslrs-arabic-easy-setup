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
- Discovery and Binding providers plus a snapshotted Firmware Update provider
  registry;
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

Firmware compatibility can still evaluate a minimal descriptor, but Firmware
execution now requires a `FirmwareUpdateArtifact` with provenance schema v1.
Core rebuilds fixed own data properties before the first observer, validates
canonical digest/commit/time/repository/size shapes, and requires the descriptor
Target and digest to agree with provenance. The result is explicitly labeled
`COHERENCE_ONLY`.

Execution also requires an exact non-empty `Uint8Array`. Core copies it before
the first observer, caps it at 64 MiB, requires its length to equal provenance,
and verifies its canonical SHA-256 through an injected digest provider before
calling an update provider. Validation, preparation, and writing each receive a
fresh copy of those verified bytes. The Browser adapter implements the digest
with Web Crypto and reads bounded `Blob`/`File` bytes without retaining a file
name. Synthetic execution uses an explicitly `SYNTHETIC_ONLY` fixture boundary.

Byte integrity is not authenticity. The operation result separately records
provenance validation, byte-verification assurance, manifest trust, and provider
assurance. Manifest trust remains `UNVERIFIED_NO_TRUST_ROOT`, and the provider
registry currently admits only `SYNTHETIC_ONLY`; a real writer cannot satisfy
the contract.

Separately, the Workflow package can parse the fixed version-1 Manifest
allowlist under strict JSON/resource limits, build domain-separated RFC 8785
bytes, and exercise Ed25519 through the Browser Web Crypto adapter. That spike
admits only `synthetic` channel/role, raw uncompressed bytes, and a caller
supplied Synthetic public key. Even a matching signature is
`VALID_UNTRUSTED`; it is not wired into Firmware execution or catalog trust.

The next isolated Workflow slice parses bounded `synthetic-root` metadata,
verifies exact `N → N+1` rotation against both old and incoming root
thresholds, blocks key-ID rebinding, evaluates expiry through one fixed
`SYNTHETIC_ONLY` clock value, and models Manifest-key removal as revocation. It
can resolve and verify a Synthetic Manifest through that role, but the result
is deliberately `VERIFIED_AGAINST_UNTRUSTED_ROOT` because no initial root is
admitted.

A separate 32 KiB pure codec models the highest root version and per-Target
release floors. Its transition functions detect root/release rollback and
equal-sequence digest conflict, returning only `ADVANCED_UNPERSISTED`. No Core
package calls IndexedDB, `localStorage`, or another persistence API; the exact
future IndexedDB bundle is only `PROPOSED` in the storage registry. Root
ceremony, production clock assurance, atomic persistence, catalog admission,
and every real writer remain blocked.

Another isolated Workflow validates compressed fixtures without changing the
raw-only Manifest v1 or the update facade. An exact Synthetic descriptor names
both gzip/download and decompressed byte lengths and SHA-256 values. Core caps
the input at 16 MiB, accepts at most 64 MiB of output through 64 KiB chunks,
hashes both forms, and then parses an exact Synthetic executable container whose
embedded Target must match the descriptor. Success is evidence-only
`VERIFIED_SYNTHETIC_FIXTURE` with
`writeDisposition: BLOCKED_SYNTHETIC_FIXTURE`; no payload bytes are returned.
The Browser Platform supplies a streaming `DecompressionStream("gzip")` adapter
labeled `SYNTHETIC_ONLY`. No real executable format, catalog entry, or writer is
admitted.

A separate 16 KiB version-2 Synthetic linkage Manifest now names the gzip and
decompressed sizes and SHA-256 values under a new RFC 8785/Ed25519 domain. The
existing fresh Synthetic root role can resolve its exact signer, and the
unpersisted release floor uses the compressed digest as the identity of the
download/decompression input. A final evidence join accepts only internally
branded root-verification, compressed-validator, and rollback-transition
objects created for the same Target/release/bytes. Its result is explicitly
`SYNTHETIC_CATALOG_CANDIDATE_EVIDENCE` with
`catalogDisposition: NOT_ADMITTED_UNTRUSTED_SYNTHETIC` and
`writeDisposition: BLOCKED_SYNTHETIC_FIXTURE`. It returns no bytes and is not
connected to the Target Catalog or update facade. An admitted root, atomic
persistence, real executable parser, catalog admission, and every writer remain
blocked.

A separate 16 KiB signed Synthetic distribution statement now binds that exact
v2 artifact name/size/digest to canonical source and notice bundle
name/URL/size/digest identities. Its reserved `.invalid` same-origin policy is
deliberately non-production. Core accepts only an internally root-verified
statement, then copies at most 4,096 exact 64 KiB chunks, requires an unchanged
URL/status/media/size receipt, hashes the complete object, clears transient
copies, and returns `VERIFIED_SYNTHETIC_ACQUISITION` without bytes. The Firmware,
source, and notice acquisitions must join the existing branded catalog
candidate through the same parsed root, Target, release, and compressed object.
Success remains `SYNTHETIC_DISTRIBUTION_CANDIDATE_EVIDENCE`,
`NOT_ADMITTED_UNTRUSTED_SYNTHETIC`, and `BLOCKED_SYNTHETIC_FIXTURE`. Source and
notice contents remain explicitly uninspected, and no Browser/network provider
or production origin is admitted.

Core creates `firmware-update-post-write-v1` with four required facts: device
reconnected, session-local device identity matched, Target matched, and Firmware
version matched. Strict evaluation of that immutable plan is an additional
condition for `SUCCESS`. The exact provenance snapshot and plan are returned as
operation evidence.

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
validate Core-verified artifact bytes
→ read identity/capabilities
→ prepare
→ write a fresh copy of the verified bytes
→ reboot
→ reconnect
→ verify target and version
```

A provider receipt proves only that its command/write call completed. It does
not prove the postcondition and cannot directly create `SUCCESS`.

Firmware Update providers also declare a canonical method independently from
their platform-specific provider ID. Core currently recognizes Wi-Fi OTA,
UART, Betaflight/EdgeTX passthrough, XMODEM, STLink, DFU, and external-tool
paths. The injected Target Catalog orders the supported methods; Core selects
one provider from that order, never from registry order. Missing, malformed,
duplicate, or ambiguous provider mappings stop before a provider call. The
ordinary UI does not choose a method.

## Platform status

| Provider | Current implementation | Validation |
| --- | --- | --- |
| Synthetic Discovery | Deterministic fixtures | Synthetic only |
| Browser Local HTTP Discovery | Explicit, bounded `GET /config` candidate | `UNVALIDATED`; no Hardware |
| Binding | Scripted Synthetic | No RF/link Hardware |
| Firmware Update | Scripted Synthetic multi-method selection, provenance coherence, byte flow/hash boundary, bounded untrusted Manifest-signature spike, and declarative verification | Mock only; no trusted manifest, real writer, or device I/O |
| Android | None | Deferred to Android real-device spike |

No package contains an actual WebSerial, WebUSB, native USB, Firmware build, or
real-device Flash implementation. The Browser Local HTTP package exposes only
the pinned read route and discards raw/private fields. Synthetic providers still
exercise in-memory `writeFirmware`/reconnect/verify contracts separately.
