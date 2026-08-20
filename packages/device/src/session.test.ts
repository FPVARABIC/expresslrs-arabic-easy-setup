import { CoreOperationError } from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import { ExclusiveDeviceSessionManager } from "./session.js";

function manager() {
  let id = 0;
  return new ExclusiveDeviceSessionManager({
    clock: { now: () => "2026-08-20T08:00:00.000Z" },
    ids: { next: () => `session-${++id}` },
  });
}

describe("ExclusiveDeviceSessionManager", () => {
  it("returns the same lease when one owner retries acquisition", () => {
    const sessions = manager();
    const owner = { id: "operation-a", kind: "WORKFLOW" } as const;
    const first = sessions.acquire({ deviceId: "device-a", owner });
    const second = sessions.acquire({ deviceId: "device-a", owner });

    expect(second).toBe(first);
  });

  it("prevents a second module from owning the same physical session", () => {
    const sessions = manager();
    sessions.acquire({
      deviceId: "device-a",
      owner: { id: "operation-a", kind: "WORKFLOW" },
    });

    expect(() =>
      sessions.acquire({
        deviceId: "device-a",
        owner: { id: "operation-b", kind: "MODULE" },
      }),
    ).toThrow(CoreOperationError);
  });

  it("allows a new owner only after the current lease is released", () => {
    const sessions = manager();
    const first = sessions.acquire({
      deviceId: "device-a",
      owner: { id: "operation-a", kind: "WORKFLOW" },
    });
    sessions.release(first);

    const second = sessions.acquire({
      deviceId: "device-a",
      owner: { id: "operation-b", kind: "MODULE" },
    });
    expect(second.owner.id).toBe("operation-b");
  });

  it("rejects stale sessions after release", () => {
    const sessions = manager();
    const first = sessions.acquire({
      deviceId: "device-a",
      owner: { id: "operation-a", kind: "WORKFLOW" },
    });
    sessions.release(first);

    expect(() => sessions.assertHeld(first)).toThrow(CoreOperationError);
  });
});
