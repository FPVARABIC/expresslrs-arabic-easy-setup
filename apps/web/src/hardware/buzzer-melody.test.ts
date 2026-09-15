import { describe, expect, it } from "vitest";

import type { OfficialTarget } from "./parity-types";
import {
  BUZZER_BEEP_TUNE,
  BUZZER_DEFAULT_TUNE,
  BUZZER_ENCODED_BYTES,
  BuzzerMelodyError,
  encodeBuzzerOptions,
  evaluateBuzzerSupport,
  parseBuzzerMelody,
} from "./buzzer-melody";

function target(overrides: {
  readonly role?: "tx" | "rx";
  readonly platform?: string;
  readonly features?: readonly string[];
  readonly hasBuzzer?: boolean;
}): OfficialTarget {
  return {
    id: "frsky/tx_900/r9m",
    role: overrides.role ?? "tx",
    vendorKey: "frsky",
    vendorName: "FrSky",
    radioKey: "tx_900",
    targetKey: "r9m",
    config: {
      productName: "FrSky R9M",
      platform: overrides.platform ?? "stm32",
      firmware: "Frsky_TX_R9M",
      luaName: null,
      layoutFile: null,
      logoFile: null,
      priorTargetName: null,
      uploadMethods: ["stlink", "download"],
      minVersion: null,
      customLayout: null,
      overlay: null,
      raw: {
        ...(overrides.features === undefined
          ? {}
          : { features: overrides.features }),
        ...(overrides.hasBuzzer === undefined
          ? {}
          : { has_buzzer: overrides.hasBuzzer }),
      },
    },
  };
}

describe("buzzer melodies, as the firmware's melodyparser.py reads them", () => {
  it("parses the configurator's two built-in tunes to the firmware's tones", () => {
    // 'A4 20 B4 20|60|0': A4 is key 49 -> 440 Hz; B4 is key 51 -> 493 Hz;
    // a whole note at 60 bpm is 4000 ms, divided by 20.
    expect(parseBuzzerMelody(BUZZER_BEEP_TUNE)).toEqual([
      [440, 200],
      [493, 200],
    ]);
    // 'E5 40 E5 40 C5 120 E5 40 G5 22 G4 21|20|0': a whole note at 20 bpm is 12000 ms.
    expect(parseBuzzerMelody(BUZZER_DEFAULT_TUNE)).toEqual([
      [659, 300],
      [659, 300],
      [523, 100],
      [659, 300],
      [783, 545],
      [391, 571],
    ]);
  });

  it("honours pauses, sharps and transposition in the notes notation", () => {
    expect(parseBuzzerMelody("C#5 8 P4 A4 2|120|0")).toEqual([
      [554, 250],
      [0, 500],
      [440, 1000],
    ]);
    // Transposing A4 up an octave lands on A5.
    expect(parseBuzzerMelody("A4 4|120|12")).toEqual([[880, 500]]);
  });

  it("parses RTTTL the way the firmware's bundled rtttl.py does", () => {
    // d=4 default quarter notes, o=5, b=120: a whole note is 2000 ms.
    expect(parseBuzzerMelody("beep:d=4,o=5,b=120:c,8e6,p,4g#.")).toEqual([
      [523, 500], // C5: 261.6 * 2 -> 523.2
      [1318, 250], // E6: 329.6 * 4 -> 1318.4, an eighth note
      [0, 500], // pause
      [830, 750], // G#5 dotted quarter: 415.3 * 2, 1.5x
    ]);
  });

  it("refuses what the firmware could not hold or the parser could not read", () => {
    expect(() => parseBuzzerMelody("   ")).toThrow(BuzzerMelodyError);
    expect(() => parseBuzzerMelody("|60|0")).toThrowError(/no notes/u);
    // melodyparser.py skips a token that is neither a note nor a pause, so
    // "H4 4" leaves no tones at all — and an empty tune is refused, not written.
    expect(() => parseBuzzerMelody("H4 4|60|0")).toThrowError(/no notes/u);
    expect(() => parseBuzzerMelody("A9x 4|60|0")).toThrowError(/not a note/u);
    expect(() => parseBuzzerMelody("A4|60|0")).toThrowError(/note length/u);
    expect(() => parseBuzzerMelody("A4 4|0|0")).toThrowError(
      /beats per minute/u,
    );
    expect(() => parseBuzzerMelody("no colons here")).toThrowError(
      /two colons/u,
    );
    const tooMany = `${Array.from({ length: 33 }, () => "A4 4").join(" ")}|120|0`;
    expect(() => parseBuzzerMelody(tooMany)).toThrowError(/33 tones/u);
  });

  it("encodes the mode byte and 32 little-endian tone pairs exactly as patch_buzzer writes them", () => {
    expect(encodeBuzzerOptions("quiet", "")).toEqual(
      new Uint8Array(BUZZER_ENCODED_BYTES),
    );
    const one = encodeBuzzerOptions("one-beep", "");
    expect(one[0]).toBe(1);
    expect(one.slice(1).every((byte) => byte === 0)).toBe(true);

    const beep = encodeBuzzerOptions("beep-tune", "");
    expect(beep.byteLength).toBe(129);
    expect([...beep.slice(0, 9)]).toEqual([
      2,
      440 & 0xff,
      440 >> 8,
      200,
      0,
      493 & 0xff,
      493 >> 8,
      200,
      0,
    ]);
    expect(beep.slice(9).every((byte) => byte === 0)).toBe(true);

    const custom = encodeBuzzerOptions("custom-tune", "A5 1|60|0");
    expect([...custom.slice(0, 5)]).toEqual([
      2,
      880 & 0xff,
      880 >> 8,
      4000 & 0xff,
      4000 >> 8,
    ]);
    expect(() => encodeBuzzerOptions("custom-tune", "")).toThrow(
      BuzzerMelodyError,
    );
  });

  it("is offered exactly where the official flasher offers it: an STM32 transmitter listing the buzzer feature", () => {
    expect(
      evaluateBuzzerSupport(target({ features: ["buzzer", "fan"] })),
    ).toEqual({ supported: true });
    expect(evaluateBuzzerSupport(target({ features: ["fan"] }))).toMatchObject({
      supported: false,
      reason: "NO_BUZZER_FEATURE",
    });
    // ES915TX's legacy `has_buzzer` key is not what the official flasher reads.
    expect(evaluateBuzzerSupport(target({ hasBuzzer: true }))).toMatchObject({
      supported: false,
      reason: "NO_BUZZER_FEATURE",
    });
    expect(
      evaluateBuzzerSupport(target({ role: "rx", features: ["buzzer"] })),
    ).toMatchObject({
      supported: false,
      reason: "NOT_A_TRANSMITTER",
    });
    expect(
      evaluateBuzzerSupport(
        target({ platform: "esp32", features: ["buzzer"] }),
      ),
    ).toMatchObject({
      supported: false,
      reason: "PLATFORM_HAS_NO_BUZZER_OPTION",
      targetName: "FrSky R9M",
      platform: "esp32",
    });
    expect(evaluateBuzzerSupport(null)).toEqual({ supported: true });
  });
});
