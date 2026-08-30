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
