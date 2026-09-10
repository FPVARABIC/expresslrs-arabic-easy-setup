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

  // --- receiver as transmitter (upstream `--rx-as-tx`) --------------------
  // Distinct from AirPort: this replaces the receiver's firmware with the
  // transmitter build so the device changes role.
  "workbench.options.rxAsTx": "Flash this receiver with transmitter firmware",
  "workbench.options.rxAsTx.off": "Off — keep it a receiver",
  "workbench.options.rxAsTx.internal": "Internal (full-duplex)",
  "workbench.options.rxAsTx.external": "External (half-duplex)",
  "workbench.options.airport":
    "AirPort — transparent serial bridge (does not change the RX/TX role)",
  "workbench.rxAsTx.NO_TARGET_SELECTED":
    "Choose an official Target first; whether it can run transmitter firmware depends on the device.",
  "workbench.rxAsTx.TARGET_IS_TRANSMITTER":
    "{target} is already a transmitter, so there is no role to change.",
  "workbench.rxAsTx.PLATFORM_UNSUPPORTED":
    "UNSUPPORTED_BY_TARGET: {target} runs on {platform}. ExpressLRS builds receiver-as-transmitter firmware only for ESP32 and ESP8285 receivers, so this device cannot take it.",
  "workbench.rxAsTx.MODE_UNSUPPORTED_BY_PLATFORM":
    "UNSUPPORTED_BY_TARGET: {target} runs on {platform}, which supports only {modes} mode. ESP8285 receivers have no second UART, so half-duplex external mode is unavailable.",
  "workbench.rxAsTx.NO_TX_ARTIFACT":
    "UNSUPPORTED_BY_TARGET: the official catalog entry for {target} names no receiver artifact that a transmitter build can be selected from, so no transmitter firmware exists for it.",
  "workbench.rxAsTx.LAYOUT_HAS_NO_SERIAL_PINS":
    "UNSUPPORTED_BY_TARGET: the official hardware layout for {target} declares no serial_rx/serial_tx pair, so transmitter firmware has no serial port to drive.",

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

  // --- per-operation readiness --------------------------------------------
  "wb.need.identity": "Connect the device and let its identity be read first.",
  "wb.need.identityForUart":
    "A direct UART write needs a live device identity; connect the device first.",
  "wb.need.recoveryJournal":
    "The recovery journal could not be read. Reload the page so it can be verified.",
  "wb.need.targetPack":
    "{target} is newer than validated Target pack {pack} (ExpressLRS/targets {targetsSha}). Its hardware layout {layout} is not in the pack, and packaging reads exact layout bytes from the pack rather than from the live mirror, so that a recovery archive restores the same image it saved. The Target stays selectable; a new validated pack is needed to write to it.",
  "wb.need.clearCheckpoint":
    "An earlier operation left a recovery checkpoint open. Finish or clear that recovery first.",
  "wb.need.portCleanup":
    "The previous port was not proven closed. Unplug the device safely and reload the page.",
  "wb.need.idle":
    "Another operation is running. Wait for it to finish or cancel it.",
  "wb.need.target": "Choose the official Target for this device first.",
  "wb.need.writableSetting": "Choose a writable setting from the list first.",
  "wb.need.settingsBackup":
    "Create a settings backup first, so there is something to restore.",
  "wb.need.bindingAcknowledgement":
    "Confirm you understand binding changes the link, then try again.",
  "wb.need.preparedPackage": "Build the firmware package first.",
  "wb.need.recoveryDownload":
    "Download the recovery archive first, so the device can be put back.",
  "wb.need.powerAcknowledgement":
    "Confirm the device is on stable power that will not drop mid-write.",
  "wb.need.antennaAcknowledgement":
    "Confirm the transmitter's antenna is fitted before it can transmit.",
  "wb.need.targetConfirmation":
    "Type the Target name to confirm it, because the device identity does not pin it exactly.",
  "wb.need.recoveryPackage":
    "Select the recovery package to restore, or resume the open checkpoint.",
  "wb.need.durableRecovery":
    "Save the recovery package to durable storage and let it be verified first. A copy inside this app is erased if the app is removed, which is exactly when it is needed.",
  "wb.need.durableRecoveryStale":
    "The verified recovery copy belongs to a different package. Save this one to durable storage again.",

  // --- durable recovery export and import ---------------------------------
  "wb.durable.exporting": "Saving the recovery package and verifying it…",
  "wb.durable.verified":
    "Recovery package verified on durable storage: {location} · SHA-256 {digest}",
  "wb.durable.importing": "Reading the recovery package…",
  "wb.durable.imported":
    "Recovery package imported and verified from {location}. Recovery can run without any earlier application data.",
  "wb.durable.NO_DURABLE_TARGET":
    "This platform offers no storage this application can write to and read back, so a durable recovery copy cannot be proven. Firmware writing stays blocked; everything else remains available.",
  "wb.durable.CANCELLED": "Saving the recovery package was cancelled.",
  "wb.durable.WRITE_FAILED":
    "The recovery package could not be written to the chosen location.",
  "wb.durable.INSUFFICIENT_STORAGE":
    "There is not enough room at the chosen location for the recovery package.",
  "wb.durable.REOPEN_FAILED":
    "The recovery package was written but could not be reopened, so its durability is unproven.",
  "wb.durable.TRUNCATED":
    "The saved recovery package is shorter than what was written.",
  "wb.durable.HASH_MISMATCH":
    "The saved recovery package does not match the bytes that were written.",
  "wb.durable.PACKAGE_INVALID":
    "That file is not a recovery package this build can restore from.",

  // --- Advanced Mode interface --------------------------------------------
  "wb.ui.kicker": "Easy ELRS · Hardware Lab",
  "wb.ui.title": "Set up and update ExpressLRS",
  "wb.ui.subtitle":
    "Official sources, CRSF identification, real settings, mandatory recovery, and success conditional on the expected device coming back.",
  "wb.ui.statusLabel": "Status",
  "wb.ui.cancelOperation": "Cancel the operation",
  "wb.ui.pendingRecovery": "Recovery pending ·",
  "wb.ui.confirmTargetForRecovery": "Confirm the Target for recovery",
  "wb.ui.typeExactly": "Type it exactly:",
  "wb.ui.powerStableRecovery": "Power stays stable throughout the recovery",
  "wb.ui.antennaFittedRecovery":
    "The transmitter's antenna is fitted throughout the recovery",
  "wb.ui.chooseRecoveryPackage": "Choose the recovery package",
  "wb.ui.journalChecking":
    "Checking the recovery journal. Writes wait until that check finishes.",
  "wb.ui.journalUnreadable":
    "The recovery journal could not be verified, so flashing and recovery stay closed until it can be. Reload the page to try again.",
  "wb.ui.catalogHeading": "Release and Target",
  "wb.ui.catalogSubtitle":
    "Releases, Targets, and update methods all come from the official ExpressLRS sources.",
  "wb.ui.release": "Release",
  "wb.ui.chooseRelease": "Choose a release",
  "wb.ui.vendor": "Vendor",
  "wb.ui.bandFamily": "Band / family",
  "wb.ui.regulatoryRegion": "Regulatory region",
  "wb.ui.chooseRegion": "Choose the region",
  "wb.ui.updateMethod": "Update method",
  "wb.ui.platform": "Platform",
  "wb.ui.officialTargetMethods": "Official Target methods",
  "wb.ui.deviceHeading": "Device identity and settings",
  "wb.ui.deviceSubtitle":
    "No identity is shown before a valid Device Info with a valid CRC, and that needs no catalog download.",
  "wb.ui.identifyOverCrsf": "Identify the device over CRSF",
  "wb.ui.closeSession": "Close the session",
  "wb.ui.usePortNote":
    "Use the ELRS module's direct port. A joystick port or the radio's general port does not satisfy the CRSF gate.",
  "wb.ui.device": "Device",
  "wb.ui.targetMatch": "Target match",
  "wb.ui.awaitingCatalog": "Awaiting the catalog",
  "wb.ui.targetAutoMatched":
    "The chosen Target matches the CRSF identity automatically.",
  "wb.ui.identityPinnedLoadLater":
    "The CRSF identity is pinned. Load the catalog later, only to match a Target and prepare firmware.",
  "wb.ui.identityPinnedNeedsManual":
    "CRSF is pinned, but the Target still needs a manual choice and confirmation before flashing. Settings and binding rely on the parameters the device itself declared.",
  "wb.ui.connectToReadSettings":
    "Connect and identify the device to read its real settings. Every write is read back afterwards to confirm it actually took.",
  "wb.ui.setting": "Setting",
  "wb.ui.value": "Value",
  "wb.ui.saveWithReadBack": "Save, with read-back",
  "wb.ui.restoreSnapshot": "Restore the snapshot",
  "wb.ui.runRealBinding": "Run the real binding",
  "wb.ui.bindingAcknowledgement":
    "The other end is ready to bind, and power and antennas are in a safe state",
  "wb.ui.bindEvidenceLevel": "Binding evidence level:",
  "wb.ui.optionsHeading": "Firmware options",
  "wb.ui.optionsSubtitle":
    "The binding phrase and the Wi-Fi password stay in memory only until the package is built.",
  "wb.ui.bindPhrase": "Binding phrase",
  "wb.ui.bindPhraseNote":
    "Type the same phrase into the transmitter and the receiver. Any difference between them means the link will not come up. The device does not report its UID over CRSF, so a matching phrase is proven by a live link, not by this write.",
  "wb.ui.bindPhraseInvalid":
    "The binding phrase is not valid: it is too long, only spaces, or contains a hidden character.",
  "wb.ui.wifiSsid": "Wi-Fi network name",
  "wb.ui.wifiPassword": "Wi-Fi password",
  "wb.ui.wifiAutoOn": "Turn Wi-Fi on automatically after (seconds)",
  "wb.ui.uartInverted": "UART inverted",
  "wb.ui.unlockHigherPower": "Unlock the higher power levels",
  "wb.ui.receiverInvertTx": "Invert the receiver's TX output",
  "wb.ui.lockOnFirstConnection": "Lock on first connection",
  "wb.ui.packageHeading": "Build the package and flash",
  "wb.ui.packageSubtitle":
    "Every segment is documented with a SHA-256, and the recovery package is mandatory.",
  "wb.ui.buildOfficialFirmware": "Build the official firmware",
  "wb.ui.noPackageYet": "No package has been built yet.",
  "wb.ui.downloadFirmware": "Download the firmware / OTA",
  "wb.ui.downloadRecovery": "Download the recovery package",
  "wb.ui.exportDurableRecovery": "Save the recovery package to durable storage",
  "wb.ui.importDurableRecovery": "Import a saved recovery package",
  "wb.ui.durableRecoveryLocation": "Verified copy",
  "wb.ui.durableRecoveryPending": "No verified durable copy yet",
  "wb.ui.downloadLua": "Download the Lua script",
  "wb.ui.recoveryKeptConfirmed":
    "The operator confirmed the recovery package is saved outside this application.",
  "wb.ui.recoveryKeptCheckbox":
    "I confirm the recovery package file is saved and I can reach it without this application",
  "wb.ui.recoveryFirstNote":
    "Writing waits until the download has started and you have confirmed the recovery package is saved.",
  "wb.ui.confirmTarget": "Confirm the Target",
  "wb.ui.powerStableFlash": "Power stays stable throughout the flash",
  "wb.ui.antennaFitted": "The transmitter's antenna is fitted",
  "wb.ui.sourceOfficial": "Source: official ExpressLRS",
  "wb.ui.hardwareObservedNote":
    "HARDWARE_OBSERVED appears only after a session with a real device.",
  "wb.ui.noCrsfSession": "No CRSF session",
  "wb.ui.crsfConnected": "CRSF connected",
  "wb.ui.loadCatalog": "Load the official catalog",
  "wb.ui.loading": "Loading…",
  "wb.ui.deviceType": "Device type",
  "wb.ui.deviceTx": "TX transmitter",
  "wb.ui.deviceRx": "RX receiver",
  "wb.ui.experimentalSuffix": " · experimental",
  "wb.ui.downloadOpenWifi": "Download and open the Wi-Fi page",
  "wb.ui.downloadPackage": "Download the package",
  "wb.ui.startStm32Dfu": "Start STM32 DFU",
  "wb.ui.startRealFlash": "Start the real flash",

  "wb.ui.recoveryPickSameTarget":
    "Choose the same Target and recovery method, then the matching recovery package.",
  "wb.ui.flashNeeds": "Flashing is waiting on:",
} as const;
