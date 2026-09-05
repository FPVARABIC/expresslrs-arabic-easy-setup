import { describe, expect, it } from "vitest";

import {
  getApplicationFailureCopy,
  getApplicationUpdateCopy,
  getLimitedOfflineCopy,
} from "./network.js";

describe("network and shell copy", () => {
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

  it("provides a non-interrupting Arabic application-update notice", () => {
    const copy = getApplicationUpdateCopy("ar");
    expect(copy.title).toBe("تحديث التطبيق جاهز");
    expect(copy.description).toContain("لن تتبدل النسخة أثناء العملية الحالية");
    expect(`${copy.title}${copy.description}`).not.toMatch(/[؟?]/u);
    expect(Object.isFrozen(copy)).toBe(true);
  });

  it("provides the English application-update fallback", () => {
    const copy = getApplicationUpdateCopy("en");
    expect(copy.title).toBe("App update ready");
    expect(copy.description).toContain("current session will not be replaced");
    expect(`${copy.title}${copy.description}`).not.toMatch(/[؟?]/u);
  });

  it("keeps the Arabic application-failure message fixed and device-safe", () => {
    const copy = getApplicationFailureCopy("ar");
    expect(copy.title).toBe("تعذر عرض التطبيق");
    expect(copy.description).toContain("فحالتها غير مؤكدة");
    expect(copy.description).not.toContain("لم يُرسل أي أمر إلى الجهاز");
    expect(`${copy.title}${copy.description}`).not.toMatch(/[؟?]/u);
  });

  it("provides an English application-failure fallback", () => {
    const copy = getApplicationFailureCopy("en");
    expect(copy.title).toBe("The app could not be displayed");
    expect(copy.description).toContain("its state is uncertain");
    expect(copy.description).not.toContain("No device command was sent");
    expect(`${copy.title}${copy.description}`).not.toMatch(/[؟?]/u);
  });
});
