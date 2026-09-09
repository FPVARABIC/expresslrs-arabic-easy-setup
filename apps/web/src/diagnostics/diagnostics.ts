import { redactSensitiveAcceptanceText } from "../acceptance/physical-acceptance";

export const DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

/**
 * What the application can actually say about a session, gathered from live
 * state rather than from a build-time claim. Every field here is either an
 * observation the device made, a choice the operator made, or a capability the
 * browser reported.
 *
 * Secrets are absent by construction, not by filtering: the binding phrase,
 * the derived UID, the Wi-Fi credentials, and the USB serial number have no
 * field to live in. Free text still passes through the acceptance redaction on
 * the way out, because an operator's note can carry anything.
 */
export interface DiagnosticsSnapshot {
  readonly schemaVersion: typeof DIAGNOSTICS_SCHEMA_VERSION;
  readonly capturedAt: string;
  readonly buildSha: string;
  readonly environment: {
    readonly secureContext: boolean;
    readonly webSerialSupported: boolean;
    readonly webUsbSupported: boolean;
    readonly language: string;
    readonly platform: string;
    readonly standaloneDisplay: boolean;
    readonly serviceWorkerSupported: boolean;
  };
  readonly device: {
    readonly connected: boolean;
    readonly productName: string | null;
    readonly firmwareVersion: string | null;
    readonly hardwareVersion: number | null;
    readonly role: "tx" | "rx" | null;
    readonly identityValidation: string | null;
    readonly parameterCount: number | null;
    readonly usbVendorId: number | null;
    readonly usbProductId: number | null;
  };
  readonly capabilities: {
    readonly writableParameterCount: number;
    readonly bindCommandAvailable: boolean;
    readonly linkTelemetryObservable: boolean;
    readonly settingsBackupAvailable: boolean;
  };
  readonly firmware: {
    readonly catalogState: string;
    readonly releaseLabel: string | null;
    readonly targetId: string | null;
    readonly targetPlatform: string | null;
    readonly targetConfidence: string | null;
    readonly updateMethod: string | null;
    readonly regulatoryRegion: string | null;
    readonly packageSegmentCount: number;
    readonly packageSegmentHashes: readonly string[];
    readonly bindingPhraseConfigured: boolean;
    readonly recoveryPackageDownloaded: boolean;
  };
  readonly recovery: {
    readonly journalState: string;
    readonly checkpointStage: string | null;
    readonly checkpointProductName: string | null;
    readonly checkpointSafeError: string | null;
  };
  readonly binding: {
    readonly evidenceLevel: string | null;
  };
  readonly lastStatusMessage: string;
  /** What this build has and has not been proven against. */
  readonly evidence: {
    readonly hardwareValidation: "NONE" | "IN_PROGRESS" | "VERIFIED";
    readonly deviceWrites: "EVIDENCE_GATED";
  };
}

function redactedLine(label: string, value: unknown): string {
  return `${label}: ${redactSensitiveAcceptanceText(String(value ?? "—"))}`;
}

/**
 * Serializes a snapshot as JSON. Free-text fields are redacted; structured
 * fields are already secret-free, so they are emitted as read.
 */
export function serializeDiagnosticsJson(
  snapshot: DiagnosticsSnapshot,
): string {
  return JSON.stringify(
    {
      ...snapshot,
      lastStatusMessage: redactSensitiveAcceptanceText(
        snapshot.lastStatusMessage,
      ),
      recovery: {
        ...snapshot.recovery,
        checkpointSafeError:
          snapshot.recovery.checkpointSafeError === null
            ? null
            : redactSensitiveAcceptanceText(
                snapshot.recovery.checkpointSafeError,
              ),
      },
    },
    null,
    2,
  );
}

/** The same snapshot as a report a person can paste into an issue. */
export function serializeDiagnosticsMarkdown(
  snapshot: DiagnosticsSnapshot,
): string {
  const lines = [
    "# ExpressLRS Easy Setup — diagnostics",
    "",
    redactedLine("Captured", snapshot.capturedAt),
    redactedLine("Build", snapshot.buildSha),
    redactedLine("Hardware validation", snapshot.evidence.hardwareValidation),
    redactedLine("Device writes", snapshot.evidence.deviceWrites),
    "",
    "## Environment",
    redactedLine("Secure context", snapshot.environment.secureContext),
    redactedLine("Web Serial", snapshot.environment.webSerialSupported),
    redactedLine("WebUSB", snapshot.environment.webUsbSupported),
    redactedLine("Service worker", snapshot.environment.serviceWorkerSupported),
    redactedLine("Standalone display", snapshot.environment.standaloneDisplay),
    redactedLine("Platform", snapshot.environment.platform),
    redactedLine("Language", snapshot.environment.language),
    "",
    "## Device",
    redactedLine("Connected", snapshot.device.connected),
    redactedLine("Model", snapshot.device.productName),
    redactedLine("Firmware", snapshot.device.firmwareVersion),
    redactedLine("Hardware", snapshot.device.hardwareVersion),
    redactedLine("Role", snapshot.device.role),
    redactedLine("Identity evidence", snapshot.device.identityValidation),
    redactedLine("Parameters", snapshot.device.parameterCount),
    redactedLine("USB vendor", snapshot.device.usbVendorId),
    redactedLine("USB product", snapshot.device.usbProductId),
    "",
    "## Capabilities",
    redactedLine(
      "Writable parameters",
      snapshot.capabilities.writableParameterCount,
    ),
    redactedLine("Bind command", snapshot.capabilities.bindCommandAvailable),
    redactedLine(
      "Link telemetry",
      snapshot.capabilities.linkTelemetryObservable,
    ),
    redactedLine(
      "Settings backup",
      snapshot.capabilities.settingsBackupAvailable,
    ),
    "",
    "## Firmware",
    redactedLine("Catalog", snapshot.firmware.catalogState),
    redactedLine("Release", snapshot.firmware.releaseLabel),
    redactedLine("Target", snapshot.firmware.targetId),
    redactedLine("Platform", snapshot.firmware.targetPlatform),
    redactedLine("Target confidence", snapshot.firmware.targetConfidence),
    redactedLine("Update method", snapshot.firmware.updateMethod),
    redactedLine("Regulatory region", snapshot.firmware.regulatoryRegion),
    redactedLine("Segments", snapshot.firmware.packageSegmentCount),
    redactedLine(
      "Segment hashes",
      snapshot.firmware.packageSegmentHashes.join(", "),
    ),
    redactedLine(
      "Binding phrase configured",
      snapshot.firmware.bindingPhraseConfigured,
    ),
    redactedLine(
      "Recovery package downloaded",
      snapshot.firmware.recoveryPackageDownloaded,
    ),
    "",
    "## Recovery",
    redactedLine("Journal", snapshot.recovery.journalState),
    redactedLine("Checkpoint stage", snapshot.recovery.checkpointStage),
    redactedLine("Checkpoint device", snapshot.recovery.checkpointProductName),
    redactedLine("Checkpoint error", snapshot.recovery.checkpointSafeError),
    "",
    "## Binding",
    redactedLine("Evidence level", snapshot.binding.evidenceLevel),
    "",
    "## Last status",
    redactSensitiveAcceptanceText(snapshot.lastStatusMessage),
  ];
  return lines.join("\n");
}

/** A stable, sortable file name that carries no device or operator identity. */
export function diagnosticsFileStem(snapshot: DiagnosticsSnapshot): string {
  const stamp = snapshot.capturedAt.replace(/[^0-9]/gu, "").slice(0, 14);
  return `elrs-easy-diagnostics-${stamp === "" ? "unknown" : stamp}`;
}
