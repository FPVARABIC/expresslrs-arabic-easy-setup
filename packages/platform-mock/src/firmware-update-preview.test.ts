import { ExclusiveDeviceSessionManager } from "@elrs-easy/device";
import type { ArtifactProvenance } from "@elrs-easy/domain";
import {
  approvalMatchesFirmwareUpdatePreview,
  createFirmwareUpdateApproval,
  prepareFirmwareUpdatePreview,
  runFirmwareUpdate,
  type FirmwareUpdateApproval,
} from "@elrs-easy/workflows";
import { describe, expect, it } from "vitest";

import { syntheticTargetCatalog } from "./fixtures.js";
import { ScriptedFirmwareUpdateProvider } from "./mock-sensitive-operation-providers.js";
import {
  compatibleFirmwareArtifact,
  compatibleFirmwareProvenance,
  majorVersionMismatchArtifact,
  majorVersionMismatchProvenance,
  sensitiveOperationFixtures,
} from "./sensitive-operation-fixtures.js";

const now = "2026-08-20T08:00:00.000Z";

function sessions() {
  let id = 0;
  return new ExclusiveDeviceSessionManager({
    clock: { now: () => now },
    ids: { next: () => `firmware-preview-session-${++id}` },
  });
}

function blockerCodes(preview: {
  readonly blockers: readonly { readonly code: string }[];
}) {
  return preview.blockers.map((item) => item.code);
}

describe("Firmware Update preview, provenance, and approval", () => {
  it("prepares a read-only Synthetic preview with provenance and verification plan", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const preview = await prepareFirmwareUpdatePreview({
      operationId: "firmware-preview-ready",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance: compatibleFirmwareProvenance,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(preview).toMatchObject({
      schemaVersion: 1,
      previewId: "firmware-preview-ready:firmware-preview:v1",
      operationType: "FIRMWARE_UPDATE",
      status: "READY",
      validationLevel: "SIMULATION_ONLY",
      executionAuthority: "SYNTHETIC_ONLY",
      providerId: "mock-wifi",
      updateCapabilityId: "mock-wifi-update",
      targetId: compatibleFirmwareArtifact.targetId,
      compatibilityStatus: "COMPATIBLE",
      blockers: [],
    });
    expect(preview.artifact).toEqual(compatibleFirmwareArtifact);
    expect(preview.provenance).toEqual(compatibleFirmwareProvenance);
    expect(preview.changeCodes).toEqual([
      "FIRMWARE_WILL_BE_REPLACED",
      "DEVICE_WILL_REBOOT",
      "LINK_WILL_BE_INTERRUPTED",
    ]);
    expect(
      preview.verificationPlan?.requirements.map((item) => item.fact),
    ).toEqual([
      "DEVICE_RECONNECTED",
      "DEVICE_IDENTITY_MATCHES",
      "TARGET_MATCHES",
      "FIRMWARE_VERSION_MATCHES",
    ]);
    expect(provider.calls.map((call) => call.stage)).toEqual([
      "VALIDATE_ARTIFACT",
      "READ_IDENTITY_INITIAL",
      "READ_CAPABILITIES_INITIAL",
    ]);
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.verificationPlan)).toBe(true);
    expect(Object.isFrozen(preview.verificationPlan?.requirements)).toBe(true);
  });

  it("blocks a non-Synthetic authority before any provider method", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    Object.defineProperty(provider, "executionAuthority", {
      configurable: true,
      value: "REAL_DEVICE",
    });

    const preview = await prepareFirmwareUpdatePreview({
      operationId: "firmware-preview-real-authority",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance: compatibleFirmwareProvenance,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(preview.status).toBe("BLOCKED");
    expect(preview.executionAuthority).toBe("NONE");
    expect(blockerCodes(preview)).toContain("HARDWARE_WRITE_DISABLED");
    expect(provider.calls).toEqual([]);
  });

  it("blocks provenance that does not bind the artifact before provider calls", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const provenance: ArtifactProvenance = Object.freeze({
      ...compatibleFirmwareProvenance,
      artifactSha256: "a".repeat(64),
    });
    const preview = await prepareFirmwareUpdatePreview({
      operationId: "firmware-preview-provenance-mismatch",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(preview.status).toBe("BLOCKED");
    expect(blockerCodes(preview)).toContain("PROVENANCE_ARTIFACT_MISMATCH");
    expect(preview.verificationPlan).toBeNull();
    expect(provider.calls).toEqual([]);
  });

  it("does not execute accessor-backed provenance", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    let accessorExecuted = false;
    const provenance = Object.defineProperties(
      {},
      Object.fromEntries(
        Object.entries(compatibleFirmwareProvenance).map(([key, value]) => [
          key,
          key === "builtAt"
            ? {
                configurable: true,
                enumerable: true,
                get: () => {
                  accessorExecuted = true;
                  return value;
                },
              }
            : {
                configurable: true,
                enumerable: true,
                value,
                writable: false,
              },
        ]),
      ),
    );

    const preview = await prepareFirmwareUpdatePreview({
      operationId: "firmware-preview-accessor-provenance",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(preview.status).toBe("BLOCKED");
    expect(blockerCodes(preview)).toContain("PROVENANCE_INVALID");
    expect(accessorExecuted).toBe(false);
    expect(provider.calls).toEqual([]);
  });

  it("blocks failed local artifact integrity without reading the device", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
      artifactValid: false,
    });
    const preview = await prepareFirmwareUpdatePreview({
      operationId: "firmware-preview-integrity-failed",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance: compatibleFirmwareProvenance,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(preview.status).toBe("BLOCKED");
    expect(blockerCodes(preview)).toContain("ARTIFACT_INTEGRITY_NOT_CONFIRMED");
    expect(provider.calls.map((call) => call.stage)).toEqual([
      "VALIDATE_ARTIFACT",
    ]);
  });

  it("records compatibility failure for an unsupported major version", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const preview = await prepareFirmwareUpdatePreview({
      operationId: "firmware-preview-major-mismatch",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: majorVersionMismatchArtifact,
      provenance: majorVersionMismatchProvenance,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(preview.status).toBe("BLOCKED");
    expect(preview.compatibilityStatus).toBe("BLOCKED");
    expect(preview.compatibilityReasons).toContain(
      "FIRMWARE_MAJOR_UNSUPPORTED",
    );
    expect(blockerCodes(preview)).toContain("COMPATIBILITY_NOT_PROVEN");
  });

  it("creates an immutable approval bound to artifact, provenance, and plan", async () => {
    const preview = await prepareFirmwareUpdatePreview({
      operationId: "firmware-preview-approval",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance: compatibleFirmwareProvenance,
      provider: new ScriptedFirmwareUpdateProvider({
        initial: sensitiveOperationFixtures.initial,
      }),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });
    const approval = createFirmwareUpdateApproval(preview, now);

    expect(approvalMatchesFirmwareUpdatePreview(preview, approval)).toBe(true);
    expect(Object.isFrozen(approval)).toBe(true);
    expect(
      approvalMatchesFirmwareUpdatePreview(
        preview,
        Object.freeze({
          ...approval,
          provenanceUpstreamCommitSha: "b".repeat(40),
        }),
      ),
    ).toBe(false);
    expect(
      approvalMatchesFirmwareUpdatePreview(
        preview,
        Object.freeze({
          ...approval,
          verificationPlanId: "other-plan",
        }),
      ),
    ).toBe(false);
  });

  it("does not execute accessor-backed approval data", async () => {
    const preview = await prepareFirmwareUpdatePreview({
      operationId: "firmware-preview-accessor-approval",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance: compatibleFirmwareProvenance,
      provider: new ScriptedFirmwareUpdateProvider({
        initial: sensitiveOperationFixtures.initial,
      }),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });
    const valid = createFirmwareUpdateApproval(preview, now);
    let accessorExecuted = false;
    const accessorBacked = Object.defineProperties(
      {},
      Object.fromEntries(
        Object.entries(valid).map(([key, value]) => [
          key,
          key === "artifactSha256"
            ? {
                configurable: true,
                enumerable: true,
                get: () => {
                  accessorExecuted = true;
                  return value;
                },
              }
            : {
                configurable: true,
                enumerable: true,
                value,
                writable: false,
              },
        ]),
      ),
    );

    expect(approvalMatchesFirmwareUpdatePreview(preview, accessorBacked)).toBe(
      false,
    );
    expect(accessorExecuted).toBe(false);
  });

  it("executes only when a fresh live preview matches the approval", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const sessionManager = sessions();
    const operationId = "firmware-approved-execution";
    const preview = await prepareFirmwareUpdatePreview({
      operationId,
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance: compatibleFirmwareProvenance,
      provider,
      sessions: sessionManager,
      catalog: syntheticTargetCatalog,
    });
    const approval = createFirmwareUpdateApproval(preview, now);
    const operation = await runFirmwareUpdate({
      operationId,
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance: compatibleFirmwareProvenance,
      approval,
      provider,
      sessions: sessionManager,
      catalog: syntheticTargetCatalog,
      clock: { now: () => now },
    });

    expect(operation.state).toBe("SUCCESS");
    expect(operation.verificationPassed).toBe(true);
    expect(operation.result?.previewId).toBe(preview.previewId);
    expect(operation.result?.verificationPlanId).toBe(
      preview.verificationPlan?.id,
    );
    expect(operation.result?.provenanceArtifactSha256).toBe(
      compatibleFirmwareProvenance.artifactSha256,
    );
    expect(provider.calls.map((call) => call.stage)).toContain(
      "WRITE_FIRMWARE",
    );
  });

  it("rejects a stale provenance-bound approval before prepare or write", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const sessionManager = sessions();
    const operationId = "firmware-stale-approval";
    const preview = await prepareFirmwareUpdatePreview({
      operationId,
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance: compatibleFirmwareProvenance,
      provider,
      sessions: sessionManager,
      catalog: syntheticTargetCatalog,
    });
    const approval: FirmwareUpdateApproval = createFirmwareUpdateApproval(
      preview,
      now,
    );
    const changedProvenance: ArtifactProvenance = Object.freeze({
      ...compatibleFirmwareProvenance,
      patchSetVersion: "synthetic-m4-preview-v2",
    });
    const operation = await runFirmwareUpdate({
      operationId,
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance: changedProvenance,
      approval,
      provider,
      sessions: sessionManager,
      catalog: syntheticTargetCatalog,
      clock: { now: () => now },
    });

    expect(operation.state).toBe("FAILED");
    expect(operation.error?.code).toBe("PERMISSION_DENIED");
    expect(operation.error?.reason).toBe(
      "FIRMWARE_APPROVAL_DID_NOT_MATCH_LIVE_PREVIEW",
    );
    expect(provider.calls.some((call) => call.stage === "PREPARE_UPDATE")).toBe(
      false,
    );
    expect(provider.calls.some((call) => call.stage === "WRITE_FIRMWARE")).toBe(
      false,
    );
  });

  it("cannot approve a blocked preview", async () => {
    const preview = await prepareFirmwareUpdatePreview({
      operationId: "firmware-blocked-approval",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: majorVersionMismatchArtifact,
      provenance: majorVersionMismatchProvenance,
      provider: new ScriptedFirmwareUpdateProvider({
        initial: sensitiveOperationFixtures.initial,
      }),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(() => createFirmwareUpdateApproval(preview, now)).toThrowError(
      "A blocked Firmware preview cannot be approved",
    );
  });

  it("rejects mixed confirmation modes before artifact validation", async () => {
    const provider = new ScriptedFirmwareUpdateProvider({
      initial: sensitiveOperationFixtures.initial,
    });
    const preview = await prepareFirmwareUpdatePreview({
      operationId: "firmware-mixed-confirmation",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance: compatibleFirmwareProvenance,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });
    const operation = await runFirmwareUpdate({
      operationId: "firmware-mixed-confirmation",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      provenance: compatibleFirmwareProvenance,
      approval: createFirmwareUpdateApproval(preview, now),
      userConfirmed: true,
      provider: new ScriptedFirmwareUpdateProvider({
        initial: sensitiveOperationFixtures.initial,
      }),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
      clock: { now: () => now },
    });

    expect(operation.state).toBe("FAILED");
    expect(operation.error?.reason).toBe(
      "FIRMWARE_CONFIRMATION_MODE_AMBIGUOUS",
    );
  });
});
