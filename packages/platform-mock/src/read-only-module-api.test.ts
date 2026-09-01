import {
  ExclusiveDeviceSessionManager,
  type DiscoveryProvider,
} from "@elrs-easy/device";
import { ReadOnlyExpressLrsModule } from "@elrs-easy/workflows";
import { describe, expect, it } from "vitest";

import { fixtureById, syntheticTargetCatalog } from "./fixtures.js";
import { MockDiscoveryProvider } from "./mock-discovery-provider.js";
import { createSyntheticIdentityEvidencePolicy } from "./synthetic-evidence-policy.js";

function sessionManager() {
  let id = 0;
  return new ExclusiveDeviceSessionManager({
    clock: { now: () => "2026-08-20T08:00:00.000Z" },
    ids: { next: () => `read-only-module-session-${++id}` },
  });
}

function moduleWith(provider: DiscoveryProvider) {
  return new ReadOnlyExpressLrsModule({
    provider,
    sessions: sessionManager(),
    catalog: syntheticTargetCatalog,
    evidencePolicy: createSyntheticIdentityEvidencePolicy(provider),
    clock: { now: () => "2026-08-20T08:00:00.000Z" },
  });
}

describe("ReadOnlyExpressLrsModule", () => {
  it("exposes discovery without a write-capable module surface", async () => {
    const provider = new MockDiscoveryProvider([fixtureById("known-tx-2g4")]);
    const module = moduleWith(provider);

    const result = await module.discover({ operationId: "read-only-discover" });

    expect(result.state).toBe("SUCCESS");
    expect(result.result?.devices[0]?.identity.confidence).toBe("CONFIRMED");
    expect("bind" in module).toBe(false);
    expect("update" in module).toBe(false);
  });

  it("captures a getter-backed operation id before an observer can mutate it", async () => {
    const provider = new MockDiscoveryProvider([fixtureById("known-tx-2g4")]);
    const module = moduleWith(provider);
    let operationId = "immutable-operation-id";
    let operationIdReads = 0;
    const request = {
      get operationId() {
        operationIdReads += 1;
        return operationId;
      },
      onProgress() {
        operationId = "observer-mutated-operation-id";
      },
    };

    const result = await module.discover(request);

    expect(result.id).toBe("immutable-operation-id");
    expect(operationIdReads).toBe(1);
    expect(() =>
      module.discover({ operationId: "immutable-operation-id" }),
    ).toThrowError("OPERATION_ID_ALREADY_USED");
  });

  it("captures the complete request before caller property replacement", async () => {
    const baseProvider = new MockDiscoveryProvider([
      fixtureById("known-tx-2g4"),
    ]);
    let releaseDiscovery!: () => void;
    const discoveryGate = new Promise<void>((resolve) => {
      releaseDiscovery = resolve;
    });
    const provider = {
      id: "delayed-read-only-provider",
      async discover(signal) {
        await discoveryGate;
        return baseProvider.discover(signal);
      },
      readIdentity: baseProvider.readIdentity.bind(baseProvider),
      readCapabilities: baseProvider.readCapabilities.bind(baseProvider),
    } satisfies DiscoveryProvider;
    const module = moduleWith(provider);
    const originalStates: string[] = [];
    const replacementStates: string[] = [];
    const request = {
      operationId: "request-input-snapshot",
      signal: { aborted: false },
      onProgress: (snapshot: { readonly state: string }) =>
        originalStates.push(snapshot.state),
    };

    const pending = module.discover(request);
    request.operationId = "mutated-operation-id";
    request.signal = { aborted: true };
    request.onProgress = (snapshot) => replacementStates.push(snapshot.state);
    releaseDiscovery();
    const result = await pending;

    expect(result.id).toBe("request-input-snapshot");
    expect(result.state).toBe("SUCCESS");
    expect(originalStates).toEqual(result.history);
    expect(replacementStates).toEqual([]);
  });

  it("snapshots constructor collaborators against later input mutation", async () => {
    const trustedProvider = new MockDiscoveryProvider([
      fixtureById("known-tx-2g4"),
    ]);
    const emptyProvider = new MockDiscoveryProvider([]);
    const constructorInput: {
      provider: DiscoveryProvider;
      sessions: ExclusiveDeviceSessionManager;
      catalog: typeof syntheticTargetCatalog;
      evidencePolicy: ReturnType<typeof createSyntheticIdentityEvidencePolicy>;
    } = {
      provider: trustedProvider,
      sessions: sessionManager(),
      catalog: syntheticTargetCatalog,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(trustedProvider),
    };
    const module = new ReadOnlyExpressLrsModule(constructorInput);
    constructorInput.provider = emptyProvider;
    constructorInput.evidencePolicy =
      createSyntheticIdentityEvidencePolicy(emptyProvider);

    const result = await module.discover({
      operationId: "constructor-input-snapshot",
    });

    expect(result.state).toBe("SUCCESS");
    expect(result.result?.devices).toHaveLength(1);
    expect(trustedProvider.calls[0]?.method).toBe("discover");
    expect(emptyProvider.calls).toEqual([]);
  });

  it("rejects malformed operation ids before invoking the provider", () => {
    const provider = new MockDiscoveryProvider([fixtureById("known-tx-2g4")]);
    const module = moduleWith(provider);

    expect(() =>
      module.discover({ operationId: "unsafe\u202Eoperation" }),
    ).toThrowError("OPERATION_ID_INVALID");
    expect(provider.calls).toEqual([]);
  });
});
