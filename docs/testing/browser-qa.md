# Browser QA

## What this is

A Playwright suite that runs the **built** application in a real Chromium
against a server that applies the headers that actually ship. It is the only
thing in this repository that can support a `BROWSER_VERIFIED` claim: jsdom
does not enforce a Content-Security-Policy, does not run a service worker, and
does not decide whether `navigator.serial` exists.

- Suite: [`browser-qa/shipped-application.spec.ts`](../../browser-qa/shipped-application.spec.ts)
- Config: [`playwright.config.ts`](../../playwright.config.ts)
- Server: [`scripts/serve-built-web.mjs`](../../scripts/serve-built-web.mjs)

## Running it

```bash
pnpm --filter @elrs-easy/web build
pnpm qa:browser
```

The server reads `apps/web/dist/_headers` and applies its `/*` block, because
`vite preview` ignores that file and would prove nothing about the shipped
policy. It also detects the base path the build was compiled for — a Pages
build rewrites every asset URL to `/<repo>/assets/...` — so the suite runs
against the exact artifact that ships rather than a second build made only for
testing. Serving a Pages build from the root instead returns `index.html` for
every asset and the browser rejects them on MIME type; the "no console errors"
check is what catches that.

Where a Chromium is already installed, point at it instead of
downloading another:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm qa:browser
```

## In CI

`ci.yml` installs the Chromium runtime and runs `pnpm qa:browser` on every push
and pull request, and uploads the Playwright report when it fails.
`scripts/check-ci-hygiene.mjs` fails the build if either step is removed, so a
`BROWSER_VERIFIED` claim cannot outlive the check that supports it.

## What it verifies, and what it does not

| Claim | Level |
| --- | --- |
| The shipped CSP, Referrer-Policy, X-Frame-Options, X-Content-Type-Options and Permissions-Policy are served, and the CSP contains no host-source with an underscore | `BROWSER_VERIFIED` |
| The application loads in Arabic RTL with no console error and no CSP violation against its own bundle | `BROWSER_VERIFIED` |
| The advanced workbench is reachable only through an explicit choice | `BROWSER_VERIFIED` |
| The device transport shown matches what the browser actually exposes, and the connect button is disabled with a named reason when it does not | `BROWSER_VERIFIED` |
| The diagnostics report states `Hardware validation: NONE` and the real `Web Serial` value | `BROWSER_VERIFIED` |
| A service worker activates and controls the page from the second navigation | `BROWSER_VERIFIED` |

**Not covered, by construction:** anything involving a device. No hardware is
attached, so no test here opens a port, identifies a device, writes a setting,
binds, flashes, or recovers. Every device path is exercised only up to the
point where a real port would be required.

## Recorded observation

Chromium 1194, `http://127.0.0.1:4173` (a trustworthy origin, so a secure
context):

```json
{"serial":true,"usb":true,"secure":true}
```

This is desktop Linux Chromium. It says nothing about Chrome for Android; see
[ANDROID.md](../ANDROID.md) for what is and is not known there.

## Run it the way CI does

`pnpm qa:browser` tests whatever is in `apps/web/dist`. In CI that is the real
GitHub Pages artifact, built with the commit SHA embedded as the build
identity. A local `pnpm build` leaves that identity unset, so the banner reads
`unpinned-development-build` and the acceptance panel's candidate SHA is empty.

That difference is not cosmetic. A 40-character hex run has no break
opportunity in it, and one shipped defect — the candidate SHA setting the
metadata grid's minimum width and pushing the whole panel past a 320px viewport
— was invisible against an unpinned build and only appeared in CI.

Before pushing, run:

```sh
pnpm qa:browser:pinned
```

which builds with the current commit SHA first, then runs the same suite. That
is the pre-push equivalent of the CI step.
