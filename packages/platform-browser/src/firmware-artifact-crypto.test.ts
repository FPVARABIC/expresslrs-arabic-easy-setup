import { describe, expect, it, vi } from "vitest";

import {
  readFirmwareArtifactBlob,
  WebCryptoFirmwareArtifactDigestProvider,
  WebCryptoFirmwareManifestSignatureVerifier,
} from "./firmware-artifact-crypto.js";
import { BrowserGzipFirmwareArtifactDecompressionProvider } from "./firmware-artifact-decompression.js";

const gzipHello = new Uint8Array([
  0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xcb, 0x48, 0xcd,
  0xc9, 0xc9, 0x07, 0x00, 0x86, 0xa6, 0x10, 0x36, 0x05, 0x00, 0x00, 0x00,
]);

describe("Browser Firmware artifact cryptography", () => {
  it("computes the canonical SHA-256 known vector with Web Crypto", async () => {
    const provider = new WebCryptoFirmwareArtifactDigestProvider();
    const bytes = new TextEncoder().encode("abc");

    await expect(provider.digestSha256(bytes)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(provider.assurance).toBe("CRYPTOGRAPHIC");
  });

  it("fails closed when cancellation is active", async () => {
    const provider = new WebCryptoFirmwareArtifactDigestProvider();
    await expect(
      provider.digestSha256(new Uint8Array([1]), { aborted: true }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reads exact Blob bytes while bypassing caller-overridden accessors", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])]);
    const sizeGetter = vi.fn(() => 999);
    const arrayBufferOverride = vi.fn(async () => new ArrayBuffer(999));
    Object.defineProperties(blob, {
      size: { get: sizeGetter },
      arrayBuffer: { value: arrayBufferOverride },
    });

    const bytes = await readFirmwareArtifactBlob({ blob });

    expect([...bytes]).toEqual([1, 2, 3, 4]);
    expect(sizeGetter).not.toHaveBeenCalled();
    expect(arrayBufferOverride).not.toHaveBeenCalled();
  });

  it("rejects empty, invalid, and pre-cancelled Blob reads", async () => {
    await expect(
      readFirmwareArtifactBlob({ blob: new Blob([]) }),
    ).rejects.toThrow("FIRMWARE_ARTIFACT_BLOB_EMPTY");
    await expect(
      readFirmwareArtifactBlob({ blob: {} as Blob }),
    ).rejects.toThrow("FIRMWARE_ARTIFACT_BLOB_INVALID");
    await expect(
      readFirmwareArtifactBlob({
        blob: new Blob([new Uint8Array([1])]),
        signal: { aborted: true },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("verifies Ed25519 known bytes without assigning key trust", async () => {
    const verifier = new WebCryptoFirmwareManifestSignatureVerifier();
    const keyPair = (await crypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const signatureInput = new TextEncoder().encode(
      "synthetic-manifest-signature-input",
    );
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: "Ed25519" },
        keyPair.privateKey,
        signatureInput,
      ),
    );
    const rawPublicKey = new Uint8Array(
      await crypto.subtle.exportKey("raw", keyPair.publicKey),
    );

    await expect(
      verifier.verifyEd25519(signatureInput, signature, rawPublicKey),
    ).resolves.toBe(true);
    signatureInput[0] = (signatureInput[0] ?? 0) ^ 1;
    await expect(
      verifier.verifyEd25519(signatureInput, signature, rawPublicKey),
    ).resolves.toBe(false);
    expect(verifier.assurance).toBe("CRYPTOGRAPHIC");
  });

  it("rejects malformed or cancelled Ed25519 operations", async () => {
    const verifier = new WebCryptoFirmwareManifestSignatureVerifier();
    await expect(
      verifier.verifyEd25519(
        new Uint8Array([1]),
        new Uint8Array(63),
        new Uint8Array(32),
      ),
    ).rejects.toThrow("ED25519_WIRE_VALUE_INVALID");
    await expect(
      verifier.verifyEd25519(
        new Uint8Array([1]),
        new Uint8Array(64),
        new Uint8Array(32),
        { aborted: true },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Browser Firmware artifact gzip decompression", () => {
  it("streams a valid single-member gzip fixture in bounded exact chunks", async () => {
    const provider = new BrowserGzipFirmwareArtifactDecompressionProvider();
    const input = gzipHello.slice();
    const output: Uint8Array[] = [];
    const byteLengthGetter = vi.fn(() => 0);
    const sliceOverride = vi.fn(() => new Uint8Array());
    Object.defineProperties(input, {
      byteLength: { get: byteLengthGetter },
      slice: { value: sliceOverride },
    });

    const operation = provider.decompressGzip(input, (chunk) => {
      expect(Object.getPrototypeOf(chunk)).toBe(Uint8Array.prototype);
      expect(chunk.byteLength).toBeGreaterThan(0);
      expect(chunk.byteLength).toBeLessThanOrEqual(64 * 1024);
      output.push(chunk.slice());
    });
    input.fill(0);
    await operation;

    const bytes = new Uint8Array(
      output.reduce((length, chunk) => length + chunk.byteLength, 0),
    );
    let offset = 0;
    for (const chunk of output) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    expect(new TextDecoder().decode(bytes)).toBe("hello");
    expect(provider.assurance).toBe("SYNTHETIC_ONLY");
    expect(byteLengthGetter).not.toHaveBeenCalled();
    expect(sliceOverride).not.toHaveBeenCalled();
  });

  it("splits large platform chunks before crossing the Core sink boundary", async () => {
    const raw = new Uint8Array(70 * 1024);
    raw.fill(0x61);
    const compressedStream = new Blob([raw])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    const compressed = new Uint8Array(
      await new Response(compressedStream).arrayBuffer(),
    );
    const provider = new BrowserGzipFirmwareArtifactDecompressionProvider();
    const chunks: Uint8Array[] = [];

    await provider.decompressGzip(compressed, (chunk) => chunks.push(chunk));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.byteLength <= 64 * 1024)).toBe(true);
    expect(chunks.reduce((length, chunk) => length + chunk.byteLength, 0)).toBe(
      raw.byteLength,
    );
  });

  it.each([
    [
      "bad-checksum",
      Uint8Array.from(gzipHello, (value, index) =>
        index === 19 ? value ^ 1 : value,
      ),
    ],
    ["trailing-data", new Uint8Array([...gzipHello, 0])],
    ["multiple-members", new Uint8Array([...gzipHello, ...gzipHello])],
  ] as const)("rejects %s", async (_name, bytes) => {
    const provider = new BrowserGzipFirmwareArtifactDecompressionProvider();
    await expect(
      provider.decompressGzip(bytes, () => undefined),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("uses fixed failures for unavailable streams and preserves cancellation", async () => {
    const unavailable = new BrowserGzipFirmwareArtifactDecompressionProvider({
      createStream() {
        throw new Error("private-platform-detail");
      },
    });
    const provider = new BrowserGzipFirmwareArtifactDecompressionProvider();

    await expect(
      unavailable.decompressGzip(gzipHello, () => undefined),
    ).rejects.toThrow("BROWSER_GZIP_DECOMPRESSION_UNAVAILABLE");
    await expect(
      provider.decompressGzip(gzipHello, () => undefined, { aborted: true }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects invalid direct inputs before constructing a stream", async () => {
    const createStream = vi.fn(() => new DecompressionStream("gzip"));
    const provider = new BrowserGzipFirmwareArtifactDecompressionProvider({
      createStream,
    });

    await expect(
      provider.decompressGzip(new Uint8Array(), () => undefined),
    ).rejects.toThrow("BROWSER_GZIP_DECOMPRESSION_INPUT_INVALID");
    await expect(
      provider.decompressGzip(
        new Uint16Array([1, 2]) as unknown as Uint8Array,
        () => undefined,
      ),
    ).rejects.toThrow("BROWSER_GZIP_DECOMPRESSION_INPUT_INVALID");
    expect(createStream).not.toHaveBeenCalled();
  });
});
