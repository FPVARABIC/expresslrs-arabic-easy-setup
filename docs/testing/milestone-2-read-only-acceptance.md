# Milestone 2A Read-only Candidate — Acceptance Evidence

Status: **Implementation candidate complete locally; owner acceptance and
Hardware validation pending**.

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
| Timeout and cancellation | Tests cover fetch timeout, hung-body timeout, caller cancellation during fetch/body, and stale Web completion | Passed |
| Transport/session ownership | Same-origin provider instances serialize before Fetch, different origins remain independent, timeout/cancel release the guard, and the Web host shares stable endpoint sessions | Passed |
| Minimum identity envelope | Target, Firmware version, and TX/RX role are required; optional safe fields may be absent | Passed |
| Partial band flags | Missing half of the low/high pair remains unknown and emits no capability with empty provenance | Passed |
| Privacy-negative matrix | UID, Wi-Fi options, SSID, password, `lua_name`, raw response, raw errors, unknown fields, and malicious control/Bidi text do not cross the boundary | Passed |
| Trust clamp | Provider trust metadata is rebuilt by a Core policy; one Local HTTP trust domain remains `UNVALIDATED` | Passed |
| Target safety | Empty real Target Catalog keeps identity `UNKNOWN`; no real Binding/update surface exists | Passed |
| Session ownership | Exact opaque session lease, duplicate/non-connected rejection, release on failure/cancel, and forged-session cases | Passed |
| UI separation | Real panel is visually/structurally separate from deterministic Mock Binding/update; real facts cannot populate the Mock workflows | Passed |
| Arabic/English UX | RTL/LTR, explicit read, loading, cancel, failure/retry, safe result, unvalidated label, keyboard, and mobile/desktop shell tests | Passed |
| Retry semantics | Retry is offered for transient errors and withheld for non-retryable schema/provider failures | Passed |

## Local quality evidence

Executed from the candidate tree on 2026-08-20:

```text
Prettier format check: passed
ESLint with zero warnings: passed
TypeScript: passed
Dependency boundaries: 8 workspace projects passed
Markdown links and MASTER_PLAN contract: passed
Vitest: 20 files, 261/261 tests passed
Production Web build: passed
Frozen offline lockfile/policy verification: 272 entries passed
Dependency license policy: 248 package/version records passed
git diff --check: passed
```

No new external package was added by M2A. The high-severity advisory audit and
official CI must run again after the candidate is committed/pushed; prior green
M1 CI is not evidence for this uncommitted tree.

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

Record the exact device, Target, ExpressLRS version/SHA, browser version, OS,
network topology, and raw observations for at least:

- one reference TX and one reference RX;
- AP IP, RX mDNS, and TX mDNS paths where applicable;
- field presence/types on the selected supported Firmware versions;
- Local Network Access, mixed-content, CORS, captive-portal, and `.local`
  behavior on each candidate desktop/mobile browser;
- cable/network loss, request timeout, cancellation, tab close, sleep, device
  leaving Wi-Fi mode, and reconnect;
- confirmation that UID, credentials, raw bodies, and identifiers do not enter
  UI, logs, clipboard, storage, or reports.

Only reviewed matrix rows may later receive `HARDWARE_TESTED`; success on one
device must not become a general ExpressLRS support claim.
