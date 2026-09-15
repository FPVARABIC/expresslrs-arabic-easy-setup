import type { OfficialTarget } from "./parity-types";

/**
 * The STM32 transmitter buzzer, as the firmware's own configurator encodes it.
 *
 * `firmware_options_t` (`src/lib/OPTIONS/options.h`, 3.4.3 and later) carries,
 * for transmitter builds with `GPIO_PIN_BUZZER`, a `buzzer_mode` byte followed
 * by `uint16_t buzzer_melody[32][2]` — 32 (frequency Hz, duration ms) pairs.
 * `binary_configurator.py` `patch_buzzer` writes mode 0 for quiet, 1 for one
 * beep and 2 with a melody for the three tunes; the pinned official web
 * flasher does the same (`firmware.js` `getSettings`, `configure.js`
 * `#patch_buzzer`) for every Target whose catalog entry lists `buzzer` in its
 * `features`, with the "default tune" as its default choice.
 *
 * Melodies are written in either of the two notations the firmware's own
 * `melodyparser.py` reads: `notes|bpm|transpose` (for example
 * `E5 40 E5 40 C5 120|20|0`) or RTTTL (`name:d=4,o=5,b=100:notes`).
 */
export const BUZZER_MODES = Object.freeze([
  "quiet",
  "one-beep",
  "beep-tune",
  "default-tune",
  "custom-tune",
] as const);
export type BuzzerMode = (typeof BUZZER_MODES)[number];

/** `binary_configurator.py` `BuzzerMode.beep` → this melody. */
export const BUZZER_BEEP_TUNE = "A4 20 B4 20|60|0";
/** `binary_configurator.py` `BuzzerMode.default` → this melody. */
export const BUZZER_DEFAULT_TUNE = "E5 40 E5 40 C5 120 E5 40 G5 22 G4 21|20|0";
/** The firmware stores at most this many tones (`buzzer_melody[32][2]`). */
export const BUZZER_MELODY_MAX_TONES = 32;
/** Mode byte plus 32 tones of two 16-bit values. */
export const BUZZER_ENCODED_BYTES = 1 + BUZZER_MELODY_MAX_TONES * 4;

export type BuzzerTone = readonly [frequencyHz: number, durationMs: number];

export class BuzzerMelodyError extends Error {
  public constructor(
    public readonly code:
      | "EMPTY"
      | "BAD_NOTE"
      | "BAD_DURATION"
      | "BAD_BPM"
      | "BAD_RTTTL"
      | "TOO_MANY_TONES",
    message: string,
  ) {
    super(message);
    this.name = "BuzzerMelodyError";
  }
}

// ---- `notes|bpm|transpose` (melodyparser.py) -------------------------------

const NOTE_NAMES = Object.freeze([
  "A",
  "A#",
  "B",
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
]);

/** `melodyparser.getFrequency`: piano key number from the note, then equal temperament from A4 = 440 Hz. */
function noteFrequency(note: string, transposeBy: number): number {
  const octaveText = note.length === 3 ? note[2] : note[1];
  const octave = Number.parseInt(octaveText ?? "", 10);
  const name = note.slice(0, -1);
  const index = NOTE_NAMES.indexOf(name);
  if (index < 0 || !Number.isInteger(octave)) {
    throw new BuzzerMelodyError(
      "BAD_NOTE",
      `"${note}" is not a note like A4 or C#5`,
    );
  }
  let key =
    index < 3
      ? index + 12 + (octave - 1) * 12 + 1
      : index + (octave - 1) * 12 + 1;
  key += transposeBy;
  return Math.trunc(440 * 2 ** ((key - 49) / 12));
}

/** `melodyparser.getDurationInMs`: a whole note at `bpm`, divided by the note value. */
function durationMs(bpm: number, value: string | undefined): number {
  const divisor = Number.parseFloat(value ?? "");
  if (!Number.isFinite(divisor) || divisor <= 0) {
    throw new BuzzerMelodyError(
      "BAD_DURATION",
      `"${value ?? ""}" is not a note length (a positive number)`,
    );
  }
  return Math.trunc((1000 * ((60 * 4) / bpm)) / divisor);
}

function parseNotesMelody(input: string): readonly BuzzerTone[] {
  const parts = input.split("|");
  const notes = (parts[0] ?? "").trim();
  const bpm = Number.parseInt((parts[1] ?? "").trim(), 10);
  const transpose =
    parts.length > 2 ? Number.parseInt((parts[2] ?? "").trim(), 10) : 0;
  if (!Number.isInteger(bpm) || bpm <= 0) {
    throw new BuzzerMelodyError(
      "BAD_BPM",
      `"${parts[1] ?? ""}" is not a tempo in beats per minute`,
    );
  }
  if (!Number.isInteger(transpose)) {
    throw new BuzzerMelodyError(
      "BAD_NOTE",
      `"${parts[2] ?? ""}" is not a transposition in semitones`,
    );
  }
  const tokens = notes.split(" ").filter((token) => token.length > 0);
  const tones: BuzzerTone[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (token.startsWith("P")) {
      tones.push([0, durationMs(bpm, token.slice(1))]);
    } else if (/^[A-G]/u.test(token)) {
      const frequency = noteFrequency(token, transpose);
      const duration = durationMs(bpm, tokens[index + 1]);
      tones.push([frequency, duration]);
      index += 1;
    }
    // Anything else is skipped, as melodyparser.py skips it.
  }
  return tones;
}

// ---- RTTTL (external/rtttl.py) ---------------------------------------------

const RTTTL_NOTE_HZ = Object.freeze([
  440.0, // A
  493.9, // B or H
  261.6, // C
  293.7, // D
  329.6, // E
  349.2, // F
  392.0, // G
  0.0, // pause
  466.2, // A#
  0.0,
  277.2, // C#
  311.1, // D#
  0.0,
  370.0, // F#
  415.3, // G#
  0.0,
]);

function parseRtttlMelody(input: string): readonly BuzzerTone[] {
  const pieces = input.split(":");
  if (pieces.length !== 3) {
    throw new BuzzerMelodyError(
      "BAD_RTTTL",
      "an RTTTL tune has exactly two colons: name:defaults:notes",
    );
  }
  let defaultDuration = 4;
  let defaultOctave = 6;
  let bpm = 63;
  let id = " ";
  let value = 0;
  for (const raw of pieces[1] ?? "") {
    const char = raw.toLowerCase();
    if (/[0-9]/u.test(char)) {
      value = value * 10 + (char.charCodeAt(0) - 48);
      if (id === "o") defaultOctave = value;
      else if (id === "d") defaultDuration = value;
      else if (id === "b") bpm = value;
    } else if (/[a-z]/u.test(char)) {
      id = char;
      value = 0;
    }
  }
  if (bpm <= 0 || defaultDuration <= 0) {
    throw new BuzzerMelodyError(
      "BAD_RTTTL",
      "the RTTTL defaults need a positive tempo and note length",
    );
  }
  const msPerWholeNote = 240000 / bpm;
  const tune = (pieces[2] ?? "").replaceAll(",", " ");
  let position = 0;
  const next = (): string => (position < tune.length ? tune[position++]! : "|");
  const tones: BuzzerTone[] = [];
  for (;;) {
    let char = next();
    while (char === " ") char = next();
    let duration = 0;
    while (/[0-9]/u.test(char)) {
      duration = duration * 10 + (char.charCodeAt(0) - 48);
      char = next();
    }
    if (duration === 0) duration = defaultDuration;
    if (char === "|") break;
    const note = char.toLowerCase();
    // rtttl.py: a-g and h are notes, anything else (p included) is a pause.
    let noteIndex: number;
    if (note >= "a" && note <= "g") noteIndex = note.charCodeAt(0) - 97;
    else if (note === "h") noteIndex = 1;
    else noteIndex = 7;
    char = next();
    if (char === "#") {
      noteIndex += 8;
      char = next();
    }
    let multiplier = 1;
    if (char === ".") {
      multiplier = 1.5;
      char = next();
    }
    let octave = defaultOctave;
    if (char >= "4" && char <= "7") {
      octave = char.charCodeAt(0) - 48;
      char = next();
    }
    if (char === ".") {
      multiplier = 1.5;
      char = next();
    }
    // rtttl.py reads one character past the note and drops it: the comma (or
    // space) that separates notes. Kept that way so the same text yields the
    // same tones here and in the firmware's own tooling.
    const frequency = (RTTTL_NOTE_HZ[noteIndex] ?? 0) * 2 ** (octave - 4);
    const milliseconds = (msPerWholeNote / duration) * multiplier;
    tones.push([Math.trunc(frequency), Math.trunc(milliseconds)]);
  }
  return tones;
}

/**
 * The tones a melody text produces, in the order and units the firmware
 * stores them. Rejects an empty tune, a malformed note, and more tones than
 * the firmware can hold (the configurator truncates silently; this refuses).
 */
export function parseBuzzerMelody(text: string): readonly BuzzerTone[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new BuzzerMelodyError("EMPTY", "the custom tune is empty");
  }
  const tones = trimmed.includes("|")
    ? parseNotesMelody(trimmed)
    : parseRtttlMelody(trimmed);
  if (tones.length === 0) {
    throw new BuzzerMelodyError("EMPTY", "the custom tune contains no notes");
  }
  if (tones.length > BUZZER_MELODY_MAX_TONES) {
    throw new BuzzerMelodyError(
      "TOO_MANY_TONES",
      `the tune has ${tones.length} tones; the firmware stores at most ${BUZZER_MELODY_MAX_TONES}`,
    );
  }
  return Object.freeze(
    tones.map((tone) => Object.freeze([tone[0], tone[1]] as const)),
  );
}

/** The melody a mode plays, or null for the two modes with none. */
export function buzzerMelodyFor(
  mode: BuzzerMode,
  customMelody: string,
): string | null {
  switch (mode) {
    case "quiet":
    case "one-beep":
      return null;
    case "beep-tune":
      return BUZZER_BEEP_TUNE;
    case "default-tune":
      return BUZZER_DEFAULT_TUNE;
    case "custom-tune":
      return customMelody;
  }
}

/**
 * The 129 bytes `patch_buzzer` writes after the transmitter flags: the mode
 * (0 quiet, 1 one beep, 2 tune) and 32 little-endian (frequency, duration)
 * pairs, zero-filled after the tune.
 */
export function encodeBuzzerOptions(
  mode: BuzzerMode,
  customMelody: string,
): Uint8Array {
  const out = new Uint8Array(BUZZER_ENCODED_BYTES);
  const melody = buzzerMelodyFor(mode, customMelody);
  out[0] = melody === null ? (mode === "quiet" ? 0 : 1) : 2;
  if (melody !== null) {
    const tones = parseBuzzerMelody(melody);
    const view = new DataView(out.buffer);
    tones.forEach((tone, index) => {
      view.setUint16(1 + index * 4, tone[0] & 0xffff, true);
      view.setUint16(3 + index * 4, tone[1] & 0xffff, true);
    });
  }
  return out;
}

// ---- which Targets have one -------------------------------------------------

export type BuzzerSupport =
  | Readonly<{ supported: true }>
  | Readonly<{
      supported: false;
      reason:
        | "NOT_A_TRANSMITTER"
        | "PLATFORM_HAS_NO_BUZZER_OPTION"
        | "NO_BUZZER_FEATURE";
      targetName: string;
      platform: string;
    }>;

/**
 * Whether the buzzer options are encoded for this Target, decided exactly as
 * the pinned official flasher decides it: an STM32 transmitter whose catalog
 * entry lists `buzzer` among its `features`. ESP images carry no buzzer field
 * in their options JSON, and a receiver has no buzzer.
 */
export function evaluateBuzzerSupport(
  target: OfficialTarget | null,
): BuzzerSupport {
  if (target === null) return Object.freeze({ supported: true as const });
  const platform = target.config.platform.toLocaleLowerCase("en-US");
  const refuse = (
    reason: Exclude<BuzzerSupport, { supported: true }>["reason"],
  ) =>
    Object.freeze({
      supported: false as const,
      reason,
      targetName: target.config.productName,
      platform: target.config.platform,
    });
  if (target.role !== "tx") return refuse("NOT_A_TRANSMITTER");
  if (!platform.startsWith("stm32"))
    return refuse("PLATFORM_HAS_NO_BUZZER_OPTION");
  const features = target.config.raw.features;
  if (!Array.isArray(features) || !features.includes("buzzer")) {
    return refuse("NO_BUZZER_FEATURE");
  }
  return Object.freeze({ supported: true as const });
}
