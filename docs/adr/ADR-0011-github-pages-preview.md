# ADR-0011: GitHub Pages Public Development Preview

- Status: Accepted for the public preview; amended for the M2 physical candidate
- Date: 2026-08-20

## Context

The owner requested a public GitHub-hosted Web App that preserves the accepted
Arabic-first product interface. The application is a static React/Vite build,
but GitHub Project Pages serves it below the repository path rather than at the
origin root. The hosted page also runs over HTTPS while the three reviewed
ExpressLRS device origins use HTTP.

GitHub Pages does not interpret the repository's `_headers` file as response
header configuration. It therefore cannot prove the reviewed CSP,
`X-Frame-Options`, COOP, CORP, or Permissions Policy at the HTTP-response layer.
HTML supports a partial CSP meta policy, but `frame-ancestors` and the other
response-only controls cannot be replaced by meta elements.

## Decision

Publish the exact quality-gated Web build as a **public development preview** at
the repository's GitHub Pages URL. This is not a trusted Release and does not
close any Hardware, browser-matrix, final-brand, product-license, or hosted
response-header gate.

The deployment must:

- build against the fixed canonical repository base path, verify every emitted
  asset against it, and compare it with the configured Pages path before deploy;
- run the frozen install, complete source checks, dependency-license policy,
  and moderate-or-higher advisory audit before packaging;
- inject a reviewed Pages-only CSP meta policy before executable resources and
  include a `no-referrer` meta policy;
- keep the fuller `_headers` artifact for a future compatible host while
  explicitly treating it as inert on GitHub Pages;
- publish only `apps/web/dist` through official GitHub Actions pinned to full
  immutable Commit SHAs;
- grant `pages: write` and `id-token: write` only to the deployment job;
- ship the notices required by the self-hosted Cairo font and runtime packages;
- state that Hardware validation is absent, keep all device-changing controls
  locked at the public entry point, and avoid real-device support,
  offline-Firmware, or trusted-host claims.

The deployment workflow responds only to a push to `main` or a manual dispatch,
and its build job additionally requires `refs/heads/main`. It checks out that
triggering commit, reruns the complete quality gate, and publishes only the
artifact bound to the same full SHA. Pull requests run a separate read-only CI
artifact check and never enter the deployment workflow. This is not a separate
PR environment: a successful main deployment replaces the single Pages
preview.

## Real-device boundary

The hosted interface and deterministic Mock lab are expected to work. A user
may explicitly attempt the existing `GET /config` read, but HTTPS-to-local-HTTP,
Local Network Access, CORS, mDNS resolution, device AP switching, and browser
behavior remain `NOT_RUN` on reference Hardware. The preview must not promise
that this path works. It may never proxy device data through a cloud service.

## Consequences

- The owner receives one public Web App URL backed by GitHub and reproducible
  Actions evidence.
- Easy Mode tasks remain first, followed by a visibly separate real-device
  read-only experiment and optional Advanced Mode.
- The agreed dark-green, turquoise, pale-yellow, and white direction is applied
  without copying an upstream product identity.
- `CODE_REVIEWED` and `BUILD_TESTED` may be recorded for an exact successful
  workflow SHA. `HARDWARE_TESTED`, `STABLE`, and trusted-host status remain
  prohibited.
- A future production host must enforce and verify real response headers before
  the hosting security gate can pass.

## M2 physical-candidate amendment — 2026-09-04

The later TX/RX candidate adds one HTTPS `connect-src` origin:
`https://expresslrs.github.io`. It is used only for the official Web Flasher's
CORS-capable mirror: the global release index and Target JSON; revision/region/
Firmware-family Firmware and boot assets; global hardware layouts; a
revision-first logo with global fallback; and the revision-bound Lua script.
Requests are bounded, use fixed HTTPS origin/path construction, and reject a
final URL that differs from the requested mirror path. The three local-device
origins remain unchanged, direct Artifactory access is not admitted by the
browser policy. This amendment supersedes the earlier “all real writes absent”
implementation description: device-changing code now exists, but the current
public entry point keeps settings writes, Binding, flashing, Wi-Fi handoff, and
recovery locked. Enabling them requires a separately reviewed entry point; it
is not a public build switch. Every Pages build must inject and verify its exact
40-character candidate SHA so a physical-acceptance export can be bound to the
tested code.

Pull requests run the read-only CI workflow and build a non-deployed Pages
artifact for verification. The deployment workflow has no `pull_request`
trigger, its build job is additionally restricted to `refs/heads/main`, and
only its deployment job receives Pages and OIDC write permissions. Therefore a
Draft PR push cannot publish or replace the public preview.

This amendment also supersedes the original `GET /config`-only real-device
description. The current public entry point permits explicit CRSF connection,
identity inspection, and parameter reads. Those paths remain unvalidated on
Hardware, and the entry point does not enable settings writes, Binding,
flashing, Wi-Fi handoff, or recovery.

The revision paths for Firmware, boot assets, Lua, and the first logo attempt
provide commit-addressed provenance, not a publisher signature. The global
catalog, Target, layout, and fallback-logo inputs are mutable and unsigned;
HTTPS plus an exact final URL identifies their delivery source but does not bind
them to the selected revision. Per-segment hashes in the locally generated
recovery manifest detect later package corruption; they do not authenticate
upstream publication.

## References

- [Vite static deployment guidance](https://vite.dev/guide/static-deploy.html#github-pages)
- [GitHub Pages custom workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [CSP meta-element limitations](https://www.w3.org/TR/CSP/#meta-element)
