import type {
  FirmwareManifestSignatureVerifier,
  FirmwareTrustClock,
  SignedFirmwareManifestEnvelope,
  SignedFirmwareRootMetadataEnvelopeV1,
  SyntheticFirmwareManifestPayloadV1,
  SyntheticFirmwareReleaseFloorV1,
  SyntheticFirmwareRootMetadataPayloadV1,
  SyntheticFirmwareRootPublicKeyV1,
} from "@elrs-easy/domain";
import { describe, expect, it, vi } from "vitest";

import {
  parseSignedFirmwareManifest,
  type ParsedSignedFirmwareManifest,
} from "./firmware-manifest.js";
import {
  evaluateSyntheticFirmwareRootFreshness,
  maximumSignedFirmwareRootMetadataBytes,
  parseSignedFirmwareRootMetadata,
  signedFirmwareRootMetadataDomain,
  verifySyntheticFirmwareManifestAgainstRoot,
  verifySyntheticFirmwareRootRotation,
  type ParsedSignedFirmwareRootMetadata,
  type SyntheticFirmwareManifestRootVerificationResult,
  type SyntheticFirmwareRootRotationResult,
} from "./firmware-root-metadata.js";
import {
  advanceSyntheticFirmwareReleaseState,
  advanceSyntheticFirmwareRootState,
  createEmptySyntheticFirmwareTrustState,
  parseSyntheticFirmwareTrustState,
  type ParsedSyntheticFirmwareTrustState,
} from "./firmware-trust-state.js";

const zeroSignatureBase64Url = "A".repeat(86);
const defaultNotBefore = "2026-08-21T00:00:00.000Z";
const defaultExpiresAt = "2026-09-21T00:00:00.000Z";

interface TestKey {
  readonly keyId: string;
  readonly keyPair: CryptoKeyPair;
  readonly publicKey: Uint8Array;
  readonly rootKey: SyntheticFirmwareRootPublicKeyV1;
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

async function createTestKey(keyId: string): Promise<TestKey> {
  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  return Object.freeze({
    keyId,
    keyPair,
    publicKey,
    rootKey: Object.freeze({
      keyId,
      keyType: "ed25519",
      algorithm: "Ed25519",
      publicKeyBase64Url: encodeBase64Url(publicKey),
    }),
  });
}

function uniqueKeys(keys: readonly TestKey[]): readonly TestKey[] {
  return [...new Map(keys.map((key) => [key.keyId, key])).values()];
}

function rootPayload(input: {
  readonly version: number;
  readonly rootKeys: readonly TestKey[];
  readonly manifestKeys: readonly TestKey[];
  readonly rootThreshold?: number;
  readonly manifestThreshold?: number;
  readonly notBefore?: string;
  readonly expiresAt?: string;
}): SyntheticFirmwareRootMetadataPayloadV1 {
  return {
    rootSchema: "1",
    metadataType: "synthetic-root",
    version: input.version,
    notBefore: input.notBefore ?? defaultNotBefore,
    expiresAt: input.expiresAt ?? defaultExpiresAt,
    keys: uniqueKeys([...input.rootKeys, ...input.manifestKeys]).map(
      (key) => key.rootKey,
    ),
    roles: [
      {
        name: "root",
        channel: "synthetic",
        keyIds: input.rootKeys.map((key) => key.keyId),
        threshold: input.rootThreshold ?? 1,
      },
      {
        name: "synthetic",
        channel: "synthetic",
        keyIds: input.manifestKeys.map((key) => key.keyId),
        threshold: input.manifestThreshold ?? 1,
      },
    ],
  };
}

function rootEnvelope(
  payload: SyntheticFirmwareRootMetadataPayloadV1,
  signerIds: readonly string[],
): SignedFirmwareRootMetadataEnvelopeV1 {
  return {
    schemaVersion: "1",
    canonicalization: "RFC8785",
    payload,
    signatures: signerIds.map((keyId) => ({
      algorithm: "Ed25519",
      keyId,
      signatureBase64Url: zeroSignatureBase64Url,
    })),
  };
}

function requireRoot(source: string): ParsedSignedFirmwareRootMetadata {
  const result = parseSignedFirmwareRootMetadata(source);
  expect(result.status).toBe("PARSED_UNTRUSTED");
  if (result.status !== "PARSED_UNTRUSTED") {
    throw new Error(`root fixture did not parse: ${result.reason}`);
  }
  return result;
}

async function signRoot(
  payload: SyntheticFirmwareRootMetadataPayloadV1,
  signers: readonly TestKey[],
): Promise<ParsedSignedFirmwareRootMetadata> {
  const uniqueSigners = uniqueKeys(signers);
  const placeholder = requireRoot(
    JSON.stringify(
      rootEnvelope(
        payload,
        uniqueSigners.map((key) => key.keyId),
      ),
    ),
  );
  const signatureInput = Uint8Array.from(placeholder.copySignatureInput());
  const signatures = await Promise.all(
    uniqueSigners.map(async (key) => ({
      algorithm: "Ed25519" as const,
      keyId: key.keyId,
      signatureBase64Url: encodeBase64Url(
        new Uint8Array(
          await crypto.subtle.sign(
            { name: "Ed25519" },
            key.keyPair.privateKey,
            signatureInput,
          ),
        ),
      ),
    })),
  );
  return requireRoot(
    JSON.stringify({
      schemaVersion: "1",
      canonicalization: "RFC8785",
      payload,
      signatures,
    }),
  );
}

function manifestPayload(input: {
  readonly rootVersion: number;
  readonly releaseSequence?: number;
  readonly targetIdentifier?: string;
  readonly artifactSha256?: string;
}): SyntheticFirmwareManifestPayloadV1 {
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
    targetIdentifier: input.targetIdentifier ?? "fixture.tx.alpha-2g4",
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
    artifactSha256: input.artifactSha256 ?? "a".repeat(64),
    buildSourceEpoch: 1_787_209_200,
    testsAndValidationLevel: ["SYNTHETIC_ONLY"],
    correspondingSourceUrl: "https://example.invalid/source/commit",
    noticeBundle: {
      url: "https://example.invalid/notices/bundle.json",
      sha256: "8".repeat(64),
    },
    releaseSequence: input.releaseSequence ?? 1,
    publishedAt: "2026-08-21T08:00:00.000Z",
    minimumApplicationVersion: "0.0.0",
    minimumCoreVersion: "0.0.0",
    signingRole: "synthetic",
    requiredRootMetadataVersion: input.rootVersion,
  };
}

function manifestEnvelope(
  payload: SyntheticFirmwareManifestPayloadV1,
  keyId: string,
  signatureBase64Url = zeroSignatureBase64Url,
): SignedFirmwareManifestEnvelope<SyntheticFirmwareManifestPayloadV1> {
  return {
    schemaVersion: "1",
    canonicalization: "RFC8785",
    payload,
    signature: {
      algorithm: "Ed25519",
      keyId,
      signatureBase64Url,
    },
  };
}

function requireManifest(source: string): ParsedSignedFirmwareManifest {
  const result = parseSignedFirmwareManifest(source);
  expect(result.status).toBe("PARSED_UNTRUSTED");
  if (result.status !== "PARSED_UNTRUSTED") {
    throw new Error(`manifest fixture did not parse: ${result.reason}`);
  }
  return result;
}

async function signManifest(
  key: TestKey,
  input: Parameters<typeof manifestPayload>[0],
): Promise<ParsedSignedFirmwareManifest> {
  const payload = manifestPayload(input);
  const placeholder = requireManifest(
    JSON.stringify(manifestEnvelope(payload, key.keyId)),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "Ed25519" },
      key.keyPair.privateKey,
      Uint8Array.from(placeholder.copySignatureInput()),
    ),
  );
  return requireManifest(
    JSON.stringify(
      manifestEnvelope(payload, key.keyId, encodeBase64Url(signature)),
    ),
  );
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

function syntheticClock(now: string): FirmwareTrustClock {
  return {
    assurance: "SYNTHETIC_ONLY",
    async readUtcNow() {
      return now;
    },
  };
}

function stateText(
  highestRootMetadataVersion: number,
  releaseFloors: readonly SyntheticFirmwareReleaseFloorV1[] = [],
): string {
  return JSON.stringify({
    schemaVersion: "1",
    stateType: "synthetic-firmware-trust-state",
    highestRootMetadataVersion,
    releaseFloors,
  });
}

function requireState(source: string): ParsedSyntheticFirmwareTrustState {
  const result = parseSyntheticFirmwareTrustState(source);
  expect(result.status).toBe("PARSED_UNPERSISTED");
  if (result.status !== "PARSED_UNPERSISTED") {
    throw new Error(`state fixture did not parse: ${result.reason}`);
  }
  return result;
}

function requireRotation(
  result: SyntheticFirmwareRootRotationResult,
): Extract<
  SyntheticFirmwareRootRotationResult,
  { status: "ROTATION_VERIFIED_UNTRUSTED" }
> {
  expect(result.status).toBe("ROTATION_VERIFIED_UNTRUSTED");
  if (result.status !== "ROTATION_VERIFIED_UNTRUSTED") {
    throw new Error(`rotation fixture failed: ${result.reason}`);
  }
  return result;
}

function requireManifestVerification(
  result: SyntheticFirmwareManifestRootVerificationResult,
): Extract<
  SyntheticFirmwareManifestRootVerificationResult,
  { status: "VERIFIED_AGAINST_UNTRUSTED_ROOT" }
> {
  expect(result.status).toBe("VERIFIED_AGAINST_UNTRUSTED_ROOT");
  if (result.status !== "VERIFIED_AGAINST_UNTRUSTED_ROOT") {
    throw new Error(`manifest/root fixture failed: ${result.reason}`);
  }
  return result;
}

describe("bounded Synthetic Firmware root metadata", () => {
  it("rebuilds immutable metadata and stable domain-separated RFC 8785 bytes", async () => {
    const rootKey = await createTestKey("synthetic:root-a");
    const manifestKey = await createTestKey("synthetic:manifest-a");
    const payload = rootPayload({
      version: 1,
      rootKeys: [rootKey],
      manifestKeys: [manifestKey],
    });
    const ordinary = requireRoot(
      JSON.stringify(rootEnvelope(payload, [rootKey.keyId])),
    );
    const reversedPayload = Object.fromEntries(
      Object.entries(payload).reverse(),
    ) as unknown as SyntheticFirmwareRootMetadataPayloadV1;
    const reordered = requireRoot(
      JSON.stringify({
        signatures: rootEnvelope(payload, [rootKey.keyId]).signatures,
        payload: reversedPayload,
        canonicalization: "RFC8785",
        schemaVersion: "1",
      }),
    );

    expect(ordinary.trustStatus).toBe("UNVERIFIED_NO_TRUST_ROOT");
    expect(ordinary.metadata.payload).toMatchObject({
      metadataType: "synthetic-root",
      version: 1,
    });
    expect(Object.isFrozen(ordinary)).toBe(true);
    expect(Object.isFrozen(ordinary.metadata)).toBe(true);
    expect(Object.isFrozen(ordinary.metadata.payload.keys)).toBe(true);
    expect(Object.isFrozen(ordinary.metadata.payload.roles[0]?.keyIds)).toBe(
      true,
    );
    expect([...reordered.copySignatureInput()]).toEqual([
      ...ordinary.copySignatureInput(),
    ]);
    const decodedSignatureInput = new TextDecoder().decode(
      ordinary.copySignatureInput(),
    );
    expect(decodedSignatureInput).toMatch(
      new RegExp(`^${signedFirmwareRootMetadataDomain}`),
    );
    expect(decodedSignatureInput).not.toContain("signatureBase64Url");
    const mutatedCopy = ordinary.copySignatureInput();
    mutatedCopy.fill(0);
    expect(new TextDecoder().decode(ordinary.copySignatureInput())).toBe(
      decodedSignatureInput,
    );
  });

  it("rejects duplicate keys, unsafe numbers, unknown fields, and resource excess", async () => {
    const rootKey = await createTestKey("synthetic:root-parser");
    const manifestKey = await createTestKey("synthetic:manifest-parser");
    const payload = rootPayload({
      version: 1,
      rootKeys: [rootKey],
      manifestKeys: [manifestKey],
    });
    const text = JSON.stringify(rootEnvelope(payload, [rootKey.keyId]));
    const duplicate = text.replace(
      '{"schemaVersion":"1"',
      '{"schemaVersion":"1","schema\\u0056ersion":"1"',
    );
    const unsafe = text.replace('"version":1', '"version":1e0');
    const unknown = JSON.stringify({
      ...rootEnvelope(payload, [rootKey.keyId]),
      payload: { ...payload, authorizesStable: true },
    });
    const oversized = `{"value":"${"x".repeat(maximumSignedFirmwareRootMetadataBytes)}"}`;

    expect(parseSignedFirmwareRootMetadata(duplicate)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_DUPLICATE_KEY",
    });
    expect(parseSignedFirmwareRootMetadata(unsafe)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_UNSAFE_NUMBER",
    });
    expect(parseSignedFirmwareRootMetadata(unknown)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_SCHEMA_INVALID",
    });
    expect(parseSignedFirmwareRootMetadata(oversized)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_LIMIT_EXCEEDED",
    });
  });

  it("rejects invalid validity, role scope, referential integrity, and signatures", async () => {
    const rootKey = await createTestKey("synthetic:root-schema");
    const manifestKey = await createTestKey("synthetic:manifest-schema");
    const unusedKey = await createTestKey("synthetic:unused-schema");
    const payload = rootPayload({
      version: 1,
      rootKeys: [rootKey],
      manifestKeys: [manifestKey],
    });
    const invalidValidity = {
      ...payload,
      notBefore: payload.expiresAt,
    };
    const wrongChannel = {
      ...payload,
      roles: payload.roles.map((role) =>
        role.name === "synthetic" ? { ...role, channel: "stable" } : role,
      ),
    };
    const unused = {
      ...payload,
      keys: [...payload.keys, unusedKey.rootKey],
    };

    for (const hostilePayload of [invalidValidity, wrongChannel, unused]) {
      expect(
        parseSignedFirmwareRootMetadata(
          JSON.stringify({
            ...rootEnvelope(payload, [rootKey.keyId]),
            payload: hostilePayload,
          }),
        ).status,
      ).toBe("BLOCKED");
    }
    expect(
      parseSignedFirmwareRootMetadata(
        JSON.stringify({
          ...rootEnvelope(payload, [rootKey.keyId]),
          signatures: [
            {
              algorithm: "Ed25519",
              keyId: rootKey.keyId,
              signatureBase64Url: "A".repeat(85),
            },
          ],
        }),
      ),
    ).toEqual({ status: "BLOCKED", reason: "FIRMWARE_ROOT_SCHEMA_INVALID" });
  });
});

describe("Synthetic root rotation and time policy", () => {
  it("requires both old and incoming thresholds for exact N to N+1 rotation", async () => {
    const [oldA, oldB, oldC, newA, newB, newC, oldManifest, newManifest] =
      await Promise.all([
        createTestKey("synthetic:root-old-a"),
        createTestKey("synthetic:root-old-b"),
        createTestKey("synthetic:root-old-c"),
        createTestKey("synthetic:root-new-a"),
        createTestKey("synthetic:root-new-b"),
        createTestKey("synthetic:root-new-c"),
        createTestKey("synthetic:manifest-old"),
        createTestKey("synthetic:manifest-new"),
      ]);
    const current = await signRoot(
      rootPayload({
        version: 1,
        rootKeys: [oldA, oldB, oldC],
        manifestKeys: [oldManifest],
        rootThreshold: 2,
      }),
      [oldA, oldB],
    );
    const incomingPayload = rootPayload({
      version: 2,
      rootKeys: [newA, newB, newC],
      manifestKeys: [newManifest],
      rootThreshold: 2,
    });
    const incoming = await signRoot(incomingPayload, [oldA, oldB, newA, newB]);

    await expect(
      verifySyntheticFirmwareRootRotation({
        current,
        incoming,
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "ROTATION_VERIFIED_UNTRUSTED",
      currentVersion: 1,
      incomingVersion: 2,
      currentThreshold: 2,
      incomingThreshold: 2,
      currentVerifiedKeyIds: [oldA.keyId, oldB.keyId],
      incomingVerifiedKeyIds: [newA.keyId, newB.keyId],
      verifierAssurance: "CRYPTOGRAPHIC",
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
    });

    const missingOld = await signRoot(incomingPayload, [oldA, newA, newB]);
    const missingNew = await signRoot(incomingPayload, [oldA, oldB, newA]);
    await expect(
      verifySyntheticFirmwareRootRotation({
        current,
        incoming: missingOld,
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_CURRENT_THRESHOLD_NOT_MET",
    });
    await expect(
      verifySyntheticFirmwareRootRotation({
        current,
        incoming: missingNew,
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_INCOMING_THRESHOLD_NOT_MET",
    });
  });

  it("rejects version gaps, forged parser results, and key-id rebinding", async () => {
    const oldRoot = await createTestKey("synthetic:root-rebind");
    const replacementMaterial = await createTestKey("synthetic:replacement");
    const manifestKey = await createTestKey("synthetic:manifest-rebind");
    const current = await signRoot(
      rootPayload({
        version: 1,
        rootKeys: [oldRoot],
        manifestKeys: [manifestKey],
      }),
      [oldRoot],
    );
    const reboundRoot: TestKey = {
      ...replacementMaterial,
      keyId: oldRoot.keyId,
      rootKey: {
        ...replacementMaterial.rootKey,
        keyId: oldRoot.keyId,
      },
    };
    const rebound = await signRoot(
      rootPayload({
        version: 2,
        rootKeys: [reboundRoot],
        manifestKeys: [manifestKey],
      }),
      [oldRoot],
    );
    await expect(
      verifySyntheticFirmwareRootRotation({
        current,
        incoming: rebound,
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_KEY_ID_REBOUND",
    });

    const versionGap = await signRoot(
      rootPayload({
        version: 3,
        rootKeys: [oldRoot],
        manifestKeys: [manifestKey],
      }),
      [oldRoot],
    );
    await expect(
      verifySyntheticFirmwareRootRotation({
        current,
        incoming: versionGap,
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_VERSION_NOT_SEQUENTIAL",
    });
    await expect(
      verifySyntheticFirmwareRootRotation({
        current: { ...current },
        incoming: rebound,
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_NOT_FROM_PARSER",
    });
  });

  it("sanitizes verifier failures, preserves cancellation, and avoids accessors", async () => {
    const oldRoot = await createTestKey("synthetic:root-provider-old");
    const newRoot = await createTestKey("synthetic:root-provider-new");
    const manifestKey = await createTestKey("synthetic:manifest-provider");
    const current = await signRoot(
      rootPayload({
        version: 1,
        rootKeys: [oldRoot],
        manifestKeys: [manifestKey],
      }),
      [oldRoot],
    );
    const incoming = await signRoot(
      rootPayload({
        version: 2,
        rootKeys: [newRoot],
        manifestKeys: [manifestKey],
      }),
      [oldRoot, newRoot],
    );
    const failed: FirmwareManifestSignatureVerifier = {
      assurance: "CRYPTOGRAPHIC",
      async verifyEd25519() {
        throw new Error("provider-private-detail");
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
    let getterCalls = 0;
    const hostile = Object.defineProperties(
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
      verifySyntheticFirmwareRootRotation({
        current,
        incoming,
        verifier: failed,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_SIGNATURE_VERIFICATION_FAILED",
    });
    await expect(
      verifySyntheticFirmwareRootRotation({
        current,
        incoming,
        verifier: cancelled,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      verifySyntheticFirmwareRootRotation({
        current,
        incoming,
        verifier: hostile,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_SIGNATURE_VERIFIER_INVALID",
    });
    expect(getterCalls).toBe(0);
  });

  it("checks one fixed Synthetic clock value with inclusive expiry blocking", async () => {
    const rootKey = await createTestKey("synthetic:root-clock");
    const manifestKey = await createTestKey("synthetic:manifest-clock");
    const root = await signRoot(
      rootPayload({
        version: 1,
        rootKeys: [rootKey],
        manifestKeys: [manifestKey],
      }),
      [rootKey],
    );

    await expect(
      evaluateSyntheticFirmwareRootFreshness({
        root,
        clock: syntheticClock(defaultNotBefore),
      }),
    ).resolves.toMatchObject({
      status: "FRESH_UNTRUSTED",
      checkedAt: defaultNotBefore,
      clockAssurance: "SYNTHETIC_ONLY",
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
    });
    await expect(
      evaluateSyntheticFirmwareRootFreshness({
        root,
        clock: syntheticClock("2026-08-20T23:59:59.999Z"),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_NOT_YET_VALID",
    });
    await expect(
      evaluateSyntheticFirmwareRootFreshness({
        root,
        clock: syntheticClock(defaultExpiresAt),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_EXPIRED",
    });

    let getterCalls = 0;
    const hostileClock = Object.defineProperty({}, "assurance", {
      get() {
        getterCalls += 1;
        return "SYNTHETIC_ONLY";
      },
    }) as FirmwareTrustClock;
    await expect(
      evaluateSyntheticFirmwareRootFreshness({ root, clock: hostileClock }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_CLOCK_INVALID",
    });
    expect(getterCalls).toBe(0);

    await expect(
      evaluateSyntheticFirmwareRootFreshness({
        root,
        clock: {
          assurance: "SYNTHETIC_ONLY",
          async readUtcNow() {
            throw new Error("clock-private-detail");
          },
        },
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_CLOCK_READ_FAILED",
    });
    await expect(
      evaluateSyntheticFirmwareRootFreshness({
        root,
        clock: {
          assurance: "SYNTHETIC_ONLY",
          async readUtcNow() {
            const error = new Error("cancelled");
            error.name = "AbortError";
            throw error;
          },
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Manifest authorization through untrusted Synthetic root metadata", () => {
  it("verifies an authorized key while preserving the no-root trust status", async () => {
    const rootKey = await createTestKey("synthetic:root-manifest");
    const manifestKey = await createTestKey("synthetic:manifest-authorized");
    const root = await signRoot(
      rootPayload({
        version: 4,
        rootKeys: [rootKey],
        manifestKeys: [manifestKey],
      }),
      [rootKey],
    );
    const manifest = await signManifest(manifestKey, {
      rootVersion: 4,
      releaseSequence: 7,
    });

    await expect(
      verifySyntheticFirmwareManifestAgainstRoot({
        root,
        manifest,
        clock: syntheticClock("2026-08-21T12:00:00.000Z"),
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "VERIFIED_AGAINST_UNTRUSTED_ROOT",
      rootVersion: 4,
      role: "synthetic",
      roleThreshold: 1,
      keyId: manifestKey.keyId,
      checkedAt: "2026-08-21T12:00:00.000Z",
      clockAssurance: "SYNTHETIC_ONLY",
      verifierAssurance: "CRYPTOGRAPHIC",
      targetIdentifier: "fixture.tx.alpha-2g4",
      releaseSequence: 7,
      artifactSha256: "a".repeat(64),
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
    });
  });

  it("enforces root version, single-signature role threshold, and parser provenance", async () => {
    const rootKey = await createTestKey("synthetic:root-policy");
    const manifestA = await createTestKey("synthetic:manifest-policy-a");
    const manifestB = await createTestKey("synthetic:manifest-policy-b");
    const root = await signRoot(
      rootPayload({
        version: 2,
        rootKeys: [rootKey],
        manifestKeys: [manifestA],
      }),
      [rootKey],
    );
    const wrongVersion = await signManifest(manifestA, { rootVersion: 1 });
    await expect(
      verifySyntheticFirmwareManifestAgainstRoot({
        root,
        manifest: wrongVersion,
        clock: syntheticClock("2026-08-21T12:00:00.000Z"),
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_ROOT_VERSION_MISMATCH",
    });

    const thresholdRoot = await signRoot(
      rootPayload({
        version: 2,
        rootKeys: [rootKey],
        manifestKeys: [manifestA, manifestB],
        manifestThreshold: 2,
      }),
      [rootKey],
    );
    const manifest = await signManifest(manifestA, { rootVersion: 2 });
    await expect(
      verifySyntheticFirmwareManifestAgainstRoot({
        root: thresholdRoot,
        manifest,
        clock: syntheticClock("2026-08-21T12:00:00.000Z"),
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_ROOT_ROLE_THRESHOLD_UNSUPPORTED",
    });
    await expect(
      verifySyntheticFirmwareManifestAgainstRoot({
        root,
        manifest: { ...manifest },
        clock: syntheticClock("2026-08-21T12:00:00.000Z"),
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_NOT_FROM_PARSER",
    });
  });

  it("models revocation as key removal in a dual-threshold rotation", async () => {
    const oldRootKey = await createTestKey("synthetic:root-revoke-old");
    const newRootKey = await createTestKey("synthetic:root-revoke-new");
    const revokedManifestKey = await createTestKey(
      "synthetic:manifest-revoked",
    );
    const replacementManifestKey = await createTestKey(
      "synthetic:manifest-replacement",
    );
    const current = await signRoot(
      rootPayload({
        version: 1,
        rootKeys: [oldRootKey],
        manifestKeys: [revokedManifestKey],
      }),
      [oldRootKey],
    );
    const incoming = await signRoot(
      rootPayload({
        version: 2,
        rootKeys: [newRootKey],
        manifestKeys: [replacementManifestKey],
      }),
      [oldRootKey, newRootKey],
    );
    requireRotation(
      await verifySyntheticFirmwareRootRotation({
        current,
        incoming,
        verifier: webCryptoVerifier(),
      }),
    );

    const revokedClaim = await signManifest(revokedManifestKey, {
      rootVersion: 2,
    });
    await expect(
      verifySyntheticFirmwareManifestAgainstRoot({
        root: incoming,
        manifest: revokedClaim,
        clock: syntheticClock("2026-08-21T12:00:00.000Z"),
        verifier: webCryptoVerifier(),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_ROOT_KEY_NOT_AUTHORIZED",
    });
    const replacementClaim = await signManifest(replacementManifestKey, {
      rootVersion: 2,
    });
    expect(
      (
        await verifySyntheticFirmwareManifestAgainstRoot({
          root: incoming,
          manifest: replacementClaim,
          clock: syntheticClock("2026-08-21T12:00:00.000Z"),
          verifier: webCryptoVerifier(),
        })
      ).status,
    ).toBe("VERIFIED_AGAINST_UNTRUSTED_ROOT");
  });

  it("blocks expired metadata before invoking Manifest cryptography", async () => {
    const rootKey = await createTestKey("synthetic:root-expired");
    const manifestKey = await createTestKey("synthetic:manifest-expired");
    const root = await signRoot(
      rootPayload({
        version: 1,
        rootKeys: [rootKey],
        manifestKeys: [manifestKey],
      }),
      [rootKey],
    );
    const manifest = await signManifest(manifestKey, { rootVersion: 1 });
    const verifyEd25519 = vi.fn(async () => true);

    await expect(
      verifySyntheticFirmwareManifestAgainstRoot({
        root,
        manifest,
        clock: syntheticClock(defaultExpiresAt),
        verifier: { assurance: "CRYPTOGRAPHIC", verifyEd25519 },
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_EXPIRED",
    });
    expect(verifyEd25519).not.toHaveBeenCalled();
  });
});

describe("Synthetic rollback-state codec and monotonic transitions", () => {
  it("parses, sorts, freezes, and canonically serializes the proposed state", () => {
    const floors: SyntheticFirmwareReleaseFloorV1[] = [
      {
        channel: "synthetic",
        targetIdentifier: "fixture.tx.zeta",
        highestReleaseSequence: 4,
        artifactSha256: "b".repeat(64),
        acceptedRootMetadataVersion: 2,
      },
      {
        channel: "synthetic",
        targetIdentifier: "fixture.rx.alpha",
        highestReleaseSequence: 3,
        artifactSha256: "a".repeat(64),
        acceptedRootMetadataVersion: 1,
      },
    ];
    const state = requireState(stateText(2, floors));

    expect(state.assurance).toBe("SYNTHETIC_ONLY");
    expect(state.trustStatus).toBe("UNVERIFIED_NO_TRUST_ROOT");
    expect(
      state.state.releaseFloors.map((floor) => floor.targetIdentifier),
    ).toEqual(["fixture.rx.alpha", "fixture.tx.zeta"]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.state.releaseFloors)).toBe(true);
    expect(JSON.parse(state.copySerializedState())).toEqual({
      highestRootMetadataVersion: 2,
      releaseFloors: [floors[1], floors[0]],
      schemaVersion: "1",
      stateType: "synthetic-firmware-trust-state",
    });
    expect(requireState(state.copySerializedState()).state).toEqual(
      state.state,
    );
    expect(createEmptySyntheticFirmwareTrustState().state).toMatchObject({
      highestRootMetadataVersion: 0,
      releaseFloors: [],
    });
  });

  it("rejects corrupted, duplicate, impossible, and accessor-free forged state", () => {
    const floor: SyntheticFirmwareReleaseFloorV1 = {
      channel: "synthetic",
      targetIdentifier: "fixture.tx.alpha",
      highestReleaseSequence: 1,
      artifactSha256: "a".repeat(64),
      acceptedRootMetadataVersion: 1,
    };
    expect(parseSyntheticFirmwareTrustState(stateText(0, [floor]))).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_TRUST_STATE_SCHEMA_INVALID",
    });
    expect(
      parseSyntheticFirmwareTrustState(stateText(1, [floor, { ...floor }])),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_TRUST_STATE_SCHEMA_INVALID",
    });
    const duplicate = stateText(1).replace(
      '"schemaVersion":"1"',
      '"schemaVersion":"1","schema\\u0056ersion":"1"',
    );
    expect(parseSyntheticFirmwareTrustState(duplicate)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_TRUST_STATE_DUPLICATE_KEY",
    });
    const unsafe = stateText(1).replace(
      '"highestRootMetadataVersion":1',
      '"highestRootMetadataVersion":1.0',
    );
    expect(parseSyntheticFirmwareTrustState(unsafe)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_TRUST_STATE_UNSAFE_NUMBER",
    });
  });

  it("advances root state only from an unforgeable verified sequential rotation", async () => {
    const oldRoot = await createTestKey("synthetic:state-root-old");
    const newRoot = await createTestKey("synthetic:state-root-new");
    const manifestKey = await createTestKey("synthetic:state-manifest");
    const current = await signRoot(
      rootPayload({
        version: 1,
        rootKeys: [oldRoot],
        manifestKeys: [manifestKey],
      }),
      [oldRoot],
    );
    const incoming = await signRoot(
      rootPayload({
        version: 2,
        rootKeys: [newRoot],
        manifestKeys: [manifestKey],
      }),
      [oldRoot, newRoot],
    );
    const rotation = requireRotation(
      await verifySyntheticFirmwareRootRotation({
        current,
        incoming,
        verifier: webCryptoVerifier(),
      }),
    );
    const initial = requireState(stateText(1));
    const advanced = advanceSyntheticFirmwareRootState({
      state: initial,
      rotation,
    });
    expect(advanced).toMatchObject({
      status: "ADVANCED_UNPERSISTED",
      change: "ROOT_VERSION",
      previousRootVersion: 1,
      highestRootMetadataVersion: 2,
      assurance: "SYNTHETIC_ONLY",
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
    });
    if (advanced.status !== "ADVANCED_UNPERSISTED") {
      throw new Error("root state did not advance");
    }
    expect(advanced.state.state.highestRootMetadataVersion).toBe(2);

    expect(
      advanceSyntheticFirmwareRootState({
        state: advanced.state,
        rotation,
      }),
    ).toEqual({ status: "BLOCKED", reason: "FIRMWARE_ROOT_ROLLBACK" });
    expect(
      advanceSyntheticFirmwareRootState({
        state: initial,
        rotation: { ...rotation },
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_ROTATION_NOT_VERIFIED",
    });
    expect(
      advanceSyntheticFirmwareRootState({
        state: createEmptySyntheticFirmwareTrustState(),
        rotation,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_STATE_MISMATCH",
    });
  });

  it("detects release rollback, equal-sequence conflict, replay, and advance", async () => {
    const rootKey = await createTestKey("synthetic:release-root");
    const manifestKey = await createTestKey("synthetic:release-manifest");
    const root = await signRoot(
      rootPayload({
        version: 1,
        rootKeys: [rootKey],
        manifestKeys: [manifestKey],
      }),
      [rootKey],
    );
    const clock = syntheticClock("2026-08-21T12:00:00.000Z");
    const verifier = webCryptoVerifier();
    const verify = async (
      releaseSequence: number,
      artifactSha256 = "a".repeat(64),
      targetIdentifier = "fixture.tx.alpha-2g4",
    ) =>
      requireManifestVerification(
        await verifySyntheticFirmwareManifestAgainstRoot({
          root,
          manifest: await signManifest(manifestKey, {
            rootVersion: 1,
            releaseSequence,
            artifactSha256,
            targetIdentifier,
          }),
          clock,
          verifier,
        }),
      );

    const initial = requireState(stateText(1));
    const sequenceFive = await verify(5);
    const firstAdvance = advanceSyntheticFirmwareReleaseState({
      state: initial,
      verification: sequenceFive,
    });
    expect(firstAdvance).toMatchObject({
      status: "ADVANCED_UNPERSISTED",
      change: "RELEASE_SEQUENCE",
      highestReleaseSequence: 5,
      assurance: "SYNTHETIC_ONLY",
    });
    if (firstAdvance.status !== "ADVANCED_UNPERSISTED") {
      throw new Error("release state did not advance");
    }

    expect(
      advanceSyntheticFirmwareReleaseState({
        state: firstAdvance.state,
        verification: sequenceFive,
      }),
    ).toMatchObject({
      status: "UNCHANGED_UNPERSISTED",
      change: "NONE",
      highestReleaseSequence: 5,
    });
    expect(
      advanceSyntheticFirmwareReleaseState({
        state: firstAdvance.state,
        verification: await verify(4),
      }),
    ).toEqual({ status: "BLOCKED", reason: "FIRMWARE_RELEASE_ROLLBACK" });
    expect(
      advanceSyntheticFirmwareReleaseState({
        state: firstAdvance.state,
        verification: await verify(5, "b".repeat(64)),
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_RELEASE_SEQUENCE_CONFLICT",
    });
    expect(
      advanceSyntheticFirmwareReleaseState({
        state: firstAdvance.state,
        verification: await verify(6),
      }),
    ).toMatchObject({
      status: "ADVANCED_UNPERSISTED",
      highestReleaseSequence: 6,
    });
    expect(
      advanceSyntheticFirmwareReleaseState({
        state: firstAdvance.state,
        verification: await verify(1, "c".repeat(64), "fixture.rx.beta-2g4"),
      }),
    ).toMatchObject({
      status: "ADVANCED_UNPERSISTED",
      targetIdentifier: "fixture.rx.beta-2g4",
      highestReleaseSequence: 1,
    });

    const fullFloors: SyntheticFirmwareReleaseFloorV1[] = Array.from(
      { length: 128 },
      (_, index) => ({
        channel: "synthetic",
        targetIdentifier: `t${String(index).padStart(3, "0")}`,
        highestReleaseSequence: 1,
        artifactSha256: "d".repeat(64),
        acceptedRootMetadataVersion: 1,
      }),
    );
    expect(
      advanceSyntheticFirmwareReleaseState({
        state: requireState(stateText(1, fullFloors)),
        verification: await verify(1, "e".repeat(64), "fixture.capacity.extra"),
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_TRUST_STATE_CAPACITY_EXCEEDED",
    });
  });

  it("requires root state to match verified Manifest metadata and rejects forgery", async () => {
    const rootKey = await createTestKey("synthetic:state-match-root");
    const manifestKey = await createTestKey("synthetic:state-match-manifest");
    const root = await signRoot(
      rootPayload({
        version: 2,
        rootKeys: [rootKey],
        manifestKeys: [manifestKey],
      }),
      [rootKey],
    );
    const verification = requireManifestVerification(
      await verifySyntheticFirmwareManifestAgainstRoot({
        root,
        manifest: await signManifest(manifestKey, { rootVersion: 2 }),
        clock: syntheticClock("2026-08-21T12:00:00.000Z"),
        verifier: webCryptoVerifier(),
      }),
    );
    expect(
      advanceSyntheticFirmwareReleaseState({
        state: requireState(stateText(1)),
        verification,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_STATE_NOT_ADVANCED",
    });
    expect(
      advanceSyntheticFirmwareReleaseState({
        state: requireState(stateText(3)),
        verification,
      }),
    ).toEqual({ status: "BLOCKED", reason: "FIRMWARE_ROOT_ROLLBACK" });
    expect(
      advanceSyntheticFirmwareReleaseState({
        state: requireState(stateText(2)),
        verification: { ...verification },
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
    });
    expect(
      advanceSyntheticFirmwareReleaseState({
        state: { ...requireState(stateText(2)) },
        verification,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_TRUST_STATE_NOT_FROM_PARSER",
    });
  });
});
