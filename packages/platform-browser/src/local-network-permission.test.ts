import { describe, expect, it, vi } from "vitest";

import { assessLocalNetworkPermission } from "./local-network-permission.js";

describe("assessLocalNetworkPermission", () => {
  it("returns DENIED without requesting permission", async () => {
    const query = vi.fn().mockResolvedValue({ state: "denied" });

    await expect(
      assessLocalNetworkPermission({
        permissions: { query },
        secureContext: true,
      }),
    ).resolves.toBe("DENIED");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({ name: "local-network" });
  });

  it("returns PROMPT without treating it as denial", async () => {
    const query = vi.fn().mockResolvedValue({ state: "prompt" });

    await expect(
      assessLocalNetworkPermission({
        permissions: { query },
        secureContext: true,
      }),
    ).resolves.toBe("PROMPT");
  });

  it("falls back to the reviewed legacy descriptor alias", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("unsupported descriptor"))
      .mockResolvedValueOnce({ state: "granted" });

    await expect(
      assessLocalNetworkPermission({
        permissions: { query },
        secureContext: true,
      }),
    ).resolves.toBe("GRANTED");
    expect(query).toHaveBeenNthCalledWith(2, {
      name: "local-network-access",
    });
  });

  it("does not block when the Permissions API is unavailable", async () => {
    await expect(
      assessLocalNetworkPermission({
        permissions: null,
        secureContext: true,
      }),
    ).resolves.toBe("UNAVAILABLE");
  });

  it("does not rely on local-network permission outside a secure context", async () => {
    const query = vi.fn();
    await expect(
      assessLocalNetworkPermission({
        permissions: { query },
        secureContext: false,
      }),
    ).resolves.toBe("UNAVAILABLE");
    expect(query).not.toHaveBeenCalled();
  });

  it("contains unknown or throwing PermissionStatus access", async () => {
    let getterExecuted = false;
    const status = Object.defineProperty({}, "state", {
      get() {
        getterExecuted = true;
        throw new Error("secret=permission-status");
      },
    });
    const query = vi.fn().mockResolvedValue(status);

    await expect(
      assessLocalNetworkPermission({
        permissions: { query },
        secureContext: true,
      }),
    ).resolves.toBe("UNKNOWN");
    expect(getterExecuted).toBe(true);
  });
});
