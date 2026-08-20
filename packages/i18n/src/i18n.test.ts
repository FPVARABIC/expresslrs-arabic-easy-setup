import { operationErrorCodes } from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import { ar } from "./locales/ar";
import { en, type MessageKey } from "./locales/en";
import {
  operationErrorMessageKeys,
  translate,
  translateOperationError,
} from "./index.js";

describe("Arabic-first message catalogs", () => {
  it("has Arabic text for every Easy Mode and structured-error message", () => {
    const requiredKeys = (Object.keys(en) as MessageKey[]).filter(
      (key) => !key.startsWith("debug."),
    );

    expect(requiredKeys.filter((key) => !(key in ar))).toEqual([]);
  });

  it("maps every Core error code to localized text without string matching", () => {
    for (const code of operationErrorCodes) {
      expect(operationErrorMessageKeys[code].startsWith("error.")).toBe(true);
      expect(translateOperationError("ar", code)).not.toBe(code);
      expect(translateOperationError("en", code)).not.toBe(code);
    }
  });

  it("has complete Arabic messages for real read progress, support, and reconnect states", () => {
    const requiredKeys = [
      "real.progress.heading",
      "real.progress.preparing",
      "real.progress.discovering",
      "real.progress.identifying",
      "real.progress.verifying",
      "real.progress.success",
      "real.progress.failed",
      "real.progress.cancelled",
      "real.support.copyAction",
      "real.support.copying",
      "real.support.copied",
      "real.support.copyFailed",
      "real.support.privacy",
      "real.reconnect.consistent",
      "real.reconnect.changed",
      "real.reconnect.required",
    ] as const satisfies readonly MessageKey[];
    const arabicCatalog: Partial<Record<MessageKey, string>> = ar;

    expect(
      requiredKeys.filter(
        (key) => (arabicCatalog[key]?.trim().length ?? 0) === 0,
      ),
    ).toEqual([]);
  });

  it("retains the explicit English fallback for optional debug text", () => {
    expect(translate("ar", "debug.englishOnly")).toBe(
      "English fallback verified",
    );
  });
});
