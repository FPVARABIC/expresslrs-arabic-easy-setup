import { describe, expect, it } from "vitest";

import {
  prepareFirmwarePreviewLab,
  runPreparedFirmwarePreviewLab,
  type FirmwarePreviewLabPreparation,
} from "./firmwarePreviewLab";

describe("Firmware preview Web lab view-model", () => {
  it("prepares a ready value-only preview with artifact provenance and a verification plan", async () => {
    const preparation = await prepareFirmwarePreviewLab("compatible");

    expect(preparation.preview).toMatchObject({
      operationId: preparation.operationId,
      operationType: "FIRMWARE_UPDATE",
      status: "READY",
      validationLevel: "SIMULATION_ONLY",
      executionAuthority: "SYNTHETIC_ONLY",
      providerId: "mock-wifi",
      updateCapabilityId: "mock-wifi-update",
      targetId: "fixture.tx.alpha-2g4",
      compatibilityStatus: "COMPATIBLE",
      blockers: [],
    });
    expect(preparation.preview.artifact?.firmwareVersion).toBe("4.2.0");
    expect(preparation.preview.provenance?.upstreamVersion).toBe("4.1.0");
    expect(preparation.preview.changeCodes).toEqual([
      "FIRMWARE_WILL_BE_REPLACED",
      "DEVICE_WILL_REBOOT",
      "LINK_WILL_BE_INTERRUPTED",
    ]);
    expect(
      preparation.preview.verificationPlan?.requirements.map(
        (item) => item.fact,
      ),
    ).toEqual([
      "DEVICE_RECONNECTED",
      "DEVICE_IDENTITY_MATCHES",
      "TARGET_MATCHES",
      "FIRMWARE_VERSION_MATCHES",
    ]);
    expect(Object.isFrozen(preparation)).toBe(true);
  });

  it("runs the displayed preview through a fresh live gate before Synthetic write", async () => {
    const preparation = await prepareFirmwarePreviewLab("compatible");
    const outcome = await runPreparedFirmwarePreviewLab(preparation);

    expect(outcome).toMatchObject({
      state: "SUCCESS",
      verificationPassed: true,
      errorCode: null,
      targetId: "fixture.tx.alpha-2g4",
      firmwareVersion: "4.2.0",
      previewId: preparation.preview.previewId,
      verificationPlanId: preparation.preview.verificationPlan?.id,
      provenanceArtifactSha256: preparation.preview.provenance?.artifactSha256,
    });
    expect(outcome.auditEventCount).toBeGreaterThan(0);
  });

  it("keeps confirmation unavailable when compatibility is blocked", async () => {
    const preparation = await prepareFirmwarePreviewLab("major-mismatch");

    expect(preparation.preview.status).toBe("BLOCKED");
    expect(preparation.preview.compatibilityStatus).toBe("BLOCKED");
    expect(preparation.preview.compatibilityReasons).toContain(
      "FIRMWARE_MAJOR_UNSUPPORTED",
    );
    expect(preparation.preview.blockers.map((item) => item.code)).toContain(
      "COMPATIBILITY_NOT_PROVEN",
    );
    await expect(
      runPreparedFirmwarePreviewLab(preparation),
    ).rejects.toThrowError("A blocked Firmware preview cannot be approved");
  });

  it("keeps confirmation unavailable when provenance does not bind the artifact", async () => {
    const preparation = await prepareFirmwarePreviewLab("provenance-mismatch");

    expect(preparation.preview.status).toBe("BLOCKED");
    expect(preparation.preview.blockers.map((item) => item.code)).toContain(
      "PROVENANCE_ARTIFACT_MISMATCH",
    );
    expect(preparation.preview.verificationPlan).toBeNull();
  });

  it("rejects a displayed artifact alteration before any success claim", async () => {
    const original = await prepareFirmwarePreviewLab("compatible");
    const altered: FirmwarePreviewLabPreparation = Object.freeze({
      ...original,
      preview: Object.freeze({
        ...original.preview,
        artifact: Object.freeze({
          ...original.preview.artifact!,
          sha256: "b".repeat(64),
        }),
      }),
    });
    const outcome = await runPreparedFirmwarePreviewLab(altered);

    expect(outcome.state).toBe("FAILED");
    expect(outcome.verificationPassed).toBe(false);
    expect(outcome.errorCode).toBe("PERMISSION_DENIED");
    expect(outcome.targetId).toBeNull();
    expect(outcome.previewId).toBeNull();
    expect(outcome.verificationPlanId).toBeNull();
  });

  it("rejects an operation-id mismatch before constructing approval", async () => {
    const original = await prepareFirmwarePreviewLab("compatible");
    const altered: FirmwarePreviewLabPreparation = Object.freeze({
      ...original,
      operationId: `${original.operationId}-other`,
    });

    await expect(runPreparedFirmwarePreviewLab(altered)).rejects.toThrowError(
      "Firmware preview operation id does not match",
    );
  });
});
