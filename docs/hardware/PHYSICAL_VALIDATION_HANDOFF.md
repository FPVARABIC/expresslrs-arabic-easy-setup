# Physical validation handoff

> An Arabic summary of the safety rules, the test order and the information needed before starting is in [دليل الاختبار الفعلي](دليل-الاختبار-الفعلي.md). This file is the complete version: every row, every expected observation, and the recording sheet.

Everything a person needs to run the 25 rows of
[HARDWARE_TEST_SHEET.md](HARDWARE_TEST_SHEET.md) themselves, and nothing that
claims to have run them.

**Nothing in this repository has been connected to a transmitter or a
receiver.** Every row is `HARDWARE_UNVERIFIED`. The software gates, the
protocol handling, the packaging and the Android host are tested; that is a
different claim, and it is recorded separately in
[RUNTIME_AVAILABILITY.md](../RUNTIME_AVAILABILITY.md) and
[FEATURE_REALITY_MATRIX.md](../FEATURE_REALITY_MATRIX.md).

## Safety, before anything else

These are not preferences.

- **No propellers.** Nothing that can spin is attached to anything on the
  bench, on any row, at any point. Remove them before you start, not before the
  RF rows.
- **Minimum practical RF power** on every row that transmits. Start at the
  lowest the Target offers — 10 mW or 25 mW — and only raise it if a row
  genuinely cannot be observed, recording the level you used.
- **The transmitter's antenna is fitted before it is ever powered.** An ELRS
  module transmitting into an open connector can damage its own output stage.
- **A supply that will not brown out.** A mid-write brownout is exactly the
  condition row H16 tests deliberately; suffering it accidentally on your only
  receiver is a different outcome.
- **One receiver bound to one transmitter.** The RX under test is the only one
  bound to the TX under test, or the link observations mean nothing.
- **Do the destructive rows on a spare.** H16 through H22 can leave a device
  unusable. Use a receiver you are willing to lose.

## 1. The build under test

### Web

Open the deployed site, or serve the built bundle. The build banner at the top
shows the commit; copy it into the recording sheet before you begin. If it says
the build carries no commit identity, stop and get a build that does — a result
you cannot tie to a tree is not evidence.

### Android

The APK is produced by the `Android host` workflow and published as a run
artifact. Take the artifact named for the commit you are testing:

1. Open the workflow run for that commit under **Actions → Android host**.
2. Download the artifact `elrs-android-host-debug-<commit sha>`.
3. It contains `app-debug.apk`, `app-debug.apk.sha256`, and
   `app-debug.apk.identity.txt`.

**Verify the APK you downloaded before installing it:**

```sh
sha256sum app-debug.apk
# must equal the value in app-debug.apk.sha256 from the same artifact
```

If it does not match, do not install it, and say so — a mismatch there is
either a corrupted download or an artifact that is not what the log says it is.

Compare against the digest in [ANDROID.md](../ANDROID.md#apk-identity) **only
when the artifact ID matches the one recorded there.** For any other build it
will differ legitimately, and it is not a fault: no debug keystore is
configured, so every CI run signs with a freshly generated debug key and
produces different APK bytes from identical sources. The digests that *are*
stable across builds of the same tree are the two embedded source digests in
`app-debug.apk.identity.txt`, and those are what step 6 below checks.

#### Installing it

This is a **debug** build, signed with a generated Android debug key. It is not
from a store and Play Protect will warn about it; that is expected for a debug
APK and is not a fault to work around silently.

1. Enable installing from your file manager or browser: **Settings → Apps →
   Special app access → Install unknown apps**, and allow the app you will open
   the APK from.
2. **If any earlier build of this app is installed, uninstall it first** —
   `adb uninstall com.fpvarabic.elrs.bridge`, or **Settings → Apps →
   ExpressLRS Easy Setup → Uninstall**. Each CI run signs with a different debug key, so
   Android refuses to install one build over another
   (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`, or "app not installed" in the UI).
   That refusal is Android working correctly, not a broken APK. Uninstalling
   also clears any state left by the previous build, which is what you want
   between candidates.
3. Open `app-debug.apk` and install it.
4. Or, over ADB: `adb install app-debug.apk` (after step 2; `-r` cannot help
   here, because the obstacle is the signature, not the presence of the app).
5. Attach the ELRS device with a USB OTG adapter, open the app, and grant the
   USB permission when Android asks. The permission dialog names the device;
   check it is the one you attached.
6. Open **Diagnostics → Show the report** and confirm the *Native host web
   build* and *Native host native source* digests match
   `app-debug.apk.identity.txt`. That is how a result from a phone is traced
   back to a source tree, and unlike the APK digest it does not change when the
   same tree is built again.

If the app reports that its USB bridge could not be installed, record the exact
reason it gives. It means this device's Android System WebView is too old to
provide an origin-restricted bridge, and no device can be opened — that is a
real result for this handoff, not a failure to work around.

## 2. What is needed before starting

Eight facts decide which rows can actually be closed and which need hardware
that is not on the bench yet. **Answer these before buying anything** — several
of the rows can be closed with less than the full kit, and one of them (spare
receiver) decides whether three whole stages may be attempted at all.

| # | Question | Why it decides something |
| --- | --- | --- |
| 1 | Android phone model and Android version | Decides API level, WebView version, and therefore whether the bridge can be installed at all |
| 2 | Does that phone support USB OTG? | Many budget devices omit USB host entirely. Without it, rows A1–A13 and H25 cannot run on that phone, and no amount of software fixes it |
| 3 | TX: exact commercial model, frequency band, current ExpressLRS version | Decides the Target, the regulatory domain, and whether the frozen pack covers it |
| 4 | RX: exact commercial model, chip/platform if known, frequency band, current ExpressLRS version | As above, plus whether RX-as-TX is even possible — an ESP8285 cannot do external mode, and STM32 cannot do either |
| 5 | Available USB/UART adapters and cables | Decides which upload methods are reachable: OTG for the phone, and a UART programmer for anything without native USB |
| 6 | Is a spare receiver available? | **Stages 7, 8 and row A11 must not be run without one.** They break a device on purpose |
| 7 | Stable power source | A dropped supply mid-write is the most common way a device is lost. A nearly flat battery is not a stable supply |
| 8 | Can the recovery file be saved outside the app? | Stage 3 needs somewhere the operator chooses — Downloads, an SD card, a cloud folder — with a few megabytes free. Without it, firmware writing stays refused, by design |

An Arabic version of this request, with the safety rules and the order, is in
[دليل الاختبار الفعلي](دليل-الاختبار-الفعلي.md).

## 3. Minimum hardware for all 25 rows

The per-row table is in
[HARDWARE_TEST_SHEET.md](HARDWARE_TEST_SHEET.md#hardware-required-per-row).
Consolidated, the smallest kit that closes every row is:

| # | Item | Closes | Why nothing smaller will do |
| --- | --- | --- | --- |
| 1 | One ExpressLRS **transmitter** module (e.g. RadioMaster Ranger, BetaFPV SuperG, Happymodel ES24TX) | H1, H3–H5, H9, H11–H16 | The transmitter rows need a device that reports `0xEE` |
| 2 | A handset exposing the module bay serial port, **or** a direct USB-serial link to that module | H1–H24 | Every row needs a CRSF port at 420000 baud |
| 3 | One supported **receiver**, kept working | H2, H6–H8, H10, and the paired end of H11 and H17–H19 | The receiver rows, and the far end of every link observation |
| 4 | One **spare ESP32 receiver** that may be bricked (e.g. BetaFPV SuperD, Happymodel EP2 — any catalog `platform` starting `esp32`) | H16–H18, H22 | ESP32 is the only platform upstream builds both rx-as-tx modes for |
| 5 | One **spare ESP8285 receiver** (e.g. Happymodel EP1, BetaFPV Lite RX) | H19, H20 | ESP8285 takes internal only; H20 proves external is refused |
| 6 | One **STM32 receiver** (e.g. FrSky R9 Mini/MM) — read-only, nothing is written | H21 | Proves the refusal names the platform rather than hiding the option |
| 7 | A **second receiver** to pair with a converted device, plus a way to see its channel output — a flight controller with a receiver tab, or a servo on one channel | H17–H19 step 4 | A converted device is only a transmitter if something receives from it |
| 8 | A handset outputting CRSF, **or** a bench CRSF generator that can send RC frames at 50 Hz | H17–H19 step 2 | A transmitter with no RC input transmits nothing to observe |
| 9 | Something on the far end of a serial link to watch bytes cross | H23, H24 | AirPort is a transparent bridge; the only proof is bytes arriving |
| 10 | An **Android phone with USB OTG** and a USB OTG adapter | H25, and A1–A13 in [ANDROID.md](../ANDROID.md) | No emulator has a USB host |
| 11 | A **stable USB supply**, and a USB-serial adapter if the module has no USB | all | A brownout mid-write is row H16, not an accident |

Rows whose hardware you do not have stay `UNVERIFIED`. Do not mark them
failed — "not tested" and "does not work" are different findings.

## 4. Run them in this order

Each stage is safe to stop after. Do not skip forward: the later stages assume
the earlier ones passed, and a firmware write on a device whose identity you
have not confirmed is how a device is lost.

**None of the 25 hardware rows is closed.** Every row below is `UNVERIFIED`
until someone runs it on real hardware and records what they saw. This document
being complete is not the same as the rows being done.

| Stage | Rows | Introduces |
| --- | --- | --- |
| 1 — install and detect | A1, A2, H25 | nothing; read-only |
| 2 — identity and diagnostics | H1–H5, H21, A3–A5 | nothing; read-only |
| 3 — **durable recovery** | D1–D8 | nothing; it is the safety net for stage 6 |
| 4 — reversible settings | H6–H8 | a write that is put straight back |
| 5 — binding and telemetry | H9–H11 | RF |
| 6 — firmware | H12–H15 | a destructive write |
| 7 — interruption and recovery | H16, A6, A11 | deliberate breakage; spare only |
| 8 — RX-as-TX | H17–H20, H22 | the hardest change to undo; spare only |
| 9 — AirPort, on its own | H23, H24 | nothing new, but must not be mixed with stage 8 |
| 10 — final RF verification | F1 | the whole system, after everything above |

**Stage 3 sits before stage 6 for a reason, and it is not tidiness.** The
durable recovery copy is the only way back if a firmware write fails. Until it
is proven, stage 6 is a device with no safety net — and the application itself
refuses to write firmware until a copy has been written outside it and
hash-verified, naming that as the reason.

### Stage 1 — install and read-only OTG detection (A1, A2, H25)

Nothing is written, and nothing is even opened. This stage answers one question:
does this phone see this device at all?

| Step | Do | Expect | Fails if |
| --- | --- | --- | --- |
| A1 | Install the APK per section 1 | It installs; Play Protect warns and you continue | It will not install. If the error is `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, uninstall the earlier build first — see section 1 |
| A2 | Attach the ELRS device through the OTG adapter | Android offers this app for the attached device, or the app lists it once opened | Nothing happens. Check the phone supports USB host at all before concluding the app is at fault |
| H25 | Open the app with the device attached and read the device list | The device appears. A device this host cannot drive still appears, **with the reason attached** | The list is empty with a device plugged in, or an undrivable device is hidden rather than explained |

If A2 fails on a phone whose USB host support you have not verified, that is not
a result for this application — record the phone model and stop.

### Stage 2 — identity and diagnostics (H1–H5, H21, A3–A5)

Nothing is written. Safe on any device, including ones you care about.

| Step | Do | Expect | Fails if |
| --- | --- | --- | --- |
| H1 | Connect the TX, press *Identify the device over CRSF* | Device Info appears: product, firmware, hardware version, parameter count. Role reads transmitter | No identity, a CRC failure, or a role that is not `tx` |
| H2 | Same with the receiver | As H1, role reads receiver | As above, or the role reads `tx` |
| H3 | Connect a joystick port or any non-CRSF port and try to identify | A named failure, and the port is released — the next attempt works | It hangs, or the next attempt fails because a port is still held |
| H4 | With the TX attached, choose the RX role and identify | A role-mismatch reason; the session stays closed | It connects anyway |
| H5 | Unplug, replug, identify again | The same role, product and hardware version | Anything differs, or the reconnect needs an app restart |
| H21 | Choose an STM32 receiver as the Target and open the rx-as-tx selector | Both modes refused, naming the Target and the platform. Nothing is written | The option is hidden, or blamed on the build |
| A3 | Grant the USB permission when Android asks | A port opens and the identity is read. The dialog names the device — check it is the one you attached | It names a different device, or no port opens after granting |
| A4 | Deny the permission on a second device | A named refusal. No port is held; the next attempt still works | It hangs, or a later attempt fails because something was left open |
| A5 | Grant, then revoke in Android settings, then retry | The stale handle is refused rather than used | It carries on with a handle it no longer has |

### Stage 3 — durable recovery export and re-import (D1–D8)

**Run this before any firmware write.** It is the stage that decides whether
stage 6 has a way back. Nothing here touches the device: it is entirely about
whether a file survives.

| Step | Do | Expect | Fails if |
| --- | --- | --- | --- |
| D1 | Build a package, then press *Save the recovery package where it will survive* **with the passphrase field empty** | Refused, naming the passphrase and its minimum length. The button is not greyed out — it answers | The button is dead, or it saves an unprotected file |
| D2 | Type a recovery passphrase — **write it down first** — and save. Choose a location **outside the app**: Downloads, an SD card, a cloud folder | Android's file picker opens. The app then reports the exact location and a SHA-256, having written the file, reopened it and hashed it | No picker appears, it offers only app-private storage, or it reports success without a digest |
| D3 | Open the saved file in a text viewer or unzip tool | It is **not** a readable zip. It begins with `ELRSRCV1` and the rest is unreadable | You can list its contents, or you can find your Wi-Fi password in it |
| D4 | Dismiss the picker instead of choosing | A cancellation, named as such — not an error, and not a silent success | It reports success, or an unexplained failure |
| D5 | With the save cancelled, try to start a firmware write | Refused, naming the missing durable copy. **Identity, diagnostics and reversible settings all still work** | The write is allowed, or the whole application locks up |
| D6 | Press *Choose a saved recovery file*, pick the file, and enter a **wrong** passphrase | Refused, saying the passphrase is wrong or the file was modified. Nothing is imported | It imports anything, or reports a different kind of error |
| D7 | **Uninstall the app, reinstall it**, then press *Choose a saved recovery file* — **before building anything** | The control is there on a fresh install with nothing prepared, and shows which device and date the file came from | The control is missing, or it demands a firmware package first |
| D8 | Enter the correct passphrase, then confirm the recovered identity | It reports the package imported and verified, and *Restore the device from this package* becomes available with no earlier app data at all | It cannot be imported, or the restore stays unavailable after confirming |

D7 and D8 are the whole point of this stage. Record the location and the digest from D2
on the recording sheet — you will need them again at stage 7.

### Stage 4 — reversible settings (H6–H8)

Written and put straight back. Safe on a working device, but do it on the spare
if you would rather.

| Step | Do | Expect | Fails if |
| --- | --- | --- | --- |
| H6 | Connect and note the settings backup | A backup tied to this device's identity, carrying no binding phrase, UID, Wi-Fi password or USB serial | It is missing, or contains any of those |
| H7 | Change one non-sensitive value (packet rate is a good one) and save | The value read back after the write equals what you asked for, exactly | Read-back differs, or is not performed |
| H8 | Press *Restore the snapshot* | Every value returns; nothing is skipped | Any parameter does not come back |

### Stage 5 — binding and telemetry (H9–H11)

The first stage that transmits. Antenna fitted. Minimum power. No propellers.

| Step | Do | Expect | Fails if |
| --- | --- | --- | --- |
| H9 | Acknowledge the binding warning and run binding on the TX | A CRSF acknowledgement. **This alone is not an RF result** | No acknowledgement, or the app claims a link from it |
| H10 | Run binding on the receiver | The command and any response recorded, with no assumed link | The app reports success without evidence |
| H11 | Observe the link at **both** ends | Independent evidence at the TX *and* the RX: telemetry returning, or both indicators. Record what each end showed | Only one end shows anything. A bind acknowledgement alone fails this row |

### Stage 6 — standard firmware update and verified reboot (H12–H15)

Destructive. Recovery archive downloaded and stored off the device first. The
application refuses to write until you have confirmed that.

| Step | Do | Expect | Fails if |
| --- | --- | --- | --- |
| H12 | Build the package | Target, release, method, and every segment's name, address and SHA-256 recorded. The recovery archive downloads | Any segment has no digest, or the recovery archive is not offered |
| H13 | Start the write and watch the bootloader stage | The tool names the correct chip, Target or DFU interface **before** any erase | It erases before naming the device, or names the wrong one |
| H14 | Let it complete | Erase and write complete with read-back or tool-side segment verification | It reports success without verifying |
| H15 | Let it reboot and reconnect | The same identity returns, reporting the expected release | The identity changed, or the version is not what was written |

### Stage 7 — controlled interruption and recovery (H16, A6, A11)

**Spare device only.** This is the row that proves recovery works, by breaking
a device on purpose.

| Step | Do | Expect | Fails if |
| --- | --- | --- | --- |
| H16 | Start a write and pull the cable during `WRITING` | `RECOVERY_REQUIRED` appears and the checkpoint is kept. Recovery from the archive restores the original, and the identity and version return | The checkpoint is lost, recovery is unavailable, or the device cannot be restored |
| A6 | Repeat H16 on Android, detaching mid-write | The port closes, the checkpoint survives, and the app says what happened | The app hangs, or claims success |
| A11 | Recover the interrupted device on Android **using the file from D2 and its passphrase** | The original firmware returns, restored from the durable copy rather than from anything inside the app | It cannot be restored, or it needs app data the reinstall in D6 removed |

Reconnect the interrupted device before recovering it, so the recovery writes
to a device whose identity has been confirmed.

A11 is the row that makes stage 3 worth having: it restores a broken device
from a file that outlived an uninstall.

### Stage 8 — RX-as-TX, on spare hardware only (H17–H20, H22)

Most destructive, because a converted receiver is the hardest thing to get back.
**Spare receivers only, and only after stage 7 passed** — if recovery has not
been proven on this bench, do not start this stage.

| Step | Do | Expect | Fails if |
| --- | --- | --- | --- |
| H17 | ESP32 receiver, mode **internal**, full functional TX test | All four steps of [the functional TX test](HARDWARE_TEST_SHEET.md#the-functional-tx-test-h17-h18-h19) | Any step fails. Step 1 failing is a failed conversion — restore |
| H18 | ESP32 receiver, mode **external** | As H17. External is half-duplex — receive and transmit share a pin; record the wiring | As above |
| H19 | ESP8285 receiver, mode **internal** | As H17 | As above |
| H20 | ESP8285 receiver, try mode **external** | The application refuses it, naming the Target and the platform — an ESP8285 has one UART | It is offered, hidden, or blamed on the build |
| H22 | Recover a converted device from its archive | The **original receiver firmware** returns; the device reports a receiver role again | It comes back as a transmitter, or cannot be restored |

### Stage 9 — AirPort, on its own (H23, H24)

AirPort is a different feature from RX-as-TX. It is tested separately and
deliberately not in the same session as stage 8, because the one thing these two
rows exist to detect is the two features being entangled.

| Step | Do | Expect | Fails if |
| --- | --- | --- | --- |
| H23 | AirPort **on**, rx-as-tx **off** | Bytes cross the serial bridge. The device is still a receiver | The role changed, or the bridge does not carry bytes |
| H24 | rx-as-tx **on**, AirPort **off** | The role changed. AirPort is not enabled | AirPort turned itself on, or the role did not change |

If turning one on moves the other, that is a defect and worth reporting on its
own, before any of the remaining rows.

### Stage 10 — final functional RF verification (F1)

Everything above, together, on the real link. Antenna fitted, minimum power, no
propellers.

| Step | Do | Expect | Fails if |
| --- | --- | --- | --- |
| F1 | With the TX and RX both on the firmware and settings this session produced, power both and fly nothing | A bound link with telemetry at both ends, stable for at least two minutes, at the packet rate that was configured | No link, telemetry only one way, a rate that is not what was set, or a link that drops |

This is the row that says the whole session produced a working pair rather than
a sequence of individually passing steps.

### The remaining Android rows (A7–A10, A12, A13)

Rows A7–A13 in
[ANDROID.md](../ANDROID.md#still-open--needs-a-physical-android-device) — screen
rotation and backgrounding mid-operation, cancellation, the file picker, both
locales at phone width, and nothing hidden merely because the platform is
Android. Run them alongside whichever stage above they belong to, and record
them against their own row numbers.

## 5. Exporting diagnostics

Do this **after every row**, not only after a failure. A passing row with no
export is a claim; a passing row with an export is evidence.

1. Open **Diagnostics** — it is in both Easy and Advanced mode, and it needs no
   device attached.
2. Press **Show the report** to read it, then **Download JSON** *and*
   **Download Markdown**. Take both: the JSON is machine-readable, the Markdown
   is what a person reviews.
3. The filename carries the build identity and the capture time.

The export never contains the binding phrase, the derived UID, Wi-Fi
credentials or the USB serial number, and free text is redacted on the way out.
You do not need to scrub it by hand — but read it before attaching it anyway.

For the acceptance rows, use the recorder in Advanced Mode as well: it exports
the same session as JSON and Markdown with the candidate SHA stamped in.

## 6. Recording sheet

Fill this in per device, before you start. A row is passed only by someone who
watched it happen.

### Session

| Field | Value |
| --- | --- |
| Date and time (with timezone) | |
| Who ran it | |
| Web build commit (from the build banner) | |
| Android APK SHA-256 (if used) | |
| Android web build digest (from Diagnostics) | |
| Android native source digest (from Diagnostics) | |
| Browser and version, **or** Android version and phone model | |
| USB adapter or OTG adapter used | |

### Per device under test

| Field | Transmitter | Receiver | Spare ESP32 RX | Spare ESP8285 RX | STM32 RX |
| --- | --- | --- | --- | --- | --- |
| Model, exactly as printed | | | | | |
| Official Target chosen | | | | | |
| Catalog `platform` | | | | | |
| Band (2.4 GHz / 900 MHz / dual) | | | | | |
| Regulatory region (FCC / LBT / CE) | | | | | |
| Firmware **before** | | | | | |
| Firmware **after** | | | | | |
| RF power used | | | | | |
| Recovery archive filename and where it is stored | | | | | |

### Per row

| Row | Result (PASS / FAIL / BLOCKED / UNVERIFIED) | What you actually saw | Diagnostics export filename |
| --- | --- | --- | --- |
| H1 | | | |
| H2 | | | |
| H3 | | | |
| H4 | | | |
| H5 | | | |
| H6 | | | |
| H7 | | | |
| H8 | | | |
| H9 | | | |
| H10 | | | |
| H11 | | | |
| H12 | | | |
| H13 | | | |
| H14 | | | |
| H15 | | | |
| H16 | | | |
| H17 | | | |
| H18 | | | |
| H19 | | | |
| H20 | | | |
| H21 | | | |
| H22 | | | |
| H23 | | | |
| H24 | | | |
| H25 | | | |

### Raw CRSF evidence

For any row whose result turns on what the device reported — H1, H2, H4, H5,
H15, H17–H19 step 1, H22 — record the frame, not a summary of it. The role is
decided by the origin address byte and by nothing else; a product name that
says "RX" or "TX" is not evidence.

| Row | Frame type | `dest_addr` | `orig_addr` | Product name as reported | Role the app derived |
| --- | --- | --- | --- | --- | --- |
| | `0x29` | | | | |
| | `0x29` | | | | |
| | `0x29` | | | | |

`orig_addr` `0xEE` is `CRSF_ADDRESS_CRSF_TRANSMITTER`; `0xEC` is
`CRSF_ADDRESS_CRSF_RECEIVER`. A converted receiver that still reports `0xEC`
has not become a transmitter, whatever else completed successfully.

### Anything unexpected

Write down anything that surprised you, even if the row passed. A row that
passed on the second attempt is a different result from a row that passed on
the first, and the difference is usually the interesting part.
