import type {
  FirmwareManifestSignatureVerifier,
  SignedFirmwareManifestEnvelope,
  SyntheticFirmwareManifestPayloadV1,
} from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import {
  maximumSignedFirmwareManifestBytes,
  parseSignedFirmwareManifest,
  signedFirmwareManifestDomain,
  verifySyntheticFirmwareManifestSignature,
  type ParsedSignedFirmwareManifest,
} from "./firmware-manifest.js";

const zeroSignatureBase64Url = "A".repeat(86);
const syntheticKeyId = "synthetic:manifest-test-key-1";
const artifactSha256 = "a".repeat(64);

function manifestPayload(): SyntheticFirmwareManifestPayloadV1 {
  return {
    manifestSchema: "1",
    applicationVersion: "0.0.0",
    coreVersion: "0.0.0",
    channel: "synthetic",
    upstreamRepository: "https://example.invalid/expresslrs",
    upstreamTag: "v4.2.0",
    upstreamFullSha: "1".repeat(40),
    upstreamSourceArchiveSha256: "2".repeat(64),
    targetsRepository: "https://example.invalid/targets",
    targetsFullSha: "3".repeat(40),
    targetsSnapshotSha256: "4".repeat(64),
    patchSetId: "synthetic-none",
    patches: [{ id: "synthetic-patch-a", sha256: "5".repeat(64) }],
    dirtyTree: false,
    toolchainOrContainerDigest: `sha256:${"6".repeat(64)}`,
    platformioVersion: "6.1.18",
    platformVersions: [{ name: "synthetic-platform", version: "1.0.0" }],
    dependencyLockDigest: `sha256:${"7".repeat(64)}`,
    targetIdentifier: "fixture.tx.alpha-2g4",
    productIdentifier: "synthetic-product",
    mcu: "esp32",
    radio: "sx1280",
    band: "2g4",
    regulatoryDomain: "ism2400",
    nonSecretBuildOptions: [{ name: "synthetic.fixture", value: "enabled" }],
    artifactName: "synthetic-firmware.bin",
    artifactMediaType: "application/octet-stream",
    artifactCompression: "none",
    artifactByteForm: "RAW_TO_WRITE",
    artifactSizeBytes: 4_096,
    artifactSha256,
    buildSourceEpoch: 1_787_209_200,
    testsAndValidationLevel: ["SYNTHETIC_ONLY"],
    correspondingSourceUrl: "https://example.invalid/source/commit",
    noticeBundle: {
      url: "https://example.invalid/notices/bundle.json",
      sha256: "8".repeat(64),
    },
    releaseSequence: 1,
    publishedAt: "2026-08-21T08:00:00.000Z",
    minimumApplicationVersion: "0.0.0",
    minimumCoreVersion: "0.0.0",
    signingRole: "synthetic",
    requiredRootMetadataVersion: 1,
  };
}

function manifestEnvelope(
  input: {
    readonly payload?: SyntheticFirmwareManifestPayloadV1;
    readonly signatureBase64Url?: string;
    readonly keyId?: string;
  } = {},
): SignedFirmwareManifestEnvelope<SyntheticFirmwareManifestPayloadV1> {
  return {
    schemaVersion: "1",
    canonicalization: "RFC8785",
    payload: input.payload ?? manifestPayload(),
    signature: {
      algorithm: "Ed25519",
      keyId: input.keyId ?? syntheticKeyId,
      signatureBase64Url: input.signatureBase64Url ?? zeroSignatureBase64Url,
    },
  };
}

function manifestText(
  input: Parameters<typeof manifestEnvelope>[0] = {},
): string {
  return JSON.stringify(manifestEnvelope(input));
}

function encodeBase64Url(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += alphabet[first >> 2];
    result += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      result += alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) {
      result += alphabet[third & 63];
    }
  }
  return result;
}

function requireParsed(source: string): ParsedSignedFirmwareManifest {
  const result = parseSignedFirmwareManifest(source);
  expect(result.status).toBe("PARSED_UNTRUSTED");
  if (result.status !== "PARSED_UNTRUSTED") {
    throw new Error(`fixture did not parse: ${result.reason}`);
  }
  return result;
}

async function createSignedFixture(): Promise<{
  readonly parsed: ParsedSignedFirmwareManifest;
  readonly publicKey: Uint8Array;
}> {
  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const placeholder = requireParsed(manifestText());
  const signatureInput = Uint8Array.from(placeholder.copySignatureInput());
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "Ed25519" },
      keyPair.privateKey,
      signatureInput,
    ),
  );
  const parsed = requireParsed(
    manifestText({ signatureBase64Url: encodeBase64Url(signature) }),
  );
  return {
    parsed,
    publicKey: new Uint8Array(
      await crypto.subtle.exportKey("raw", keyPair.publicKey),
    ),
  };
}

function webCryptoVerifier(): FirmwareManifestSignatureVerifier {
  return {
    assurance: "CRYPTOGRAPHIC",
    async verifyEd25519(signatureInput, signature, rawPublicKey) {
      const publicKey = await crypto.subtle.importKey(
        "raw",
        Uint8Array.from(rawPublicKey),
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      return crypto.subtle.verify(
        { name: "Ed25519" },
        publicKey,
        Uint8Array.from(signature),
        Uint8Array.from(signatureInput),
      );
    },
  };
}

describe("bounded signed Firmware manifest parser", () => {
  it("rebuilds the complete Synthetic allowlist without granting trust", () => {
    const parsed = requireParsed(manifestText());

    expect(parsed.trustStatus).toBe("UNVERIFIED_NO_TRUST_ROOT");
    expect(parsed.manifest.payload).toMatchObject({
      channel: "synthetic",
      signingRole: "synthetic",
      artifactCompression: "none",
      artifactByteForm: "RAW_TO_WRITE",
      artifactSha256,
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.manifest)).toBe(true);
    expect(Object.isFrozen(parsed.manifest.payload)).toBe(true);
    expect(Object.isFrozen(parsed.manifest.payload.patches)).toBe(true);
    expect(Object.isFrozen(parsed.manifest.payload.patches[0])).toBe(true);
  });

  it("builds stable domain-separated RFC 8785 bytes independent of wire order", () => {
    const ordinary = requireParsed(manifestText());
    const envelope = manifestEnvelope();
    const reversedPayload = Object.fromEntries(
      Object.entries(envelope.payload).reverse(),
    ) as unknown as SyntheticFirmwareManifestPayloadV1;
    const reordered = JSON.stringify({
      signature: envelope.signature,
      payload: reversedPayload,
      canonicalization: envelope.canonicalization,
      schemaVersion: envelope.schemaVersion,
    });
    const shuffled = requireParsed(reordered);

    const firstCopy = ordinary.copySignatureInput();
    expect([...shuffled.copySignatureInput()]).toEqual([...firstCopy]);
    const decoded = new TextDecoder().decode(firstCopy);
    expect(decoded.startsWith(signedFirmwareManifestDomain)).toBe(true);
    expect(decoded).toContain('{"canonicalization":"RFC8785","payload":{');
    expect(decoded).not.toContain("signatureBase64Url");

    firstCopy.fill(0);
    expect(new TextDecoder().decode(ordinary.copySignatureInput())).toBe(
      decoded,
    );
  });

  it("rejects decoded duplicate names at every object depth", () => {
    const duplicateTopLevel = manifestText().replace(
      '{"schemaVersion":"1"',
      '{"schemaVersion":"1","schema\\u0056ersion":"1"',
    );
    const duplicateNested = manifestText().replace(
      '"id":"synthetic-patch-a"',
      '"id":"synthetic-patch-a","\\u0069d":"second"',
    );

    expect(parseSignedFirmwareManifest(duplicateTopLevel)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_DUPLICATE_KEY",
    });
    expect(parseSignedFirmwareManifest(duplicateNested)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_DUPLICATE_KEY",
    });
  });

  it.each([
    ["1.0", "FIRMWARE_MANIFEST_UNSAFE_NUMBER"],
    ["1e0", "FIRMWARE_MANIFEST_UNSAFE_NUMBER"],
    ["9007199254740992", "FIRMWARE_MANIFEST_UNSAFE_NUMBER"],
  ] as const)("rejects non-safe release sequence %s", (value, reason) => {
    const hostile = manifestText().replace(
      '"releaseSequence":1',
      `"releaseSequence":${value}`,
    );
    expect(parseSignedFirmwareManifest(hostile)).toEqual({
      status: "BLOCKED",
      reason,
    });
  });

  it("rejects invalid Unicode, oversized input, and oversized arrays", () => {
    const loneSurrogate = manifestText().replace(
      '"productIdentifier":"synthetic-product"',
      '"productIdentifier":"\\ud800"',
    );
    const oversizedInput = `{"value":"${"x".repeat(maximumSignedFirmwareManifestBytes)}"}`;
    const oversizedArray = manifestText().replace(
      '"testsAndValidationLevel":["SYNTHETIC_ONLY"]',
      `"testsAndValidationLevel":[${Array.from({ length: 65 }, () => '"SYNTHETIC_ONLY"').join(",")}]`,
    );

    expect(parseSignedFirmwareManifest(loneSurrogate)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_INVALID_UNICODE",
    });
    expect(parseSignedFirmwareManifest(oversizedInput)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_LIMIT_EXCEEDED",
    });
    expect(parseSignedFirmwareManifest(oversizedArray)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_LIMIT_EXCEEDED",
    });
  });

  it("rejects unknown fields, noncanonical signatures, and real-channel claims", () => {
    const unknownPayload = {
      ...manifestPayload(),
      unexpectedAuthorization: true,
    };
    const stableClaim = { ...manifestPayload(), channel: "stable" };
    const compressedClaim = {
      ...manifestPayload(),
      artifactCompression: "gzip",
    };

    expect(
      parseSignedFirmwareManifest(
        JSON.stringify({ ...manifestEnvelope(), payload: unknownPayload }),
      ),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_SCHEMA_INVALID",
    });
    expect(
      parseSignedFirmwareManifest(
        manifestText({ signatureBase64Url: "A".repeat(85) }),
      ),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_SCHEMA_INVALID",
    });
    expect(
      parseSignedFirmwareManifest(
        JSON.stringify({ ...manifestEnvelope(), payload: stableClaim }),
      ).status,
    ).toBe("BLOCKED");
    expect(
      parseSignedFirmwareManifest(
        JSON.stringify({ ...manifestEnvelope(), payload: compressedClaim }),
      ).status,
    ).toBe("BLOCKED");
    expect(parseSignedFirmwareManifest(null as unknown as string)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_JSON_INVALID",
    });
  });
});

describe("Synthetic Ed25519 Firmware manifest verification", () => {
  it("verifies synthetic bytes while preserving the no-root trust claim", async () => {
    const fixture = await createSignedFixture();

    await expect(
      verifySyntheticFirmwareManifestSignature({
        parsed: fixture.parsed,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: syntheticKeyId,
          rawPublicKey: fixture.publicKey,
        },
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "VERIFIED_UNTRUSTED",
      verification: {
        status: "VALID_UNTRUSTED",
        algorithm: "Ed25519",
        assurance: "CRYPTOGRAPHIC",
        keyAssurance: "SYNTHETIC_ONLY",
        keyId: syntheticKeyId,
        trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
      },
    });
  });

  it("rejects payload tampering after a valid signature was produced", async () => {
    const fixture = await createSignedFixture();
    const signatureBase64Url =
      fixture.parsed.manifest.signature.signatureBase64Url;
    const tamperedPayload = { ...manifestPayload(), releaseSequence: 2 };
    const tampered = requireParsed(
      JSON.stringify({
        ...manifestEnvelope({ signatureBase64Url }),
        payload: tamperedPayload,
      }),
    );

    await expect(
      verifySyntheticFirmwareManifestSignature({
        parsed: tampered,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: syntheticKeyId,
          rawPublicKey: fixture.publicKey,
        },
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_SIGNATURE_INVALID",
    });
  });

  it("rejects mismatched, malformed, and accessor-backed Synthetic keys", async () => {
    const fixture = await createSignedFixture();
    await expect(
      verifySyntheticFirmwareManifestSignature({
        parsed: fixture.parsed,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: "synthetic:another-key",
          rawPublicKey: fixture.publicKey,
        },
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_KEY_ID_MISMATCH",
    });

    await expect(
      verifySyntheticFirmwareManifestSignature({
        parsed: fixture.parsed,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: syntheticKeyId,
          rawPublicKey: new Uint8Array(31),
        },
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_MANIFEST_KEY_INVALID",
    });

    let getterCalls = 0;
    const hostileKey = Object.defineProperty(
      {
        assurance: "SYNTHETIC_ONLY" as const,
        keyId: syntheticKeyId,
      },
      "rawPublicKey",
      {
        get() {
          getterCalls += 1;
          return fixture.publicKey;
        },
      },
    ) as unknown as {
      assurance: "SYNTHETIC_ONLY";
      keyId: string;
      rawPublicKey: Uint8Array;
    };
    await expect(
      verifySyntheticFirmwareManifestSignature({
        parsed: fixture.parsed,
        key: hostileKey,
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_MANIFEST_KEY_INVALID",
    });
    expect(getterCalls).toBe(0);
  });

  it("accepts only results created by this parser", async () => {
    const forged = {
      ...requireParsed(manifestText()),
    } as ParsedSignedFirmwareManifest;

    await expect(
      verifySyntheticFirmwareManifestSignature({
        parsed: forged,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: syntheticKeyId,
          rawPublicKey: new Uint8Array(32),
        },
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_NOT_FROM_PARSER",
    });
  });

  it("does not execute accessor-backed verifier methods or metadata", async () => {
    const fixture = await createSignedFixture();
    let getterCalls = 0;
    const hostileVerifier = Object.defineProperties(
      {},
      {
        assurance: {
          get() {
            getterCalls += 1;
            return "CRYPTOGRAPHIC";
          },
        },
        verifyEd25519: {
          get() {
            getterCalls += 1;
            return async () => true;
          },
        },
      },
    ) as FirmwareManifestSignatureVerifier;

    await expect(
      verifySyntheticFirmwareManifestSignature({
        parsed: fixture.parsed,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: syntheticKeyId,
          rawPublicKey: fixture.publicKey,
        },
        verifier: hostileVerifier,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_SIGNATURE_VERIFIER_INVALID",
    });
    expect(getterCalls).toBe(0);
  });

  it("sanitizes verifier failures while preserving cancellation", async () => {
    const fixture = await createSignedFixture();
    const key = {
      assurance: "SYNTHETIC_ONLY" as const,
      keyId: syntheticKeyId,
      rawPublicKey: fixture.publicKey,
    };
    const failed: FirmwareManifestSignatureVerifier = {
      assurance: "CRYPTOGRAPHIC",
      async verifyEd25519() {
        throw new Error("private-key-or-provider-detail");
      },
    };
    const cancelled: FirmwareManifestSignatureVerifier = {
      assurance: "CRYPTOGRAPHIC",
      async verifyEd25519() {
        const error = new Error("cancelled");
        error.name = "AbortError";
        throw error;
      },
    };

    await expect(
      verifySyntheticFirmwareManifestSignature({
        parsed: fixture.parsed,
        key,
        verifier: failed,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_SIGNATURE_VERIFICATION_FAILED",
    });
    await expect(
      verifySyntheticFirmwareManifestSignature({
        parsed: fixture.parsed,
        key,
        verifier: cancelled,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
