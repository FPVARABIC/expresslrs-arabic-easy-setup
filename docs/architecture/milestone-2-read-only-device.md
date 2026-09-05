# Milestone 2A — Read-only Real Device Candidate

Status: **Build-tested implementation candidate with green official CI; owner
acceptance and hardware validation pending**.

This slice is intentionally narrower than the complete Milestone 2 gate. It
proves a first real browser connection without granting write authority.

## Product flow

```text
User joins the ExpressLRS device Wi-Fi
→ explicitly selects an official local origin
→ clicks Read device
→ GET /config once
→ bounded schema and privacy validation
→ Core rebuilds immutable facts
→ empty Target catalog keeps identity unresolved
→ Web displays device-reported, unvalidated facts
```

`SUCCESS` at this boundary means only that the read-only operation collected
and rebuilt the expected facts. It does not mean that the Target is confirmed,
that the hardware is supported, or that Binding/update is safe.

## Dependency direction

```text
Web host
  → Browser Local HTTP provider
  → ReadOnlyExpressLrsModule
    → Workflows
      → Device boundary rebuilders / session ownership
      → Compatibility catalog (empty in the real-device spike)
      → Domain
  → Diagnostics (fixed-category, value-free support report)
```

The discovery-only module exposes `discover()` and no sensitive-operation
method. The existing Synthetic lab stays visibly separate and does not turn
real device facts into Mock Binding/update inputs.

Because HTTP discovery occurs before a concrete device descriptor exists, the
Browser adapter holds a narrow per-origin transport guard around the request.
The Web host also reuses one `DeviceSessionManager` and maps each fixed origin
to a stable, non-secret endpoint ID. Same-origin overlaps return structured
`DEVICE_BUSY`. Normal completion releases the guard. An abandoned request is
released only after every tracked transport promise settles and cleanup is
proved successful. If body cleanup rejects, throws, is absent, is accessor-
backed, or cannot otherwise be proved, that origin remains fail-closed
quarantined for the current JavaScript realm. This prevents timeout/cancel or a
hostile response boundary from immediately starting an overlapping request to
the same device.
This coordination is process/JavaScript-realm local; cross-tab and external
client behavior remains part of the Browser/Hardware matrix.

Each Browser provider instance owns one immutable snapshot for its workflow.
Every explicit Web retry/refresh constructs a new instance, so the cached
descriptor is not reused as a later connectivity claim.

The Web host retains the first successful safe fact envelope in memory only.
A later user-triggered read compares reported Target, Firmware version, and
TX/RX role. `CONSISTENT` means only that these two self-reported snapshots
match; `CHANGED` means they do not. Neither state authenticates a physical
device, and no polling or automatic reconnect exists.

## Safe public fields

The first parser may retain only these `settings` fields after type, length,
control-character, and schema checks:

| ExpressLRS wire field | Product meaning | Trust status |
| --- | --- | --- |
| `product_name` | Device-reported product label | Self-reported |
| `target` | Reported Target string | Self-reported; never confirmed alone |
| `version` | Reported Firmware version | Self-reported |
| `git-commit` | Reported Firmware commit | Self-reported |
| `module-type` | TX/RX role | Self-reported |
| `radio-type` | Radio family; open bounded string | Self-reported |
| `has_low_band`, `has_high_band` | Reported band capabilities | Self-reported |
| `reg_domain_low`, `reg_domain_high` | Reported regulatory-domain facts | Self-reported |
| `custom_hardware` | Reported custom-hardware flag | Self-reported |

`radio-type` is not a closed enum because upstream development already contains
radio families absent from 4.1.0. Unknown bounded values remain displayable as
reported facts rather than crashing or being silently mapped to a known radio.
Low/high band is derived only when both upstream boolean flags are present.
Missing one flag means unknown, not `false`, and no unsupported capability with
empty provenance is emitted.

## Privacy boundary

The JSON body is untrusted and temporarily exists only inside the parser. The
adapter never exposes or persists it. These fields are excluded by construction:

- `config.uid`;
- the entire raw `options` object;
- `settings.ssid` and Wi-Fi credentials;
- `lua_name` in this first slice because it can be user-customized;
- RX/TX mutable configuration that is unrelated to read-only identity;
- unknown top-level, settings, config, and options fields.

Errors crossing the Workflow boundary contain only a stable code, retryability,
a Core-selected fixed reason, and empty details. They never include the URL,
response body, DOM exception message/stack, UID, SSID, or credential value.
Provider-controlled error reasons and details are replaced/stripped even when a
malicious provider uses an otherwise allowlisted-looking token or detail key.
The Synthetic sensitive workflows apply the same boundary to provider IDs,
receipts, reconnect descriptors, and verification results: Core reads only own
data properties, rebuilds descriptors, and never publishes provider-supplied
observed values or verification reasons.

The explicit support-copy action uses `packages/diagnostics`. Its schema accepts
only fixed outcome, fact-category, stage-category, error-code, attempt, and
reconnect constants. It contains no reported fact values, raw field names,
origin, timestamp, operation/device ID, credential, or response fragment. The
builder reconstructs hostile runtime input and fails inconsistent success or
reconnect combinations closed.

## Browser deployment boundary

`apps/web/public/_headers` is the reviewed production header artifact for
compatible static hosts. At this read-only checkpoint, its CSP allowed
connections only to the application origin and the three fixed ExpressLRS
origins. The later M2 physical-candidate amendment in ADR-0011 adds the official
ExpressLRS Web Flasher mirror; the current policy and checker must be reviewed
together. Scripts and styles remain same-origin only, while `base-uri`,
`object-src`, and `frame-ancestors` are `none`. The build verifies that the
copied artifact is byte-for-byte identical to the reviewed source. Hosts that
do not implement `_headers` must translate the same policy to their native
configuration and verify the response header before release.

CSP permission does not override browser mixed-content, CORS, Local Network
Access, mDNS, or captive-portal rules. Those remain Hardware/Browser gates.

## Admission tests

- exact-origin and exact-request tests;
- bounded body, timeout, cancellation, malformed JSON/schema, wrong content
  type, HTTP failure, and redirect failure;
- missing optional field and future radio-family fixtures;
- UID/options/Wi-Fi secret non-retention tests;
- duplicate device/evidence/capability, forged trust, mutable provider output,
  disconnected descriptor, and forged session tests at the Core boundary;
- Arabic/English UI, loading, cancellation, retry, failure, reported-facts,
  progress, manual reconnect, safe support-copy, focus, component-width smoke,
  and keyboard tests;
- production security-header source/build verification;
- full formatting, lint, TypeScript, dependency-boundary, unit/integration,
  build, license, and high-severity advisory gates.

## Exit limits

This candidate cannot close Milestone 2 until reference hardware proves:

- connection to TX and RX examples;
- exact field behavior on supported Firmware versions;
- disconnect/reconnect and device AP behavior;
- supported desktop/mobile browser combinations;
- Local Network Access and deployed HTTPS behavior;
- absence of sensitive data in logs, clipboard, storage, and reports.

The execution procedure and evidence template are in the
[Milestone 2A Hardware/Browser runbook](../testing/milestone-2-hardware-browser-runbook.md).

The locally achieved validation labels are `CODE_REVIEWED` and `BUILD_TESTED`.
The gate state is `HARDWARE_VALIDATION_PENDING`; it is not a validation level.
No Target/device support or write capability is claimed.
