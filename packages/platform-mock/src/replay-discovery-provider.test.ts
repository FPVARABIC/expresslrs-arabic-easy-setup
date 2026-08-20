import {
  ExclusiveDeviceSessionManager,
  type DiscoveryProvider,
} from "@elrs-easy/device";
import { runReadOnlyDiscovery } from "@elrs-easy/workflows";
import { describe, expect, it } from "vitest";

import { fixtureById, syntheticTargetCatalog } from "./fixtures.js";
import {
  createSyntheticDiscoveryReplay,
  ReplayDiscoveryProvider,
} from "./replay-discovery-provider.js";
import { createSyntheticIdentityEvidencePolicy } from "./synthetic-evidence-policy.js";

function sessions() {
  let id = 0;
  return new ExclusiveDeviceSessionManager({
    clock: { now: () => "2026-08-20T08:00:00.000Z" },
    ids: { next: () => `replay-session-${++id}` },
  });
}

describe("ReplayDiscoveryProvider", () => {
  it("replays the same classified facts with the same deterministic result", async () => {
    const replay = createSyntheticDiscoveryReplay({
      replayId: "discovery-regression-1",
      capturedAt: "2026-08-20T08:00:00.000Z",
      fixtures: [fixtureById("known-tx-2g4"), fixtureById("ambiguous-family")],
    });

    const firstProvider = new ReplayDiscoveryProvider(replay);
    const first = await runReadOnlyDiscovery({
      operationId: "replay-first",
      provider: firstProvider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(firstProvider),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });
    const secondProvider = new ReplayDiscoveryProvider(replay);
    const second = await runReadOnlyDiscovery({
      operationId: "replay-second",
      provider: secondProvider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(secondProvider),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
    });

    expect(
      first.result?.devices.map((device) => device.identity.confidence),
    ).toEqual(["CONFIRMED", "AMBIGUOUS"]);
    expect(
      second.result?.devices.map((device) => device.identity.confidence),
    ).toEqual(
      first.result?.devices.map((device) => device.identity.confidence),
    );
    expect(replay.dataClassification).toBe("SYNTHETIC_NON_SENSITIVE");
  });

  it("cannot promote a pre-cancelled replay to SUCCESS", async () => {
    const replay = createSyntheticDiscoveryReplay({
      replayId: "discovery-cancelled-before-start",
      capturedAt: "2026-08-20T08:00:00.000Z",
      fixtures: [fixtureById("known-tx-2g4")],
    });
    const provider = new ReplayDiscoveryProvider(replay);
    const signal = { aborted: true } as const;

    await expect(provider.discover(signal)).rejects.toMatchObject({
      name: "AbortError",
    });

    const operation = await runReadOnlyDiscovery({
      operationId: "replay-pre-cancelled",
      provider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(provider),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
      signal,
    });

    expect(operation.state).toBe("CANCELLED");
    expect(operation.result).toBeNull();
    expect(operation.verificationPassed).toBe(false);
    expect(operation.history).not.toContain("SUCCESS");
  });

  it("cancels when a provider ignores a signal aborted during discovery", async () => {
    const replay = createSyntheticDiscoveryReplay({
      replayId: "discovery-cancelled-during-provider",
      capturedAt: "2026-08-20T08:00:00.000Z",
      fixtures: [fixtureById("known-tx-2g4")],
    });
    const replayProvider = new ReplayDiscoveryProvider(replay);
    const signal = { aborted: false };
    const cancellationIgnoringProvider = {
      id: "cancellation-ignoring-provider",
      async discover() {
        signal.aborted = true;
        return replayProvider.discover();
      },
      readIdentity: replayProvider.readIdentity.bind(replayProvider),
      readCapabilities: replayProvider.readCapabilities.bind(replayProvider),
    } satisfies DiscoveryProvider;

    const operation = await runReadOnlyDiscovery({
      operationId: "replay-cancelled-after-discover",
      provider: cancellationIgnoringProvider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(
        cancellationIgnoringProvider,
      ),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
      signal,
    });

    expect(operation.state).toBe("CANCELLED");
    expect(operation.result).toBeNull();
    expect(operation.verificationPassed).toBe(false);
    expect(operation.history).not.toContain("IDENTIFYING");
    expect(operation.history).not.toContain("SUCCESS");
  });

  it("does not promote verification when progress handling cancels the operation", async () => {
    const replay = createSyntheticDiscoveryReplay({
      replayId: "discovery-cancelled-at-verification",
      capturedAt: "2026-08-20T08:00:00.000Z",
      fixtures: [fixtureById("known-tx-2g4")],
    });
    const signal = { aborted: false };

    const provider = new ReplayDiscoveryProvider(replay);
    const operation = await runReadOnlyDiscovery({
      operationId: "replay-cancelled-at-verification",
      provider,
      evidencePolicy: createSyntheticIdentityEvidencePolicy(provider),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
      signal,
      observer(snapshot) {
        if (snapshot.state === "VERIFYING") {
          signal.aborted = true;
        }
      },
    });

    expect(operation.state).toBe("CANCELLED");
    expect(operation.result).toBeNull();
    expect(operation.verificationPassed).toBe(false);
    expect(operation.history).toContain("VERIFYING");
    expect(operation.history).not.toContain("SUCCESS");
  });
});
