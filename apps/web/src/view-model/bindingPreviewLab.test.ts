import { describe, expect, it } from "vitest";

import {
  prepareBindingPreviewLab,
  runPreparedBindingPreviewLab,
  type BindingPreviewLabPreparation,
} from "./bindingPreviewLab";

describe("Binding preview Web lab view-model", () => {
  it("prepares a ready value-only preview for a supported Synthetic fixture", async () => {
    const preparation = await prepareBindingPreviewLab("tx-2g4");

    expect(preparation.preview).toMatchObject({
      operationId: preparation.operationId,
      status: "READY",
      validationLevel: "SIMULATION_ONLY",
      executionAuthority: "SYNTHETIC_ONLY",
      providerId: "mock-binding",
      targetId: "fixture.tx.alpha-2g4",
      targetDisplayName: "Synthetic TX Alpha 2.4",
      blockers: [],
    });
    expect(preparation.preview.changeCodes).toEqual([
      "BINDING_RELATIONSHIP_WILL_CHANGE",
    ]);
    expect(preparation.preview.verificationRequirements).toEqual([
      "RECONNECT_SAME_DEVICE",
      "REIDENTIFY_SAME_TARGET",
      "LINK_ESTABLISHED",
    ]);
    expect(Object.isFrozen(preparation)).toBe(true);
  });

  it("runs the displayed preview through a fresh live gate before Synthetic execution", async () => {
    const preparation = await prepareBindingPreviewLab("rx-sub-ghz");
    const outcome = await runPreparedBindingPreviewLab(preparation);

    expect(outcome).toMatchObject({
      state: "SUCCESS",
      verificationPassed: true,
      errorCode: null,
      targetId: "fixture.rx.beta-subghz",
      previewId: preparation.preview.previewId,
    });
    expect(outcome.auditEventCount).toBeGreaterThan(0);
  });

  it("keeps confirm unavailable when runtime guided Binding evidence is absent", async () => {
    const preparation = await prepareBindingPreviewLab("tx-dual-band");

    expect(preparation.preview.status).toBe("BLOCKED");
    expect(preparation.preview.blockers.map((item) => item.code)).toContain(
      "RUNTIME_GUIDED_BIND_NOT_AVAILABLE",
    );
    await expect(runPreparedBindingPreviewLab(preparation)).rejects.toThrowError(
      "A blocked Binding preview cannot be approved",
    );
  });

  it("rejects a Target-altered displayed preview before any success claim", async () => {
    const original = await prepareBindingPreviewLab("tx-2g4");
    const altered: BindingPreviewLabPreparation = Object.freeze({
      ...original,
      preview: Object.freeze({
        ...original.preview,
        targetId: "fixture.rx.beta-subghz",
        targetDisplayName: "Synthetic RX Beta Sub-GHz",
      }),
    });
    const outcome = await runPreparedBindingPreviewLab(altered);

    expect(outcome.state).toBe("FAILED");
    expect(outcome.verificationPassed).toBe(false);
    expect(outcome.errorCode).toBe("PERMISSION_DENIED");
    expect(outcome.targetId).toBeNull();
    expect(outcome.previewId).toBeNull();
  });

  it("rejects an operation-id mismatch before constructing approval", async () => {
    const original = await prepareBindingPreviewLab("tx-2g4");
    const altered: BindingPreviewLabPreparation = Object.freeze({
      ...original,
      operationId: `${original.operationId}-other`,
    });

    await expect(runPreparedBindingPreviewLab(altered)).rejects.toThrowError(
      "Binding preview operation id does not match",
    );
  });
});
