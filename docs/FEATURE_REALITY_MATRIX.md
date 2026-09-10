# Feature Reality Matrix

What each feature and each control actually is, verified against the shipped
entry point rather than against the presence of a file or a Mock test.

## Status vocabulary

Every claim in this repository uses exactly these levels. A claim never sits
above the evidence that supports it.

| Level | What it means | What produces it |
| --- | --- | --- |
| `IMPLEMENTED` | The code exists and is reachable from the shipped entry point. Nothing is claimed about running it. | Source plus the write-path and UI-honesty gates |
| `EMULATOR_VERIFIED` | Behaviour is proven against a stubbed transport in jsdom, or — for the Android host — on an emulator against a fake USB backend. | `pnpm test`; `gradle connectedDebugAndroidTest` |
| `RUNTIME_AVAILABLE` | The control was observed refused, and then observed becoming available once exactly the prerequisites the application names were satisfied — driven through the shipped entry point. | `pnpm check:availability` — see [RUNTIME_AVAILABILITY.md](RUNTIME_AVAILABILITY.md) |
| `BROWSER_VERIFIED` | Behaviour is proven in a real browser against the built application and its shipped headers. | `pnpm qa:browser` — see [browser QA](testing/browser-qa.md) |
| `HARDWARE_VERIFIED` | Behaviour is proven against a physical ExpressLRS device. | A recorded physical acceptance session |
| `UNSUPPORTED_WITH_EVIDENCE` | The path cannot work here, and the evidence for that is recorded. | A named, checkable observation |

**No row in this document is `HARDWARE_VERIFIED`.** No physical TX or RX has
been connected to this application. The term `FULLY FUNCTIONAL` is not used
anywhere, and must not be while that remains true.

## Controls

Every button in the shipped interface, what it actually does, and what proves
it. `scripts/check-ui-honesty.mjs` fails the build if a control appears in the
interface without a row here, if it renders without a handler, if its handler
does nothing, or if an Easy Mode operation hands off instead of completing.

### Product shell

| Control | Action | What it does | Level |
| --- | --- | --- | --- |
| Easy / Advanced mode | `setMode` | Switches which view renders the one shared device controller. The session, identity and write authority are not re-created. | `BROWSER_VERIFIED` |
| Arabic / English | `setLocale` | Switches the message catalog and the document direction. | `BROWSER_VERIFIED` |
| Copy the full commit | `copyFullSha` | Copies the build's full commit. The banner states the stage and the short commit; it gates nothing and disables nothing. | `EMULATOR_VERIFIED` |

### Easy Mode

| Control | Action | What it does | Level |
| --- | --- | --- | --- |
| Start an operation | `startOperation` | Selects binding, settings, or firmware and resets the step state. | `EMULATOR_VERIFIED` |
| Choose another operation | `setOperation` | Returns to the operation list, keeping the device session. | `EMULATOR_VERIFIED` |
| Identify my device | `identify` | Opens one CRSF session through the shared controller and reads the device's identity. Refused with a named reason when the browser exposes no serial transport. | `EMULATOR_VERIFIED` |
| Prepare the official source | `loadCatalog` | Loads the official ExpressLRS release index and Target catalog over HTTPS. | `EMULATOR_VERIFIED` |
| Prepare and verify the package | `buildFirmware` | Downloads the official artifacts, applies the options, and verifies every segment by SHA-256. The typed binding phrase is compiled in and then dropped from memory. | `EMULATOR_VERIFIED` |
| Download the recovery package | `downloadRecovery` | Writes the recovery archive to the operator's machine as a convenience second copy. The page cannot reopen a download, so this does **not** satisfy the firmware-write prerequisite. | `EMULATOR_VERIFIED` |
| Save the recovery package where it will survive | `exportDurableRecoveryPackage` | Writes the archive, with its provenance sidecar, to storage the operator owns — Android's Storage Access Framework or the File System Access API — then reopens it and hashes it. Only a matching digest satisfies the firmware-write prerequisite. | `EMULATOR_VERIFIED` |
| I already have a saved recovery package | `importDurableRecoveryPackage` | Opens a package saved earlier, validates it in full, and reconstitutes the checkpoint from its digest. Reads no application state, so it works on a fresh installation. | `EMULATOR_VERIFIED` |
| Put the device into bind mode | `runBinding` | Sends the bind command the device declares, watching link telemetry across the attempt, and grades the result. | `EMULATOR_VERIFIED` |
| The link came up / No link yet | `confirmBindObservation` | Records the operator's observation as `USER_CONFIRMED_LINK` or `COMMAND_ACKNOWLEDGED_ONLY`. Never shown as a verified success. | `EMULATOR_VERIFIED` |
| Apply the change | `runSettingsWrite` | Writes one declared setting and reports it applied only when the device reads the value back. | `EMULATOR_VERIFIED` |
| Write the firmware | `runFirmwareWrite` | Runs the whole update in Easy Mode: bootloader, write, reboot, reconnect, identity, Target and version. | `EMULATOR_VERIFIED` |
| Stop the current step | `cancelCurrentOperation` | Aborts the in-flight operation through its abort signal. | `EMULATOR_VERIFIED` |
| Copy technical details | `copyDetails` | Copies the model, firmware, hardware and confidence. Excludes the USB serial number. | `EMULATOR_VERIFIED` |
| Close the connection | `disconnectHardware`, `setStep`, `setConnectFailure` | Closes the port, revokes outstanding capabilities, clears the identity, and wipes typed secrets. | `EMULATOR_VERIFIED` |
| Open advanced mode | `onOpenAdvanced` | The one place Easy Mode opens the Advanced view, and never from an operation. | `BROWSER_VERIFIED` |

### Advanced Mode

| Control | Action | What it does | Level |
| --- | --- | --- | --- |
| Load the official catalog | `loadCatalog` | As above. | `EMULATOR_VERIFIED` |
| TX / RX role | `setRole`, `targetDefaults` | Selects the role and resets Target, method and regulatory choices. | `EMULATOR_VERIFIED` |
| Identify over CRSF | `connectHardware` | As Easy Mode's identify, on the same controller. | `EMULATOR_VERIFIED` |
| Close the session | `disconnectHardware` | As above. | `EMULATOR_VERIFIED` |
| Save with read-back | `writeSetting` | Requests a capability, writes one parameter, and rejects any value the device does not read back. | `EMULATOR_VERIFIED` |
| Restore the snapshot | `restoreSettings` | Requests a capability and restores each backed-up value with a read-back per parameter. | `EMULATOR_VERIFIED` |
| Run the real binding | `startBinding` | As Easy Mode's binding, on the same controller and the same evidence grading. | `EMULATOR_VERIFIED` |
| Build the official firmware | `buildFirmware` | As above. | `EMULATOR_VERIFIED` |
| Download the firmware | `downloadFirmware` | Hands the verified artifact to the operator; writes nothing to a device. | `EMULATOR_VERIFIED` |
| Download the recovery package | `downloadRecovery` | As above: a second copy, not the gate. | `EMULATOR_VERIFIED` |
| Save the recovery package to durable storage | `exportDurableRecoveryPackage` | As above. | `EMULATOR_VERIFIED` |
| Import a saved recovery package | `importDurableRecoveryPackage` | As above. | `EMULATOR_VERIFIED` |
| Download the Lua script | `downloadLuaScript` | Fetches the official Lua script for the selected release and Target. | `EMULATOR_VERIFIED` |
| Start the real flash | `flashPreparedFirmware` | The authorized firmware write, followed by reconnect and verification. Any failure leaves a recovery checkpoint. | `EMULATOR_VERIFIED` |
| Flash this receiver with transmitter firmware | `updateOption("rxAsTxMode", …)` | Upstream's `--rx-as-tx`. Selects the transmitter build for a receiver and rewrites its hardware layout for the chosen mode. Every mode stays visible; one the Target cannot take is closed with that Target's own reason. | `BROWSER_VERIFIED` |
| AirPort | `updateOption("airportEnabled", …)` | Upstream's `--airport-baud`. Writes `is-airport` so the device acts as a transparent serial bridge. Independent of the option above; neither derives from the other. | `BROWSER_VERIFIED` |
| Cancel the operation | `cancelCurrentOperation` | As above. | `EMULATOR_VERIFIED` |

### Every operation, end to end

Control → readiness → driver → write authority → verification → recovery, for
every operation the shipped application offers. Reachability of each driver
from `apps/web/src/main.tsx` is enforced by `pnpm check:reachability`.

That gate is static, and a static gate cannot settle the question that matters:
`disabled={expr}` looks dynamic and can still evaluate false forever.
[RUNTIME_AVAILABILITY.md](RUNTIME_AVAILABILITY.md) is the runtime half — every
operation below was driven through the shipped `ProductShell`, observed
refused, and then observed becoming available once its named prerequisites were
satisfied. `pnpm check:availability` fails the build if any operation never
opens, has no recorded row, or turns out to be gated on nothing.

| Operation | Control | Handler | Readiness gate (live prerequisites) | Driver | Write authority | Success requires | On failure |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Identify | Identify over CRSF | `connectHardware` | `connect` — idle, port cleanup proven | `serial.ts` → CRSF Device Info `0x29` | none (read) | A well-formed Device Info with a valid CRC. No identity is shown without one. | Port closed, no identity retained |
| Diagnostics | Show / copy / download | `captureDiagnostics` | `diagnostics` — always ready | none | none (read) | Not a write. Secrets redacted before the report leaves the page. | — |
| Settings write | Save with read-back | `writeSetting` | `settingsWrite` — idle, live identity, port clean, journal read, no open checkpoint, a writable parameter chosen | CRSF parameter write | single-use capability, 180 s TTL, bound to session + device fingerprint + operation | The device reads the value back and it matches exactly | Reported unapplied; the prior value stands |
| Settings restore | Restore the snapshot | `restoreSettings` | `settingsRestore` — as above, plus a backup exists | CRSF parameter write, per parameter | as above | Every restored parameter reads back | Named parameter reported; restore fails |
| Binding | Run the real binding | `startBinding` | `binding` — as settings, plus the operator's acknowledgement (`bindingPrerequisites` gates the acknowledgement itself) | CRSF command `0x32`, then Link Statistics `0x14` observation | as above | Never `VERIFIED_SUCCESS` from the command. Graded `COMMAND_ACKNOWLEDGED_ONLY` unless the operator confirms a live link → `USER_CONFIRMED_LINK` | Graded down, never up |
| Firmware write | Start the real flash | `flashPreparedFirmware` | `firmwareWrite` — idle, Target chosen, port clean, journal read, no open checkpoint, package built, recovery archive downloaded, power acknowledged, antenna acknowledged for a TX, Target confirmed where identity does not pin it, live identity for a UART write | esptool-js, STM32 DFU (WebUSB), XMODEM, or passthrough | as above | Reboot, reconnect, read identity, confirm Target, confirm version | Checkpoint kept at the reached stage; recovery offered |
| Receiver as transmitter | Mode selector, then the flash | `flashPreparedFirmware` with `rxAsTxMode` | `rxAsTx` — a Target upstream builds transmitter firmware for, in the chosen mode | the same flashers, against the `_TX` artifact | as above | Everything a firmware write requires, **and** the rebooted device's CRSF Device Info origin must be `0xEE` | `WRITE_COMPLETED_RECONNECT_UNVERIFIED`; checkpoint kept; the original receiver image is still restorable |
| AirPort | AirPort switch | `updateOption("airportEnabled", …)` | `airport` — a Target chosen | options block in the packaged firmware | via the firmware write it is part of | The packaged options block carries `is-airport`. Independent of the role. | as firmware write |
| Recovery | Restore from the package | `recoverFromCheckpoint` | `recovery` — idle, Target chosen, port clean, journal read, a package or an open checkpoint, power acknowledged | the same flashers | as above | Write, reboot, reconnect, read identity, confirm Target, confirm version, then clear the checkpoint | `RECOVERY_INCOMPLETE`; checkpoint kept for another attempt |
| Cancel | Cancel the operation | `cancelCurrentOperation` | available whenever an operation is in flight | the operation's `AbortSignal` | — | The in-flight operation stops and the port is released | Late results are quarantined, not applied |

### Diagnostics

| Control | Action | What it does | Level |
| --- | --- | --- | --- |
| Show the report | `show` | Renders the live snapshot as Markdown. | `BROWSER_VERIFIED` |
| Copy the report | `copy` | Copies the same Markdown to the clipboard. | `EMULATOR_VERIFIED` |
| Download JSON | `downloadJson` | Saves the snapshot as JSON with free text redacted. | `EMULATOR_VERIFIED` |
| Download Markdown | `downloadMarkdown` | Saves the same report as Markdown. | `EMULATOR_VERIFIED` |

### Physical acceptance recorder

| Control | Action | What it does | Level |
| --- | --- | --- | --- |
| Start a new session | `createNewSession` | Opens a recording session bound to the build SHA. | `EMULATOR_VERIFIED` |
| Capture the context | `captureCurrentContext` | Snapshots the live device and build context into the session. | `EMULATOR_VERIFIED` |
| Capture step evidence | `captureStepEvidence` | Records the operator's observation for one acceptance step. | `EMULATOR_VERIFIED` |
| Export JSON / Markdown | `exportJson`, `exportMarkdown` | Saves the session with secrets redacted. | `EMULATOR_VERIFIED` |
| Import a session | `click` | Opens the file picker for a previously exported session. | `EMULATOR_VERIFIED` |

## Features

Columns:

- **UI** — reachable in the shipped build (E = Easy Mode, A = Advanced).
- **Service** — a real implementation, not a simulation.
- **Adapter** — reaches real hardware transport.
- **Effect** — performs a real device side effect.
- **Verified** — the result is confirmed independently, not assumed.
- **Tests** — automated coverage exists.
- **Hardware** — proven on a physical device.

| Feature | UI | Service | Adapter | Effect | Verified | Tests | Hardware |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TX discovery | E + A | yes | Web Serial | read | CRSF Device Info | yes | NONE |
| RX discovery | E + A | yes | Web Serial | read | CRSF Device Info | yes | NONE |
| Identity read | E + A | yes | CRSF | read | ELRS marker required | yes | NONE |
| Re-verify after reconnect | A | yes | CRSF | read | identity compared | yes | NONE |
| Binding command | E + A | yes | CRSF | yes | link telemetry, else recorded as the operator's claim | yes | NONE |
| Binding phrase | E + A | yes | compiled into the package | yes | UID matches the ExpressLRS build flag; wiped after use | yes | NONE |
| Settings read | E + A | yes | CRSF | read | device-reported values | yes | NONE |
| Settings write | E + A | yes | CRSF | yes | independent read-back | yes | NONE |
| Essential settings subset | E | yes | CRSF | yes | independent read-back | yes | NONE |
| Settings restore | A | yes | CRSF | yes | read-back per parameter | yes | NONE |
| Firmware catalog | E + A | yes | HTTPS | read | trusted-origin + redirect check | yes | NONE |
| Target selection | E + A | yes | — | no | exact-key confirmation | yes | NONE |
| Firmware download | E + A | yes | HTTPS | no | hash + size + structure | yes | NONE |
| Firmware packaging | E + A | yes | — | no | per-segment SHA-256 | yes | NONE |
| Firmware validation | E + A | yes | — | no | target + version + artifact | yes | NONE |
| ESP flashing | E + A | yes | esptool-js | yes | reconnect + version check | yes | NONE |
| STM32 DFU | E + A | yes | WebUSB DFU | yes | reconnect + version check | yes | NONE |
| XMODEM / UART | E + A | yes | Web Serial | yes | reconnect + version check | yes | NONE |
| Passthrough (EdgeTX/Betaflight) | E + A | yes | Web Serial | yes | reconnect + version check | yes | NONE |
| Wi-Fi update | A | yes | handoff to device page | no direct write | device's own updater | yes | NONE |
| Recovery package | E + A | yes | — | no | SHA-256 vs checkpoint | yes | NONE |
| Recovery write | E + A | yes | UART / DFU / XMODEM | yes | checkpoint hash + target key; unread identity keeps `RECOVERY_INCOMPLETE` | yes | NONE |
| Post-write verification | E + A | yes | CRSF | read | target + firmware version | yes | NONE |
| Lua script download | A | yes | HTTPS | no | trusted origin | yes | NONE |
| Physical acceptance recorder | A | yes | — | no | operator-entered, SHA-bound | yes | NONE |
| Evidence export (JSON + Markdown) | A | yes | — | no | redaction applied | yes | NONE |
| Arabic (RTL) | E + A | yes | — | — | browser-verified | yes | NONE |
| English | E + A | yes | — | — | browser-verified | yes | NONE |
| PWA / offline shell | E + A | yes | Service Worker | — | browser-verified | yes | NONE |
| Diagnostics report | E + A | yes | — | no | redaction plus absent-by-construction secrets | yes | NONE |
| Device transport detection | E + A | yes | Web Serial / WebUSB probe | no | the APIs themselves | yes | NONE |
| Native bridge seam | E + A | web half only | injected host transport | n/a | shape validated before use; no host implements it | yes | NONE |
| Android (PWA on Chrome) | E + A | yes | Web Serial / WebUSB as the browser exposes them | same as desktop | diagnostics reports the real APIs; see [ANDROID.md](ANDROID.md) | yes | **UNVERIFIED** |

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

- A **bind command acknowledgement is not a bind.** Link telemetry from the
  device is the only machine evidence (`LINK_OBSERVED_BY_TELEMETRY`). Without
  it the operator is asked, and their answer is recorded as
  `USER_CONFIRMED_LINK` — never as a verified success.
- A **settings write is applied only when the device reads it back.** The
  session performs an independent read after the write and rejects a mismatch.
- A **flash is complete only after a physical reconnect** plus a Target match
  and a firmware version/commit match. Any failure writes a
  `RECOVERY_REQUIRED` checkpoint instead.
- A **recovery is complete only when the device is read back.** A recovery
  write that finishes without a readable identity restages the checkpoint to
  `RECOVERY_INCOMPLETE` and keeps it, so a second attempt stays possible.
