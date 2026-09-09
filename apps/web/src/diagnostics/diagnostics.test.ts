import { describe, expect, it } from "vitest";

import {
  DIAGNOSTICS_SCHEMA_VERSION,
  diagnosticsFileStem,
  serializeDiagnosticsJson,
  serializeDiagnosticsMarkdown,
  type DiagnosticsSnapshot,
} from "./diagnostics";

function snapshot(
  overrides: Partial<DiagnosticsSnapshot> = {},
): DiagnosticsSnapshot {
  return {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    capturedAt: "2026-09-09T07:30:00.000Z",
    buildSha: "a".repeat(40),
    environment: {
      secureContext: true,
      webSerialSupported: true,
      webUsbSupported: false,
      nativeBridge: false,
      nativeHostWebBuild: null,
      nativeHostNativeSource: null,
      nativeHostBridge: null,
      language: "ar",
      platform: "Linux",
      standaloneDisplay: false,
      serviceWorkerSupported: true,
      browserVersion: "Chromium 154",
      android: false,
      serialPolicyAllowed: true,
      usbPolicyAllowed: true,
      grantedSerialPorts: 0,
      grantedUsbDevices: 0,
    },
    device: {
      connected: true,
      productName: "Reference TX",
      firmwareVersion: "4.1.0",
      hardwareVersion: 3,
      role: "tx",
      identityValidation: "CRSF_DEVICE_INFO",
      parameterCount: 12,
      usbVendorId: 0x303a,
      usbProductId: 0x1001,
    },
    capabilities: {
      writableParameterCount: 4,
      bindCommandAvailable: true,
      linkTelemetryObservable: true,
      settingsBackupAvailable: true,
    },
    firmware: {
      catalogState: "ready",
      releaseLabel: "4.1.0",
      targetId: "vendor/tx_2400/module",
      targetPlatform: "esp32",
      targetConfidence: "EXACT",
      updateMethod: "uart",
      regulatoryRegion: "FCC_2400",
      packageSegmentCount: 1,
      packageSegmentHashes: ["b".repeat(64)],
      bindingPhraseConfigured: true,
      recoveryPackageDownloaded: true,
    },
    recovery: {
      journalState: "ready",
      checkpointStage: null,
      checkpointProductName: null,
      checkpointSafeError: null,
    },
    binding: { evidenceLevel: "LINK_OBSERVED_BY_TELEMETRY" },
    lastStatusMessage: "اكتمل التفليش وعاد الجهاز بالإصدار المتوقع.",
    evidence: { hardwareValidation: "NONE", deviceWrites: "EVIDENCE_GATED" },
    ...overrides,
  };
}

describe("diagnostics snapshot", () => {
  it("records whether a binding phrase was used without carrying the phrase", () => {
    const json = serializeDiagnosticsJson(snapshot());
    const parsed = JSON.parse(json) as DiagnosticsSnapshot;

    expect(parsed.firmware.bindingPhraseConfigured).toBe(true);
    // There is no field for the phrase or the derived UID at all.
    expect(json).not.toMatch(/bindPhrase|bindingPhrase"|"uid"/iu);
  });

  it("redacts a secret an operator typed into free text", () => {
    const leaked = snapshot({
      lastStatusMessage: "فشل مع bind phrase: shared-bench-phrase",
      recovery: {
        journalState: "ready",
        checkpointStage: "RECOVERY_INCOMPLETE",
        checkpointProductName: "Reference TX",
        checkpointSafeError: "wifi password=hunter2 rejected",
      },
    });

    const json = serializeDiagnosticsJson(leaked);
    const markdown = serializeDiagnosticsMarkdown(leaked);

    expect(json).not.toContain("shared-bench-phrase");
    expect(json).not.toContain("hunter2");
    expect(markdown).not.toContain("shared-bench-phrase");
    expect(markdown).not.toContain("hunter2");
    expect(markdown).toContain("REDACTED");
  });

  it("never claims hardware validation the project does not have", () => {
    expect(serializeDiagnosticsMarkdown(snapshot())).toContain(
      "Hardware validation: NONE",
    );
  });

  it("reports the recovery stage so an interrupted update is visible", () => {
    const pending = snapshot({
      recovery: {
        journalState: "ready",
        checkpointStage: "RECOVERY_INCOMPLETE",
        checkpointProductName: "Reference TX",
        checkpointSafeError: null,
      },
    });

    expect(serializeDiagnosticsMarkdown(pending)).toContain(
      "Checkpoint stage: RECOVERY_INCOMPLETE",
    );
  });

  it("names the file by capture time and nothing else", () => {
    expect(diagnosticsFileStem(snapshot())).toBe(
      "elrs-easy-diagnostics-20260909073000",
    );
  });

  it("falls back to a stable name when the timestamp is unusable", () => {
    expect(diagnosticsFileStem(snapshot({ capturedAt: "" }))).toBe(
      "elrs-easy-diagnostics-unknown",
    );
  });
});
