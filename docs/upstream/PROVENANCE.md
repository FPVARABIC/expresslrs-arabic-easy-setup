# Upstream provenance

Which upstream revision each thing comes from, and where two of them are not
the same revision.

## What the two SHAs are

Both appear in [`baseline.md`](baseline.md) and they are not interchangeable.

| SHA | What it is | Date | Tag |
| --- | --- | --- | --- |
| `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6` | **The `4.1.0` release.** `git rev-list -n1 4.1.0` resolves to exactly this commit. | 2026-07-14 | `4.1.0` |
| `73ce820ba51437f73f31686233b607c58e188e7b` | **The tip of `master` when the baseline was captured** — post-4.1.0 development, subject "Merge pull request #3697 from pkendall64/4.2/lr2021". Not a release. | 2026-08-20 | none |

Earlier reports cited `73ce820b` for behaviour without saying it was a
development snapshot rather than the release. That was ambiguous, and this
table replaces it.

### Does the difference change anything we rely on?

Checked file by file, not assumed:

| File | `4.1.0` vs `master` |
| --- | --- |
| `src/include/crsf_protocol.h` | identical blob |
| `src/lib/CrsfProtocol/CRSFEndpoint.cpp` | identical blob |
| `src/lib/CrsfProtocol/CRSFRouter.cpp` | identical blob |
| `src/lib/rx-crsf/RXEndpoint.cpp` | identical blob |
| `src/lib/tx-crsf/TXModuleEndpoint.h` | identical blob |
| `src/python/binary_configurator.py` | differs, **but not in the rx-as-tx gate** |
| `src/python/UnifiedConfiguration.py` | differs, **but not in the rx-as-tx layout rewrite** |

So every fact this application depends on holds at both revisions. Only the
line numbers move:

| Behaviour | at `4.1.0` | at `master` |
| --- | --- | --- |
| rx-as-tx platform gate and `_RX` → `_TX` swap | `binary_configurator.py:229-235` | `:237-243` |
| rx-as-tx layout rewrite | `UnifiedConfiguration.py:53-61` | `:59-67` |
| `is-airport` set from `--airport-baud` only | `binary_configurator.py` (same hunk) | `:89-94` |
| CRSF endpoint addresses | `crsf_protocol.h` (identical) | identical |

## Reference sources — read, never shipped

These are read to establish correct behaviour. No byte of them reaches a
device; they are not dependencies.

| Repository | Purpose | Revision | Release |
| --- | --- | --- | --- |
| `ExpressLRS/ExpressLRS` | Firmware and CRSF protocol semantics | `73ce820ba51437f73f31686233b607c58e188e7b` | also read at `a9d4a9cb…` = `4.1.0` |
| `ExpressLRS/ExpressLRS-Configurator` | Cross-check of the rx-as-tx per-platform mode lists and artifact swap | `421d656f1987117e37472979444cee464e3fcdef` | `1.8.3` at the same SHA |
| `ExpressLRS/web-flasher` | Browser flasher architecture | `4125a4e07d37ce1e872bb562ebd4286e6fd143f9` | none selected; reuse blocked pending a license answer |

### Files read for the flash-path parity audit

Every bootloader-entry, rate and block-size rule in `passthrough.ts`,
`esp-flasher.ts` and `useDeviceController.ts` cites one of these, read at the
pinned revision rather than from memory.

| Repository @ revision | File | What it settles |
| --- | --- | --- |
| `ExpressLRS/web-flasher` @ `4125a4e0…` | `src/js/espflasher.js` | Rates per path (betaflight 420000, etx 230400, passthru 230400, uart 460800 with 115200 ROM rate on ESP32), `no_reset` after passthrough, `ESP_RAM_BLOCK = 0x800`, `FLASH_WRITE_SIZE = 0x800` for etx/betaflight, the `bl` fallback for a non-ESP32 receiver on UART |
| `ExpressLRS/web-flasher` @ `4125a4e0…` | `src/js/passthrough.js` | `reset_to_bootloader()`: `07 07 12 20`, 32 × `0x55`, 200 ms, `[EC 04 32 'b' 'l' crc]`, target-line comparison, `MismatchError` |
| `ExpressLRS/web-flasher` @ `4125a4e0…` | `src/js/xmodem.js` | STM32 behind a flight controller: `CCC` detection, `hold down button` → `bbbbbb`, the `_RX_` target check |
| `ExpressLRS/ExpressLRS` @ `a9d4a9cb…` (4.1.0) | `src/lib/rx-crsf/RXEndpoint.cpp` | `handleRaw`: the `bl` frame is matched on `frame_size >= 4` and the first two payload bytes |
| `ExpressLRS/ExpressLRS` @ `a9d4a9cb…` | `src/src/rx_main.cpp` | `reset_into_bootloader()`: prints `&target_name[4]`, ESP8285 reboots into UART download mode, ESP32 enters `serialUpdate` |
| `ExpressLRS/ExpressLRS` @ `a9d4a9cb…` | `src/lib/SerialUpdate/devSerialUpdate.cpp` | The ESP32 `serialUpdate` state stops the radio and runs the upload stub on the serial port |
| `ExpressLRS/ExpressLRS` @ `a9d4a9cb…` | `src/lib/tx-crsf/TXModuleParameters.cpp` | The complete list of transmitter Lua commands: Bind, Enable WiFi, Enable Rx WiFi, Enable Backpack WiFi, Enable VRx WiFi, BLE Joystick, Send VTx — no serial-update or bootloader command exists |
| `ExpressLRS/ExpressLRS` @ `a9d4a9cb…` | `src/lib/rx-crsf/RXParameters.cpp` | The receiver's Lua parameters, including the `version_domain` info entry |
| `ExpressLRS/ExpressLRS` @ `a9d4a9cb…` | `src/lib/FHSS/FHSS.cpp` | The regulatory-domain names (`AU915 FCC915 EU868 IN866 AU433 EU433 US433 US433W ISM2G4 CE_LBT`) and `addDomainInfo()`, which appends them to the version string the device reports |

### Files read for the write-route audit

The ST-Link route, the XMODEM trailer and retransmission rules, the Betaflight
sanity checks, the STM32 buzzer options and the `prior_target_name` handling in
`stm32-stlink.ts`, `xmodem.ts`, `passthrough.ts`, `buzzer-melody.ts`,
`firmware-package.ts` and `useDeviceController.ts` cite these. Each saved copy
was compared byte-for-byte against the revision named before this table was
written.

| Repository @ revision | File | What it settles |
| --- | --- | --- |
| `ExpressLRS/web-flasher` @ `4125a4e0…` | `src/js/stlink.js`, `src/pages/STLinkFlash.vue` | The `stlink` upload method is a WebUSB ST-Link probe over SWD, not a DFU device: `detect_cpu(config.stlink.cpus)` must name the connected part, the core is halted, and only the application image is written at `flash_start + stlink.offset`; a bootloader argument exists but the page never passes one |
| `ExpressLRS/web-flasher` @ `4125a4e0…` | `src/js/stlink/webstlink.js`, `src/js/stlink/lib/stlinkv2.js`, `src/js/stlink/lib/stlinkusb.js` | The probe protocol — `GET_VERSION` (JTAG firmware below 21 refused), leaving DFU/DEBUG/SWIM mode, the target voltage, `SWD_SET_FREQ`, entering SWD, `READCOREID`, the debug-register and memory commands in 16-byte packets — and the V2 (`0x3748`) / V2-1 (`0x374B`) endpoints; `flash()` calls `flash_write(addr, data, {erase: true, verify: true})`, so every written block is read back and compared, and the core is left halted afterwards |
| `ExpressLRS/web-flasher` @ `4125a4e0…` | `src/js/stlink/lib/stm32.js`, `src/js/stlink/lib/stm32fp.js`, `src/js/stlink/lib/stm32devices.js` | CPUID part numbers, the F0/F1/F3 flash registers and unlock keys, page erase, the on-core halfword writer loaded at `0x20000000`, the read-back verify, and the device table (`dev_id` → family, page size, flash-size register) |
| `ExpressLRS/web-flasher` @ `4125a4e0…` | `src/js/xmodem.js` | The receiver chooses the trailer: `C` selects CRC-16 (133-byte frames), `NAK` selects the 8-bit checksum (132-byte frames); a block is re-sent unchanged after a `NAK` or silence; `EOT` is repeated until acknowledged; `CAN CAN` cancels |
| `ExpressLRS/web-flasher` @ `4125a4e0…` | `src/js/passthrough.js` | `betaflight()`: before `serialpassthrough`, `get serialrx_provider` must answer `CRSF` or `ELRS`, `get serialrx_inverted` must be `OFF`, and `get serialrx_halfduplex` must be `OFF` or `AUTO`; when the provider check fails, `get rx_spi_protocol` = `EXPRESSLRS` identifies an SPI receiver, which cannot be flashed this way |
| `ExpressLRS/web-flasher` @ `4125a4e0…` | `src/js/configure.js`, `src/js/firmware.js`, `src/pages/TransmitterOptions.vue` | `#patch_buzzer`: the buzzer mode and melody are appended to the STM32 transmitter options only for Targets whose `features` include `buzzer`; the page offers quiet, one beep, the beep tune, the default tune and a custom melody |
| `ExpressLRS/ExpressLRS` @ `41daca2a…` (3.4.3) | `src/lib/OPTIONS/options.h`, `src/lib/OPTIONS/options.cpp` | The STM32 options struct: magic, version, domain, `hasUID`, `uid[6]`, `flash_discriminator`, then for a transmitter `tlm_report`, `fan_min_runtime`, the flags byte (`uart_inverted`, `unlock_higher_power`) and, under `#if GPIO_PIN_BUZZER`, the `buzzer_mode` byte and `buzzer_melody[32][2]`; the enum `buzzerQuiet = 0`, `buzzerOne = 1`, `buzzerTune = 2` |
| `ExpressLRS/ExpressLRS` @ `41daca2a…` (3.4.3) and `40555e14…` (3.5.3) | `src/python/binary_configurator.py` | `patch_buzzer`: the mode byte then 32 little-endian `(note, duration)` pairs; from 3.5 `fan_min_runtime` precedes the transmitter fields; `prior_target_name` feeds only `args.accept` for the Wi-Fi upload, never a byte of the binary |
| `ExpressLRS/ExpressLRS` @ `41daca2a…` (3.4.3) | `src/python/melodyparser.py`, `src/python/external/rtttl.py` | The two melody notations: `notes\|bpm\|transpose` with the key-number formula and `P<length>` pauses, and RTTTL with dotted notes; unknown tokens are skipped or read as pauses |
| `ExpressLRS/ExpressLRS` @ `a9d4a9cb…` (4.1.0) | `src/lib/WIFI/devWIFI.cpp` | The Wi-Fi updater scans the uploaded image for the device's own `target_name`; if it is absent it names the Target it found and asks for *Flash Anyway* (`force`), which is what `--accept` automates for a device still reporting its `prior_target_name`. The firmware itself never reads `prior_target_name` |

## Runtime sources — what actually reaches a device

Everything is fetched from the official Web Flasher mirror:

```
https://expresslrs.github.io/web-flasher/assets/firmware
```

**These are scoped to the release the operator selected** (`<revision>` is that
release's revision), so a firmware image and its boot assets always come from
one release together:

| Artifact | Path |
| --- | --- |
| Application image | `/<revision>/<FCC\|LBT>/<firmware>/firmware.bin` |
| ESP32 bootloader | `/<revision>/<FCC\|LBT>/<firmware>/bootloader.bin` |
| ESP32 partitions | `/<revision>/<FCC\|LBT>/<firmware>/partitions.bin` |
| ESP32 boot_app0 | `/<revision>/<FCC\|LBT>/<firmware>/boot_app0.bin` |

**These are not release-scoped.** The mirror publishes one current set:

| Artifact | Path | Consequence |
| --- | --- | --- |
| Target catalog | `/hardware/targets.json` | The Target list describes the mirror's current hardware set, not the selected release |
| Hardware layout | `/hardware/<RX\|TX>/<layout_file>` | The pin map appended to a firmware image is the mirror's current one |
| Logo | `/hardware/logo/<logo_file>` | Cosmetic |

### Determinism: the pack, not the mirror

Earlier revisions of this document argued that combining a release-pinned
firmware image with a mirror-current hardware layout was acceptable because
upstream's own flasher does the same. That argument is withdrawn. What upstream
tolerates for a one-shot flash is not good enough here: this application also
*recovers* devices, and a recovery archive is worth nothing unless the image it
restores is byte-identical to the image it saved. "It matched when you saved it"
is not a property you can rely on if the layout can change underneath you.

So the hardware layouts, the target catalog and the logos are no longer fetched
at all. They are frozen into the build from an immutable Targets commit,
hashed, and verified against a manifest before use:

| Manifest field | What it pins |
| --- | --- |
| `packVersion`, `createdAt` | This pack's identity |
| `provenance.claim` | `NOT_THE_RELEASE_SNAPSHOT`, with the reason |
| `validatedReleases` | The ExpressLRS releases this pack was exercised against |
| `targetsRepository.sha` | The immutable `ExpressLRS/targets` commit |
| `targetsJsonSha256` | The catalog's exact bytes |
| `layoutArchiveSha256`, `layoutSha256` | Every layout, individually and as a set |
| `logoArchiveSha256`, `logoSha256` | Every logo, individually and as a set |

**Why the pack cannot claim to be 4.1.0's own snapshot.** It is not one, and
nobody could build one: `.github/workflows/build.yml` at tag `4.1.0` checks out
`ExpressLRS/targets` with **no `ref:`**, so the release consumed whatever the
default branch tip was when the job ran and recorded it nowhere. The manifest
says exactly this in `provenance.reason` rather than implying a fidelity it
does not have.

**What happens on a mismatch.** An explicit `TargetPackIntegrityError` naming
the file and both digests. There is deliberately no fallback to the live
mirror: reaching for it would restore precisely the nondeterminism the pack
removes.

**What happens for a Target the pack does not carry.** It stays visible in the
catalog and says it is newer than the validated pack, naming the pack version
and the Targets commit. It is never hidden and never described as blocked by a
build stage — validating a new pack makes it work, and the message says so.

**Updating.** A catalog update means regenerating the pack
(`scripts/build-target-pack.mjs --targets <checkout> --sha <40-hex>`), which
produces a new `packVersion` with fresh digests. There is no in-place edit.

**Offline.** Because the pack is in the bundle, a previously verified pack keeps
working with no network at all.

## Integrity

Every artifact that reaches a device is hashed, and the hashes are recorded:

| Where | What |
| --- | --- |
| `FirmwareSegment.sha256` | SHA-256 of every segment's final bytes, after the options block, hardware layout and logo are appended |
| Recovery manifest | The same per-segment name, address and SHA-256, written into the recovery archive |
| Recovery validation | A restore recomputes and compares before writing; a mismatched archive is refused |
| `capture-upstream-manifest.mjs` | SHA-256 of `index.json` and `targets.json` as CI serves them, plus per-platform Target counts, uploaded as a CI artifact so upstream drift is visible |

The per-artifact hashes for a specific run are not listed here because they are
per-release and per-Target: they are produced at build time and recorded in the
recovery manifest and the diagnostics report for the exact package an operator
built. This environment cannot fetch them — its egress gateway answers
`403 CONNECT` for `expresslrs.github.io` — so the `upstream-live` CI workflow
captures them instead.
