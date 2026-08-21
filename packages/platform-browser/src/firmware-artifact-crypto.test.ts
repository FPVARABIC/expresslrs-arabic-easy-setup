import { describe, expect, it, vi } from "vitest";

import {
  readFirmwareArtifactBlob,
  WebCryptoFirmwareArtifactDigestProvider,
  WebCryptoFirmwareManifestSignatureVerifier,
} from "./firmware-artifact-crypto.js";

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
