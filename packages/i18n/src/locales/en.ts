export const en = {
  "app.name": "ExpressLRS Easy Setup",
  "app.independent":
    "Compatible with ExpressLRS — independent community project, not affiliated with or endorsed by ExpressLRS LLC",
  "navigation.skip": "Skip to content",
  "language.arabic": "العربية",
  "language.english": "English",
  "language.switch": "Switch language",
  "mode.easy": "Easy mode",
  "mode.advanced": "Advanced mode",
  "mode.advancedHint": "Simulation, device reading, and technical details",
  "real.progress.heading": "Read progress",
  "real.progress.preparing": "Preparing a read-only request",
  "real.progress.discovering": "Trying to reach the selected device address",
  "real.progress.identifying": "Reading the device-reported identity facts",
  "real.progress.verifying":
    "Checking safe fields and excluding sensitive data",
  "real.progress.success": "The latest read is complete",
  "real.progress.failed": "The read stopped before completion",
  "real.progress.cancelled": "The read was cancelled",
  "real.support.copyAction": "Copy safe support details",
  "real.support.copying": "Copying safe support details…",
  "real.support.copied": "Safe support details copied",
  "real.support.copyFailed":
    "Could not copy the support details. Check clipboard permission and try again.",
  "real.support.privacy":
    "The copied details exclude the Binding identifier (UID), Wi-Fi network name (SSID), credentials, passwords, the raw response, and stable device identifiers.",
  "real.reconnect.consistent":
    "After connectivity was restored, the reported Target, Firmware version, and TX/RX role matched the first successful read.",
  "real.reconnect.changed":
    "After connectivity was restored, at least one reported Target, Firmware version, or TX/RX role differed from the first successful read. Review it before continuing.",
  "real.reconnect.required":
    "Put the device back in Wi-Fi mode, make sure you are on the correct network, then read it again.",
  "error.DEVICE_NOT_FOUND": "The device could not be found.",
  "error.DEVICE_BUSY": "Another operation is using this device.",
  "error.PERMISSION_DENIED": "Permission to access the device was denied.",
  "error.CONNECTION_LOST":
    "The device could not be reached, or the read stopped before completion.",
  "error.IDENTITY_UNKNOWN": "The device identity could not be confirmed.",
  "error.IDENTITY_AMBIGUOUS":
    "More than one device Target matches the available evidence.",
  "error.TARGET_UNKNOWN": "The device Target is unknown.",
  "error.TARGET_MISMATCH":
    "This file or device does not match the expected Target.",
  "error.VERSION_INCOMPATIBLE":
    "This Firmware version is not compatible with the confirmed Target.",
  "error.PROVIDER_UNSUPPORTED":
    "The required connection method is not supported.",
  "error.ARTIFACT_INVALID": "The Firmware file did not pass validation.",
  "error.VERIFICATION_FAILED":
    "The operation finished, but its result could not be verified.",
  "error.INVALID_STATE_TRANSITION":
    "The operation entered an invalid internal state.",
  "error.RECOVERY_REQUIRED":
    "The device needs a recovery workflow before continuing.",
  "error.INTERNAL_ERROR": "An unexpected internal error occurred.",
  "debug.englishOnly": "English fallback verified",

  "transport.INSECURE_CONTEXT":
    "This page is not running in a secure context, so the browser exposes no device APIs at all. Open it over HTTPS or from localhost.",
  "transport.NO_SERIAL_TRANSPORT":
    "This browser exposes neither the Web Serial API nor a native bridge, so no device port can be opened here. Use a desktop Chrome, Edge or Opera, or a host application that provides the bridge.",
  "transport.USB_ONLY":
    "This browser exposes WebUSB but not Web Serial, so CRSF identification and serial flashing cannot run here. Only an STM32 DFU device could be reached over USB.",
  "transport.detected":
    "Detected: Web Serial {webSerial}, WebUSB {webUsb}, native bridge {bridge}, secure context {secure}.",
  "build.stage": "Hardware validation beta",
  "build.note":
    "Every operation is available. Nothing has been proven on a physical device yet.",
  "build.copyFull": "Copy the full commit",
  "build.copied": "Copied",
  "build.copyFailed":
    "Copy failed. The full commit is in the code element's title.",
  "build.unpinned":
    "This build carries no commit identity, so a result recorded from it cannot be tied to one tree.",
  "diagnostics.heading": "Diagnostics",
  "diagnostics.intro":
    "A report of what this session actually observed: the browser's capabilities, what the device reported, the package that was prepared, and the recovery state.",
  "diagnostics.privacy":
    "The binding phrase, the derived UID, Wi-Fi credentials and the USB serial number are never collected, and free text is redacted on the way out.",
  "diagnostics.show": "Show the report",
  "diagnostics.copy": "Copy the report",
  "diagnostics.copied": "Copied",
  "diagnostics.copyFailed": "Copy failed. Select the report text manually.",
  "diagnostics.downloadJson": "Download JSON",
  "diagnostics.downloadMarkdown": "Download Markdown",
  "easy.title": "Set up ExpressLRS",
  "easy.intro":
    "Choose what you want to do. The app walks you through it: connect the device, identify it, check what it supports, run the operation, then verify the result.",
  "easy.roleLabel": "Type of connected device",
  "easy.roleTx": "Transmitter (TX)",
  "easy.roleRx": "Receiver (RX)",
  "easy.connect": "Identify my device",
  "easy.connecting": "Reading the device…",
  "easy.fieldProduct": "Model",
  "easy.fieldFirmware": "Firmware version",
  "easy.confidence": "Identification confidence",
  "easy.confidenceConfirmed": "Confirmed by the device itself",
  "easy.disconnect": "Close the connection",
  "easy.noHardwareClaim":
    "Nothing here is proof that a device was bound, configured, or flashed.",
  "easy.advancedCta": "Open advanced mode",
  "easy.advancedHint":
    "Technical workbench: catalog, targets, firmware packaging, and diagnostics.",
  "easy.easyCta": "Back to easy mode",
  "easy.copyDetails": "Copy technical details",
  "easy.copied": "Copied",
  "easy.copyFailed": "Copy failed. Select the text manually.",
  "easy.errorHeading": "Could not identify the device",
  "easy.fail.CANCELLED": "You cancelled before the device answered.",
  "easy.fail.TIMED_OUT": "The device did not answer in time.",
  "easy.fail.INVALID_PARAMETER_TABLE":
    "The device answered with data this preview cannot trust.",
  "easy.fail.CLEANUP_UNCONFIRMED":
    "The previous port could not be confirmed closed. Reload the page before trying again.",
  "easy.fail.CONNECT_FAILED": "The device could not be opened.",
  "easy.fail.UNKNOWN":
    "The device could not be identified, so nothing is claimed about it.",
  "easy.op.binding": "Bind transmitter and receiver",
  "easy.op.bindingDescription":
    "Put the device into bind mode and confirm the link on the other side.",
  "easy.op.settings": "Essential settings",
  "easy.op.settingsDescription":
    "Read the current values from the device and change one safely.",
  "easy.op.firmware": "Firmware update",
  "easy.op.firmwareDescription":
    "Check the installed version and update to an official release.",
  "easy.op.start": "Start",
  "easy.op.back": "Choose another operation",
  "easy.step.connect": "Connect the device",
  "easy.step.identify": "Identify it",
  "easy.step.compatibility": "Check what it supports",
  "easy.step.execute": "Run the operation",
  "easy.step.verify": "Verify the result",
  "easy.step.connectHint":
    "Connect the device over USB, then choose its port in the browser prompt.",
  "easy.run.binding": "Put the device into bind mode",
  "easy.run.settings": "Apply the change",
  "easy.run.firmware": "Start the firmware update",
  "easy.run.busy": "Working…",
  "easy.binding.sent":
    "The device accepted the bind command. Bring the other side into bind range now and confirm below whether the link came up.",
  "easy.binding.confirmQuestion": "Did the other side link",
  "easy.binding.linked": "The link came up",
  "easy.binding.notLinked": "No link yet",
  "easy.settings.current": "Current value on the device",
  "easy.settings.choose": "Setting",
  "easy.settings.newValue": "New value",
  "easy.settings.applied":
    "The change was written and read back from the device with the same value.",
  "easy.settings.mismatch":
    "The value read back does not match what was requested, so the change is not reported as applied.",
  "easy.firmware.handoff":
    "Your device is identified and its Target is known. Advanced mode carries the firmware workflow: official catalog, artifact verification, recovery package, write, and reconnect verification.",
  "easy.compat.noBindCommand":
    "This device does not report a bind command over USB. Bind it from its own controller menu or its Wi-Fi page, then return here to verify.",
  "easy.compat.noEssentialSettings":
    "This device reported no writable essential settings over CRSF. Advanced mode lists every parameter it did report.",
  "easy.compat.needIdentity":
    "The device must be identified before a firmware update can be prepared.",
  "easy.deny.NO_DEVICE_SESSION": "Connect the device first.",
  "easy.deny.IDENTITY_UNCONFIRMED":
    "The device identity is not confirmed. Identify it again.",
  "easy.deny.PORT_CLEANUP_UNCONFIRMED":
    "A previous port was not confirmed closed. Reload the page after disconnecting safely.",
  "easy.deny.OPERATION_IN_PROGRESS": "Another operation is running.",
  "easy.deny.RECOVERY_JOURNAL_UNREADABLE":
    "The recovery journal could not be read, so no write is allowed without a known way back.",
  "easy.deny.PENDING_RECOVERY_CHECKPOINT":
    "An interrupted operation is waiting for recovery. Finish it first.",
  "easy.deny.NO_PENDING_RECOVERY":
    "There is no interrupted operation to recover.",
  "easy.deny.TARGET_NOT_MATCHED": "Choose a Target that matches this device.",
  "easy.deny.BAND_NOT_MATCHED": "The band does not match this device.",
  "easy.deny.ARTIFACT_NOT_VERIFIED":
    "Prepare and verify the firmware package first.",
  "easy.deny.RECOVERY_NOT_AVAILABLE": "Download the recovery package first.",
  "easy.deny.BENCH_NOT_ACKNOWLEDGED":
    "Confirm stable power, and a fitted transmitter antenna, before writing.",
  "easy.deny.USER_CONFIRMATION_MISSING":
    "Confirm the operation before it runs.",
  "easy.binding.observing":
    "Bind command accepted. Watching the device's link telemetry — bring the other side into range now.",
  "easy.binding.telemetry":
    "The device reported a live RF link ({quality}% link quality). This is machine evidence, not a report.",
  "easy.binding.userConfirmed":
    "Recorded as confirmed by you. The device did not report link telemetry, so this is your observation and not machine evidence.",
  "easy.binding.commandOnly":
    "The command was accepted, but no link was observed and none was reported. Binding is not recorded as successful.",
  "easy.binding.ready":
    "The other side is ready to bind, and power and antennas are in a safe state",
  "easy.fw.bindPhrase": "Binding phrase (optional)",
  "easy.fw.bindPhraseHint":
    "Flash the transmitter and the receiver with the same phrase. A different phrase on either side means they will not link.",
  "easy.fw.bindPhraseConfigured":
    "A binding phrase will be compiled into this package.",
  "easy.fw.bindPhraseUnverifiable":
    "The device does not report its UID back over CRSF, so a matching phrase is proven by a live link, not by this write.",
  "easy.fw.bindPhrase.TOO_LONG":
    "The phrase is longer than 128 characters, which the derivation cannot accept.",
  "easy.fw.bindPhrase.BLANK":
    "The phrase is only spaces. Leave it empty to set none, or type a phrase you can retype exactly on the other side.",
  "easy.fw.bindPhrase.CONTROL_CHARACTER":
    "The phrase contains an invisible control character. Retype it as plain text.",
  "easy.fw.loadCatalog": "Prepare the official update source",
  "easy.fw.catalogReady":
    "Loaded {releases} buildable versions and {targets} official Targets.",
  "easy.fw.release": "ExpressLRS version",
  "easy.fw.target": "Target for this device",
  "easy.fw.targetExact":
    "Matched to one official Target from the identity the device reported.",
  "easy.fw.targetConfirm":
    "Type the Target key exactly to confirm it belongs to this device",
  "easy.fw.region": "Regulatory region",
  "easy.fw.method": "Update path",
  "easy.fw.build": "Prepare and verify the official package",
  "easy.fw.prepared":
    "Prepared {segments} segments with a SHA-256 for each. Download the recovery package before any write.",
  "easy.fw.downloadRecovery": "Download the recovery package",
  "easy.fw.recoverySaved":
    "I checked the recovery package is saved on my computer",
  "easy.fw.power":
    "Power is stable and will not be interrupted during the write",
  "easy.fw.antenna": "The transmitter antenna is fitted",
  "easy.fw.write": "Write the firmware to the device",
  "easy.fw.writeBlocked":
    "The write stays unavailable until every condition above is met. Each unmet one is listed there.",
  "easy.fw.progress": "{stage}: {written} of {total} bytes",
  "easy.fw.cancel": "Stop the current step",
  "easy.fw.pending":
    "An interrupted update is waiting for recovery at stage {stage}. Choose the matching recovery package to finish it.",
  "easy.fw.recoverFile": "Choose the recovery package",
  "easy.fw.recoveryNote":
    "Recovery reopens the port and writes the package saved before this update, then reads the identity back.",
  "easy.fw.verified":
    "The device came back and reported the expected Target and version after rebooting.",
} as const;

export type MessageKey = keyof typeof en;
