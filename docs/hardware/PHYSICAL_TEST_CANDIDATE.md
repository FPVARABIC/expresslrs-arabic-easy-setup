# Physical test candidate

This is the build to run on a bench, and the exact order to run it in. Nothing
here has been executed on hardware; every row starts at `NOT_RUN`.

## Preparing the candidate

```bash
pnpm install --frozen-lockfile
pnpm check                     # every gate, including the interface-honesty gate
pnpm --filter @elrs-easy/web build
pnpm qa:browser                # six browser checks against the built app
pnpm serve:built               # http://127.0.0.1:4173
```

`pnpm serve:built` is the one to open in the browser. It serves
`apps/web/dist` **with the headers that actually ship**, which `vite dev` and
`vite preview` do not, so the bench session runs under the real
Content-Security-Policy and Permissions-Policy. `http://127.0.0.1` is a
trustworthy origin, so Web Serial and WebUSB are available there without a
certificate.

To pin the candidate's identity into the build, so the acceptance record names
one immutable commit:

```bash
VITE_BUILD_SHA=$(git rev-parse HEAD) pnpm --filter @elrs-easy/web build
```

The diagnostics report then carries that SHA instead of
`unpinned-development-build`.

## Before touching a device

| Check | Why |
| --- | --- |
| A desktop Chrome, Edge or Opera | Web Serial exists nowhere else today |
| Diagnostics report shows `Web Serial: true` | Proves the transport before a device is blamed for a browser limit |
| A powered bench supply that will not drop | A write interrupted by power loss is the case recovery exists for |
| The transmitter's antenna fitted | Never transmit into an open connector |
| Somewhere to save the recovery package | It is downloaded before the write and is the only way back |

## The order

Read-only first, then reversible, then RF, then destructive. Every step stops
on its first failure; do not carry on to a firmware write with an unexplained
result behind you.

| # | Step | Risk | Stop if |
| --- | --- | --- | --- |
| 1 | Identify the TX over USB | read-only | The identity is not `CONFIRMED` |
| 2 | Identify the RX over USB | read-only | The identity is not `CONFIRMED` |
| 3 | Disconnect and re-identify | read-only | The second read disagrees with the first |
| 4 | Change one essential setting, then change it back | reversible | The read-back does not match |
| 5 | Restore the settings snapshot | reversible | Any parameter fails its read-back |
| 6 | Bind, with the receiver powered and in range | RF | Both sides are quiet after two attempts |
| 7 | Prepare a firmware package for the matched Target | none | The Target confidence is not `EXACT` and the key cannot be confirmed |
| 8 | Download and save the recovery package | none | The file is not on disk |
| 9 | Flash the same version already on the device | **destructive** | Anything at all — go to step 10 |
| 10 | Recovery drill: restore from the saved package | **destructive** | — |

Step 9 deliberately flashes the version the device already runs. It exercises
the whole write path with the smallest possible change in outcome, and makes
the post-write version check meaningful without leaving the device on
different firmware.

## Recording the result

The Advanced view carries the acceptance recorder. For each step it stores the
status, the operator's evidence, and the build SHA, and exports JSON and
Markdown with secrets redacted. Export after the session and attach it to the
pull request; that export, not a summary, is what moves a row in the
[Feature Reality Matrix](../FEATURE_REALITY_MATRIX.md) to `HARDWARE_VERIFIED`.

If anything fails, export the [diagnostics report](../../apps/web/src/diagnostics/diagnostics.ts)
as well. It carries the browser's capabilities, what the device reported, the
package hashes, and the recovery checkpoint stage — and it never carries the
binding phrase, the derived UID, Wi-Fi credentials, or the USB serial number.
