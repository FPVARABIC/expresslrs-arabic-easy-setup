import { describe, expect, it } from "vitest";

import {
  BoundedJsonError,
  canonicalizeBoundedJson,
  parseBoundedJson,
  type BoundedJsonLimits,
} from "./bounded-json.js";

const limits: BoundedJsonLimits = Object.freeze({
  maximumUtf8Bytes: 4_096,
  maximumDepth: 8,
  maximumStringCodeUnits: 256,
  maximumArrayElements: 32,
  maximumObjectMembers: 32,
  maximumTotalValues: 128,
});

describe("bounded RFC 8785 JSON subset", () => {
  it("matches the RFC 8785 UTF-16 property-order vector", () => {
    const source = JSON.stringify({
      "\u20ac": "Euro Sign",
      "\r": "Carriage Return",
      "\ufb33": "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "\ud83d\ude00": "Emoji: Grinning Face",
      "\u0080": "Control",
      "\u00f6": "Latin Small Letter O With Diaeresis",
    });

    expect(canonicalizeBoundedJson(parseBoundedJson(source, limits))).toBe(
      '{"\\r":"Carriage Return","1":"One",\u0022\u0080\u0022:"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}',
    );
  });

  it("rejects escape-equivalent duplicates before object construction", () => {
    expect(() =>
      parseBoundedJson('{"role":"synthetic","r\\u006fle":"stable"}', limits),
    ).toThrow(
      expect.objectContaining<Partial<BoundedJsonError>>({
        code: "DUPLICATE_KEY",
      }),
    );
  });
});
