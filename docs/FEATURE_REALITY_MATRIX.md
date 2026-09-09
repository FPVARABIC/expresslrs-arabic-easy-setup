# Feature Reality Matrix

What each feature actually is, verified against the shipped entry point rather
than against the presence of a file or a Mock test.

Columns:

- **UI** — reachable in the shipped build (E = Easy Mode, A = Advanced).
- **Service** — a real implementation, not a simulation.
- **Adapter** — reaches real hardware transport.
- **Effect** — performs a real device side effect.
- **Verified** — the result is confirmed independently, not assumed.
- **Tests** — automated coverage exists.
- **Hardware** — proven on a physical device.

`NONE` in the Hardware column is the honest state of this whole table: no
physical TX or RX has been connected. Everything else is software evidence.

| Feature | UI | Service | Adapter | Effect | Verified | Tests | Hardware |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TX discovery | E + A | yes | Web Serial | read | CRSF Device Info | yes | NONE |
| RX discovery | E + A | yes | Web Serial | read | CRSF Device Info | yes | NONE |
| Identity read | E + A | yes | CRSF | read | ELRS marker required | yes | NONE |
| Re-verify after reconnect | A | yes | CRSF | read | identity compared | yes | NONE |
| Binding command | E + A | yes | CRSF | yes | operator-observed link | yes | NONE |
| Binding phrase | — | UID derivation only (`bind-phrase.ts`) | — | no | — | yes | NONE |
| Settings read | E + A | yes | CRSF | read | device-reported values | yes | NONE |
| Settings write | E + A | yes | CRSF | yes | independent read-back | yes | NONE |
| Essential settings subset | E | yes | CRSF | yes | independent read-back | yes | NONE |
| Settings restore | A | yes | CRSF | yes | read-back per parameter | yes | NONE |
| Firmware catalog | A | yes | HTTPS | read | trusted-origin + redirect check | yes | NONE |
| Target selection | A | yes | — | no | exact-key confirmation | yes | NONE |
| Firmware download | A | yes | HTTPS | no | hash + size + structure | yes | NONE |
| Firmware packaging | A | yes | — | no | per-segment SHA-256 | yes | NONE |
| Firmware validation | A | yes | — | no | target + version + artifact | yes | NONE |
| ESP flashing | A | yes | esptool-js | yes | reconnect + version check | yes | NONE |
| STM32 DFU | A | yes | WebUSB DFU | yes | reconnect + version check | yes | NONE |
| XMODEM / UART | A | yes | Web Serial | yes | reconnect + version check | yes | NONE |
| Passthrough (EdgeTX/Betaflight) | A | yes | Web Serial | yes | reconnect + version check | yes | NONE |
| Wi-Fi update | A | yes | handoff to device page | no direct write | device's own updater | yes | NONE |
| Recovery package | A | yes | — | no | SHA-256 vs checkpoint | yes | NONE |
| Recovery write | A | yes | UART / DFU / XMODEM | yes | checkpoint hash + target key | yes | NONE |
| Post-write verification | A | yes | CRSF | read | target + firmware version | yes | NONE |
| Lua script download | A | yes | HTTPS | no | trusted origin | yes | NONE |
| Physical acceptance recorder | A | yes | — | no | operator-entered, SHA-bound | yes | NONE |
| Evidence export (JSON + Markdown) | A | yes | — | no | redaction applied | yes | NONE |
| Arabic (RTL) | E + A | yes | — | — | browser-verified | yes | NONE |
| English | E + A | yes | — | — | browser-verified | yes | NONE |
| PWA / offline shell | E + A | yes | Service Worker | — | browser-verified | yes | NONE |
| Android | layout only | — | — | — | viewport only | no | **UNVERIFIED** |

## Features that are deliberately not in the shipped product

These exist in the repository but are not reachable from the entry point, and
must not be described as product features. See
[ADR-0022](adr/ADR-0022-single-product-architecture.md).

| Item | Why |
| --- | --- |
| `packages/workflows`, `device`, `compatibility`, `diagnostics` | Abstract model with no transport; superseded by the real device layer |
| `packages/platform-mock` | Mock devices; must never reach production, and does not |
| `packages/platform-browser` local HTTP discovery | Plain HTTP, blocked as mixed content from an HTTPS deployment; two of its three origins are also invalid CSP sources |
| `apps/web/src/App.tsx` and `view-model/` | Built on Mock scenarios; would present simulated results as device results |
| Dedicated diagnostics panel | Not shipped. Operation status messages and the acceptance recorder cover this today |

## How a device write is authorized

There is no project-phase lock. `apps/web/src/hardware/write-authority.ts`
issues a single-use capability bound to one session, one device fingerprint,
and one operation, with a TTL. A refusal names the missing condition:

`NO_DEVICE_SESSION`, `IDENTITY_UNCONFIRMED`, `PORT_CLEANUP_UNCONFIRMED`,
`OPERATION_IN_PROGRESS`, `RECOVERY_JOURNAL_UNREADABLE`,
`PENDING_RECOVERY_CHECKPOINT`, `NO_PENDING_RECOVERY`, `TARGET_NOT_MATCHED`,
`BAND_NOT_MATCHED`, `ARTIFACT_NOT_VERIFIED`, `RECOVERY_NOT_AVAILABLE`,
`BENCH_NOT_ACKNOWLEDGED`, `USER_CONFIRMATION_MISSING`.

Recovery is the deliberate exception: it requires the pending checkpoint and an
operator-confirmed Target rather than a live identity, because it runs on a
device that may no longer answer CRSF. A normal write is refused while a
checkpoint is pending.

`scripts/check-write-path-integrity.mjs` fails the build if a flasher becomes
reachable outside the reviewed boundary, if the boundary stops requesting and
consuming a capability, if a phase lock reappears, or if any shipped button
renders without a handler.

## What "success" means here

- A **bind command acknowledgement is not a bind.** Easy Mode asks the operator
  to observe the other side; only an observed link is recorded as successful.
- A **settings write is applied only when the device reads it back.** The
  session performs an independent read after the write and rejects a mismatch.
- A **flash is complete only after a physical reconnect** plus a Target match
  and a firmware version/commit match. Any failure writes a
  `RECOVERY_REQUIRED` checkpoint instead.
