import { ExclusiveDeviceSessionManager } from "@elrs-easy/device";
import { runReadOnlyDiscovery } from "@elrs-easy/workflows";
import { describe, expect, it } from "vitest";

import {
  fixtureById,
  syntheticDeviceFixtures,
  syntheticTargetCatalog,
} from "./fixtures.js";
import { MockDiscoveryProvider } from "./mock-discovery-provider.js";

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
    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-1",
      provider: new MockDiscoveryProvider(syntheticDeviceFixtures),
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
      expect(sessionManager.current(fixture.descriptor.id)).toBeNull();
    }
  });

  it("returns an honest unknown result for MCU-only evidence", async () => {
    const fixture = fixtureById("unknown-mcu-only");
    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-unknown",
      provider: new MockDiscoveryProvider([fixture]),
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
    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-failure",
      provider: new MockDiscoveryProvider([fixture], "READ_CAPABILITIES"),
      sessions: sessionManager,
      catalog: syntheticTargetCatalog,
    });

    expect(operation.state).toBe("FAILED");
    expect(operation.error?.code).toBe("CONNECTION_LOST");
    expect(sessionManager.current(fixture.descriptor.id)).toBeNull();
  });

  it("reports an explicit cancellation instead of an internal failure", async () => {
    const controller = new AbortController();
    controller.abort();

    const operation = await runReadOnlyDiscovery({
      operationId: "discovery-cancelled",
      provider: new MockDiscoveryProvider([fixtureById("known-tx-2g4")]),
      sessions: sessions(),
      catalog: syntheticTargetCatalog,
      signal: controller.signal,
    });

    expect(operation.state).toBe("CANCELLED");
    expect(operation.error).toBeNull();
    expect(operation.verificationPassed).toBe(false);
  });
});
