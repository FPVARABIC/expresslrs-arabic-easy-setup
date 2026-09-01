# Milestone 2A Read-only Candidate — Acceptance Evidence

Status: **Build-tested implementation candidate with green official CI; owner
acceptance and Hardware validation pending**.

This evidence covers only the first real Browser read path. It does not close
the complete Milestone 2 hardware gate and does not authorize Binding,
configuration, reboot, update, or Firmware write.

## Candidate contract

```text
Explicit user action
→ one selected pinned ExpressLRS local origin
→ GET /config
→ bounded transport/schema/privacy checks
→ Core-owned immutable facts
→ empty Target Catalog
→ device-reported facts + UNKNOWN identity
```

The accepted origins are exactly:

- `http://10.0.0.1`;
- `http://elrs_rx.local`;
- `http://elrs_tx.local`.

The request uses `GET`, `mode: "cors"`, `cache: "no-store"`,
`credentials: "omit"`, `redirect: "error"`, `referrerPolicy: "no-referrer"`,
and `Accept: application/json`. The provider offers no arbitrary URL, subnet
scan, fallback endpoint, or write command.

## Automated evidence

| Gate | Candidate evidence | Local status |
| --- | --- | --- |
| No request before user intent | Web test asserts `fetch` is untouched on initial render | Passed |
| Exact request boundary | Provider/Web tests assert fixed origins, literal `/config`, method, credentials, redirect, cache, and referrer policy | Passed |
| Transport/body validation | Tests cover actual `Response`, status, redirect, JSON content type, content length, streamed size, malformed chunks, UTF-8, JSON, and schema | Passed |
| Bounded work | Body storage is fixed at 256 KiB, chunks must be non-empty, the stream is capped at 4,096 chunks, and malformed UTF-8 is rejected | Passed |
| Timeout and cancellation | Tests cover fetch timeout, hung-body timeout, caller cancellation during fetch/body, and stale Web completion | Passed |
| Transport/session ownership | Same-origin reads serialize before Fetch, different origins remain independent, and an origin is released only after normal completion or proven successful cleanup; rejected, absent, throwing, or otherwise unprovable cleanup stays fail-closed quarantined | Passed |
| Minimum identity envelope | Target, Firmware version, and TX/RX role are required; optional safe fields may be absent | Passed |
| Partial band flags | Missing half of the low/high pair remains unknown and emits no capability with empty provenance | Passed |
| Privacy-negative matrix | UID, Wi-Fi options, SSID, password, `lua_name`, raw response, provider error reason/details, receipt/verification diagnostics, hostile field names/getters, unknown fields, and malicious control/Bidi text do not cross the boundary | Passed |
| Trust clamp | Provider trust metadata is rebuilt by a Core policy; one Local HTTP trust domain remains `UNVALIDATED` | Passed |
| Target safety | Empty real Target Catalog keeps identity `UNKNOWN`; no real Binding/update surface exists | Passed |
| Session ownership | Exact opaque session lease, duplicate/non-connected rejection, release on failure/cancel, and forged-session cases | Passed |
| UI separation | Real panel is visually/structurally separate from deterministic Mock Binding/update; real facts cannot populate the Mock workflows | Passed |
| Arabic/English UX | RTL/LTR, explicit read, progress, cancel, manual retry, snapshot/reconnect wording, safe support copy, focus movement, result, and unvalidated labels | Passed |
| Retry semantics | Retry is offered for transient errors and withheld for non-retryable schema/provider failures | Passed |
| Support diagnostics | Runtime input is rebuilt into fixed categories only; inconsistent success/reconnect claims fail closed and no value, raw field name, URL, or identifier can enter the report | Passed |
| Browser security policy | A checked production `_headers` artifact limits `connect-src` to self plus the three reviewed origins and sets `base-uri`, `object-src`, and `frame-ancestors` to `none` without wildcard/unsafe script sources | Passed locally |

The 360/1440 Web tests are component-shell smoke checks under jsdom. They do
not execute a real layout engine and are not responsive-browser evidence.

## Local quality evidence

Executed from the candidate tree on 2026-08-20:

```text
Prettier format check: passed
ESLint with zero warnings: passed
TypeScript: passed
Dependency boundaries: 9 workspace projects passed
Production browser security-header policy: passed in source and build output
Markdown links and MASTER_PLAN contract: passed
Vitest: 22 files, 332/332 tests passed
Production Web build: passed
Frozen offline lockfile/policy verification: 272 entries passed
Dependency license policy: 248 package/version records passed
High-severity dependency advisory audit: no known vulnerabilities
Coverage: 94.46% statements, 88.69% branches, 98.84% functions, 94.41% lines
git diff --check: passed
```

No new external package was added by this hardening slice. The local
high-severity advisory audit found no known vulnerability. Candidate commit
`79eb37e7298b0e244f0bedf368e84dc1c684c5c4` passed the complete official gate
in [GitHub Actions run #8](https://github.com/melyanneahmed-rgb/expresslrs-arabic-easy-setup/actions/runs/32409948903)
and the PR-triggered [run #9](https://github.com/melyanneahmed-rgb/expresslrs-arabic-easy-setup/actions/runs/32409978636).
These runs are evidence only for that immutable candidate; later source changes
require their own run.

## Validation labels and limits

- Achieved locally: `CODE_REVIEWED`, `BUILD_TESTED` for the Web/Core candidate.
- Hardware validation: **NONE**.
- Gate state: `HARDWARE_VALIDATION_PENDING`.
- Not claimed: supported device/Target, authenticated identity,
  `HARDWARE_TESTED`, `STABLE`, real Binding/update, or any performance benefit.

Here, operation `SUCCESS`/`verificationPassed` means only that the requested
read completed and the allowlisted facts were rebuilt while the session was
held. It does not confirm the reported Target or Hardware support.

## Hardware/browser acceptance still required

Use the dedicated
[read-only Hardware/Browser runbook](milestone-2-hardware-browser-runbook.md)
and record the exact device, reported Target, ExpressLRS version/SHA, browser
version, OS, network topology, and sanitized observations for at least:

- one reference TX and one reference RX;
- AP IP, RX mDNS, and TX mDNS paths where applicable;
- field presence/types on the selected supported Firmware versions;
- Local Network Access, mixed-content, CORS, captive-portal, and `.local`
  behavior on each candidate desktop/mobile browser;
- cable/network loss, request timeout, cancellation, tab close, sleep, device
  leaving Wi-Fi mode, and reconnect;
- confirmation that UID, credentials, raw bodies, raw field names, and stable
  identifiers do not enter UI, logs, clipboard, storage, or reports.

Only reviewed matrix rows may later receive `HARDWARE_TESTED`; success on one
device must not become a general ExpressLRS support claim.
