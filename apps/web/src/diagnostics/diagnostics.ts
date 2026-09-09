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
    /** A native host supplied the serial transport instead of the browser. */
    readonly nativeBridge: boolean;
    /**
     * What that native host was built from. A packaged host serves the web
     * application from inside itself, so this is the only way a report from an
     * installed build names the sources behind it. Null in a browser.
     */
    readonly nativeHostWebBuild: string | null;
    readonly nativeHostNativeSource: string | null;
    readonly nativeHostBridge: string | null;
    readonly language: string;
    readonly platform: string;
    readonly standaloneDisplay: boolean;
    readonly serviceWorkerSupported: boolean;
    /** The browser's own version claim, e.g. "Chrome 154". */
    readonly browserVersion: string;
    /** Whether the platform reports itself as Android. */
    readonly android: boolean;
    /** Whether the document's permissions policy allows the device APIs. */
    readonly serialPolicyAllowed: boolean | null;
    readonly usbPolicyAllowed: boolean | null;
    /**
     * Devices this origin has already been granted. Neither Web Serial nor
     * WebUSB reveals OTG state or an unprompted device list, so this is the
     * closest observable to "a device is attached". Zero before a first grant
     * is normal, and null means the browser would not answer.
     */
    readonly grantedSerialPorts: number | null;
    readonly grantedUsbDevices: number | null;
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
    redactedLine("Browser", snapshot.environment.browserVersion),
    redactedLine("Android", snapshot.environment.android),
    redactedLine("Web Serial", snapshot.environment.webSerialSupported),
    redactedLine("WebUSB", snapshot.environment.webUsbSupported),
    redactedLine(
      "Serial permitted by policy",
      snapshot.environment.serialPolicyAllowed,
    ),
    redactedLine(
      "USB permitted by policy",
      snapshot.environment.usbPolicyAllowed,
    ),
    redactedLine(
      "Serial ports already granted",
      snapshot.environment.grantedSerialPorts,
    ),
    redactedLine(
      "USB devices already granted",
      snapshot.environment.grantedUsbDevices,
    ),
    redactedLine("Native bridge", snapshot.environment.nativeBridge),
    redactedLine(
      "Native host web build",
      snapshot.environment.nativeHostWebBuild,
    ),
    redactedLine(
      "Native host native source",
      snapshot.environment.nativeHostNativeSource,
    ),
    redactedLine("Native host bridge", snapshot.environment.nativeHostBridge),
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
