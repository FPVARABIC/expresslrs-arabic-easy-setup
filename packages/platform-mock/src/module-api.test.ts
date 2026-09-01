import { ExclusiveDeviceSessionManager } from "@elrs-easy/device";
import { FoundationExpressLrsModule } from "@elrs-easy/workflows";
import { describe, expect, it } from "vitest";

import { fixtureById, syntheticTargetCatalog } from "./fixtures.js";
import { MockDiscoveryProvider } from "./mock-discovery-provider.js";
import {
  ScriptedBindingProvider,
  ScriptedFirmwareUpdateProvider,
} from "./mock-sensitive-operation-providers.js";
import {
  compatibleFirmwareArtifact,
  sensitiveOperationFixtures,
} from "./sensitive-operation-fixtures.js";

function createModule() {
  let sessionId = 0;
  const fixture = fixtureById("known-tx-2g4");
  return new FoundationExpressLrsModule({
    providers: {
      discovery: new MockDiscoveryProvider([fixture]),
      binding: new ScriptedBindingProvider({ initial: fixture }),
      firmwareUpdate: new ScriptedFirmwareUpdateProvider({ initial: fixture }),
    },
    sessions: new ExclusiveDeviceSessionManager({
      clock: { now: () => "2026-08-20T08:00:00.000Z" },
      ids: { next: () => `module-session-${++sessionId}` },
    }),
    catalog: syntheticTargetCatalog,
    clock: { now: () => "2026-08-20T08:00:00.000Z" },
  });
}

describe("FoundationExpressLrsModule", () => {
  it("is callable without a Web UI and returns structured operation records", async () => {
    const module = createModule();

    const discovery = await module.discover({ operationId: "module-discover" });
    const binding = await module.bind({
      operationId: "module-bind",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      userConfirmed: true,
    });
    const update = await module.update({
      operationId: "module-update",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      userConfirmed: true,
    });

    expect(discovery.state).toBe("SUCCESS");
    expect(binding.state).toBe("SUCCESS");
    expect(update.state).toBe("SUCCESS");
    expect(update.auditEvents.at(-1)?.outcome).toBe("SUCCEEDED");
  });

  it("publishes live structured progress to a non-UI host", async () => {
    const module = createModule();
    const states: string[] = [];

    const update = await module.update({
      operationId: "module-progress",
      descriptor: sensitiveOperationFixtures.initial.descriptor,
      artifact: compatibleFirmwareArtifact,
      userConfirmed: true,
      onProgress: (snapshot) => states.push(snapshot.state),
    });

    expect(update.state).toBe("SUCCESS");
    expect(states).toEqual(update.history);
    expect(states).toContain("WRITE_COMPLETED");
    expect(states.at(-1)).toBe("SUCCESS");
  });

  it("rejects a reused operation id so audit streams cannot collide", async () => {
    const module = createModule();
    await module.discover({ operationId: "module-unique-operation" });

    expect(() =>
      module.discover({ operationId: "module-unique-operation" }),
    ).toThrowError("OPERATION_ID_ALREADY_USED");
  });
});
