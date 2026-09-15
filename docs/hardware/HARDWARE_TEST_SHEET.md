# Hardware test sheet

One sheet. Every row is `HARDWARE_UNVERIFIED` until a person runs it on a
device and records what they saw. No software result promotes any row.

## Before anything is written

Do not flash anything until all of these are known and written down. This is a
safety precondition for a destructive operation, not a feature gate — every
control in the application is available now.

| Needed | Value |
| --- | --- |
| TX model | |
| RX model | |
| Band (2.4 GHz / 900 MHz / dual) | |
| Regulatory region (FCC / LBT) | |
| Official Target for each | |
| Current firmware version on each | |
| Recovery archive downloaded and stored off the device | |
| Spare receiver available for the destructive rows | |

## Bench safety

- Minimum RF power for every transmitting row.
- TX antenna fitted before the module is ever powered.
- **No propellers.** Nothing that can spin is connected.
- Stable supply that will not brown out mid-write.
- The RX under test is the only receiver bound to the TX under test.

## Rows

Risk: R read-only · W reversible write · RF transmits · F flash · X destructive.

| # | Risk | Test | Pass means | State |
| --- | --- | --- | --- | --- |
| H1 | R | Identify a TX over CRSF | Device Info with a valid CRC; product, firmware, hardware version and parameter count shown | UNVERIFIED |
| H2 | R | Identify an RX over CRSF | as H1 | UNVERIFIED |
| H3 | R | Wrong port rejected | A joystick or non-CRSF port yields a named failure and leaves no port held | UNVERIFIED |
| H4 | R | Wrong role rejected | Selecting RX for a TX stops the session closed, with a role-mismatch reason | UNVERIFIED |
| H5 | R | Identity stable across a reconnect | Same role, product, hardware version after unplug and replug | UNVERIFIED |
| H6 | W | Settings backup created | A backup tied to the device identity, with no hidden or sensitive fields | UNVERIFIED |
| H7 | W | Reversible setting write and read-back | The value read after the write equals the value requested, exactly | UNVERIFIED |
| H8 | W | Original setting restored | Every restored value reads back; no parameter missing | UNVERIFIED |
| H9 | RF | Binding command acknowledged on TX | A CRSF acknowledgement only. **No RF claim from this row.** | UNVERIFIED |
| H10 | RF | Binding command sent to RX | Command type and any response recorded, without assuming a link | UNVERIFIED |
| H11 | RF | Link observed from both ends | Independent evidence at TX *and* RX — telemetry returning, or both indicators. A bind acknowledgement alone fails this row. | UNVERIFIED |
| H12 | F | Package built and verified | Target, release, method, and every segment name, address and SHA-256 recorded; recovery archive downloaded | UNVERIFIED |
| H13 | F | Bootloader entered | The tool names the correct chip, Target, DFU interface, or ST-Link probe and MCU part **before** any erase | UNVERIFIED |
| H14 | F | Normal flash with the route's own verification | Erase and write complete, and the completion text names the evidence of the route used — ESP: the chip computed the MD5 of every written region and it matched the image; ST-Link and DFU: every block read back and compared; STM32 XMODEM behind a flight controller: every frame acknowledged by the bootloader, **nothing read back**. Record the sentence shown. A completion text claiming a read-back on the XMODEM route fails this row | UNVERIFIED |
| H15 | F | Reboot, Target, version and domain verified | The same identity returns, reporting the expected release, and the regulatory domain matches the Target's band when the device publishes one. The completion text says compiled-in options are **not** read back — each option you set (binding phrase, Wi-Fi, buzzer…) is proven only by its own effect, at stage 10 or in a settings read | UNVERIFIED |
| H16 | X | Interrupted write and recovery | Interrupt during WRITING; `RECOVERY_REQUIRED` appears; recovery restores the original and the identity and version return. **Spare device only.** | UNVERIFIED |
| H17 | X | ESP32 RX-as-TX, **internal** | See the functional TX test below | UNVERIFIED |
| H18 | X | ESP32 RX-as-TX, **external** | See the functional TX test below | UNVERIFIED |
| H19 | X | ESP8285 RX-as-TX, **internal** | See the functional TX test below | UNVERIFIED |
| H20 | R | ESP8285 RX-as-TX, **external** is refused | The application refuses it, naming the Target and platform — ESP8285 has one UART | UNVERIFIED |
| H21 | R | STM32 RX-as-TX is refused | Refused for both modes, naming the Target and platform | UNVERIFIED |
| H22 | X | Recovery from RX-as-TX | The recovery archive restores the **original receiver firmware**; the device returns to reporting a receiver role | UNVERIFIED |
| H23 | W | AirPort enabled **with rx-as-tx off** | `is-airport` takes effect; the device is still a receiver | UNVERIFIED |
| H24 | W | AirPort disabled **with rx-as-tx on** | The role changed; AirPort is not enabled | UNVERIFIED |
| H25 | — | Android OTG | Every row in [ANDROID.md](../ANDROID.md#still-open--needs-a-physical-android-device) A1–A19 | UNVERIFIED |
| W1 | R | Betaflight `serialrx_*` sanity check | Behind a flight controller whose `serialrx_provider` is not CRSF/ELRS, or whose `serialrx_inverted` is ON, or whose `serialrx_halfduplex` is ON, the write is refused **before** `serialpassthrough`, naming the setting and the value read. Nothing is written; the CLI is left | UNVERIFIED |
| W2 | F | ST-Link route over SWD | The probe's firmware version and the target voltage are shown; the connected MCU is named and matched to the Target's `stlink.cpus` **before** any erase; only the application pages are erased and written; every block is read back; the flash is locked again and the lock confirmed by a read-back before the core is released to run | UNVERIFIED |

## The functional TX test (H17, H18, H19)

A completed write, a clean reboot and a healthy reconnect prove nothing about
whether the device transmits. Rows H17–H19 pass only with all four steps.

1. **Role from the protocol.** After the reboot, the reconnected device's CRSF
   Device Info must carry origin address `0xEE`
   (`CRSF_ADDRESS_CRSF_TRANSMITTER`), not `0xEC`. The application checks this
   and refuses to report success otherwise, recording
   `WRITE_COMPLETED_RECONNECT_UNVERIFIED` and keeping the checkpoint. **Note
   that the product name will still read as the receiver's** — that is expected
   and is not evidence either way.
2. **It accepts RC input.** Feed valid CRSF RC channel frames
   (`0x16`, 16 channels packed 11-bit) at the handset cadence — 50 Hz or faster
   — into the converted device's serial input, from a handset or a bench
   generator.
3. **It transmits.** A separate, already-bound receiver reports a link:
   its LED indicates a connection, and link statistics or telemetry return to
   the converted transmitter.
4. **Channels arrive.** Move one stick or channel and confirm the paired
   receiver's output for that channel follows. Record which channel and the
   observed range.

Record for each: mode used (internal or external), the wiring (external is
half-duplex — receive and transmit share one pin), the paired receiver's model,
and the RF power level used.

Failing step 1 is a failed conversion; restore from recovery. Passing step 1
but failing 2–4 is `WRITE_COMPLETED_RECONNECT_UNVERIFIED` — the role changed
but the device is not a working transmitter, which is worth recording exactly
as it happened.

## Hardware required, per row

Rows that cannot be run because the hardware is not present stay
`UNVERIFIED`. They are never marked passed, and never marked failed either.

| Rows | Precise hardware |
| --- | --- |
| H1, H3–H5, H9, H11–H16 | One ExpressLRS **transmitter** module — for example a RadioMaster Ranger, BetaFPV SuperG or Happymodel ES24TX — plus a handset that exposes its module bay serial port, or a direct USB-serial connection to the module |
| H2, H6–H8, H10 | One ExpressLRS **receiver** — any supported 2.4 GHz or 900 MHz RX |
| H16, H17, H18, H22 | A **spare ESP32-based receiver** that may be bricked — for example a BetaFPV SuperD or Happymodel EP2, anything whose catalog `platform` starts `esp32` |
| H19, H20 | A **spare ESP8285 receiver** — for example a Happymodel EP1 or BetaFPV Lite RX |
| H21 | An **STM32 receiver** — for example an FrSky R9 Mini or R9 MM. Read-only; nothing is written |
| H17–H19 step 3 | A **second, separate receiver** to pair with the converted device, plus a way to observe its channel output — a flight controller with a receiver tab, or a servo on the channel under test |
| H17–H19 step 2 | A handset outputting CRSF, or a bench CRSF generator capable of 50 Hz RC frames |
| H23, H24 | Any supported ESP receiver, plus something on the far end of the serial link to observe the AirPort bridge carrying bytes |
| H25 | See [ANDROID.md](../ANDROID.md#hardware-required-to-close-them) |
| W1 | A **flight controller running Betaflight** with the receiver under test on one of its UARTs, and that receiver's Target chosen |
| W2 | An **ST-Link/V2 or V2-1 probe** (an ST-Link/V3 is refused by name) wired to the SWD pads of an STM32 Target that lists the `stlink` method — for example an FrSky R9M transmitter or an R9 Mini receiver |

## Recording

Use the acceptance recorder in Advanced Mode. It exports JSON and Markdown with
secrets redacted, and it stamps the candidate SHA of the build under test.
Attach both exports to the pull request.

A row is passed only by someone who watched it happen.
