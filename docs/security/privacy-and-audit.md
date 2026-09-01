# Privacy and Audit Policy — Milestone 1

Status: **Normative for M1 Foundation**. The current implementation is synthetic
and performs no real-device I/O. Its Mock providers simulate Binding and Firmware
write state transitions in memory, so the whole Foundation is not described as
globally read-only. This policy defines the contract that real Web/Android
adapters must satisfy before their data may enter logs, clipboard exports,
support reports, or persistent storage.

## Local-first rule

- No analytics, crash reporter, cloud sync, remote log collector, or application
  backend exists in M1.
- Operation data remains in memory unless the user explicitly requests an
  export.
- A user action to copy/export is not consent to include secrets or stable
  hardware identifiers.
- No automatic device change is permitted by an audit or diagnostic component.

## Data classes

| Class | Examples | Log | User export | Persistence |
| --- | --- | --- | --- | --- |
| `PUBLIC` | app/Core/upstream version, documented error code | Allowed | Allowed | Only by an approved key |
| `OPERATIONAL` | operation ID, stage, provider ID, Target ID, capability ID, timestamps | Allowed when needed | Allowed after scrub | M1: no |
| `DEVICE_IDENTIFIER` | hardware serial, MAC, USB serial, stable device UID, raw hostname | Never raw | Redact by default | M1: prohibited |
| `SECRET` | Binding Phrase, derived UID bytes, Wi-Fi password, access token, signing key | Prohibited | Prohibited | Prohibited |
| `UNTRUSTED_PAYLOAD` | raw device/error/file text and unknown adapter fields | Allowlisted fields only | Allowlisted fields after scrub | M1: no |

An opaque session-local device ID is `OPERATIONAL` only if it cannot be reversed
or correlated across sessions. Artifact SHA-256 is operational provenance; it
must never be used as a substitute for validating the artifact source.

## Audit event contract

Every future sensitive workflow event must have structured fields equivalent to:

```text
schemaVersion
eventId
operationId
sequence
occurredAt
operationType
stage
eventCode
outcome
providerId (optional)
safeDetails
```

Requirements:

- `eventCode`, `stage`, and `outcome` are stable non-localized identifiers.
- `safeDetails` accepts only explicitly allowlisted primitives; arbitrary adapter
  objects, exception objects, stack traces, and request/response bodies are not
  copied into it.
- Events preserve ordering and stage evidence. A list of state names alone is
  not a complete audit record.
- Provider write completion records `WRITE_COMPLETED`, never `SUCCESS`.
- `SUCCESS` is emitted only after the expected postcondition is verified.
- Unknown final device state is recorded as `UNKNOWN_STATE` or
  `RECOVERY_REQUIRED`; it is never rewritten as a generic failure or success.

## Scrubbing rules

Before clipboard/export/support use, the scrubber must:

1. build a new object from an allowlist rather than mutate and forward the raw
   object;
2. remove known secret/identifier field names case-insensitively;
3. reject unexpected nested objects, binary data, URLs with credentials, and raw
   exception objects;
4. never copy a sensitive value, replacement derived from it, or hash of it;
   record only the field name in `redactedFields` so reviewers can see that a
   class was removed without receiving its value;
5. retain safe provenance fields needed to reproduce the issue: app/Core
   version, upstream SHA, synthetic/catalog revision, workflow stage, stable
   error code, and validation level;
6. pass fixtures containing Binding phrases, UID-like bytes, Wi-Fi credentials,
   serial/MAC values, tokens, and malicious HTML before real adapters are
   admitted.

Logs must not infer that a field is safe because its name is unfamiliar. Unknown
adapter detail is excluded by default.

## Retention and deletion

- M1 audit state is volatile and is discarded on reload/process exit.
- M1 registers no storage key, cookie, service worker cache, IndexedDB database,
  or local file.
- Explicit clipboard content is under the operating system/browser after the
  user action; the UI must explain what is copied and must generate it through
  the scrubber.
- A future persisted operation log needs a registered schema version, purpose,
  maximum retention, deletion UX, migration behavior, and privacy tests before
  implementation.

## Review gates

- Adding a real provider requires a field-level data inventory.
- Adding diagnostic export requires scrubber implementation and tests.
- Adding telemetry/crash reporting requires a new ADR and explicit privacy UX.
- Adding Binding or Wi-Fi workflows requires negative tests proving forbidden
  values never reach logs, errors, clipboard, storage, analytics, or crash data.
