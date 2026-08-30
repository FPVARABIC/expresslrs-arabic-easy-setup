import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  bytesToHex,
  expressLrsBindingUid,
  md5Bytes,
} from "./bind-phrase";

function nodeMd5(value: string): string {
  return createHash("md5").update(value, "utf8").digest("hex");
}

describe("ExpressLRS binding phrase UID", () => {
  it.each([
    ["", "d41d8cd98f00b204e9800998ecf8427e"],
    ["a", "0cc175b9c0f1b6a831c399e269772661"],
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
  ])("matches the RFC MD5 vector for %s", (value, expected) => {
    expect(bytesToHex(md5Bytes(new TextEncoder().encode(value)))).toBe(expected);
  });

  it.each(["FPV Arabic", "عبارة ربط عربية", "A1-b2_C3"])(
    "matches the official build-flag byte contract for %s",
    (phrase) => {
      const flag = `-DMY_BINDING_PHRASE=\"${phrase.normalize("NFC")}\"`;
      expect(bytesToHex(expressLrsBindingUid(phrase))).toBe(
        nodeMd5(flag).slice(0, 12),
      );
    },
  );

  it("returns no UID when the phrase is deliberately empty", () => {
    expect(expressLrsBindingUid("")).toEqual(new Uint8Array());
  });

  it("rejects an unbounded phrase", () => {
    expect(() => expressLrsBindingUid("x".repeat(129))).toThrow(RangeError);
  });
});
