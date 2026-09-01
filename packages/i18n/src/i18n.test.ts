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

  it("retains the explicit English fallback for optional debug text", () => {
    expect(translate("ar", "debug.englishOnly")).toBe(
      "English fallback verified",
    );
  });
});
