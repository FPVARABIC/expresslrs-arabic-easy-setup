import { InMemoryTargetCatalog } from "@elrs-easy/compatibility";
import {
  ExclusiveDeviceSessionManager,
  resolveDeviceIdentity,
} from "@elrs-easy/device";
import {
  approvalMatchesEasyBindingPreview,
  buildEasyBindingPreview,
  createEasyBindingApproval,
  prepareEasyBindingPreview,
  runEasyBinding,
  type EasyBindingApproval,
} from "@elrs-easy/workflows";
import { describe, expect, it } from "vitest";

import {
  fixtureById,
  syntheticTargetCatalog,
  syntheticTargetDefinitions,
} from "./fixtures.js";
import { ScriptedBindingProvider } from "./mock-sensitive-operation-providers.js";

const now = "2026-08-20T08:00:00.000Z";

function sessions() {
  let id = 0;
  return new ExclusiveDeviceSessionManager({
    clock: { now: () => now },
    ids: { next: () => `binding-preview-session-${++id}` },
  });
}

function resolvedIdentity(fixtureId = "known-tx-2g4") {
  const fixture = fixtureById(fixtureId);
  return resolveDeviceIdentity({
    evidence: fixture.evidence,
    candidates: syntheticTargetCatalog.match(fixture.evidence),
  });
}

function blockerCodes(preview: {
  readonly blockers: readonly { readonly code: string }[];
}) {
  return preview.blockers.map((item) => item.code);
}

describe("Easy Binding preview and approval", () => {
  it("prepares a read-only Synthetic preview with explicit effects and verification", async () => {
    const fixture = fixtureById("known-tx-2g4");
    const provider = new ScriptedBindingProvider({ initial: fixture });
    const preview = await prepareEasyBindingPreview({
      operationId: "binding-preview-ready",
      descriptor: fixture.descriptor,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(preview).toMatchObject({
      schemaVersion: 1,
      previewId: "binding-preview-ready:binding-preview:v1",
      operationId: "binding-preview-ready",
      operationType: "EASY_BINDING",
      status: "READY",
      validationLevel: "SIMULATION_ONLY",
      executionAuthority: "SYNTHETIC_ONLY",
      providerId: "mock-binding",
      deviceId: fixture.descriptor.id,
      targetId: "fixture.tx.alpha-2g4",
      targetDisplayName: "Synthetic TX Alpha 2.4",
      blockers: [],
    });
    expect(preview.changeCodes).toEqual([
      "BINDING_RELATIONSHIP_WILL_CHANGE",
    ]);
    expect(preview.verificationRequirements).toEqual([
      "RECONNECT_SAME_DEVICE",
      "REIDENTIFY_SAME_TARGET",
      "LINK_ESTABLISHED",
    ]);
    expect(provider.calls.map((call) => call.stage)).toEqual([
      "READ_IDENTITY_INITIAL",
      "READ_CAPABILITIES_INITIAL",
    ]);
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.blockers)).toBe(true);
  });

  it("blocks any execution authority that is not explicitly Synthetic", () => {
    const fixture = fixtureById("known-tx-2g4");
    const preview = buildEasyBindingPreview({
      operationId: "binding-preview-hardware-disabled",
      descriptor: fixture.descriptor,
      providerId: "future-real-provider",
      executionAuthority: "REAL_DEVICE",
      identity: resolvedIdentity(),
      capabilities: fixture.capabilities,
      catalog: syntheticTargetCatalog,
    });

    expect(preview.status).toBe("BLOCKED");
    expect(preview.executionAuthority).toBe("NONE");
    expect(blockerCodes(preview)).toContain("HARDWARE_WRITE_DISABLED");
  });

  it("blocks an unapproved catalog and never exposes its display name", () => {
    const fixture = fixtureById("known-tx-2g4");
    const unapprovedCatalog = new InMemoryTargetCatalog(
      {
        ...syntheticTargetCatalog.metadata,
        contentDigest: "sha256:unapproved-catalog",
        redistributionApproved: false,
      },
      syntheticTargetDefinitions,
    );
    const preview = buildEasyBindingPreview({
      operationId: "binding-preview-unapproved-catalog",
      descriptor: fixture.descriptor,
      providerId: "mock-binding",
      executionAuthority: "SYNTHETIC_ONLY",
      identity: resolvedIdentity(),
      capabilities: fixture.capabilities,
      catalog: unapprovedCatalog,
    });

    expect(preview.status).toBe("BLOCKED");
    expect(preview.targetDisplayName).toBeNull();
    expect(blockerCodes(preview)).toContain("CATALOG_NOT_APPROVED");
  });

  it("blocks when the runtime does not prove guided Binding capability", async () => {
    const fixture = fixtureById("known-dual-band");
    const provider = new ScriptedBindingProvider({ initial: fixture });
    const preview = await prepareEasyBindingPreview({
      operationId: "binding-preview-no-runtime-capability",
      descriptor: fixture.descriptor,
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(preview.status).toBe("BLOCKED");
    expect(blockerCodes(preview)).toContain(
      "RUNTIME_GUIDED_BIND_NOT_AVAILABLE",
    );
  });

  it("creates an immutable approval bound to every safety-critical preview field", async () => {
    const fixture = fixtureById("known-tx-2g4");
    const preview = await prepareEasyBindingPreview({
      operationId: "binding-preview-approval",
      descriptor: fixture.descriptor,
      provider: new ScriptedBindingProvider({ initial: fixture }),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });
    const approval = createEasyBindingApproval(preview, now);

    expect(approvalMatchesEasyBindingPreview(preview, approval)).toBe(true);
    expect(Object.isFrozen(approval)).toBe(true);
    expect(
      approvalMatchesEasyBindingPreview(
        preview,
        Object.freeze({
          ...approval,
          catalogContentDigest: "sha256:stale-catalog",
        }),
      ),
    ).toBe(false);
    expect(
      approvalMatchesEasyBindingPreview(
        preview,
        Object.freeze({ ...approval, deviceId: "other-device" }),
      ),
    ).toBe(false);
  });

  it("does not execute accessor-backed approval fields", async () => {
    const fixture = fixtureById("known-tx-2g4");
    const preview = await prepareEasyBindingPreview({
      operationId: "binding-preview-accessor-approval",
      descriptor: fixture.descriptor,
      provider: new ScriptedBindingProvider({ initial: fixture }),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });
    const valid = createEasyBindingApproval(preview, now);
    let accessorExecuted = false;
    const accessorBacked = Object.defineProperties(
      {},
      Object.fromEntries(
        Object.entries(valid).map(([key, value]) => [
          key,
          key === "approvedAt"
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

    expect(approvalMatchesEasyBindingPreview(preview, accessorBacked)).toBe(
      false,
    );
    expect(accessorExecuted).toBe(false);
  });

  it("executes the Synthetic workflow only when live facts match the approval", async () => {
    const fixture = fixtureById("known-tx-2g4");
    const provider = new ScriptedBindingProvider({ initial: fixture });
    const sessionManager = sessions();
    const operationId = "binding-approved-execution";
    const preview = await prepareEasyBindingPreview({
      operationId,
      descriptor: fixture.descriptor,
      provider,
      sessions: sessionManager,
      catalog: syntheticTargetCatalog,
    });
    const approval = createEasyBindingApproval(preview, now);
    const operation = await runEasyBinding({
      operationId,
      descriptor: fixture.descriptor,
      provider,
      sessions: sessionManager,
      catalog: syntheticTargetCatalog,
      approval,
      clock: { now: () => now },
    });

    expect(operation.state).toBe("SUCCESS");
    expect(operation.verificationPassed).toBe(true);
    expect(operation.result?.previewId).toBe(preview.previewId);
    expect(provider.calls.map((call) => call.stage)).toContain(
      "EXECUTE_BINDING",
    );
  });

  it("rejects a stale approval before any Binding command starts", async () => {
    const fixture = fixtureById("known-tx-2g4");
    const provider = new ScriptedBindingProvider({ initial: fixture });
    const sessionManager = sessions();
    const operationId = "binding-stale-approval";
    const preview = await prepareEasyBindingPreview({
      operationId,
      descriptor: fixture.descriptor,
      provider,
      sessions: sessionManager,
      catalog: syntheticTargetCatalog,
    });
    const approval: EasyBindingApproval = Object.freeze({
      ...createEasyBindingApproval(preview, now),
      targetId: "fixture.rx.beta-subghz",
    });
    const operation = await runEasyBinding({
      operationId,
      descriptor: fixture.descriptor,
      provider,
      sessions: sessionManager,
      catalog: syntheticTargetCatalog,
      approval,
      clock: { now: () => now },
    });

    expect(operation.state).toBe("FAILED");
    expect(operation.error?.code).toBe("PERMISSION_DENIED");
    expect(operation.error?.reason).toBe(
      "BINDING_APPROVAL_DID_NOT_MATCH_LIVE_PREVIEW",
    );
    expect(
      provider.calls.some((call) => call.stage === "PREPARE_BINDING"),
    ).toBe(false);
    expect(
      provider.calls.some((call) => call.stage === "EXECUTE_BINDING"),
    ).toBe(false);
  });

  it("cannot approve a blocked preview", () => {
    const fixture = fixtureById("known-tx-2g4");
    const preview = buildEasyBindingPreview({
      operationId: "binding-blocked-approval",
      descriptor: { ...fixture.descriptor, connectionState: "LOST" },
      providerId: "mock-binding",
      executionAuthority: "SYNTHETIC_ONLY",
      identity: resolvedIdentity(),
      capabilities: fixture.capabilities,
      catalog: syntheticTargetCatalog,
    });

    expect(() => createEasyBindingApproval(preview, now)).toThrowError(
      "A blocked Binding preview cannot be approved",
    );
  });
});
