import {
  maximumFirmwareArtifactSizeBytes,
  type CancellationSignal,
  type FirmwareArtifactDigestProvider,
  type FirmwareManifestSignatureVerifier,
} from "@elrs-easy/domain";

function assertNotAborted(signal?: CancellationSignal): void {
  if (signal?.aborted === true) {
    const error = new Error("The Firmware artifact operation was cancelled");
    error.name = "AbortError";
    throw error;
  }
}

function bytesToLowercaseHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Browser SHA-256 adapter. Core still decides size and digest equality. */
export class WebCryptoFirmwareArtifactDigestProvider implements FirmwareArtifactDigestProvider {
  public readonly assurance = "CRYPTOGRAPHIC" as const;
  readonly #subtle: SubtleCrypto;

  public constructor(input: { readonly subtle?: SubtleCrypto } = {}) {
    const subtle = input.subtle ?? globalThis.crypto?.subtle;
    if (subtle === undefined) {
      throw new TypeError("WEB_CRYPTO_SUBTLE_UNAVAILABLE");
    }
    this.#subtle = subtle;
  }

  public async digestSha256(
    bytes: Uint8Array,
    signal?: CancellationSignal,
  ): Promise<string> {
    assertNotAborted(signal);
    const copy = Uint8Array.from(bytes);
    const digest = await this.#subtle.digest("SHA-256", copy);
    assertNotAborted(signal);
    return bytesToLowercaseHex(new Uint8Array(digest));
  }
}

/**
 * Browser Ed25519 primitive. Key authorization remains a Core trust-metadata
 * concern; this adapter only answers whether the signature is mathematical.
 */
export class WebCryptoFirmwareManifestSignatureVerifier implements FirmwareManifestSignatureVerifier {
  public readonly assurance = "CRYPTOGRAPHIC" as const;
  readonly #subtle: SubtleCrypto;

  public constructor(input: { readonly subtle?: SubtleCrypto } = {}) {
    const subtle = input.subtle ?? globalThis.crypto?.subtle;
    if (subtle === undefined) {
      throw new TypeError("WEB_CRYPTO_SUBTLE_UNAVAILABLE");
    }
    this.#subtle = subtle;
  }

  public async verifyEd25519(
    signatureInput: Uint8Array,
    signature: Uint8Array,
    rawPublicKey: Uint8Array,
    signal?: CancellationSignal,
  ): Promise<boolean> {
    assertNotAborted(signal);
    if (signature.byteLength !== 64 || rawPublicKey.byteLength !== 32) {
      throw new TypeError("ED25519_WIRE_VALUE_INVALID");
    }

    const inputCopy = Uint8Array.from(signatureInput);
    const signatureCopy = Uint8Array.from(signature);
    const publicKeyCopy = Uint8Array.from(rawPublicKey);
    const publicKey = await this.#subtle.importKey(
      "raw",
      publicKeyCopy,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    assertNotAborted(signal);
    const valid = await this.#subtle.verify(
      { name: "Ed25519" },
      publicKey,
      signatureCopy,
      inputCopy,
    );
    assertNotAborted(signal);
    return valid;
  }
}

const blobSizeGetter = Object.getOwnPropertyDescriptor(
  Blob.prototype,
  "size",
)?.get;
const blobArrayBuffer = Blob.prototype.arrayBuffer;

/**
 * Reads an immutable Browser Blob/File without exposing its name or path. The
 * returned exact Uint8Array can then be snapshotted synchronously by Core.
 */
export async function readFirmwareArtifactBlob(input: {
  readonly blob: Blob;
  readonly signal?: CancellationSignal;
}): Promise<Uint8Array> {
  assertNotAborted(input.signal);
  if (blobSizeGetter === undefined) {
    throw new TypeError("BLOB_SIZE_READER_UNAVAILABLE");
  }

  let size: number;
  try {
    size = Reflect.apply(blobSizeGetter, input.blob, []) as number;
  } catch {
    throw new TypeError("FIRMWARE_ARTIFACT_BLOB_INVALID");
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new RangeError("FIRMWARE_ARTIFACT_BLOB_EMPTY");
  }
  if (size > maximumFirmwareArtifactSizeBytes) {
    throw new RangeError("FIRMWARE_ARTIFACT_BLOB_TOO_LARGE");
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await Reflect.apply(blobArrayBuffer, input.blob, []);
  } catch {
    throw new TypeError("FIRMWARE_ARTIFACT_BLOB_READ_FAILED");
  }
  assertNotAborted(input.signal);
  if (buffer.byteLength !== size) {
    throw new TypeError("FIRMWARE_ARTIFACT_BLOB_SIZE_CHANGED");
  }
  return new Uint8Array(buffer.slice(0));
}
