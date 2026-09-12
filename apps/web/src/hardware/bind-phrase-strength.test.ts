import { describe, expect, it, vi } from "vitest";

import {
  GENERATED_BIND_PHRASE_BITS,
  WEAK_BIND_PHRASE_BITS,
  bindPhraseEntropyBits,
  bindPhraseIssue,
  bindPhraseStrength,
  expressLrsBindingUid,
  generateBindPhrase,
} from "./bind-phrase";

describe("weak binding phrases are warned about, never refused", () => {
  it("calls an obviously guessable phrase weak", () => {
    for (const phrase of ["fpv", "12345678", "arabic", "password", "2026"]) {
      expect(bindPhraseStrength(phrase)).toBe("WEAK");
    }
  });

  it("still treats every one of them as completely valid", () => {
    // This is the property that matters. A weak phrase must derive a UID and
    // pass validation, because an operator whose receiver is already flashed
    // with it has to be able to type it into the transmitter.
    for (const phrase of ["fpv", "12345678", "arabic", "password", "2026"]) {
      expect(bindPhraseIssue(phrase)).toBeNull();
      expect(expressLrsBindingUid(phrase)).toHaveLength(6);
    }
  });

  it("does not call a long random phrase weak", () => {
    expect(bindPhraseStrength(generateBindPhrase())).toBe("STRONG");
    expect(bindPhraseStrength("k7m2qxr9tzvw4hn6")).toBe("STRONG");
  });

  it("says nothing about an empty phrase, which is a choice and not a weakness", () => {
    expect(bindPhraseStrength("")).toBeNull();
    expect(bindPhraseIssue("")).toBeNull();
  });

  it("says nothing about an invalid phrase, because that is a different report", () => {
    // "Invalid" and "valid but weak" are distinct states and must not be
    // conflated: one blocks the phrase, the other only advises.
    expect(bindPhraseIssue("a".repeat(200))).toBe("TOO_LONG");
    expect(bindPhraseStrength("a".repeat(200))).toBeNull();
    expect(bindPhraseIssue("   ")).toBe("BLANK");
    expect(bindPhraseStrength("   ")).toBeNull();
  });

  it("does not mistake repetition for entropy", () => {
    expect(bindPhraseEntropyBits("aaaaaaaaaaaaaaaa")).toBeLessThan(
      WEAK_BIND_PHRASE_BITS,
    );
    expect(bindPhraseStrength("aaaaaaaaaaaaaaaa")).toBe("WEAK");
  });
});

describe("the generator", () => {
  it("produces at least the entropy it claims, measured the way the warning measures", () => {
    expect(GENERATED_BIND_PHRASE_BITS).toBeGreaterThanOrEqual(96);
    // Many draws, not a few. An earlier generator was sized by arithmetic
    // rather than by this estimator and fell under its own claim on roughly
    // one draw in 375 — which a handful of samples would have missed, and
    // which a sampled test can only catch by taking enough of them.
    for (let attempt = 0; attempt < 2000; attempt += 1) {
      const phrase = generateBindPhrase();
      expect(bindPhraseEntropyBits(phrase)).toBeGreaterThanOrEqual(
        GENERATED_BIND_PHRASE_BITS,
      );
      expect(bindPhraseStrength(phrase)).toBe("STRONG");
    }
  });

  it("never returns a phrase that misses the claim, whatever it draws", () => {
    // The guarantee is structural, not statistical: the generator measures
    // what it drew and draws again rather than returning something the
    // interface would then warn about. Feeding it a source that produces the
    // worst draw available — one character, repeated — proves it refuses
    // rather than returns.
    const stuck = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        if (array !== null) {
          new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(
            0,
          );
        }
        return array;
      });
    try {
      expect(() => generateBindPhrase()).toThrow(/failed its own validation/u);
    } finally {
      stuck.mockRestore();
    }
    // And the real source is back, so the refusal above was about the draw and
    // not about a spy left installed.
    expect(bindPhraseStrength(generateBindPhrase())).toBe("STRONG");
  });

  it("produces phrases the rest of the application accepts", () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const phrase = generateBindPhrase();
      expect(bindPhraseIssue(phrase)).toBeNull();
      expect(expressLrsBindingUid(phrase)).toHaveLength(6);
      expect(phrase.length).toBeLessThanOrEqual(128);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      seen.add(generateBindPhrase());
    }
    expect(seen.size).toBe(50);
  });

  it("draws from crypto.getRandomValues and never Math.random", () => {
    // Observed rather than read off the source text. A source assertion passes
    // the moment the draw moves into a helper, whether or not that helper is
    // still using a cryptographic source; watching the two functions cannot be
    // fooled that way.
    const random = vi.spyOn(Math, "random");
    const secure = vi.spyOn(crypto, "getRandomValues");
    try {
      expect(generateBindPhrase().length).toBeGreaterThan(0);
      expect(secure).toHaveBeenCalled();
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
      secure.mockRestore();
    }
  });

  it("uses characters that survive being read aloud and retyped", () => {
    // The phrase has to reach a second device through a person. Characters
    // that are misread cost more than alphabet size buys.
    const phrase = generateBindPhrase();
    expect(phrase).toMatch(/^[a-z2-9]+$/u);
    expect(phrase).not.toMatch(/[01lio]/u);
  });
});
