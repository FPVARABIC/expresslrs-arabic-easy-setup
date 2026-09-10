const MD5_SHIFT = Object.freeze([
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
] as const);

const MD5_CONSTANTS = Object.freeze(
  Array.from(
    { length: 64 },
    (_, index) =>
      Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) >>> 0,
  ),
);

function rotateLeft(value: number, count: number): number {
  return ((value << count) | (value >>> (32 - count))) >>> 0;
}

function add32(...values: readonly number[]): number {
  let result = 0;
  for (const value of values) {
    result = (result + value) >>> 0;
  }
  return result;
}

function paddedMd5Input(input: Uint8Array): Uint8Array {
  const bitLength = BigInt(input.byteLength) * 8n;
  const paddingLength = (56 - ((input.byteLength + 1) % 64) + 64) % 64;
  const bytes = new Uint8Array(input.byteLength + 1 + paddingLength + 8);
  bytes.set(input);
  bytes[input.byteLength] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.byteLength - 8, Number(bitLength & 0xffff_ffffn), true);
  view.setUint32(
    bytes.byteLength - 4,
    Number((bitLength >> 32n) & 0xffff_ffffn),
    true,
  );
  return bytes;
}

/**
 * RFC 1321 MD5 implementation used only for ExpressLRS' deterministic six-byte
 * binding UID. It is not exposed as a security primitive.
 */
export function md5Bytes(input: Uint8Array): Uint8Array {
  const bytes = paddedMd5Input(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let stateA = 0x6745_2301;
  let stateB = 0xefcd_ab89;
  let stateC = 0x98ba_dcfe;
  let stateD = 0x1032_5476;

  for (let blockOffset = 0; blockOffset < bytes.byteLength; blockOffset += 64) {
    const words = Array.from({ length: 16 }, (_, index) =>
      view.getUint32(blockOffset + index * 4, true),
    );
    let a = stateA;
    let b = stateB;
    let c = stateC;
    let d = stateD;

    for (let index = 0; index < 64; index += 1) {
      let mixed: number;
      let wordIndex: number;
      if (index < 16) {
        mixed = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        mixed = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        mixed = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        mixed = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }

      const nextD = c;
      const nextC = b;
      const rotated = rotateLeft(
        add32(a, mixed, MD5_CONSTANTS[index] ?? 0, words[wordIndex] ?? 0),
        MD5_SHIFT[index] ?? 0,
      );
      const nextB = add32(b, rotated);
      a = d;
      b = nextB;
      c = nextC;
      d = nextD;
    }

    stateA = add32(stateA, a);
    stateB = add32(stateB, b);
    stateC = add32(stateC, c);
    stateD = add32(stateD, d);
  }

  const digest = new Uint8Array(16);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, stateA, true);
  digestView.setUint32(4, stateB, true);
  digestView.setUint32(8, stateC, true);
  digestView.setUint32(12, stateD, true);
  return digest;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function expressLrsBindingUid(bindPhrase: string): Uint8Array {
  const normalized = bindPhrase.normalize("NFC");
  if (normalized.length === 0) {
    return new Uint8Array();
  }
  if (normalized.length > 128) {
    throw new RangeError("ExpressLRS binding phrase exceeds 128 characters");
  }
  const buildFlag = `-DMY_BINDING_PHRASE=\"${normalized}\"`;
  return md5Bytes(new TextEncoder().encode(buildFlag)).slice(0, 6);
}

/** Why a typed binding phrase cannot be used, or null when it can. */
export type BindPhraseIssue =
  /** Longer than the derivation accepts. */
  | "TOO_LONG"
  /** Only whitespace: a UID from blanks cannot be retyped on the other side. */
  | "BLANK"
  /** Contains a control character, which cannot survive the build flag. */
  | "CONTROL_CHARACTER";

/** Longest phrase the ExpressLRS build flag and this derivation accept. */
export const MAX_BIND_PHRASE_LENGTH = 128 as const;

/**
 * Checks a phrase before it is used. An empty phrase is deliberately allowed:
 * it means "do not set one", and derives no UID.
 */
export function bindPhraseIssue(phrase: string): BindPhraseIssue | null {
  const normalized = phrase.normalize("NFC");
  if (normalized.length === 0) return null;
  if (normalized.length > MAX_BIND_PHRASE_LENGTH) return "TOO_LONG";
  if (normalized.trim().length === 0) return "BLANK";
  if (/\p{Cc}|\p{Cf}/u.test(normalized)) return "CONTROL_CHARACTER";
  return null;
}

/**
 * Overwrites a phrase held in a mutable buffer. JavaScript strings are
 * immutable, so a phrase that lived in a string cannot be scrubbed in place:
 * the only honest mitigation is to stop referencing it, which callers do by
 * clearing the state that held it as soon as the UID has been derived.
 */
export function forgetBindPhrase(buffer: Uint8Array): void {
  buffer.fill(0);
}

/**
 * How guessable a phrase is, which is a different question from whether it
 * works.
 *
 * A weak phrase is completely valid: it derives a UID, it binds, and the link
 * works. Nothing here may refuse it, and nothing in the interface may withhold
 * an operation because of it. What it affects is a specific, real risk.
 *
 * The UID is `md5("-DMY_BINDING_PHRASE=\"…\"")[0..6]` — upstream's derivation,
 * so it is not negotiable. It is unsalted, and the format around the phrase is
 * public and fixed. An attacker who observes the 6-byte UID can therefore test
 * candidate phrases offline at the speed of MD5: a dictionary word, a name, a
 * date or a short number falls immediately. Anyone who recovers the phrase can
 * bind to the link.
 *
 * That is worth telling an operator plainly and worth offering to fix. It is
 * not worth blocking them over: an operator who has already flashed a receiver
 * with a phrase must be able to type that same phrase into the transmitter,
 * whatever anyone thinks of it, or the two will never talk to each other.
 */
export type BindPhraseStrength = "STRONG" | "WEAK";

/**
 * Bits of entropy at or above which a phrase is not called weak.
 *
 * A deliberately modest bar. This is not a password policy; it is the line
 * below which an offline search against a 6-byte MD5 is trivially worth
 * running. Phrases above it are not called strong in any absolute sense —
 * only "not obviously guessable".
 */
export const WEAK_BIND_PHRASE_BITS = 40;

/** Entropy the generator produces. */
export const GENERATED_BIND_PHRASE_BITS = 96;

/**
 * The alphabet the generator draws from.
 *
 * Lower-case letters and digits, minus the pairs that are read back wrongly
 * over a phone call or copied wrongly off a screen — `0`/`o`, `1`/`l`/`i`.
 * A phrase has to be transcribed onto a second device by a person, so
 * characters that survive that trip are worth more than alphabet size.
 */
const GENERATOR_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * A rough lower bound on how much guessing a phrase costs.
 *
 * Deliberately pessimistic: it counts the character classes actually used and
 * assumes the attacker knows the length, which is the assumption that matters
 * when the answer decides whether to warn someone. It is not a strength meter
 * and is not shown as a score — it feeds one boolean.
 */
export function bindPhraseEntropyBits(phrase: string): number {
  const normalized = phrase.normalize("NFC");
  if (normalized.length === 0) return 0;
  const classes = [
    /[a-z]/u.test(normalized) ? 26 : 0,
    /[A-Z]/u.test(normalized) ? 26 : 0,
    /[0-9]/u.test(normalized) ? 10 : 0,
    /[^A-Za-z0-9]/u.test(normalized) ? 33 : 0,
  ];
  const alphabet = classes.reduce((total, size) => total + size, 0);
  if (alphabet === 0) return 0;
  const distinct = new Set([...normalized]).size;
  // Repetition is not entropy: "aaaaaaaa" is not eight characters of choice.
  const effectiveLength = Math.min(normalized.length, distinct * 2);
  return Math.floor(effectiveLength * Math.log2(alphabet));
}

/**
 * Whether a phrase is worth warning about. Never a reason to refuse one.
 *
 * Returns null for an empty phrase, which means "no binding phrase set" and is
 * a legitimate choice rather than a weak one.
 */
export function bindPhraseStrength(phrase: string): BindPhraseStrength | null {
  if (phrase.normalize("NFC").length === 0) return null;
  if (bindPhraseIssue(phrase) !== null) return null;
  return bindPhraseEntropyBits(phrase) >= WEAK_BIND_PHRASE_BITS
    ? "STRONG"
    : "WEAK";
}

/**
 * Generates a phrase with at least {@link GENERATED_BIND_PHRASE_BITS} bits.
 *
 * `crypto.getRandomValues`, never `Math.random`: the latter is seeded
 * predictably and is not a source anyone should bind a radio link with.
 * Rejection sampling rather than a modulo, so every character of the alphabet
 * is equally likely — a modulo would quietly bias the first few characters and
 * cost real entropy.
 *
 * The result is checked against the same constraints a typed phrase faces, so
 * a generated phrase can never be one the rest of the application would
 * refuse.
 */
export function generateBindPhrase(): string {
  const alphabet = GENERATOR_ALPHABET;
  const length = Math.ceil(GENERATED_BIND_PHRASE_BITS / Math.log2(alphabet.length));
  // The largest multiple of the alphabet size that fits in a byte; values at
  // or above it are discarded rather than folded, which is what keeps the
  // distribution uniform.
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  const characters: string[] = [];
  const scratch = new Uint8Array(length * 2);
  while (characters.length < length) {
    crypto.getRandomValues(scratch);
    for (const byte of scratch) {
      if (characters.length >= length) break;
      if (byte >= limit) continue;
      characters.push(alphabet[byte % alphabet.length] ?? "");
    }
  }
  const phrase = characters.join("");
  if (bindPhraseIssue(phrase) !== null) {
    // Unreachable with this alphabet, and asserted rather than assumed: a
    // generator that produced a phrase the application refuses would be worse
    // than no generator.
    throw new Error("generated binding phrase failed its own validation");
  }
  return phrase;
}
