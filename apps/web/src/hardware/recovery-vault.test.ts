import { describe, expect, it } from "vitest";

import {
  MIN_RECOVERY_PASSPHRASE_LENGTH,
  RecoveryVaultError,
  VAULT_PBKDF2_ITERATIONS,
  looksLikeRecoveryVault,
  openRecoveryVault,
  readRecoveryVaultHeader,
  sealRecoveryVault,
  type RecoveryVaultIdentity,
} from "./recovery-vault";

const PASSPHRASE = "a-real-recovery-passphrase";

const identity: RecoveryVaultIdentity = {
  schemaVersion: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  target: {
    id: "vendor/tx_2400/example",
    productName: "Example ExpressLRS TX",
    platform: "esp32",
    firmware: "EXAMPLE_TX_2400",
  },
  release: { label: "4.1.0", revision: "release410" },
  device: {
    productName: "Example ExpressLRS TX",
    role: "tx",
    firmwareVersion: "4.1.0",
  },
};

/** Stands in for the zip. Its content is irrelevant; its secrecy is not. */
function archive(size = 4096): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) bytes[index] = index % 251;
  // A recognisable secret, so a leak is visible rather than inferred.
  new TextEncoder()
    .encode("wifi-password=correct-horse-battery-staple")
    .forEach((byte, offset) => {
      bytes[100 + offset] = byte;
    });
  return bytes;
}

// A smaller work factor keeps the suite quick. Every test that matters is
// about the format and the tag, neither of which depends on the count, and
// the production default is asserted separately below.
const iterations = 100_000;

async function seal(
  overrides: Partial<Parameters<typeof sealRecoveryVault>[0]> = {},
) {
  return sealRecoveryVault({
    archive: archive(),
    identity,
    passphrase: PASSPHRASE,
    iterations,
    ...overrides,
  });
}

describe("the encrypted recovery envelope", () => {
  it("ships a benchmarked production work factor", () => {
    expect(VAULT_PBKDF2_ITERATIONS).toBe(600_000);
  });

  it("round-trips the archive byte for byte", async () => {
    const plaintext = archive();
    const sealed = await sealRecoveryVault({
      archive: plaintext,
      identity,
      passphrase: PASSPHRASE,
      iterations,
    });
    const opened = await openRecoveryVault({
      bytes: sealed,
      passphrase: PASSPHRASE,
    });
    expect(opened.archive).toEqual(plaintext);
    expect(opened.header.identity).toEqual(identity);
  });

  it("does not leave the secret readable anywhere in the file", async () => {
    const sealed = await seal();
    const needle = new TextEncoder().encode("correct-horse-battery-staple");
    const haystack = sealed;
    let found = -1;
    outer: for (
      let i = 0;
      i <= haystack.byteLength - needle.byteLength;
      i += 1
    ) {
      for (let j = 0; j < needle.byteLength; j += 1) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      found = i;
      break;
    }
    expect(found).toBe(-1);
  });

  it("uses a fresh salt and nonce for every file", async () => {
    const first = await seal();
    const second = await seal();
    // Same passphrase, same plaintext, and the bytes must still differ.
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false);
  });

  it("reads identity without a passphrase, so a file can be recognised", () => {
    // The header is what lets an operator tell three saved files apart before
    // committing to typing anything.
    return seal().then((sealed) => {
      const header = readRecoveryVaultHeader(sealed);
      expect(header.identity.target.id).toBe("vendor/tx_2400/example");
      expect(header.iterations).toBe(iterations);
      expect(looksLikeRecoveryVault(sealed)).toBe(true);
    });
  });

  it("refuses to create a file with an unusable passphrase", async () => {
    await expect(seal({ passphrase: "short" })).rejects.toMatchObject({
      code: "PASSPHRASE_UNUSABLE",
    });
    expect(MIN_RECOVERY_PASSPHRASE_LENGTH).toBe(8);
  });
});

describe("the envelope refuses every damaged or hostile file", () => {
  it("rejects a wrong passphrase", async () => {
    const sealed = await seal();
    await expect(
      openRecoveryVault({ bytes: sealed, passphrase: "not-the-passphrase" }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("rejects an empty passphrase without deriving a key", async () => {
    const sealed = await seal();
    await expect(
      openRecoveryVault({ bytes: sealed, passphrase: "" }),
    ).rejects.toMatchObject({ code: "PASSPHRASE_UNUSABLE" });
  });

  it("rejects a single flipped bit anywhere in the ciphertext", async () => {
    const sealed = await seal();
    const header = readRecoveryVaultHeader(sealed);
    // Three positions: the first ciphertext byte, the middle, and inside the
    // GCM tag itself.
    for (const offset of [
      header.ciphertextOffset,
      header.ciphertextOffset + Math.floor(header.ciphertextLength / 2),
      sealed.byteLength - 1,
    ]) {
      const tampered = sealed.slice();
      tampered[offset] ^= 0x01;
      await expect(
        openRecoveryVault({ bytes: tampered, passphrase: PASSPHRASE }),
      ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    }
  });

  it("rejects an edited identity header even though it is cleartext", async () => {
    // This is the attack a recomputed SHA-256 does not stop: repoint a valid
    // package at a different Target so it is restored onto the wrong device.
    const sealed = await seal();
    const edited = sealed.slice();
    // Find the target id inside the cleartext identity header and change one
    // character of it, keeping the length identical so that every declared
    // offset stays valid. Nothing structural is wrong with the result: the
    // only thing that can reject it is authentication over the AAD.
    const marker = new TextEncoder().encode("tx_2400/example");
    let at = -1;
    outer: for (let i = 0; i <= edited.byteLength - marker.byteLength; i += 1) {
      for (let j = 0; j < marker.byteLength; j += 1) {
        if (edited[i + j] !== marker[j]) continue outer;
      }
      at = i;
      break;
    }
    expect(at).toBeGreaterThan(0);
    edited[at + marker.byteLength - 1] = "X".charCodeAt(0);
    expect(edited.byteLength).toBe(sealed.byteLength);
    // The edited header still parses cleanly — that is the point.
    expect(readRecoveryVaultHeader(edited).identity.target.id).toBe(
      "vendor/tx_2400/examplX",
    );
    await expect(
      openRecoveryVault({ bytes: edited, passphrase: PASSPHRASE }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("rejects a file whose iteration count has been edited", async () => {
    const sealed = await seal();
    const tampered = sealed.slice();
    // Still inside the accepted range, so this is not a bounds rejection —
    // it has to fail because the count is authenticated.
    new DataView(tampered.buffer).setUint32(12, 200_000, true);
    await expect(
      openRecoveryVault({ bytes: tampered, passphrase: PASSPHRASE }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("rejects truncated data", async () => {
    const sealed = await seal();
    await expect(
      openRecoveryVault({
        bytes: sealed.slice(0, sealed.byteLength - 1),
        passphrase: PASSPHRASE,
      }),
    ).rejects.toMatchObject({ code: "TRUNCATED" });
  });

  it("rejects extra trailing data", async () => {
    const sealed = await seal();
    const padded = new Uint8Array(sealed.byteLength + 8);
    padded.set(sealed, 0);
    await expect(
      openRecoveryVault({ bytes: padded, passphrase: PASSPHRASE }),
    ).rejects.toMatchObject({ code: "TRAILING_DATA" });
  });

  it("rejects a plain zip and anything else without the magic", async () => {
    // A plaintext recovery archive from before this format existed.
    const plainZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...archive(64)]);
    await expect(
      openRecoveryVault({ bytes: plainZip, passphrase: PASSPHRASE }),
    ).rejects.toMatchObject({ code: "NOT_A_VAULT" });
    expect(looksLikeRecoveryVault(plainZip)).toBe(false);
    await expect(
      openRecoveryVault({ bytes: new Uint8Array(4), passphrase: PASSPHRASE }),
    ).rejects.toMatchObject({ code: "NOT_A_VAULT" });
  });

  it("rejects an unsupported format version", async () => {
    const sealed = await seal();
    const future = sealed.slice();
    new DataView(future.buffer).setUint16(8, 2, true);
    expect(() => readRecoveryVaultHeader(future)).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_FORMAT" }),
    );
  });

  it("rejects an unsupported cipher or KDF identifier", async () => {
    const sealed = await seal();
    for (const offset of [10, 11]) {
      const swapped = sealed.slice();
      swapped[offset] = 9;
      expect(() => readRecoveryVaultHeader(swapped)).toThrow(
        expect.objectContaining({ code: "UNSUPPORTED_FORMAT" }),
      );
    }
  });

  it("rejects a work factor that would hang the interface", async () => {
    const sealed = await seal();
    const hostile = sealed.slice();
    new DataView(hostile.buffer).setUint32(12, 4_000_000_000, true);
    // Refused from the header, before any key derivation is attempted.
    expect(() => readRecoveryVaultHeader(hostile)).toThrow(
      expect.objectContaining({ code: "TOO_LARGE" }),
    );
  });

  it("rejects a header with inconsistent internal lengths", async () => {
    const sealed = await seal();
    const broken = sealed.slice();
    broken[16] = 32; // salt length that does not match the format
    expect(() => readRecoveryVaultHeader(broken)).toThrow(
      expect.objectContaining({ code: "MALFORMED_HEADER" }),
    );
  });

  it("rejects an identity header that is not valid JSON", async () => {
    const sealed = await seal();
    const broken = sealed.slice();
    // First byte of the identity JSON: 24 + 16 salt + 12 nonce. It is '{';
    // replacing it with a letter leaves a well-formed length and a payload
    // that cannot parse.
    expect(broken[24 + 16 + 12]).toBe("{".charCodeAt(0));
    broken[24 + 16 + 12] = "x".charCodeAt(0);
    expect(() => readRecoveryVaultHeader(broken)).toThrow(
      expect.objectContaining({ code: "MALFORMED_HEADER" }),
    );
  });

  it("rejects an oversized file before allocating for it", () => {
    // 96 MiB + 1, expressed without allocating it: a subarray view over a
    // small buffer cannot be used, so this asserts the bound itself is checked
    // against byteLength rather than against content.
    const pretend = {
      byteLength: 96 * 1024 * 1024 + 1,
    } as unknown as Uint8Array;
    expect(() => readRecoveryVaultHeader(pretend)).toThrow(
      expect.objectContaining({ code: "TOO_LARGE" }),
    );
  });

  it("produces nothing at all when authentication fails", async () => {
    const sealed = await seal();
    const tampered = sealed.slice();
    tampered[tampered.byteLength - 1] ^= 0xff;
    let leaked: unknown = "nothing was returned";
    try {
      leaked = await openRecoveryVault({
        bytes: tampered,
        passphrase: PASSPHRASE,
      });
      throw new Error("authentication must not have succeeded");
    } catch (error) {
      expect(error).toBeInstanceOf(RecoveryVaultError);
      expect((error as RecoveryVaultError).code).toBe("AUTHENTICATION_FAILED");
    }
    // There is no partial plaintext to act on: the value never changed.
    expect(leaked).toBe("nothing was returned");
  });

  it("says nothing about which byte was wrong", async () => {
    const sealed = await seal();
    const header = readRecoveryVaultHeader(sealed);
    // Both corruptions sit inside the ciphertext, where the tag is the only
    // thing that can catch them. A corrupted *header* is reported differently
    // on purpose — that is a structural fault, not a failed authentication —
    // and is covered separately above.
    const first = sealed.slice();
    first[first.byteLength - 2] ^= 0x02;
    const second = sealed.slice();
    second[header.ciphertextOffset + 3] ^= 0x02;
    const messages = new Set<string>();
    for (const bytes of [first, second]) {
      try {
        await openRecoveryVault({ bytes, passphrase: PASSPHRASE });
      } catch (error) {
        messages.add((error as Error).message);
      }
    }
    // One message for every authentication failure: no oracle.
    expect(messages.size).toBe(1);
  });
});
