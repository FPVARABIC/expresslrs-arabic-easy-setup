# PWA / Offline Foundation

## Purpose

This checkpoint adds a software-only Progressive Web App foundation without changing the three-action Easy Mode or promoting any Hardware/write capability.

The goal is deliberately narrower than "offline flashing". It establishes installability metadata, a reviewed Service Worker boundary, limited-offline user feedback, and deterministic CI checks so future offline work starts from a fail-closed base.

## Installability metadata

The Web application now publishes a repository-relative `manifest.webmanifest` with:

- Arabic-first `lang: ar` and `dir: rtl`;
- `id`, `start_url`, and `scope` all relative to the deployed application path;
- standalone display mode;
- reviewed theme/background colors;
- one local static SVG application icon.

No remote icon, analytics endpoint, or external application dependency is introduced.

## Service Worker boundary

The Service Worker is intentionally a static-shell fallback, not a Firmware cache.

It intercepts only requests that satisfy all of these conditions:

1. HTTP method is `GET`;
2. request origin equals the application origin;
3. destination is one of document, script, style, font, or image;
4. the path does not match a reviewed sensitive-path denylist.

The denylist explicitly bypasses paths containing Firmware, artifact, catalog, release, update-metadata, or update-manifest identities.

Cross-origin requests are never intercepted. This is important for the existing read-only ExpressLRS Local HTTP experiment because `http://10.0.0.1`, `http://elrs_rx.local`, and `http://elrs_tx.local` remain outside the Service Worker cache path.

## Cache behavior

Eligible static-shell requests use network-first behavior:

`Network → optional cache refresh → cached fallback only after network failure`

A cache write failure does not invalidate a successful network response.

The current cache namespace is `elrs-easy-shell-v1`. This is a shell-cache schema namespace only; it is not a Firmware version, trusted release identifier, catalog version, or security-root version.

No Firmware artifact, signed Manifest, catalog response, Target database, root metadata, rollback state, device response, UID, credential, or user-supplied file is deliberately cached by this Service Worker.

## Update safety

Registration uses `updateViaCache: "none"` so Service Worker update checks do not reuse an HTTP-cached worker script.

The application does not force activation of a waiting worker and does not force an update into the current client. This avoids deliberately replacing application code in the middle of a future sensitive workflow. A later full PWA update UX must keep operation-state awareness before it can claim safe in-session upgrades.

## Limited-offline UI

The application adds a small status notice only when the browser reports `navigator.onLine === false`.

The notice is Arabic-first with English fallback and states only that some previously saved local functions may remain available while new internet metadata and updates are unavailable.

`navigator.onLine` is not used to block Local HTTP device access and is not treated as proof that a device is unreachable.

## Browser security policy

The reviewed CSP changes only the Worker boundary needed by this checkpoint:

- `worker-src` changes from `'none'` to `'self'`;
- `connect-src` is limited to self, the CORS-capable official ExpressLRS Web
  Flasher mirror used for the global catalog/Targets/layout inputs,
  revision-bound Firmware/boot/Lua assets, and revision-first logo with a
  global fallback, plus the three reviewed ExpressLRS Local HTTP origins;
- scripts, styles, fonts, images, forms, frames, objects, and permissions retain their existing restrictions.

GitHub Pages still cannot prove deployment of response-only headers. The
meta-CSP remains a partial Pages preview control, not production-host evidence.
The global catalog, Target, layout, and fallback-logo paths are mutable and
unsigned; only the assets whose URL contains the selected full revision are
commit-addressed.

## Deterministic PWA gate

`scripts/check-pwa-safety.mjs` verifies source and production build output. It checks:

- exact relative manifest scope/start/id and reviewed icon metadata;
- static script-free SVG icon;
- same-origin `GET` and destination allowlisting in the Service Worker;
- explicit sensitive-path bypasses;
- network-first ordering;
- absence of forced Service Worker activation;
- update-cache bypass during registration;
- retention of the manifest link in production output;
- exact copying of reviewed manifest, worker, and icon into `dist`.

The gate is part of both root `pnpm check` and GitHub Actions CI, and the Web production build re-runs it against `dist`.

## Validation

Reviewed candidate: `4176240998419f46989cdecf862173450cabbbc8`.

GitHub Actions CI run #94 passed the complete clean-install gate:

- formatting;
- ESLint with zero warnings;
- strict TypeScript;
- nine-package dependency boundaries;
- Browser security-header checks;
- PWA source safety checks;
- Markdown links and complete Master Plan contract;
- 41/41 Vitest files and 539/539 tests;
- production Web build with PWA checks against `dist`;
- dependency license policy;
- high-severity advisory audit with no known vulnerability.

No dependency was added.

## Non-claims

This checkpoint does **not** claim:

- complete offline operation after one visit on every browser;
- offline Firmware download, build, flashing, or recovery;
- cached Firmware/catalog authenticity;
- Hardware-tested PWA behavior;
- Android installation or native USB/serial support;
- background device access;
- production-host response-header enforcement;
- Web Beta completion.

Those remain separate gates.
