import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LOCALE_STORAGE_KEY,
  readStoredLocale,
  writeStoredLocale,
} from "./preferences";

describe("the remembered language", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("remembers a choice and reads it back", () => {
    writeStoredLocale("en");
    expect(readStoredLocale()).toBe("en");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
  });

  it("reports no choice when nothing is stored", () => {
    expect(readStoredLocale()).toBeNull();
  });

  it("treats a language this build does not know as no choice at all", () => {
    // Rendering an interface in a locale with no catalog would be worse than
    // falling back to the default, so an unknown value is not coerced.
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "fr");
    expect(readStoredLocale()).toBeNull();
  });

  it("survives storage that throws on read", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    expect(readStoredLocale()).toBeNull();
  });

  it("survives storage that throws on write", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    // The interface still works this session; only the memory of the choice is
    // lost, and there is nothing the operator can do about it.
    expect(() => {
      writeStoredLocale("en");
    }).not.toThrow();
  });
});
