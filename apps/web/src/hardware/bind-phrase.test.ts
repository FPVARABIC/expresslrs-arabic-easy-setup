import { describe, expect, it } from "vitest";

import {
  MAX_BIND_PHRASE_LENGTH,
  bindPhraseIssue,
  bytesToHex,
  expressLrsBindingUid,
  forgetBindPhrase,
  md5Bytes,
} from "./bind-phrase";

describe("ExpressLRS binding phrase UID", () => {
  it.each([
    ["", "d41d8cd98f00b204e9800998ecf8427e"],
    ["a", "0cc175b9c0f1b6a831c399e269772661"],
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
  ])("matches the RFC MD5 vector for %s", (value, expected) => {
    expect(bytesToHex(md5Bytes(new TextEncoder().encode(value)))).toBe(
      expected,
    );
  });

  it.each([
    ["FPV Arabic", "f0660defaa7a"],
    ["عبارة ربط عربية", "452007b0073d"],
    ["A1-b2_C3", "71d18f0e4aac"],
  ])(
    "matches the official build-flag byte contract for %s",
    (phrase, expected) => {
      expect(bytesToHex(expressLrsBindingUid(phrase))).toBe(expected);
    },
  );

  it("returns no UID when the phrase is deliberately empty", () => {
    expect(expressLrsBindingUid("")).toEqual(new Uint8Array());
  });

  it("rejects an unbounded phrase", () => {
    expect(() => expressLrsBindingUid("x".repeat(129))).toThrow(RangeError);
  });
});

describe("binding phrase validation", () => {
  it("accepts an empty phrase as a deliberate choice to set none", () => {
    expect(bindPhraseIssue("")).toBeNull();
  });

  it("accepts a phrase the derivation can use", () => {
    expect(bindPhraseIssue("FPV Arabic")).toBeNull();
    expect(bindPhraseIssue("x".repeat(MAX_BIND_PHRASE_LENGTH))).toBeNull();
  });

  it("refuses a phrase longer than the derivation accepts", () => {
    expect(bindPhraseIssue("x".repeat(MAX_BIND_PHRASE_LENGTH + 1))).toBe(
      "TOO_LONG",
    );
  });

  it("refuses a phrase that is only whitespace", () => {
    expect(bindPhraseIssue("   ")).toBe("BLANK");
  });

  it("refuses an invisible control or format character", () => {
    expect(bindPhraseIssue("phrase\u0007")).toBe("CONTROL_CHARACTER");
    expect(bindPhraseIssue("phrase\u200e")).toBe("CONTROL_CHARACTER");
  });

  it("overwrites a phrase buffer in place", () => {
    const buffer = new TextEncoder().encode("secret phrase");
    forgetBindPhrase(buffer);
    expect([...buffer].every((byte) => byte === 0)).toBe(true);
  });
});
