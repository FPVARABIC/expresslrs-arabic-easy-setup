# Milestone 2A Read-only Hardware/Browser Runbook

Status: **Procedure prepared for future execution; no Hardware evidence has
been recorded**.

This runbook validates only the user-triggered `GET /config` candidate. It does
not authorize Binding, configuration, reboot, update, Flashing, Firmware or RF
changes, and it cannot create a device-support claim by itself.

## Safety and privacy boundary

- Use a controlled bench with propellers removed and no vehicle armed.
- Expect the normal RF/Telemetry link to stop while ExpressLRS is in Wi-Fi mode.
- Power, enter, and leave device Wi-Fi mode only by the documented physical or
  Firmware behavior outside this application. The application must not issue a
  command to do so.
- Do not enter Binding Phrases, Wi-Fi credentials, UID, serial/MAC values, or
  account data into the application or this record.
- Do not save `/config` response bodies, DevTools payload previews, packet
  captures, screenshots containing sensitive fields, or raw console errors.
- Stop immediately if the application sends anything other than one explicit
  `GET` to the selected fixed `/config` endpoint, if it presents a mutation
  control, or if device state changes beyond the expected Wi-Fi/RF behavior.

## Required inventory

Create one sanitized record per matrix row:

| Field | Required value |
| --- | --- |
| Evidence ID | `M2A-HW-###` |
| Date / tester | Date and reviewer name or approved alias |
| Device class | TX or RX; no serial or stable identifier |
| Reference device | Manufacturer/model or a sanitized private reference-asset ID; one is mandatory, and a private record may be linked when publication is not approved |
| Hardware revision | Exact revision when printed/documented; otherwise `UNKNOWN` with reason |
| Antenna configuration | Installed antenna count/type and connection state, without a serial or owner identifier |
| Reported Target | Safe reported value, clearly labelled self-reported |
| ExpressLRS build | Version and commit SHA when known |
| Radio/band | Reported family and low/high/dual result |
| Custom Hardware | Reported boolean |
| Browser | Product and exact version |
| Host | OS and exact version; desktop or mobile |
| App build | Candidate commit SHA and deployment origin |
| Network route | AP IP, RX mDNS, or TX mDNS |
| Network topology | Device AP/direct/client path, host adapter, and routing path; omit SSID, MAC, IP lease, and credentials |
| Security context | HTTP/HTTPS and whether Local Network Access was requested |
| Result | `PASS`, `FAIL`, `BLOCKED`, or `NOT_APPLICABLE` |
| Sanitized observation | No raw response, credentials, UID, URL query, or stable ID |

`NOT_APPLICABLE` needs a reason. An unexecuted row is `NOT_RUN`, never `PASS`.

## Minimum matrix

| Row | Device | Route | Browser context | Initial state |
| --- | --- | --- | --- | --- |
| HW-01 | Reference RX | `http://10.0.0.1` | Supported desktop browser | `NOT_RUN` |
| HW-02 | Reference TX | `http://10.0.0.1` | Supported desktop browser | `NOT_RUN` |
| HW-03 | Reference RX | `http://elrs_rx.local` | Supported desktop browser | `NOT_RUN` |
| HW-04 | Reference TX | `http://elrs_tx.local` | Supported desktop browser | `NOT_RUN` |
| HW-05 | Reference RX | Applicable fixed route | Chrome Android candidate | `NOT_RUN` |
| HW-06 | Reference TX | Applicable fixed route | Chrome Android candidate | `NOT_RUN` |

Add rows for every browser/OS combination proposed for release. Safari, Firefox,
installed/PWA, embedded WebView, iOS, and Android wrappers are unsupported until
their own rows pass; do not infer them from a Chromium desktop result.

## Procedure A — explicit single read

1. Verify the candidate commit and production header response. Confirm CSP has
   no wildcard or unsafe execution source and `connect-src` contains only self
   plus the three reviewed ExpressLRS origins.
2. Load the application while not connected to the device network. Confirm no
   local-device request occurs before user action.
3. Put the reference device in Wi-Fi mode using its normal documented method and
   join the intended network. Record the expected RF/Telemetry interruption.
4. Select exactly one applicable origin. Do not type or inject another URL.
5. Activate **Read device information** once. If a Local Network Access prompt
   appears, record the prompt and the allow/deny choice without screenshotting
   sensitive system details.
6. Confirm one `GET /config` request, omitted credentials, no redirect follow,
   and no POST/PUT/PATCH/DELETE request. Inspect method/headers only; do not save
   or copy the response body.
7. Confirm the UI shows progress and then either a structured failure or a
   completed snapshot explicitly labelled device-reported and unvalidated.
8. Confirm the result says it is a snapshot rather than a live connection and
   that Binding/update remain unavailable for the real facts.
9. Wait without further input. Confirm there is no polling, automatic retry, or
   automatic reconnect request.
10. Repeat deliberately with the refresh action and confirm exactly one new
    request is associated with that action.

Record CORS, mixed-content, `.local`, captive-portal, AP-routing, timeout, and
Local Network Access behavior as observed facts. Do not work around a browser
block by weakening CSP, enabling arbitrary origins, disabling security, or
deploying an unreviewed proxy.

## Procedure B — cancel and transport quarantine

1. Start a read on a controlled slow/unreachable route and activate **Cancel
   read** while it is pending.
2. Confirm focus moves to the cancel control while running and to the terminal
   summary after cancellation.
3. Confirm the UI makes no success claim and no stale completion replaces the
   cancelled result.
4. Start a manual retry. If the underlying browser transport has not settled or
   successful body cleanup cannot be proved, `DEVICE_BUSY` is the required
   fail-closed result; overlapping same-origin requests are not.
5. After normal completion or proven successful cleanup, confirm a later
   explicit attempt can proceed. If quarantine persists, stop the case: do not
   bypass it with another tab or origin alias. Start a fresh page/JavaScript
   realm only after the controlled route shows the old request is no longer
   active, and record the cleanup failure as Browser/Hardware evidence.

Do not label an origin permanently supported based only on a synthetic timeout.
Browser Fetch implementations and device servers must be observed on Hardware.

## Procedure C — disconnect and manual reconnect

1. Complete one successful read. Treat it as the in-memory baseline snapshot.
2. Make the route unavailable without using an application write: for example,
   leave the device network or allow the device to exit Wi-Fi mode normally.
3. Activate the refresh action once. Confirm a retryable failure recommends
   restoring Wi-Fi and shows **manual reconnect required**; the application must
   not retry itself.
4. Restore the same intended device/network outside the application, then
   activate **Try again** once.
5. If the minimum reported envelope matches, confirm the wording says only that
   the new snapshot is consistent. It must not say the physical device is
   authenticated or continuously connected.
6. In a separate safe fixture where the reported Target/version/role differs,
   confirm the UI reports `CHANGED` and asks for review. Never manufacture this
   case by modifying production Hardware configuration.

## Procedure D — privacy and support copy

1. Inspect the visible result. UID, SSID, Wi-Fi password/options, Binding
   identity, raw JSON, and user-customizable identifier fields must be absent.
2. Activate **Copy safe support details** only on a test host where clipboard
   review is approved.
3. Parse the copied JSON locally. It may contain fixed categories, stable error
   codes, bounded attempt count, validation labels, and fixed findings only.
4. Confirm it contains no reported Target/product/version/commit/radio/domain
   value, origin, timestamp, raw field name, operation/session/device ID,
   credential, raw exception, or response fragment.
5. Clear the clipboard after review according to the test-host procedure.

## Procedure E — actual UX checks

Run the Arabic RTL and English LTR flows in real browsers at minimum desktop and
360 CSS-pixel mobile viewports. Check keyboard/switch access, visible focus,
44-pixel controls, zoom/reflow, technical-value direction, status announcement,
and that the Mock divider remains perceivable. The existing jsdom width tests
are not evidence for layout, touch, browser permissions, or assistive technology.

## Acceptance rule

The M2A Hardware gate can advance only when:

- at least one reference TX and one reference RX have passing applicable rows;
- every claimed production browser/OS/security-context combination has its own
  passing row;
- AP/mDNS, CORS, mixed-content, Local Network Access, cancel, timeout, and
  disconnect/reconnect outcomes are explicitly recorded;
- privacy review confirms no forbidden data in UI, clipboard, application logs,
  storage, or reports;
- the tested commit has green official CI and the deployed CSP header matches
  the reviewed policy;
- failures and unsupported combinations remain documented rather than hidden.

Promotion applies only to named rows. It does not authorize a write provider,
confirm a Target from self-report alone, or generalize support to all ExpressLRS
devices, Firmware versions, bands, browsers, or mobile platforms.
