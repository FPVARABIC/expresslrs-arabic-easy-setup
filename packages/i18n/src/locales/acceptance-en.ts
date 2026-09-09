export const acceptanceEn = {
  // --- physical acceptance steps ------------------------------------------
  "acc.step.secure_browser.title": "Browser and secure context",
  "acc.step.secure_browser.instructions":
    "Open the reviewed build over HTTPS in Chrome or Edge and confirm Web Serial appears.",
  "acc.step.secure_browser.evidence":
    "The context is secure, Web Serial is available, and the application URL and candidate SHA are recorded.",
  "acc.step.bench_baseline.title": "Test bench baseline",
  "acc.step.bench_baseline.instructions":
    "Record the TX/RX models, cable, power source, antenna, and fan state before any write.",
  "acc.step.bench_baseline.evidence":
    "A short bench name, a stable power source, a fitted TX antenna, and fans removed where needed.",
  "acc.step.tx_crsf_identity.title": "TX identity over CRSF",
  "acc.step.tx_crsf_identity.instructions":
    "Select the TX, open the direct port, and wait for a valid Device Info with a valid CRC.",
  "acc.step.tx_crsf_identity.evidence":
    "Product name, firmware version, hardware version, VID/PID where available, and the parameter count.",
  "acc.step.rx_crsf_identity.title": "RX identity over CRSF",
  "acc.step.rx_crsf_identity.instructions":
    "Select the RX, open the direct port, and wait for a valid Device Info with a valid CRC.",
  "acc.step.rx_crsf_identity.evidence":
    "Product name, firmware version, hardware version, VID/PID where available, and the parameter count.",
  "acc.step.wrong_port_rejected.title": "Wrong port is rejected",
  "acc.step.wrong_port_rejected.instructions":
    "Deliberately choose a joystick port, or one that sends no CRSF, and confirm no successful connection is announced.",
  "acc.step.wrong_port_rejected.evidence":
    "An orderly failure with no device identity and no port left held open.",
  "acc.step.wrong_role_rejected.title": "Wrong TX/RX role is rejected",
  "acc.step.wrong_role_rejected.instructions":
    "Choose RX for a TX device or the reverse, and confirm the session stops closed.",
  "acc.step.wrong_role_rejected.evidence":
    "A role-mismatch message, no accepted identity on screen, and a closed port.",
  "acc.step.reconnect_identity_stable.title":
    "Identity is stable across a reconnect",
  "acc.step.reconnect_identity_stable.instructions":
    "Disconnect the device, reconnect it, and read its identity a second time.",
  "acc.step.reconnect_identity_stable.evidence":
    "The role, product, hardware version, and expected identity all return with no Target substitution.",
  "acc.step.settings_backup_created.title": "Settings backup created",
  "acc.step.settings_backup_created.instructions":
    "With the device identified, create the restorable snapshot of its visible settings.",
  "acc.step.settings_backup_created.evidence":
    "A backup tied to the device identity that contains no hidden or sensitive fields.",
  "acc.step.reversible_setting_write.title": "Reversible setting write",
  "acc.step.reversible_setting_write.instructions":
    "Change one safe setting within its bounds, then request the read-back.",
  "acc.step.reversible_setting_write.evidence":
    "The value read after the write matches the requested value exactly.",
  "acc.step.settings_restored.title": "Original setting restored",
  "acc.step.settings_restored.instructions":
    "Restore the settings snapshot and verify every value by read-back.",
  "acc.step.settings_restored.evidence":
    "The original value returns with no failure and no missing parameter.",
  "acc.step.tx_bind_command_ack.title": "Bind command acknowledged on TX",
  "acc.step.tx_bind_command_ack.instructions":
    "Run the real binding command parameter on the TX and wait for the device to acknowledge it.",
  "acc.step.tx_bind_command_ack.evidence":
    "A CRSF command acknowledgement only; no RF success is recorded at this step.",
  "acc.step.rx_bind_command_sent.title": "Bind command sent to RX",
  "acc.step.rx_bind_command_sent.instructions":
    "Put the RX in a ready state and send the real binding command, or the documented legacy fallback.",
  "acc.step.rx_bind_command_sent.evidence":
    "The command type and any RX response are recorded, without assuming the link succeeded.",
  "acc.step.rf_link_observed.title": "RF link observed from both ends",
  "acc.step.rf_link_observed.instructions":
    "Check the TX and RX indicators and confirm telemetry returns, or independent link evidence.",
  "acc.step.rf_link_observed.evidence":
    "Separate evidence from both ends; a bind acknowledgement alone is not enough.",
  "acc.step.firmware_package_verified.title":
    "Firmware build and recovery package",
  "acc.step.firmware_package_verified.instructions":
    "Choose the release, Target, and region, build the package, verify the SHA-256, then download the recovery archive.",
  "acc.step.firmware_package_verified.evidence":
    "The Target, release, upload method, and every segment name, address, and hash are recorded.",
  "acc.step.bootloader_entry.title": "Bootloader entry",
  "acc.step.bootloader_entry.instructions":
    "Run the bootloader method that matches the Target and confirm the tool recognises the correct platform.",
  "acc.step.bootloader_entry.evidence":
    "The chip name, Target, or matching DFU interface appears before any erase.",
  "acc.step.normal_flash_verified.title": "Normal flash with byte verification",
  "acc.step.normal_flash_verified.instructions":
    "Run the first normal flash on stable power, with no deliberate interruption.",
  "acc.step.normal_flash_verified.evidence":
    "Erase and write complete, with a read-back or the tool's own segment verification.",
  "acc.step.post_flash_reconnect.title": "Reboot, Target and version verified",
  "acc.step.post_flash_reconnect.instructions":
    "Select the device again after it reboots and confirm the same identity and the expected release or commit return.",
  "acc.step.post_flash_reconnect.evidence":
    "Target verified, a matching version or commit, and a usable session.",
  "acc.step.recovery_package_restore.title":
    "Ordinary restore from the recovery package",
  "acc.step.recovery_package_restore.instructions":
    "On a test device, restore the recorded package and verify it comes back completely.",
  "acc.step.recovery_package_restore.evidence":
    "The package hash matches, the write succeeds, and the identity and version return as expected.",
  "acc.step.interrupted_flash_recovery.title":
    "Recovery after a deliberate interruption",
  "acc.step.interrupted_flash_recovery.instructions":
    "An optional final test on a spare device only: interrupt the operation during WRITING, then recover it.",
  "acc.step.interrupted_flash_recovery.evidence":
    "RECOVERY_REQUIRED appears, the resume is safe, and the expected Target and version return.",

  // --- acceptance status labels and export ---------------------------------
  "acc.status.NOT_RUN": "Not started",
  "acc.status.PASS": "Pass",
  "acc.status.FAIL": "Fail",
  "acc.status.BLOCKED": "Blocked",
  "acc.status.SKIPPED": "Skipped",
  "acc.md.unrecorded": "not recorded",
  "acc.md.operator": "Operator",
  "acc.md.bench": "Bench",
  "acc.md.app": "App",
  "acc.md.browser": "Browser",
  "acc.md.completed": "Completed",
  "acc.md.passed": "Passed",
  "acc.md.failed": "Failed",
  "acc.md.blocked": "Blocked",
  "acc.md.skipped": "Skipped",
  "acc.md.notRun": "Not started",
  "acc.md.evidenceSection": "Evidence and notes",
  "acc.md.result": "Result",
  "acc.md.optional": "Optional",
  "acc.md.destructive": "Destructive",
  "acc.md.yes": "Yes",
  "acc.md.no": "No",
  "acc.md.evidence": "Evidence",
  "acc.md.notes": "Notes",
  "acc.md.noEvidence": "No evidence recorded.",
  "acc.md.noNotes": "No notes.",
  "acc.md.lastSnapshot": "Last context snapshot",
  "acc.md.generalNotes": "General notes",
  "acc.md.none": "None.",
  "acc.md.title": "Physical acceptance run",
  "acc.md.summary": "Summary",
  "acc.md.stepsTable": "Steps",
  "acc.md.colOrder": "#",
  "acc.md.colStep": "Step",
  "acc.md.colRisk": "Risk",
  "acc.md.colStatus": "Status",
  "acc.md.colObserved": "Observed at",
  "acc.md.evidenceLimitTitle": "Evidence limit",
  "acc.md.evidenceLimit":
    "This report records what the operator observed. A green CI run or an emulator pass never turns any item into HARDWARE_OBSERVED without a real device trial.",

  // --- acceptance panel ----------------------------------------------------
  "accp.heading": "Physical acceptance and result recording",
  "accp.subheading":
    "Every test is available immediately. The order below is a recommendation, not a software lock.",
  "accp.progressLabel": "Record completion percentage",
  "accp.readinessHeading": "What each device operation needs right now",
  "accp.readinessReady": "Ready",
  "accp.readinessBlocked": "Waiting on:",
  "accp.readinessUnknown": "Not evaluated in this view.",
  "accp.recordingAlwaysOpen":
    "Recording, import, export and result changes are always available here. The readiness list above describes the device operations only; it never gates this recorder.",
  "accp.noPhysicalPassFromSoftware":
    "A software result never becomes a physical PASS. Record only what you observed on the bench.",
  "accp.op.settingsWrite": "Settings write",
  "accp.op.settingsRestore": "Settings restore",
  "accp.op.binding": "Binding",
  "accp.op.firmwareWrite": "Firmware write",
  "accp.op.recovery": "Recovery",
  "accp.op.rxAsTx": "Receiver as transmitter",
  "accp.op.airport": "AirPort",
  "accp.captureContext": "Capture the current state",
  "accp.exportJson": "Export JSON",
  "accp.exportMarkdown": "Export a Markdown report",
  "accp.importSession": "Import a session",
  "accp.newSession": "New session",
  "accp.session": "Session",
  "accp.passed": "Passed",
  "accp.failed": "Failed",
  "accp.blocked": "Blocked",
  "accp.notRun": "Not started",
  "accp.operatorAlias": "Operator short name",
  "accp.benchLabel": "Test bench name",
  "accp.benchPlaceholder": "For example: TX-1 / RX-1",
  "accp.candidateShaPlaceholder": "Commit SHA of the build under test",
  "accp.overallNotes": "General notes",
  "accp.notesPlaceholder":
    "Do not write a UID, SSID, password or binding phrase.",
  "accp.lastSnapshot": "Last saved state snapshot",
  "accp.stepsCount": "{count} tests",
  "accp.expectedEvidence": "Acceptance evidence:",
  "accp.destructiveWarning":
    "This test writes to flash. Run it after the lower-risk tests pass, and on a spare device for the deliberate-interruption case.",
  "accp.result": "Result",
  "accp.resultOf": "Result of {step}",
  "accp.captureStepEvidence": "Capture evidence for this step",
  "accp.recordedEvidence": "Recorded evidence",
  "accp.evidenceOf": "Evidence for {step}",
  "accp.operatorNotes": "Operator notes",
  "accp.notesOf": "Notes for {step}",
  "accp.optional": "Optional",
  "accp.required": "Required",
  "accp.noTimestamp": "No timestamp recorded",
  "accp.lastUpdated": "Last updated: {at}",
  "accp.phase.PREFLIGHT": "Test bench preparation",
  "accp.phase.IDENTITY": "Identity and connection",
  "accp.phase.SETTINGS": "Reversible settings",
  "accp.phase.BINDING": "Wireless binding",
  "accp.phase.FIRMWARE": "Bootloader and flashing",
  "accp.phase.RECOVERY": "Recovery",
  "accp.risk.READ_ONLY": "Read only",
  "accp.risk.REVERSIBLE_WRITE": "Reversible write",
  "accp.risk.RF": "RF link",
  "accp.risk.FIRMWARE_WRITE": "Firmware write",
  "accp.risk.RECOVERY_DRILL": "Recovery drill",
  "accp.msg.freshRecord":
    "A new record was started because the saved candidate SHA does not match this build's SHA.",
  "accp.msg.ready":
    "A local record is ready. Every step is available from the start, with no forced dependency between them.",
  "accp.msg.contextCaptured":
    "The application's current state was captured, without saving any password, SSID or binding phrase.",
  "accp.msg.evidenceCaptured":
    "Evidence captured for {step}. The result still needs the operator's own observation.",
  "accp.msg.evidenceCapturedWithSuggestion":
    "Verifiable evidence was captured for {step}, with a suggested result of {status}.",
  "accp.msg.newSession":
    "A new acceptance session was created. The previous one is no longer in local storage.",
  "accp.msg.jsonExported":
    "A JSON file was produced with the sensitive fields redacted.",
  "accp.msg.markdownExported":
    "A Markdown report was produced, ready to review and attach to the PR.",
  "accp.msg.unboundExport":
    "This build carries no exact candidate SHA, so the export records it as UNSPECIFIED.",
  "accp.msg.importTooLarge": "The import file is empty or larger than 1 MiB.",
  "accp.msg.importInvalid":
    "The results file is not valid, or does not match the physical acceptance schema.",
  "accp.msg.importShaMismatch":
    "The import was rejected because the candidate SHA in the file does not match this build's SHA.",
  "accp.msg.imported":
    "The session was imported, and its structure and bounds verified.",
  "accp.msg.importUnreadable": "The results file could not be read.",
  "accp.msg.captureBlock": "Snapshot {at}",
} as const;
