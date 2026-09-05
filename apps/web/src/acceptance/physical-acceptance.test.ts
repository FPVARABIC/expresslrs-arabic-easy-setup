import { describe, expect, it } from "vitest";

import {
  PHYSICAL_ACCEPTANCE_STEPS,
  acceptanceEvidenceFromContext,
  capturePhysicalAcceptanceContext,
  createPhysicalAcceptanceSession,
  parsePhysicalAcceptanceJson,
  physicalAcceptanceFileStem,
  redactSensitiveAcceptanceText,
  sanitizeAcceptanceText,
  serializePhysicalAcceptanceJson,
  serializePhysicalAcceptanceMarkdown,
  suggestPhysicalAcceptanceEvidence,
  summarizePhysicalAcceptance,
  updatePhysicalAcceptanceMetadata,
  updatePhysicalAcceptanceStep,
  type PhysicalAcceptanceContextSnapshot,
} from "./physical-acceptance";

const fixedNow = () => new Date("2026-09-01T12:00:00.000Z");

function session() {
  return createPhysicalAcceptanceSession({
    runtime: {
      appUrl: "https://example.test/app/",
      userAgent: "Test Browser",
      language: "ar",
      candidateSha: "abcdef1234567890",
    },
    sessionId: "session-1",
    now: fixedNow,
  });
}

function context(
  patch: Partial<PhysicalAcceptanceContextSnapshot> = {},
): PhysicalAcceptanceContextSnapshot {
  return {
    capturedAt: "2026-09-01T12:01:00.000Z",
    secureContext: true,
    webSerialSupported: true,
    connectionState: "CRSF_CONNECTED",
    selectedRole: "tx",
    observedRole: "tx",
    productName: "Test ELRS TX",
    firmwareVersion: "4.1.0",
    hardwareVersion: 1,
    parameterCount: 16,
    usbVendorId: 0x303a,
    usbProductId: 0x1001,
    targetId: "vendor/radio/tx.json",
    targetKey: "TEST_TX",
    targetName: "Test TX",
    targetPlatform: "esp32",
    targetConfidence: "EXACT",
    releaseLabel: "4.1.0",
    releaseRevision: "4.1.0",
    flashMethod: "uart",
    settingsBackupAvailable: true,
    writableParameterCount: 6,
    bindCommandAvailable: true,
    bootloaderCommandAvailable: true,
    packageFileName: "firmware.bin",
    recoveryFileName: "recovery.zip",
    packageSegmentCount: 2,
    packageSegmentHashes: ["a".repeat(64), "b".repeat(64)],
    recoveryDownloaded: true,
    checkpointStage: "PACKAGE_SAVED",
    flashStage: null,
    statusMessage: "CRSF connected",
    ...patch,
  };
}

describe("physical acceptance model", () => {
  it("defines one ordered and unique result slot for every acceptance step", () => {
    const ids = PHYSICAL_ACCEPTANCE_STEPS.map((step) => step.id);
    const orders = PHYSICAL_ACCEPTANCE_STEPS.map((step) => step.order);

    expect(ids).toHaveLength(19);
    expect(new Set(ids).size).toBe(ids.length);
    expect(orders).toEqual(Array.from({ length: 19 }, (_, index) => index + 1));
  });

  it("creates an unlocked session with every step available from the start", () => {
    const value = session();

    expect(Object.keys(value.results)).toHaveLength(19);
    expect(
      Object.values(value.results).every(
        (result) => result.status === "NOT_RUN",
      ),
    ).toBe(true);
    expect(value.events[0]?.type).toBe("SESSION_CREATED");
  });

  it("allows a late destructive step to be recorded without completing earlier steps", () => {
    const value = updatePhysicalAcceptanceStep(
      session(),
      "normal_flash_verified",
      { status: "PASS", evidence: "read-back matched" },
      fixedNow,
    );

    expect(value.results.normal_flash_verified.status).toBe("PASS");
    expect(value.results.secure_browser.status).toBe("NOT_RUN");
    expect(value.results.settings_backup_created.status).toBe("NOT_RUN");
  });

  it("summarizes all statuses without converting skipped or blocked to pass", () => {
    let value = session();
    value = updatePhysicalAcceptanceStep(
      value,
      "secure_browser",
      { status: "PASS" },
      fixedNow,
    );
    value = updatePhysicalAcceptanceStep(
      value,
      "bench_baseline",
      { status: "FAIL" },
      fixedNow,
    );
    value = updatePhysicalAcceptanceStep(
      value,
      "tx_crsf_identity",
      { status: "BLOCKED" },
      fixedNow,
    );
    value = updatePhysicalAcceptanceStep(
      value,
      "interrupted_flash_recovery",
      { status: "SKIPPED" },
      fixedNow,
    );

    expect(summarizePhysicalAcceptance(value)).toMatchObject({
      total: 19,
      passed: 1,
      failed: 1,
      blocked: 1,
      skipped: 1,
      notRun: 15,
      completed: 4,
      completionPercent: 21,
    });
  });

  it("removes control and bidi characters from operator-controlled text", () => {
    expect(sanitizeAcceptanceText("TX\u0000\u202eABC\r\n1")).toBe("TXABC\n1");
  });

  it("redacts common sensitive labels before export", () => {
    const redacted = redactSensitiveAcceptanceText(
      "ssid: my-network\npassword=hunter2\nUID abcdef\nresult ok",
    );

    expect(redacted).not.toContain("my-network");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("abcdef");
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).toContain("result ok");
  });

  it("captures only bounded hardware evidence and rejects impossible USB IDs", () => {
    const value = capturePhysicalAcceptanceContext(
      session(),
      context({
        usbVendorId: 0x1_0000,
        packageSegmentHashes: ["A".repeat(64), "not-a-hash"],
        statusMessage: "password=hidden",
      }),
      fixedNow,
    );

    expect(value.lastContext?.usbVendorId).toBeNull();
    expect(value.lastContext?.packageSegmentHashes).toEqual(["a".repeat(64)]);
    expect(value.events.at(-1)?.type).toBe("CONTEXT_CAPTURED");
    expect(acceptanceEvidenceFromContext(value.lastContext!)).not.toContain(
      "hidden",
    );
  });

  it("suggests pass only for evidence that the application can actually observe", () => {
    expect(
      suggestPhysicalAcceptanceEvidence("tx_crsf_identity", context()).status,
    ).toBe("PASS");
    expect(
      suggestPhysicalAcceptanceEvidence("rf_link_observed", context()).status,
    ).toBeNull();
    expect(
      suggestPhysicalAcceptanceEvidence(
        "secure_browser",
        context({ secureContext: false }),
      ).status,
    ).toBe("BLOCKED");
  });

  it("round-trips a valid JSON export through strict parsing", () => {
    let value = updatePhysicalAcceptanceMetadata(
      session(),
      {
        operatorAlias: "Ahmed",
        benchLabel: "TX-1",
        overallNotes: "no secrets",
      },
      fixedNow,
    );
    value = updatePhysicalAcceptanceStep(
      value,
      "secure_browser",
      { status: "PASS", evidence: "HTTPS + Web Serial" },
      fixedNow,
    );

    const restored = parsePhysicalAcceptanceJson(
      serializePhysicalAcceptanceJson(value),
    );

    expect(restored?.operatorAlias).toBe("Ahmed");
    expect(restored?.results.secure_browser.status).toBe("PASS");
    expect(restored?.events.at(-1)?.type).toBe("SESSION_IMPORTED");
  });

  it("rejects malformed and oversized imported sessions", () => {
    expect(parsePhysicalAcceptanceJson("not-json")).toBeNull();
    expect(
      parsePhysicalAcceptanceJson(JSON.stringify({ schemaVersion: 1 })),
    ).toBeNull();
    expect(
      parsePhysicalAcceptanceJson(`"${"x".repeat(1_000_001)}"`),
    ).toBeNull();
  });

  it("redacts notes in Markdown and JSON reports", () => {
    const value = updatePhysicalAcceptanceStep(
      updatePhysicalAcceptanceMetadata(
        session(),
        { overallNotes: "ssid: lab-network" },
        fixedNow,
      ),
      "bench_baseline",
      {
        status: "PASS",
        evidence: "password=do-not-export",
        notes: "UID deadbeef",
      },
      fixedNow,
    );

    const markdown = serializePhysicalAcceptanceMarkdown(value);
    const json = serializePhysicalAcceptanceJson(value);

    expect(markdown).not.toContain("lab-network");
    expect(markdown).not.toContain("do-not-export");
    expect(json).not.toContain("deadbeef");
    expect(markdown).toContain("[REDACTED]");
  });

  it("creates a filesystem-safe report stem tied to the candidate", () => {
    expect(physicalAcceptanceFileStem(session())).toBe(
      "expresslrs-physical-acceptance-abcdef123456-session-1",
    );
  });
});
