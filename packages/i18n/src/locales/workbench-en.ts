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
  "wb.catalog.progressIndex": "Release index",
  "wb.catalog.progressTargets": "Target catalog",
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
} as const;
