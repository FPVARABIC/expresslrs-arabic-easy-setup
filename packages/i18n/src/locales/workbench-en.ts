/**
 * Advanced Mode's messages.
 *
 * These used to be Arabic string literals inside the components and the device
 * controller, which meant the technical workbench stayed Arabic even when the
 * operator chose English. They live here so both locales are complete and so a
 * missing translation is a type error rather than a surprise on screen.
 */
export const workbenchEn = {
  // --- refusals from the write authority --------------------------------
  "wb.deny.NO_DEVICE_SESSION":
    "Connect and identify the device first; an unconnected device cannot be changed.",
  "wb.deny.IDENTITY_UNCONFIRMED":
    "The device identity is unconfirmed; identify it again over CRSF before any change.",
  "wb.deny.PORT_CLEANUP_UNCONFIRMED":
    "A previous port close is unproven; reload the page after disconnecting the device safely.",
  "wb.deny.OPERATION_IN_PROGRESS":
    "An operation is already running; wait for it or cancel it.",
  "wb.deny.RECOVERY_JOURNAL_UNREADABLE":
    "The recovery journal could not be read; writing is not allowed without a known way back.",
  "wb.deny.PENDING_RECOVERY_CHECKPOINT":
    "A recovery from an earlier operation is pending; finish it first.",
  "wb.deny.NO_PENDING_RECOVERY":
    "There is no interrupted operation to recover.",
  "wb.deny.TARGET_NOT_MATCHED":
    "Choose a Target that matches the connected device before writing.",
  "wb.deny.BAND_NOT_MATCHED":
    "The band does not match the connected device; correct the selection.",
  "wb.deny.ARTIFACT_NOT_VERIFIED":
    "Prepare and verify a firmware package before writing.",
  "wb.deny.RECOVERY_NOT_AVAILABLE":
    "Download the recovery package first so the write can be undone.",
  "wb.deny.BENCH_NOT_ACKNOWLEDGED":
    "Confirm stable power, and a fitted transmitter antenna, before starting the write.",
  "wb.deny.USER_CONFIRMATION_MISSING":
    "Confirm the operation before running it.",

  // --- update paths -------------------------------------------------------
  "wb.method.uart": "Direct USB / UART",
  "wb.method.betaflight": "Through the flight controller",
  "wb.method.edgetx": "Through the radio",
  "wb.method.passthru": "Passthrough ready",
  "wb.method.wifi": "Wi-Fi",
  "wb.method.stlink": "STM32 DFU",
  "wb.method.download": "Download only",

  // --- receiver as transmitter -------------------------------------------
  "workbench.options.rxAsTx": "Run this receiver as a transmitter (AirPort)",
  "workbench.rxAsTx.NO_TARGET_SELECTED":
    "Choose an official Target first; whether it can run as a transmitter depends on the device.",
  "workbench.rxAsTx.TARGET_IS_TRANSMITTER":
    "{target} is a transmitter, so there is no receiver to repurpose.",
  "workbench.rxAsTx.PLATFORM_HAS_NO_AIRPORT_FIELD":
    "UNSUPPORTED_BY_TARGET: {target} runs on {platform}, whose packed configuration block has three receiver flags and no AirPort field, so the option cannot be written to it.",
  "workbench.rxAsTx.PLATFORM_UNKNOWN":
    "UNSUPPORTED_BY_TARGET: this application cannot configure the {platform} platform that {target} reports.",
  "workbench.rxAsTx.RELEASE_TOO_OLD":
    "UNSUPPORTED_BY_TARGET: the selected ExpressLRS release predates AirPort. Choose 3.0.0 or newer.",

  // --- controller status --------------------------------------------------
  "wb.status.idle":
    "You can identify the device straight away; load the catalog only when preparing official firmware.",
  "wb.status.unknownError": "The operation stopped with an unknown error",
  "wb.status.fileBounds": "The file must be between 1 byte and {maximum}",
  "wb.status.recoveryJournalUnreadable":
    "The recovery journal could not be verified, so every write stays refused: {detail}",
  "wb.status.sessionCloseUnproven":
    "The device session close could not be confirmed; any identity was hidden and reconnection stopped until the page is reloaded.{detail}",
  "wb.status.sessionChangedDuringOperation":
    "The device session or the port cleanup state changed during the operation; the late result was discarded.",
  "wb.status.disconnected":
    "The device disconnected. Select it again manually to continue.",
  "wb.status.cannotOpenNewSession":
    "A new device session cannot be opened because the previous port close is unproven; reload the page after disconnecting the device safely.",
  "wb.status.portCloseFailed": "The port could not be closed safely: {detail}",
  "wb.status.authorizationStale":
    "The device session or identity changed after authorization; identify it again and retry.",
  "wb.lock.needIdentity":
    "Connect and identify the device first; device-changing commands need a confirmed identity.",
  "wb.lock.journalLoading":
    "Wait for the recovery journal check to finish before changing the device.",
  "wb.lock.journalUnreadable":
    "The recovery journal could not be verified; every device-changing command is refused for safety.",
  "wb.lock.portCleanupUnproven":
    "A previous device port close is unproven; reload the page after disconnecting the device safely.",
  "wb.lock.closePending":
    "Wait until the previous device session close is proven.",
  "wb.lock.pendingRecovery":
    "A recovery is pending; finish it before sending any device-changing command.",

  // --- catalog ------------------------------------------------------------
  "wb.catalog.loading":
    "Loading the release index and the official Target catalog…",
  "wb.catalog.progressIndex": "Release index: {received}{total}",
  "wb.catalog.progressTargets": "Target catalog: {received}{total}",
  "wb.catalog.progress": "{stage}: {received}{total}",
  "wb.catalog.loaded":
    "Loaded {releases} buildable releases and {targets} official Targets.",
  "wb.catalog.loadedExact":
    "Loaded the catalog and matched {product} to a single official Target.",
  "wb.catalog.loadedNoMatch":
    "Loaded the catalog with the CRSF identity still proven. Target match: {confidence}.",
  "wb.catalog.failed": "The official source could not be loaded: {detail}",

  // --- connection ---------------------------------------------------------
  "wb.connect.prompt":
    "Select the direct ExpressLRS module port; sending a CRSF Device Ping…",
  "wb.connect.incomplete": "Identification did not complete: {detail}",
  "wb.connect.exactMatch":
    "CRSF proven and {product} matched to a single official Target.",
  "wb.connect.noCatalog":
    "CRSF and the identity of {product} are proven. You can load the catalog later to match a Target and prepare an update.",
  "wb.connect.noMatch":
    "CRSF and the device identity are proven. Target match: {confidence}; choose the official Target and confirm its key before flashing.",
  "wb.connect.stopped": "The identification session stopped: {detail}",

  // --- settings -----------------------------------------------------------
  "wb.settings.chooseFirst":
    "Choose a setting the device declared before writing.",
  "wb.settings.invalidValue": "Enter a whole number before saving the setting.",
  "wb.settings.writing": "Writing {name} and reading it back…",
  "wb.settings.applied":
    "{name} was saved and read back from the device with the same value.",
  "wb.settings.mismatch":
    "The read-back did not match the value requested for {name}, so the setting is not reported as applied.",
  "wb.settings.failed": "The setting could not be saved: {detail}",
  "wb.settings.restoring":
    "Restoring the settings snapshot and verifying every value…",
  "wb.settings.restored": "Restored {count} values with a read-back each.",
  "wb.settings.restoreFailed": "The settings restore stopped: {detail}",

  // --- binding ------------------------------------------------------------
  "wb.bind.needIdentity":
    "Connect and identify the device before sending a bind command.",
  "wb.bind.needAcknowledgement":
    "Confirm the other side, the power and the antennas are ready before sending a bind command.",
  "wb.bind.sending":
    "Sending the real bind command the device declares over CRSF…",
  "wb.bind.telemetry":
    "The device reported a live RF link (link quality {quality}%). This is machine evidence.",
  "wb.bind.commandOnly":
    "The bind command completed, but no link telemetry was observed, so the bind is not recorded as successful: {information}",
  "wb.bind.stopped": "Binding stopped: {detail}",
  "wb.bind.evidenceLevel": "Bind evidence level: {level}",
  // --- firmware packaging -------------------------------------------------
  "wb.fw.needRegion":
    "Choose the regulatory region explicitly before building firmware.",
  "wb.fw.preparing":
    "Downloading the official package and preparing firmware for this Target…",
  "wb.fw.optionsChanged":
    "The options changed while building; the stale package was discarded.",
  "wb.fw.prepared":
    "Prepared {segments} segments and verified their SHA-256. Download the recovery package before any write.",
  "wb.fw.preparedWithPhrase":
    "Prepared {segments} segments and verified their SHA-256, with a binding phrase compiled in. Download the recovery package before any write.",
  "wb.fw.prepareFailed": "Firmware could not be prepared: {detail}",
  "wb.fw.downloadStarted": "Started downloading {file}.",
  "wb.fw.recoveryDownloadStarted":
    "The browser started the recovery package download, but the application cannot prove it was saved. Confirm it manually once you have checked the file exists.",
  "wb.fw.luaDownloading":
    "Downloading the official Lua script matching this ExpressLRS release…",
  "wb.fw.luaFailed": "The Lua script could not be downloaded: {detail}",

  // --- reconnect and verification ----------------------------------------
  "wb.reconnect.prompt": "Select the device port again after it reboots",
  "wb.reconnect.promptStatus":
    "Select the device port again after it reboots to prove its identity and version.",
  "wb.reconnect.failed": "The device could not be read again: {detail}",
  "wb.reconnect.isolateFailed":
    "The reconnect session could not be isolated after an earlier cleanup failure",
  "wb.reconnect.afterUnprovenClose":
    "The device was read again after an unproven earlier port close.",
  "wb.reconnect.readingIdentity": "Reading the device identity after reboot",
  "wb.reconnect.closeMismatchedFailed":
    "The mismatched reconnect session could not be closed",
  "wb.reconnect.targetMismatch":
    "A device came back, but its Target evidence does not match the planned operation ({reason}).",
  "wb.reconnect.confirmingTarget": "Confirming the Target that was read back",
  "wb.reconnect.closeVersionMismatchFailed":
    "The mismatched version session could not be closed",
  "wb.reconnect.versionMismatch":
    "The device came back, but its version/commit does not match {expected}.",
  "wb.reconnect.confirmingVersion":
    "Confirming the version/commit that was read back",
  "wb.reconnect.closePreviousFailed":
    "The previous CRSF session could not be closed after reconnecting",
  "wb.reconnect.closeFallbackFailed":
    "The fallback reconnect session could not be closed",
  "wb.reconnect.previousCloseUnproven":
    "The previous CRSF session close could not be proven; the reconnect was stopped safely.",
  "wb.reconnect.closeAfterGateChange":
    "The reconnect session could not be closed after the cleanup gate changed",
  "wb.reconnect.gateChangedDuring":
    "The device session or the port cleanup gate changed during the reconnect; the new session was isolated.",
  "wb.reconnect.gateChangedBefore":
    "The device session or the port cleanup gate changed before the reconnect was accepted.",
  "wb.reconnect.complete":
    "Identity, Target and version were proven, and the recovery journal was closed",

  // --- transport ----------------------------------------------------------
  "wb.transport.cleanupUnproven":
    "A previous device port close is unproven; opening any new write port was stopped.",
  "wb.transport.crsfClosed": "The direct CRSF session is closed.",
  "wb.transport.gateChangedDuringIdentity":
    "The device port cleanup state changed while verifying the identity; the write was stopped.",
  "wb.transport.roleMismatch":
    "The device type changed or does not match the chosen Target.",
  "wb.transport.liveIdentityDrifted":
    "The live device identity no longer matches the Target that was granted the manual-confirmation waiver.",
  "wb.transport.bootloaderTargetMismatch":
    "The bootloader reported a different Target: {target}",
  "wb.transport.noBootloaderCommand":
    "The device declares no valid bootloader command; the write was stopped safely.",
  "wb.transport.detachFailed":
    "Releasing the CRSF port for flashing failed, so its close cannot be proven: {detail}",
  "wb.transport.closeAfterCancel":
    "The selected port could not be closed after the flash was cancelled",
  "wb.transport.gateChangedDuringPort":
    "The device port cleanup state changed while selecting the port; the write was stopped.",

  // --- flashing -----------------------------------------------------------
  "wb.flash.journalLoading":
    "Wait for the recovery journal check to finish before any write.",
  "wb.flash.journalUnreadable":
    "The recovery journal could not be verified; every write is refused for safety.",
  "wb.flash.needPackage":
    "Prepare a firmware package and choose a Target before writing.",
  "wb.flash.gatesIncomplete":
    "The Target, recovery, power and antenna gates are not complete.",
  "wb.flash.downloadOnly":
    "Started downloading {file}. Nothing was written to the device.",
  "wb.flash.wifiHandoff":
    "The OTA file was downloaded and 10.0.0.1 opened. Choose the downloaded file inside the device's own page.",
  "wb.flash.gateChangedBeforePort":
    "The device port cleanup state changed; the write was stopped before opening a new port.",
  "wb.flash.platformUnsupported":
    "This application does not support the Target's platform.",
  "wb.flash.dfuPlatformMismatch":
    "STM32 DFU does not match the chosen Target's platform.",
  "wb.flash.stm32MissingFirmware":
    "The STM32 package does not contain firmware.bin.",
  "wb.flash.stm32CleanupUnproven":
    "The STM32 write completed but releasing and closing its USB interface could not be proven",
  "wb.flash.stm32CloseUnproven":
    "The STM32 port close could not be confirmed after the write; reload the page before any further attempt.",
  "wb.flash.espCleanupUnproven":
    "The ESP write completed but closing its serial port could not be proven",
  "wb.flash.espCloseUnproven":
    "The ESP port close could not be confirmed after the write; reload the page before any further attempt.",
  "wb.flash.complete":
    "The flash completed and the device came back with the expected version/commit.",
  "wb.flash.writeCloseUnproven":
    "The write port close could not be proven after the flash stopped",
  "wb.flash.stopped":
    "The flash stopped and the operation needs recovery: {detail}",
  "wb.flash.reloadFirst": "Reload the page before opening any other port.",

  // --- recovery -----------------------------------------------------------
  "wb.recovery.journalLoading":
    "Wait for the recovery journal check to finish before choosing the package.",
  "wb.recovery.journalUnreadable":
    "Recovery cannot run without a trusted, readable recovery journal.",
  "wb.recovery.needTarget":
    "Choose the matching Target before running the recovery.",
  "wb.recovery.needDirectPath":
    "Recovery needs a direct write path: UART, Passthrough or STM32 DFU.",
  "wb.recovery.needTargetKey":
    "Confirm the Target key before running the recovery; the recovery port is a fresh selection and does not inherit the previous CRSF identity.",
  "wb.recovery.needPower": "Confirm stable power before running the recovery.",
  "wb.recovery.needAntenna":
    "Confirm the transmitter antenna is fitted before running the recovery.",
  "wb.recovery.validating":
    "Checking the recovery package and the SHA-256 of every segment…",
  "wb.recovery.packageMismatch":
    "The chosen package does not match the pending recovery session's fingerprint.",
  "wb.recovery.gateChangedBeforePort":
    "The device port cleanup state changed; the recovery was stopped before opening a new port.",
  "wb.recovery.missingFirmware":
    "The recovery package does not contain firmware.bin.",
  "wb.recovery.stm32CleanupUnproven":
    "The STM32 recovery completed but releasing and closing its USB interface could not be proven",
  "wb.recovery.stm32CloseUnproven":
    "The STM32 port close could not be confirmed after the recovery; reload the page before any further attempt.",
  "wb.recovery.closeAfterCancel":
    "The selected port could not be closed after the recovery was cancelled",
  "wb.recovery.gateChangedDuringPort":
    "The device port cleanup state changed while selecting the recovery port; the write was stopped.",
  "wb.recovery.espCleanupUnproven":
    "The ESP recovery completed but closing its serial port could not be proven",
  "wb.recovery.espCloseUnproven":
    "The ESP port close could not be confirmed after the recovery; reload the page before any further attempt.",
  "wb.recovery.platformUnsupported": "The recovery platform is unsupported.",
  "wb.recovery.complete":
    "The recovery completed and the device came back with the expected version/commit.",
  "wb.recovery.writeCloseUnproven":
    "The write port close could not be proven after the recovery stopped",
  "wb.recovery.incomplete":
    "The recovery write completed but the device's return could not be proven, so the operation is unfinished: {detail}",
  "wb.recovery.stopped": "The recovery stopped: {detail}",
  "wb.recovery.savedConfirmed":
    "Your manual confirmation that the recovery package is saved was recorded; keep it until the post-reboot verification completes.",
} as const;
