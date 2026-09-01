import { describe, expect, it } from "vitest";

import { bytesToHex, expressLrsBindingUid, md5Bytes } from "./bind-phrase";

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
