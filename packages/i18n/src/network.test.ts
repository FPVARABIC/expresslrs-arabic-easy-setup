import { describe, expect, it } from "vitest";

import { getLimitedOfflineCopy } from "./network.js";

describe("network mode copy", () => {
  it("provides Arabic-first limited-offline copy without question prompts", () => {
    const copy = getLimitedOfflineCopy("ar");
    expect(copy.title).toBe("وضع محدود بدون إنترنت");
    expect(`${copy.title}${copy.description}`).not.toMatch(/[؟?]/u);
    expect(Object.isFrozen(copy)).toBe(true);
  });

  it("provides the English fallback copy without question prompts", () => {
    const copy = getLimitedOfflineCopy("en");
    expect(copy.title).toBe("Limited offline mode");
    expect(`${copy.title}${copy.description}`).not.toMatch(/[؟?]/u);
    expect(Object.isFrozen(copy)).toBe(true);
  });
});
