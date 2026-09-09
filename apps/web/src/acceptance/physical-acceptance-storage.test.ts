import { describe, expect, it } from "vitest";

import { createPhysicalAcceptanceSession } from "./physical-acceptance";
import {
  PHYSICAL_ACCEPTANCE_STORAGE_KEY,
  clearPhysicalAcceptanceSession,
  loadPhysicalAcceptanceSession,
  savePhysicalAcceptanceSession,
  type PhysicalAcceptanceStorage,
} from "./physical-acceptance-storage";

function session() {
  return createPhysicalAcceptanceSession({
    runtime: {
      appUrl: "https://example.test/",
      userAgent: "Test Browser",
      language: "ar",
      candidateSha: "abcdef",
    },
    sessionId: "storage-test",
    now: () => new Date("2026-09-01T12:00:00.000Z"),
  });
}

function memoryStorage(): PhysicalAcceptanceStorage & {
  readonly values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

describe("physical acceptance storage", () => {
  it("saves and reloads a validated session", () => {
    const storage = memoryStorage();
    expect(savePhysicalAcceptanceSession(session(), storage)).toEqual({
      ok: true,
    });

    const restored = loadPhysicalAcceptanceSession(storage);

    expect(restored?.sessionId).toBe("storage-test");
    expect(storage.values.has(PHYSICAL_ACCEPTANCE_STORAGE_KEY)).toBe(true);
  });

  it("returns null instead of trusting invalid JSON", () => {
    const storage = memoryStorage();
    storage.values.set(PHYSICAL_ACCEPTANCE_STORAGE_KEY, "{broken");

    expect(loadPhysicalAcceptanceSession(storage)).toBeNull();
  });

  it("reports unavailable storage without throwing", () => {
    expect(savePhysicalAcceptanceSession(session(), null)).toMatchObject({
      ok: false,
    });
    expect(loadPhysicalAcceptanceSession(null)).toBeNull();
    expect(clearPhysicalAcceptanceSession(null)).toMatchObject({ ok: false });
  });

  it("reports quota or browser storage failures", () => {
    const storage: PhysicalAcceptanceStorage = {
      getItem() {
        throw new Error("read denied");
      },
      setItem() {
        throw new Error("quota exceeded");
      },
      removeItem() {
        throw new Error("remove denied");
      },
    };

    expect(loadPhysicalAcceptanceSession(storage)).toBeNull();
    expect(savePhysicalAcceptanceSession(session(), storage)).toMatchObject({
      ok: false,
      message: expect.stringContaining("quota exceeded"),
    });
    expect(clearPhysicalAcceptanceSession(storage)).toMatchObject({
      ok: false,
      message: expect.stringContaining("remove denied"),
    });
  });

  it("removes the persisted session", () => {
    const storage = memoryStorage();
    savePhysicalAcceptanceSession(session(), storage);

    expect(clearPhysicalAcceptanceSession(storage)).toEqual({ ok: true });
    expect(loadPhysicalAcceptanceSession(storage)).toBeNull();
  });
});
