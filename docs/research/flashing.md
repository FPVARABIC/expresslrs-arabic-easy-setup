# Flashing and Update Trace

Baseline sources: ExpressLRS 4.1.0, Configurator 1.8.3, and Web Flasher at their pinned SHAs.

## Provider inventory

| Provider/path | Typical device | Entry point | Identity/safety evidence | Completion signal | Current verification gap |
| --- | --- | --- | --- | --- | --- |
| Device-hosted Wi-Fi OTA | ESP TX/RX | HTTP `POST /update` | Running target string is searched in an uncompressed image; compressed path is not an independent target guarantee | Updater accepts image and schedules reboot | Must pre-validate artifact, reconnect, and read expected target/version/config |
| Direct UART / ESP bootloader | ESP TX/RX | esptool over serial | MCU family; selected target metadata | Bootloader write/MD5 protocol completes and resets | MCU is not exact board; must reconnect/read Firmware identity |
| Betaflight passthrough | UART RX through FC | Configure serial RX, request bootloader, then ESP/XMODEM write | Receiver bootloader may report current target and compare it | Passthrough plus write protocol completes | Need device/FC reconnect and expected Firmware identity |
| EdgeTX passthrough | TX module/backpack | CRSF/serial passthrough then ESP write | Selected route + MCU, limited product proof | Write/reset completes | Need TX Firmware reconnect/version check |
| XMODEM bootloader | STM32/legacy RX families | Serial bootloader protocol | Bootloader can report target in supported flows | ACK/EOT completion | Need post-reboot identity/link verification |
| STLink via WebUSB/native | STM32 | Debug probe attach, CPU detect, flash offset | CPU/flash geometry plus target metadata | Flash API completes | CPU does not prove product; must verify running Firmware |
| Download/external tool | Unsupported browser/provider | Emit prepared artifact | Artifact provenance only | User reports external result | Must guide independent post-operation verification |

`ExpressLRS/Targets` metadata lists the allowed methods per product. At the inspected snapshot, common values include `uart`, `wifi`, `betaflight`, `etx`, `stlink`, `stock`, and `dfu`. These are candidate capabilities, not proof that a given browser/device combination has been validated by our product.

## Official source traces

### Wi-Fi OTA

`src/lib/WIFI/devWIFI.cpp` exposes `/update`. The upload handler:

1. initializes the platform updater with the declared size;
2. scans incoming bytes for the currently running target identifier;
3. returns a mismatch unless forced/confirmed when the identifier is absent;
4. finalizes the updater and schedules reboot when accepted.

The device Web UI also exposes `/config`, which provides target, version, commit, product, TX/RX, radio, and band information suitable for post-reboot verification.

Important limitation: upstream supports force/confirm paths. Easy Mode must fail closed on mismatch and cannot translate “uploaded bytes accepted” into Success.

In the inspected handler, an upload beginning with gzip magic (`0x1F`) marks the target as seen at this layer rather than scanning the decompressed target marker. Our Artifact Validator must therefore identify and validate the uncompressed payload independently before upload. Device-side target checking is defense-in-depth, not the primary compatibility decision.

[ADR-0017](../adr/ADR-0017-bounded-synthetic-gzip-and-executable-identity.md)
now proves that ordering against a deliberately non-writable Synthetic format:
verify the compressed digest, stream into strict output bounds, verify the
decompressed digest, parse executable identity, then require the embedded Target
to match. It does not yet parse an ExpressLRS image or authorize `/update`.

### Configurator/native paths

`src/python/binary_flash.py` dispatches by device type, MCU, and selected upload method. It uses Wi-Fi upload, direct ESP UART, Betaflight passthrough, EdgeTX passthrough, or output-directory paths. `BFinitPassthrough.py` can compare a receiver-reported target but also contains force/interactive override paths.

Configurator separates these mechanisms behind `FlashingStrategy` and parses progress/log output. This separation is reusable as an architecture concept; the Electron/Python implementation is not a browser-neutral Core.

### Browser paths

The inspected Web Flasher uses:

- `navigator.serial.requestPort()` for ESP serial, passthrough, and XMODEM;
- `navigator.usb.requestDevice()` for STLink;
- `esptool-js` for ESP write/reset;
- a target-string check for supported XMODEM receiver bootloaders;
- an MCU-family check for ESP.

Its `SerialFlash.vue` marks the workflow complete after the write promise resolves and the connection closes. No post-reboot reconnect/read-version step appears in that flow. The inspected passthrough path can also continue when a target response is blank, and mismatch UI can offer “Flash Anyway.” Therefore we may study the mechanism, but our Update Workflow requires fail-closed identity plus an additional verification state.

Provider completion must be normalized as `WRITE_COMPLETED`, never product `SUCCESS`.

## Required state machine

```text
IDLE
→ IDENTIFYING
→ RESOLVING_TARGET
→ VALIDATING_ARTIFACT
→ CHECKING_COMPATIBILITY
→ WAITING_FOR_CONFIRMATION
→ PREPARING_PROVIDER
→ TRANSFERRING
→ WRITING
→ FINALIZING
→ REBOOTING
→ RECONNECTING
→ VERIFYING
→ SUCCESS
```

Terminal/non-success states are `FAILED`, `CANCELLED`, `RECOVERY_REQUIRED`, and `UNKNOWN_STATE`. Only `VERIFYING → SUCCESS` is legal.

## Pre-flash gate

All must be true:

- device identity confidence satisfies the selected provider policy;
- target/MCU/TX-RX/band cross-checks agree;
- version transition is supported;
- artifact source, format, target, size, and SHA-256 are valid;
- required permissions and device state are available;
- operation preview is shown and intent confirmed;
- recovery instructions exist for this target/provider.

## Progress semantics

Use real stages and provider-reported bytes/blocks when available. Never turn elapsed time into a false percentage. A provider may report:

- indeterminate `PREPARING` or erase;
- byte/block transfer count;
- write finalization;
- reboot timeout;
- reconnect attempts;
- verification checks.

## Post-flash verification

Minimum when technically available:

1. Observe expected disconnect/reboot.
2. Reconnect to the same logical device with a bounded timeout.
3. Read runtime target, product, TX/RX, version, and commit/provenance fields.
4. Cross-check expected configuration, radio/band, and artifact identity.
5. For a binding-related update, run an actual connection/link check separately.

If the platform cannot read those facts, the result must be `RECOVERY_REQUIRED` or a precisely labeled lower assurance outcome—not Stable `SUCCESS`.

## Interruption matrix requiring hardware tests

| Interruption | Expected classification before tests |
| --- | --- |
| Cable removed before write begins | Safe to retry only after re-identification |
| Cable removed during erase/write | `UNKNOWN_STATE` / `RECOVERY_REQUIRED` |
| Browser/tab closes during write | `UNKNOWN_STATE`; inspect device on return |
| Wi-Fi drops before final response | Do not infer failure or success; reconnect and read identity |
| Device reboots earlier than expected | Re-identify and verify; otherwise Recovery Required |
| Phone sleeps/backgrounds app | Platform-specific unknown until Android/mobile spike |

These classifications are conservative placeholders; each provider/target family needs bench evidence.
