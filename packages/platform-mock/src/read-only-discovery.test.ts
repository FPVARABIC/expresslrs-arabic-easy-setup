import {
  ExclusiveDeviceSessionManager,
  type DiscoveryProvider,
} from "@elrs-easy/device";
import { runReadOnlyDiscovery } from "@elrs-easy/workflows";
import { describe, expect, it } from "vitest";

import {
  fixtureById,
  syntheticDeviceFixtures,
  syntheticTargetCatalog,
} from "./fixtures.js";
import { MockDiscoveryProvider } from "./mock-discovery-provider.js";
import { createSyntheticIdentityEvidencePolicy } from "./synthetic-evidence-policy.js";

function sessions() {
  let id = 0;
  return new ExclusiveDeviceSessionManager({
    clock: { now: () => "2026-08-20T08:00:00.000Z" },
    ids: { next: () => `session-${++id}` },
  });
}

describe("runReadOnlyDiscovery with synthetic families", () => {
  it("discovers different families without model-specific workflow code", async () => {
    const sessionManager = sessions();
    const provider = new MockDiscoveryProvider(syntheticDeviceFixtures);
    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-1",
      provider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(provider),
      sessions: sessionManager,
      catalog: syntheticTargetCatalog,
      clock: { now: () => "2026-08-20T08:00:00.000Z" },
    });

    expect(operation.state).toBe("SUCCESS");
    expect(operation.verificationPassed).toBe(true);
    expect(operation.result?.devices).toHaveLength(6);

    const outcomes = new Map(
      operation.result?.devices.map((device) => [
        device.snapshot.descriptor.id,
        device.identity.confidence,
      ]),
    );
    expect(outcomes.get("mock-device-tx-2g4")).toBe("CONFIRMED");
    expect(outcomes.get("mock-device-rx-subghz")).toBe("CONFIRMED");
    expect(outcomes.get("mock-device-dual")).toBe("CONFIRMED");
    expect(outcomes.get("mock-device-unknown")).toBe("UNKNOWN");
    expect(outcomes.get("mock-device-ambiguous")).toBe("AMBIGUOUS");
    expect(outcomes.get("mock-device-conflict")).toBe("AMBIGUOUS");

    for (const fixture of syntheticDeviceFixtures) {
      expect(() =>
        sessionManager.acquire({
          deviceId: fixture.descriptor.id,
          owner: { id: "cleanup-check", kind: "SYSTEM" },
        }),
      ).not.toThrow();
    }
  });

  it("returns an honest unknown result for MCU-only evidence", async () => {
    const fixture = fixtureById("unknown-mcu-only");
    const provider = new MockDiscoveryProvider([fixture]);
    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-unknown",
      provider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(provider),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(operation.state).toBe("SUCCESS");
    expect(operation.result?.devices[0]?.identity.confidence).toBe("UNKNOWN");
    expect(operation.result?.devices[0]?.identity.selectedTargetId).toBeNull();
  });

  it("releases the exclusive session when a provider disconnects", async () => {
    const fixture = fixtureById("known-tx-2g4");
    const sessionManager = sessions();
    const provider = new MockDiscoveryProvider([fixture], "READ_CAPABILITIES");
    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-failure",
      provider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(provider),
      sessions: sessionManager,
      catalog: syntheticTargetCatalog,
    });

    expect(operation.state).toBe("FAILED");
    expect(operation.error?.code).toBe("CONNECTION_LOST");
    expect(() =>
      sessionManager.acquire({
        deviceId: fixture.descriptor.id,
        owner: { id: "cleanup-check", kind: "SYSTEM" },
      }),
    ).not.toThrow();
  });

  it("reports an explicit cancellation instead of an internal failure", async () => {
    const provider = new MockDiscoveryProvider([fixtureById("known-tx-2g4")]);
    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-cancelled",
      provider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(provider),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
      signal: { aborted: true },
    });

    expect(operation.state).toBe("CANCELLED");
    expect(operation.error).toBeNull();
    expect(operation.verificationPassed).toBe(false);
  });

  it("rejects duplicate descriptor ids before reading identity", async () => {
    const fixture = fixtureById("known-tx-2g4");
    let identityReads = 0;
    const provider = {
      id: "duplicate-descriptor-provider",
      async discover() {
        return [fixture.descriptor, { ...fixture.descriptor }];
      },
      async readIdentity() {
        identityReads += 1;
        return fixture.evidence;
      },
      async readCapabilities() {
        return fixture.capabilities;
      },
    } satisfies DiscoveryProvider;

    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-duplicate-descriptor",
      provider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(provider),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(operation.state).toBe("FAILED");
    expect(operation.error?.code).toBe("IDENTITY_AMBIGUOUS");
    expect(operation.error?.reason).toBe("DUPLICATE_DEVICE_DESCRIPTOR_ID");
    expect(identityReads).toBe(0);
    expect(operation.history).not.toContain("IDENTIFYING");
  });

  it.each(["DISCONNECTED", "CONNECTING", "REBOOTING", "LOST"] as const)(
    "rejects a %s descriptor before opening a session",
    async (connectionState) => {
      const fixture = fixtureById("known-tx-2g4");
      let identityReads = 0;
      const provider = {
        id: `non-connected-${connectionState.toLowerCase()}`,
        async discover() {
          return [{ ...fixture.descriptor, connectionState }];
        },
        async readIdentity() {
          identityReads += 1;
          return fixture.evidence;
        },
        async readCapabilities() {
          return fixture.capabilities;
        },
      } satisfies DiscoveryProvider;

      const operation = await runReadOnlyDiscovery({
        operationId: `discovery-${connectionState.toLowerCase()}`,
        provider,
        evidencePolicy: createSyntheticIdentityEvidencePolicy(provider),
        sessions: sessions(),
        catalog: syntheticTargetCatalog,
      });

      expect(operation.state).toBe("FAILED");
      expect(operation.error?.code).toBe("CONNECTION_LOST");
      expect(operation.error?.reason).toBe("DISCOVERED_DEVICE_NOT_CONNECTED");
      expect(identityReads).toBe(0);
      expect(operation.history).not.toContain("IDENTIFYING");
    },
  );

  it("keeps an unreviewed provider generic and unvalidated", async () => {
    const fixture = fixtureById("known-tx-2g4");
    const provider = new MockDiscoveryProvider([fixture]);
    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-default-untrusted-policy",
      provider,
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(operation.state).toBe("SUCCESS");
    expect(operation.result?.devices[0]?.identity.confidence).toBe("UNKNOWN");
    expect(operation.result?.devices[0]?.identity.selectedTargetId).toBeNull();
    expect(
      operation.result?.devices[0]?.snapshot.evidence.every(
        (item) =>
          item.strength === "GENERIC" && item.reliability === "UNVALIDATED",
      ),
    ).toBe(true);
  });

  it("publishes only rebuilt evidence and remapped capability provenance", async () => {
    const fixture = fixtureById("known-tx-2g4");
    const provider = new MockDiscoveryProvider([fixture]);
    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-rebuilt-output",
      provider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(provider),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });
    const snapshot = operation.result?.devices[0]?.snapshot;

    expect(snapshot?.evidence.map((item) => item.id)).toEqual([
      "evidence-1",
      "evidence-2",
      "evidence-3",
      "evidence-4",
      "evidence-5",
      "evidence-6",
    ]);
    expect(snapshot?.capabilities[1]?.sourceEvidenceIds).toEqual([
      "evidence-1",
    ]);
    expect(Object.isFrozen(snapshot?.descriptor)).toBe(true);
    expect(Object.isFrozen(snapshot?.evidence)).toBe(true);
    expect(Object.isFrozen(snapshot?.capabilities)).toBe(true);
  });

  it("isolates the published snapshot from later nested provider mutation", async () => {
    const fixture = fixtureById("known-tx-2g4");
    const mutableDescriptor = { ...fixture.descriptor };
    const mutableEvidence = fixture.evidence.slice(0, 2).map((item) => ({
      ...item,
      source: { ...item.source },
    }));
    const mutableEvidenceIds = [mutableEvidence[0]!.id];
    const mutableLimitations: string[] = [];
    const mutableCapability = {
      id: "guided-bind",
      available: true,
      sourceEvidenceIds: mutableEvidenceIds,
      limitations: mutableLimitations,
    };
    const provider = {
      id: "mutable-nested-provider",
      async discover() {
        return [mutableDescriptor];
      },
      async readIdentity() {
        return mutableEvidence;
      },
      async readCapabilities() {
        return [mutableCapability];
      },
    } satisfies DiscoveryProvider;

    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-nested-mutation",
      provider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(provider),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });
    const snapshot = operation.result?.devices[0]?.snapshot;

    mutableDescriptor.displayHint = "mutated descriptor";
    mutableEvidence[0]!.rawValue = "fixture.rx.beta-subghz";
    mutableEvidence[0]!.normalizedValue = "fixture.rx.beta-subghz";
    mutableEvidence[0]!.source.kind = "mutated-source";
    mutableCapability.id = "mutated-capability";
    mutableEvidenceIds[0] = "missing-evidence";
    mutableLimitations.push("MUTATED_LATER");

    expect(snapshot?.descriptor.displayHint).toBe("Synthetic TX 2.4");
    expect(snapshot?.evidence[0]?.rawValue).toBe("fixture.tx.alpha-2g4");
    expect(snapshot?.evidence[0]?.source.kind).toBe("synthetic-runtime-config");
    expect(snapshot?.capabilities[0]).toEqual({
      id: "guided-bind",
      available: true,
      sourceEvidenceIds: ["evidence-1"],
      limitations: [],
    });
  });
});
