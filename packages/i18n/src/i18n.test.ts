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

  it("gives Easy and Advanced the identical binding-phrase vocabulary, in both languages", () => {
    // Every string the phrase warning and the generator need, named on both
    // surfaces. A key present in one namespace and missing from the other is
    // how the two modes drift apart into "the real one and the simple one",
    // which is the outcome this pair of lists exists to prevent.
    const suffixes = [
      "bindPhraseWeak",
      "bindPhraseWeakWhy",
      "bindPhraseGenerate",
      "bindPhraseGenerateHint",
      "bindPhraseReplaceHeading",
      "bindPhraseReplaceBody",
      "bindPhraseReplaceConfirm",
      "bindPhraseReplaceCancel",
      "bindPhraseGenerated",
      "bindPhraseReveal",
      "bindPhraseHide",
    ] as const;
    const keys = suffixes.flatMap(
      (suffix) =>
        [`easy.fw.${suffix}`, `wb.ui.${suffix}`] as readonly MessageKey[],
    );

    const arabic: Partial<Record<MessageKey, string>> = ar;
    const english: Partial<Record<MessageKey, string>> = en;
    expect(
      keys.filter((key) => (english[key]?.trim().length ?? 0) === 0),
    ).toEqual([]);
    expect(
      keys.filter((key) => (arabic[key]?.trim().length ?? 0) === 0),
    ).toEqual([]);
    // And the Arabic is Arabic, not the English string copied across. The two
    // surfaces may share wording with each other; the two languages may not.
    expect(keys.filter((key) => arabic[key] === english[key])).toEqual([]);
    expect(
      keys.filter((key) => !/\p{Script=Arabic}/u.test(arabic[key] ?? "")),
    ).toEqual([]);
  });

  it("states the phrase warning as advice rather than as a refusal", () => {
    // The wording is the feature here. If this copy ever starts telling an
    // operator they cannot proceed, the warning has become a lock in all but
    // implementation, and the implementation is one edit away from following.
    for (const key of [
      "easy.fw.bindPhraseWeak",
      "wb.ui.bindPhraseWeak",
    ] as const satisfies readonly MessageKey[]) {
      expect(translate("en", key)).toMatch(/still works/u);
      expect(translate("en", key)).toMatch(/nothing here is withheld/u);
      expect(translate("ar", key)).toMatch(/ما زالت تعمل/u);
    }
    // And it says why the phrase matters, rather than asserting that it does.
    expect(translate("en", "wb.ui.bindPhraseWeakWhy")).toMatch(/MD5/u);
    expect(translate("ar", "wb.ui.bindPhraseWeakWhy")).toMatch(/MD5/u);
  });

  it("retains the explicit English fallback for optional debug text", () => {
    expect(translate("ar", "debug.englishOnly")).toBe(
      "English fallback verified",
    );
  });

  it("keeps interface copy direct and free of question phrasing", () => {
    const messages = [...Object.values(ar), ...Object.values(en)];

    expect(messages.filter((message) => /[؟?]/u.test(message))).toEqual([]);
  });
});
