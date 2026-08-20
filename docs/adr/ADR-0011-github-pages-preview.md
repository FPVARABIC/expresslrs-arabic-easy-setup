# ADR-0011: GitHub Pages Public Development Preview

- Status: Accepted for the M2A public preview only
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

- obtain and verify the Pages base path before building;
- run the frozen install, complete source checks, dependency-license policy,
  and high-severity advisory audit before packaging;
- inject a reviewed Pages-only CSP meta policy before executable resources and
  include a `no-referrer` meta policy;
- keep the fuller `_headers` artifact for a future compatible host while
  explicitly treating it as inert on GitHub Pages;
- publish only `apps/web/dist` through official GitHub Actions pinned to full
  immutable Commit SHAs;
- grant `pages: write` and `id-token: write` only to the deployment job;
- ship the notices required by the self-hosted Cairo font and runtime packages;
- label the UI `PREVIEW · HARDWARE NONE`, keep all real writes absent, and avoid
  Offline/PWA, real-device support, or trusted-host claims.

The temporary feature-branch trigger may publish the exact reviewed M2A
candidate before merge. It is not a separate PR environment: it replaces the
single Pages preview. After integration, the feature trigger must be removed so
only `main` can publish.

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

## References

- [Vite static deployment guidance](https://vite.dev/guide/static-deploy.html#github-pages)
- [GitHub Pages custom workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [CSP meta-element limitations](https://www.w3.org/TR/CSP/#meta-element)
