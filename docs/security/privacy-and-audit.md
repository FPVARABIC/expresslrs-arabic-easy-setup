# Privacy and Audit Policy — Foundation + M2A

Status: **Normative for the current Foundation and M2A candidate**. Synthetic
providers simulate Binding and Firmware-write state transitions in memory.
Separately, M2A contains one real Local HTTP provider restricted to read-only
`GET /config`; it has no write surface and is not Hardware validated. This
policy defines what any provider may allow into Core, logs, clipboard exports,
support reports, or persistent storage.

## Local-first rule

- No analytics, crash reporter, cloud sync, remote log collector, or application
  backend exists in M1.
- Operation data remains in memory unless the user explicitly requests an
  export.
- A user action to copy/export is not consent to include secrets or stable
  hardware identifiers.
- No automatic device change is permitted by an audit or diagnostic component.

## M2A Local HTTP data inventory

After explicit user action, the Browser provider may temporarily parse the
normal ExpressLRS `/config` response. It immediately rebuilds a bounded,
allowlisted snapshot containing only fields that are useful to the read-only
identity view:

- product label and reported Target;
- Firmware version and commit;
- TX/RX role and radio family;
- low/high-band capability and regulatory-domain values;
- a boolean indicating whether custom Hardware is reported.

The raw response and parsed object exist only inside the parser and are not
returned, logged, persisted, copied to the clipboard, or exposed to UI code.
The provider excludes by construction:

- `config.uid` and any Binding identity;
- the complete `options` object;
- SSID, Wi-Fi password, and other credentials;
- `lua_name` and other user-customizable identifiers;
- unknown top-level, `settings`, `config`, or `options` fields.

The sanitized snapshot is in memory only for one provider instance. The
real-device panel has one explicit safe support-copy action, but no raw export,
analytics, cloud transport, storage key, or path into the separate Synthetic
Binding/update lab. The copied report contains fixed categories and state only,
never reported device values.

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

The Synthetic compressed-artifact lab keeps copied gzip and decompressed bytes
in bounded memory only for one validation call. It never logs, persists,
exports, or returns the executable payload. Decompression providers may emit
only fixed-size exact byte chunks; provider errors and unknown metadata are
replaced by Core-owned categories. These controls do not make an unsigned
descriptor authentic or authorize a write.

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
2. never enumerate provider-owned keys or execute their accessors; probe only a
   fixed reviewed set of allowlisted keys and known sensitive aliases through
   own data descriptors, excluding every unknown key;
3. reject unexpected nested objects, binary data, URLs with credentials, and raw
   exception objects;
4. never copy a sensitive value, replacement derived from it, hash of it, or
   attacker-controlled field name; publish only bounded redacted/excluded
   counts and reviewed category constants;
5. retain safe provenance fields needed to reproduce the issue: app/Core
   version, upstream SHA, synthetic/catalog revision, workflow stage, stable
   error code, and validation level;
6. pass fixtures containing Binding phrases, UID-like bytes, Wi-Fi credentials,
   serial/MAC values, tokens, and malicious HTML before real adapters are
   admitted.

Logs must not infer that a field is safe because its name is unfamiliar. Unknown
adapter detail is excluded by default.

Provider-controlled `OperationError.reason` and `OperationError.details` are
also replaced/stripped at Workflow boundaries. A provider cannot leak a token
through exception text or by placing it under a normally allowlisted detail
key; Core-owned code must select a fixed reason and rebuild any useful detail
from its own validated values.

Provider IDs, write/command receipts, reconnect descriptors, and verification
results are untrusted too. Sensitive workflows inspect provider metadata and
result fields only through own data descriptors, so accessor-backed properties
are treated as absent rather than executed. Reconnect descriptors are rebuilt
at the Core boundary. Verification values may be used only for fixed equality
checks; provider-supplied reasons and observed Target/version/device values are
not forwarded into operation records or Audit output.

## Read-only support report

The current real-device clipboard report has schema version `1` and type
`READ_ONLY_DEVICE_DIAGNOSTIC`. It may contain only:

- fixed operation outcome, confidence, error code, retryable flag, verification
  flag, bounded attempt count, and reconnect category;
- reviewed fact-category and workflow-stage constants;
- fixed finding/recommendation identifiers and the explicit validation labels
  `BUILD_TESTED` / Hardware validation `NONE`;
- boolean privacy declarations that all raw values, raw field names, stable
  identifiers, credentials, and application persistence are absent.

It must not accept or emit a reported value, endpoint URL, timestamp, raw field
name, operation/session/device ID, exception text, or automatic-fix claim.
Runtime input is rebuilt and inconsistent success/reconnect combinations become
a fail-closed result.

## Retention and deletion

- Current audit and sanitized M2A discovery state are volatile and are discarded
  on reload/process exit.
- The current application registers no storage key, cookie, service worker cache, IndexedDB database,
  or local file.
- Explicit clipboard content is under the operating system/browser after the
  user action; the UI must explain what is copied and must generate it through
  the scrubber.
- A future persisted operation log needs a registered schema version, purpose,
  maximum retention, deletion UX, migration behavior, and privacy tests before
  implementation.

## Review gates

- Adding or expanding a real provider requires a field-level data inventory.
- Adding diagnostic export requires scrubber implementation and tests.
- Adding telemetry/crash reporting requires a new ADR and explicit privacy UX.
- Adding Binding or Wi-Fi workflows requires negative tests proving forbidden
  values never reach logs, errors, clipboard, storage, analytics, or crash data.
