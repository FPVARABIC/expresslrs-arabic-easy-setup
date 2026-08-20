# ADR-0010: Read-only Local HTTP Discovery

- Status: Accepted for the Milestone 2A technical spike
- Date: 2026-08-20
- Upstream baseline: ExpressLRS 4.1.0 at
  `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6`

## Context

Milestone 2 must prove a real-device path without introducing hardware writes.
ExpressLRS 4.1.0 exposes a device-hosted `GET /config` route that reports
product, Target, Firmware, TX/RX role, radio family, and band-related facts.
This is a stronger first browser surface than USB or serial descriptors, which
usually identify an MCU or bridge rather than the exact ExpressLRS Target.

The normal `/config` response also contains `config.uid` and raw `options`.
Official build options may contain Wi-Fi credentials. The route has no
application authentication in the inspected handler, is served over HTTP, and
reports facts from one self-reported Firmware trust domain. A successful HTTP
request is therefore neither authenticated device identity nor hardware
validation.

Entering the Firmware Wi-Fi mode also stops the normal RF path. The read request
does not write persistent configuration, but the user must be told that the
radio link/telemetry can disconnect while the device is in Wi-Fi mode.

## Decision

The first real browser provider is a read-only Local HTTP adapter with these
limits:

- it is created only after an explicit user action;
- it accepts only the pinned official origins `http://10.0.0.1`,
  `http://elrs_rx.local`, and `http://elrs_tx.local`;
- it requests the literal path `/config` with `GET`, no query string, omitted
  credentials, disabled client caching, and rejected redirects;
- it performs no subnet scan, mDNS enumeration, fallback request, POST, reboot,
  Binding, configuration, update, or Firmware operation;
- it requires HTTP 200, JSON content type, a bounded response, and the expected
  `settings` plus `config` object shape;
- it immediately rebuilds an allowlisted snapshot and never returns, stores, or
  logs the raw response, `config.uid`, `options`, SSID, or Wi-Fi credentials;
- it treats `target` as `reportedTarget`, not a confirmed Target;
- it serializes an active read per fixed origin before the HTTP request and the
  Web host reuses one session manager with stable, non-secret endpoint IDs;
- all `/config` identity evidence shares one Core-owned trust domain and stays
  `UNVALIDATED` until a reference-hardware matrix establishes reliability;
- it uses an empty, license-safe Target catalog in the Web spike, so it cannot
  authorize a sensitive operation.

The adapter lives in a browser package. Domain, Device, Compatibility, and
Workflow packages remain free of DOM and browser runtime APIs. The Web host
composes the adapter with a discovery-only module that has no Binding or update
method.

## Alternatives

- Web Serial first: deferred because a serial/USB bridge alone does not prove
  the exact Target and wired Android behavior still needs a hardware spike.
- WebUSB first: deferred because support is narrower and descriptors commonly
  identify the bridge/MCU rather than the product.
- Reuse the complete device Web UI: rejected for this slice because it exposes
  mutable endpoints and couples the product to upstream UI behavior.
- Accept an arbitrary URL or scan the local subnet: rejected because it expands
  the browser trust boundary and produces unsafe, confusing discovery behavior.
- Use `/config?export`: rejected because export mode omits `settings`, includes
  sensitive UID/configuration data, and is not the identity surface.

## Consequences

- Users must first join the ExpressLRS device Wi-Fi or otherwise make one of the
  official hostnames reachable.
- Hosted HTTPS behavior still depends on browser Local Network Access,
  mixed-content handling, CORS, captive-portal behavior, and network topology.
- A successful spike may display safe reported facts, but the support label
  remains `UNVALIDATED` and identity remains `UNKNOWN` without an independently
  approved Target catalog and cross-check.
- The provider is model-agnostic because it parses the shared schema and does
  not branch on manufacturer/model names.
- Hardware validation, reconnect behavior, mobile browsers, CSP deployment,
  and Android remain explicit follow-up gates.
- Missing half of the low/high band flag pair remains unknown; the adapter does
  not infer an exclusive band or emit a capability without evidence.

## Upstream evidence

- Firmware route and response construction:
  <https://github.com/ExpressLRS/ExpressLRS/blob/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/src/lib/WIFI/devWIFI.cpp#L370-L533>
- Route registration and CORS headers:
  <https://github.com/ExpressLRS/ExpressLRS/blob/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/src/lib/WIFI/devWIFI.cpp#L1181-L1248>
- Default device hostnames, AP names, password, and IP:
  <https://github.com/ExpressLRS/ExpressLRS/blob/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/src/lib/OPTIONS/options.cpp#L16-L24>
- Official Web UI access and troubleshooting guidance:
  <https://github.com/ExpressLRS/Docs/blob/043f06727b2859dd5e67b725763645df5bccddee/docs/quick-start/webui.md#L108-L219>
