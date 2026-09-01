import {
  maximumCompressedFirmwareArtifactSizeBytes,
  type CancellationSignal,
  type FirmwareArtifactDecompressionChunkSink,
  type FirmwareArtifactDecompressionProvider,
  type FirmwareArtifactDigestProvider,
  type FirmwareManifestSignatureVerifier,
  type FirmwareTrustClock,
  type SignedFirmwareRootMetadataEnvelopeV1,
  type SignedSyntheticDualFormFirmwareManifestEnvelopeV2,
  type SyntheticCompressedFirmwareArtifactDescriptorV1,
  type SyntheticDualFormFirmwareManifestPayloadV2,
  type SyntheticFirmwareRootMetadataPayloadV1,
  type SyntheticFirmwareRootPublicKeyV1,
} from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import { createSyntheticFirmwareCatalogCandidateEvidence } from "./firmware-catalog-candidate.js";
import {
  validateSyntheticCompressedFirmwareArtifact,
  type SyntheticCompressedFirmwareArtifactValidation,
} from "./firmware-compressed-artifact.js";
import {
  maximumSignedSyntheticDualFormFirmwareManifestBytes,
  parseSignedSyntheticDualFormFirmwareManifest,
  signedSyntheticDualFormFirmwareManifestDomain,
  verifySyntheticDualFormFirmwareManifestSignature,
  type ParsedSignedSyntheticDualFormFirmwareManifest,
} from "./firmware-dual-form-manifest.js";
import { parseSignedFirmwareManifest } from "./firmware-manifest.js";
import {
  parseSignedFirmwareRootMetadata,
  verifySyntheticDualFormFirmwareManifestAgainstRoot,
  type ParsedSignedFirmwareRootMetadata,
  type SyntheticDualFormFirmwareManifestRootVerificationResult,
} from "./firmware-root-metadata.js";
import {
  advanceSyntheticFirmwareReleaseState,
  parseSyntheticFirmwareTrustState,
  type ParsedSyntheticFirmwareTrustState,
  type SyntheticFirmwareReleaseStateTransitionResult,
} from "./firmware-trust-state.js";

const zeroSignatureBase64Url = "A".repeat(86);
const textEncoder = new TextEncoder();
const executableMagic = textEncoder.encode("ELRSEASYFWIMAGE!");
const checkedAt = "2026-08-21T12:00:00.000Z";

interface TestKey {
  readonly keyId: string;
  readonly keyPair: CryptoKeyPair;
  readonly publicKey: Uint8Array;
  readonly rootKey: SyntheticFirmwareRootPublicKeyV1;
}

interface ArtifactFixture {
  readonly compressedBytes: Uint8Array;
  readonly decompressedBytes: Uint8Array;
  readonly descriptor: SyntheticCompressedFirmwareArtifactDescriptorV1;
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

function manifestPayload(
  overrides: Partial<SyntheticDualFormFirmwareManifestPayloadV2> = {},
): SyntheticDualFormFirmwareManifestPayloadV2 {
  return {
    manifestSchema: "2",
    manifestType: "synthetic-dual-form-firmware-manifest",
    channel: "synthetic",
    targetIdentifier: "synthetic.tx.2g4",
    artifactName: "synthetic-firmware.bin.gz",
    artifactMediaType: "application/gzip",
    compression: "gzip",
    decompressedByteForm: "SYNTHETIC_EXECUTABLE_FIXTURE",
    executableFormat: "ELRS_EASY_SYNTHETIC_EXECUTABLE_V1",
    compressedSizeBytes: 128,
    compressedSha256: "a".repeat(64),
    decompressedSizeBytes: 256,
    decompressedSha256: "b".repeat(64),
    releaseSequence: 3,
    signingRole: "synthetic",
    requiredRootMetadataVersion: 1,
    ...overrides,
  };
}

function manifestEnvelope(
  payload: SyntheticDualFormFirmwareManifestPayloadV2,
  input: {
    readonly keyId?: string;
    readonly signatureBase64Url?: string;
  } = {},
): SignedSyntheticDualFormFirmwareManifestEnvelopeV2 {
  return {
    schemaVersion: "2",
    canonicalization: "RFC8785",
    payload,
    signature: {
      algorithm: "Ed25519",
      keyId: input.keyId ?? "synthetic:dual-form-test-key",
      signatureBase64Url: input.signatureBase64Url ?? zeroSignatureBase64Url,
    },
  };
}

function requireManifest(
  source: string,
): ParsedSignedSyntheticDualFormFirmwareManifest {
  const parsed = parseSignedSyntheticDualFormFirmwareManifest(source);
  expect(parsed.status).toBe("PARSED_UNTRUSTED");
  if (parsed.status !== "PARSED_UNTRUSTED") {
    throw new Error(`dual-form fixture did not parse: ${parsed.reason}`);
  }
  return parsed;
}

async function signManifest(
  payload: SyntheticDualFormFirmwareManifestPayloadV2,
  key: TestKey,
): Promise<ParsedSignedSyntheticDualFormFirmwareManifest> {
  const placeholder = requireManifest(
    JSON.stringify(manifestEnvelope(payload, { keyId: key.keyId })),
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
      manifestEnvelope(payload, {
        keyId: key.keyId,
        signatureBase64Url: encodeBase64Url(signature),
      }),
    ),
  );
}

function uniqueKeys(keys: readonly TestKey[]): readonly TestKey[] {
  return [...new Map(keys.map((key) => [key.keyId, key])).values()];
}

function rootPayload(input: {
  readonly rootKeys: readonly TestKey[];
  readonly manifestKeys: readonly TestKey[];
  readonly version?: number;
  readonly manifestThreshold?: number;
  readonly notBefore?: string;
  readonly expiresAt?: string;
}): SyntheticFirmwareRootMetadataPayloadV1 {
  return {
    rootSchema: "1",
    metadataType: "synthetic-root",
    version: input.version ?? 1,
    notBefore: input.notBefore ?? "2026-08-20T00:00:00.000Z",
    expiresAt: input.expiresAt ?? "2026-09-20T00:00:00.000Z",
    keys: uniqueKeys([...input.rootKeys, ...input.manifestKeys]).map(
      (key) => key.rootKey,
    ),
    roles: [
      {
        name: "root",
        channel: "synthetic",
        keyIds: input.rootKeys.map((key) => key.keyId),
        threshold: 1,
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

function requireRoot(
  payload: SyntheticFirmwareRootMetadataPayloadV1,
  signatureKeyId: string,
): ParsedSignedFirmwareRootMetadata {
  const envelope: SignedFirmwareRootMetadataEnvelopeV1 = {
    schemaVersion: "1",
    canonicalization: "RFC8785",
    payload,
    signatures: [
      {
        algorithm: "Ed25519",
        keyId: signatureKeyId,
        signatureBase64Url: zeroSignatureBase64Url,
      },
    ],
  };
  const parsed = parseSignedFirmwareRootMetadata(JSON.stringify(envelope));
  expect(parsed.status).toBe("PARSED_UNTRUSTED");
  if (parsed.status !== "PARSED_UNTRUSTED") {
    throw new Error(`root fixture did not parse: ${parsed.reason}`);
  }
  return parsed;
}

const verifier: FirmwareManifestSignatureVerifier = Object.freeze({
  assurance: "CRYPTOGRAPHIC",
  async verifyEd25519(
    signatureInput: Uint8Array,
    signature: Uint8Array,
    rawPublicKey: Uint8Array,
  ): Promise<boolean> {
    const key = await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(rawPublicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      Uint8Array.from(signature),
      Uint8Array.from(signatureInput),
    );
  },
});

function clock(now = checkedAt): FirmwareTrustClock {
  return Object.freeze({
    assurance: "SYNTHETIC_ONLY",
    async readUtcNow(): Promise<string> {
      return now;
    },
  });
}

async function verifyAgainstRoot(input: {
  readonly manifest: ParsedSignedSyntheticDualFormFirmwareManifest;
  readonly root: ParsedSignedFirmwareRootMetadata;
  readonly now?: string;
}): Promise<SyntheticDualFormFirmwareManifestRootVerificationResult> {
  return verifySyntheticDualFormFirmwareManifestAgainstRoot({
    root: input.root,
    manifest: input.manifest,
    clock: clock(input.now),
    verifier,
  });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)),
  );
  return Array.from(digest, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function gzip(bytes: Uint8Array): Uint8Array {
  const blockCount = Math.ceil(bytes.byteLength / 0xffff);
  const output = new Uint8Array(10 + blockCount * 5 + bytes.byteLength + 8);
  output.set([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0xff]);
  const view = new DataView(output.buffer);
  let inputOffset = 0;
  let outputOffset = 10;
  while (inputOffset < bytes.byteLength) {
    const blockLength = Math.min(0xffff, bytes.byteLength - inputOffset);
    const finalBlock = inputOffset + blockLength === bytes.byteLength;
    output[outputOffset] = finalBlock ? 1 : 0;
    view.setUint16(outputOffset + 1, blockLength, true);
    view.setUint16(outputOffset + 3, ~blockLength & 0xffff, true);
    output.set(
      bytes.subarray(inputOffset, inputOffset + blockLength),
      outputOffset + 5,
    );
    inputOffset += blockLength;
    outputOffset += 5 + blockLength;
  }
  view.setUint32(outputOffset, crc32(bytes), true);
  view.setUint32(outputOffset + 4, bytes.byteLength >>> 0, true);
  return output;
}

function syntheticExecutable(
  targetIdentifier = "synthetic.tx.2g4",
): Uint8Array {
  const target = textEncoder.encode(targetIdentifier);
  const payload = new Uint8Array([0x10, 0x20, 0x30, 0x40]);
  const bytes = new Uint8Array(22 + target.byteLength + payload.byteLength);
  bytes.set(executableMagic, 0);
  bytes[16] = 1;
  bytes[17] = target.byteLength;
  new DataView(bytes.buffer).setUint32(18, payload.byteLength, false);
  bytes.set(target, 22);
  bytes.set(payload, 22 + target.byteLength);
  return bytes;
}

async function artifactFixture(): Promise<ArtifactFixture> {
  const decompressedBytes = syntheticExecutable();
  const compressedBytes = gzip(decompressedBytes);
  return {
    compressedBytes,
    decompressedBytes,
    descriptor: {
      schemaVersion: "1",
      artifactType: "synthetic-compressed-firmware-artifact",
      compression: "gzip",
      decompressedByteForm: "SYNTHETIC_EXECUTABLE_FIXTURE",
      executableFormat: "ELRS_EASY_SYNTHETIC_EXECUTABLE_V1",
      targetIdentifier: "synthetic.tx.2g4",
      compressedSizeBytes: compressedBytes.byteLength,
      compressedSha256: await sha256(compressedBytes),
      decompressedSizeBytes: decompressedBytes.byteLength,
      decompressedSha256: await sha256(decompressedBytes),
    },
  };
}

const digestProvider: FirmwareArtifactDigestProvider = Object.freeze({
  assurance: "CRYPTOGRAPHIC",
  digestSha256: sha256,
});

async function validateFixture(
  fixture: ArtifactFixture,
): Promise<SyntheticCompressedFirmwareArtifactValidation> {
  const bytes = fixture.decompressedBytes.slice();
  const decompressionProvider: FirmwareArtifactDecompressionProvider =
    Object.freeze({
      assurance: "SYNTHETIC_ONLY",
      async decompressGzip(
        _compressedBytes: Uint8Array,
        emitChunk: FirmwareArtifactDecompressionChunkSink,
      ): Promise<void> {
        const split = Math.max(1, Math.floor(bytes.byteLength / 2));
        emitChunk(bytes.slice(0, split));
        emitChunk(bytes.slice(split));
      },
    });
  return validateSyntheticCompressedFirmwareArtifact({
    descriptor: fixture.descriptor,
    compressedBytes: fixture.compressedBytes,
    digestProvider,
    decompressionProvider,
  });
}

function requireTrustState(
  highestRootMetadataVersion = 1,
): ParsedSyntheticFirmwareTrustState {
  const parsed = parseSyntheticFirmwareTrustState(
    JSON.stringify({
      schemaVersion: "1",
      stateType: "synthetic-firmware-trust-state",
      highestRootMetadataVersion,
      releaseFloors: [],
    }),
  );
  expect(parsed.status).toBe("PARSED_UNPERSISTED");
  if (parsed.status !== "PARSED_UNPERSISTED") {
    throw new Error(`trust-state fixture did not parse: ${parsed.reason}`);
  }
  return parsed;
}

function requireReleaseTransition(
  state: ParsedSyntheticFirmwareTrustState,
  verification: SyntheticDualFormFirmwareManifestRootVerificationResult,
): SyntheticFirmwareReleaseStateTransitionResult {
  const transition = advanceSyntheticFirmwareReleaseState({
    state,
    verification,
  });
  expect(transition.status).toBe("ADVANCED_UNPERSISTED");
  return transition;
}

describe("Synthetic dual-form Firmware Manifest v2", () => {
  it("parses an exact immutable v2 envelope under a distinct domain", () => {
    const source = JSON.stringify(manifestEnvelope(manifestPayload()));
    const parsed = requireManifest(source);
    const firstCopy = parsed.copySignatureInput();

    expect(new TextDecoder().decode(firstCopy)).toMatch(
      new RegExp(`^${signedSyntheticDualFormFirmwareManifestDomain}`),
    );
    expect(new TextDecoder().decode(firstCopy)).not.toContain(
      "ELRS-EASY-FIRMWARE-MANIFEST-V1",
    );
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.manifest)).toBe(true);
    expect(Object.isFrozen(parsed.manifest.payload)).toBe(true);
    expect(Object.isFrozen(parsed.manifest.signature)).toBe(true);

    firstCopy.fill(0);
    expect(parsed.copySignatureInput()).not.toEqual(firstCopy);
    expect(parseSignedFirmwareManifest(source)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_MANIFEST_SCHEMA_INVALID",
    });
  });

  it("rejects duplicate, injected, unsafe, oversized, and malformed fields", () => {
    const payload = manifestPayload();
    const source = JSON.stringify(manifestEnvelope(payload));
    const duplicate = source.replace(
      '"releaseSequence":3',
      '"releaseSequence":3,"releaseSequence":3',
    );
    const unsafe = source.replace(
      '"releaseSequence":3',
      '"releaseSequence":9007199254740992',
    );
    const invalidUnicode = source.replace('"synthetic.tx.2g4"', '"\\ud800"');
    const injected = JSON.stringify({
      ...manifestEnvelope(payload),
      writerAuthorized: true,
    });

    expect(parseSignedSyntheticDualFormFirmwareManifest(duplicate)).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_DUPLICATE_KEY",
    });
    expect(parseSignedSyntheticDualFormFirmwareManifest(unsafe)).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_UNSAFE_NUMBER",
    });
    expect(
      parseSignedSyntheticDualFormFirmwareManifest(invalidUnicode),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_INVALID_UNICODE",
    });
    expect(parseSignedSyntheticDualFormFirmwareManifest(injected)).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_SCHEMA_INVALID",
    });
    expect(
      parseSignedSyntheticDualFormFirmwareManifest(
        `${" ".repeat(maximumSignedSyntheticDualFormFirmwareManifestBytes)}${source}`,
      ),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_LIMIT_EXCEEDED",
    });
  });

  it("fails closed for invalid byte-form identity claims", () => {
    const invalidPayloads: readonly Partial<SyntheticDualFormFirmwareManifestPayloadV2>[] =
      [
        { artifactName: "synthetic-firmware.bin" },
        { compressedSha256: "A".repeat(64) },
        { decompressedSha256: "f".repeat(63) },
        { compressedSizeBytes: 17 },
        {
          compressedSizeBytes: maximumCompressedFirmwareArtifactSizeBytes + 1,
        },
        { decompressedSizeBytes: 23 },
        { targetIdentifier: "Synthetic.TX" },
        { executableFormat: "ELRS_EASY_SYNTHETIC_EXECUTABLE_V2" as never },
        { requiredRootMetadataVersion: 0 },
      ];

    for (const overrides of invalidPayloads) {
      expect(
        parseSignedSyntheticDualFormFirmwareManifest(
          JSON.stringify(manifestEnvelope(manifestPayload(overrides))),
        ),
      ).toEqual({
        status: "BLOCKED",
        reason: "SYNTHETIC_DUAL_FORM_MANIFEST_SCHEMA_INVALID",
      });
    }

    expect(
      parseSignedSyntheticDualFormFirmwareManifest(
        JSON.stringify(
          manifestEnvelope(manifestPayload(), {
            signatureBase64Url: `${zeroSignatureBase64Url}=`,
          }),
        ),
      ),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_SCHEMA_INVALID",
    });
  });

  it("verifies Ed25519 and detects a changed compressed or decompressed form", async () => {
    const key = await createTestKey("synthetic:dual-form-signature");
    const signed = await signManifest(manifestPayload(), key);
    const verified = await verifySyntheticDualFormFirmwareManifestSignature({
      parsed: signed,
      key: {
        assurance: "SYNTHETIC_ONLY",
        keyId: key.keyId,
        rawPublicKey: key.publicKey,
      },
      verifier,
    });
    expect(verified).toMatchObject({
      status: "VERIFIED_UNTRUSTED",
      verification: {
        status: "VALID_UNTRUSTED",
        assurance: "CRYPTOGRAPHIC",
        trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
      },
    });

    for (const changedPayload of [
      manifestPayload({ compressedSha256: "c".repeat(64) }),
      manifestPayload({ decompressedSha256: "d".repeat(64) }),
    ]) {
      const tampered = requireManifest(
        JSON.stringify(
          manifestEnvelope(changedPayload, {
            keyId: key.keyId,
            signatureBase64Url: signed.manifest.signature.signatureBase64Url,
          }),
        ),
      );
      await expect(
        verifySyntheticDualFormFirmwareManifestSignature({
          parsed: tampered,
          key: {
            assurance: "SYNTHETIC_ONLY",
            keyId: key.keyId,
            rawPublicKey: key.publicKey,
          },
          verifier,
        }),
      ).resolves.toEqual({
        status: "BLOCKED",
        reason: "SYNTHETIC_DUAL_FORM_MANIFEST_SIGNATURE_INVALID",
      });
    }
  });

  it("rejects forged parser evidence, malformed keys, accessor methods, and cancellation", async () => {
    const key = await createTestKey("synthetic:dual-form-guards");
    const signed = await signManifest(manifestPayload(), key);
    const forged = {
      ...signed,
    } as ParsedSignedSyntheticDualFormFirmwareManifest;

    await expect(
      verifySyntheticDualFormFirmwareManifestSignature({
        parsed: forged,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: key.keyId,
          rawPublicKey: key.publicKey,
        },
        verifier,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_NOT_FROM_PARSER",
    });

    await expect(
      verifySyntheticDualFormFirmwareManifestSignature({
        parsed: signed,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: "synthetic:wrong-key",
          rawPublicKey: key.publicKey,
        },
        verifier,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_KEY_ID_MISMATCH",
    });

    const accessorVerifier = Object.create(
      null,
    ) as FirmwareManifestSignatureVerifier;
    Object.defineProperty(accessorVerifier, "assurance", {
      enumerable: true,
      value: "CRYPTOGRAPHIC",
    });
    Object.defineProperty(accessorVerifier, "verifyEd25519", {
      enumerable: true,
      get: () => verifier.verifyEd25519,
    });
    await expect(
      verifySyntheticDualFormFirmwareManifestSignature({
        parsed: signed,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: key.keyId,
          rawPublicKey: key.publicKey,
        },
        verifier: accessorVerifier,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_SIGNATURE_VERIFIER_INVALID",
    });

    const cancelled: CancellationSignal = Object.freeze({ aborted: true });
    await expect(
      verifySyntheticDualFormFirmwareManifestSignature({
        parsed: signed,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: key.keyId,
          rawPublicKey: key.publicKey,
        },
        verifier,
        signal: cancelled,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("resolves both forms through the exact fresh Synthetic root role", async () => {
    const key = await createTestKey("synthetic:dual-form-root");
    const payload = manifestPayload();
    const manifest = await signManifest(payload, key);
    const root = requireRoot(
      rootPayload({ rootKeys: [key], manifestKeys: [key] }),
      key.keyId,
    );
    const result = await verifyAgainstRoot({ manifest, root });

    expect(result).toEqual({
      status: "VERIFIED_DUAL_FORM_AGAINST_UNTRUSTED_ROOT",
      manifestSchema: "2",
      rootVersion: 1,
      role: "synthetic",
      roleThreshold: 1,
      keyId: key.keyId,
      checkedAt,
      clockAssurance: "SYNTHETIC_ONLY",
      verifierAssurance: "CRYPTOGRAPHIC",
      targetIdentifier: payload.targetIdentifier,
      artifactName: payload.artifactName,
      releaseSequence: payload.releaseSequence,
      compressedSizeBytes: payload.compressedSizeBytes,
      compressedSha256: payload.compressedSha256,
      decompressedSizeBytes: payload.decompressedSizeBytes,
      decompressedSha256: payload.decompressedSha256,
      rollbackArtifactSha256: payload.compressedSha256,
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
    });
  });

  it("blocks root-version, role, threshold, expiry, and provenance failures", async () => {
    const signer = await createTestKey("synthetic:dual-form-authorized");
    const other = await createTestKey("synthetic:dual-form-other");
    const manifest = await signManifest(manifestPayload(), signer);

    const wrongVersion = requireRoot(
      rootPayload({
        rootKeys: [signer],
        manifestKeys: [signer],
        version: 2,
      }),
      signer.keyId,
    );
    await expect(
      verifyAgainstRoot({ manifest, root: wrongVersion }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_ROOT_VERSION_MISMATCH",
    });

    const unauthorized = requireRoot(
      rootPayload({ rootKeys: [signer], manifestKeys: [other] }),
      signer.keyId,
    );
    await expect(
      verifyAgainstRoot({ manifest, root: unauthorized }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_ROOT_KEY_NOT_AUTHORIZED",
    });

    const threshold = requireRoot(
      rootPayload({
        rootKeys: [signer],
        manifestKeys: [signer, other],
        manifestThreshold: 2,
      }),
      signer.keyId,
    );
    await expect(
      verifyAgainstRoot({ manifest, root: threshold }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_ROOT_ROLE_THRESHOLD_UNSUPPORTED",
    });

    const expired = requireRoot(
      rootPayload({
        rootKeys: [signer],
        manifestKeys: [signer],
        expiresAt: "2026-08-21T11:00:00.000Z",
      }),
      signer.keyId,
    );
    await expect(
      verifyAgainstRoot({ manifest, root: expired }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ROOT_EXPIRED",
    });

    await expect(
      verifySyntheticDualFormFirmwareManifestAgainstRoot({
        root: wrongVersion,
        manifest: { ...manifest },
        clock: clock(),
        verifier,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_NOT_FROM_PARSER",
    });
  });

  it("uses the compressed object digest as the exact rollback identity", async () => {
    const key = await createTestKey("synthetic:dual-form-rollback");
    const root = requireRoot(
      rootPayload({ rootKeys: [key], manifestKeys: [key] }),
      key.keyId,
    );
    const first = await verifyAgainstRoot({
      manifest: await signManifest(manifestPayload(), key),
      root,
    });
    expect(first.status).toBe("VERIFIED_DUAL_FORM_AGAINST_UNTRUSTED_ROOT");
    const firstAdvance = requireReleaseTransition(requireTrustState(), first);
    expect(firstAdvance.status).toBe("ADVANCED_UNPERSISTED");
    if (firstAdvance.status !== "ADVANCED_UNPERSISTED") {
      throw new Error("release floor did not advance");
    }

    const changedCompressed = await verifyAgainstRoot({
      manifest: await signManifest(
        manifestPayload({ compressedSha256: "e".repeat(64) }),
        key,
      ),
      root,
    });
    expect(
      advanceSyntheticFirmwareReleaseState({
        state: firstAdvance.state,
        verification: changedCompressed,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_RELEASE_SEQUENCE_CONFLICT",
    });
  });

  it("creates evidence only after Manifest, bytes, and rollback brands agree", async () => {
    const fixture = await artifactFixture();
    const artifactValidation = await validateFixture(fixture);
    expect(artifactValidation.status).toBe("VERIFIED_SYNTHETIC_FIXTURE");

    const key = await createTestKey("synthetic:dual-form-candidate");
    const payload = manifestPayload({
      targetIdentifier: fixture.descriptor.targetIdentifier,
      compressedSizeBytes: fixture.descriptor.compressedSizeBytes,
      compressedSha256: fixture.descriptor.compressedSha256,
      decompressedSizeBytes: fixture.descriptor.decompressedSizeBytes,
      decompressedSha256: fixture.descriptor.decompressedSha256,
    });
    const manifest = await signManifest(payload, key);
    const root = requireRoot(
      rootPayload({ rootKeys: [key], manifestKeys: [key] }),
      key.keyId,
    );
    const rootVerification = await verifyAgainstRoot({ manifest, root });
    const rollbackEvidence = requireReleaseTransition(
      requireTrustState(),
      rootVerification,
    );

    const result = createSyntheticFirmwareCatalogCandidateEvidence({
      manifestRootVerification: rootVerification,
      artifactValidation,
      rollbackEvidence,
    });
    expect(result).toEqual({
      status: "SYNTHETIC_CATALOG_CANDIDATE_EVIDENCE",
      validationLevel: "SYNTHETIC_ONLY",
      manifestSchema: "2",
      manifestRootStatus: "VERIFIED_DUAL_FORM_AGAINST_UNTRUSTED_ROOT",
      artifactValidationStatus: "VERIFIED_SYNTHETIC_FIXTURE",
      rollbackStatus: "ADVANCED_UNPERSISTED",
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
      catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
      targetIdentifier: payload.targetIdentifier,
      artifactName: payload.artifactName,
      rootVersion: 1,
      releaseSequence: payload.releaseSequence,
      compressedSizeBytes: payload.compressedSizeBytes,
      compressedSha256: payload.compressedSha256,
      decompressedSizeBytes: payload.decompressedSizeBytes,
      decompressedSha256: payload.decompressedSha256,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("ELRSEASYFWIMAGE");
    expect(Reflect.ownKeys(result)).not.toContain("bytes");
    expect(Reflect.ownKeys(result)).not.toContain("copyBytes");
  });

  it("rejects forged or cross-wired candidate evidence", async () => {
    const fixture = await artifactFixture();
    const artifactValidation = await validateFixture(fixture);
    const key = await createTestKey("synthetic:dual-form-link-guards");
    const payload = manifestPayload({
      targetIdentifier: fixture.descriptor.targetIdentifier,
      compressedSizeBytes: fixture.descriptor.compressedSizeBytes,
      compressedSha256: fixture.descriptor.compressedSha256,
      decompressedSizeBytes: fixture.descriptor.decompressedSizeBytes,
      decompressedSha256: fixture.descriptor.decompressedSha256,
    });
    const manifest = await signManifest(payload, key);
    const root = requireRoot(
      rootPayload({ rootKeys: [key], manifestKeys: [key] }),
      key.keyId,
    );
    const firstVerification = await verifyAgainstRoot({ manifest, root });
    const secondVerification = await verifyAgainstRoot({ manifest, root });
    const transition = requireReleaseTransition(
      requireTrustState(),
      firstVerification,
    );

    expect(
      createSyntheticFirmwareCatalogCandidateEvidence({
        manifestRootVerification: {
          ...firstVerification,
        } as SyntheticDualFormFirmwareManifestRootVerificationResult,
        artifactValidation,
        rollbackEvidence: transition,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
    });

    expect(
      createSyntheticFirmwareCatalogCandidateEvidence({
        manifestRootVerification: firstVerification,
        artifactValidation: {
          ...artifactValidation,
        } as SyntheticCompressedFirmwareArtifactValidation,
        rollbackEvidence: transition,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_COMPRESSED_ARTIFACT_VALIDATION_NOT_PROVEN",
    });

    expect(
      createSyntheticFirmwareCatalogCandidateEvidence({
        manifestRootVerification: firstVerification,
        artifactValidation,
        rollbackEvidence: {
          ...transition,
        } as SyntheticFirmwareReleaseStateTransitionResult,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_RELEASE_ROLLBACK_EVIDENCE_NOT_PROVEN",
    });

    expect(
      createSyntheticFirmwareCatalogCandidateEvidence({
        manifestRootVerification: secondVerification,
        artifactValidation,
        rollbackEvidence: transition,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_RELEASE_ROLLBACK_EVIDENCE_MISMATCH",
    });

    let getterExecuted = false;
    const accessorInput = Object.create(null) as Record<string, unknown>;
    for (const field of [
      "manifestRootVerification",
      "artifactValidation",
      "rollbackEvidence",
    ]) {
      Object.defineProperty(accessorInput, field, {
        enumerable: true,
        get: () => {
          getterExecuted = true;
          return firstVerification;
        },
      });
    }
    expect(
      createSyntheticFirmwareCatalogCandidateEvidence(
        accessorInput as Parameters<
          typeof createSyntheticFirmwareCatalogCandidateEvidence
        >[0],
      ),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DUAL_FORM_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
    });
    expect(getterExecuted).toBe(false);
  });

  it("blocks every signed Target and dual-form mismatch after valid rollback evidence", async () => {
    const fixture = await artifactFixture();
    const artifactValidation = await validateFixture(fixture);
    const key = await createTestKey("synthetic:dual-form-mismatch");
    const matchingFields = {
      targetIdentifier: fixture.descriptor.targetIdentifier,
      compressedSizeBytes: fixture.descriptor.compressedSizeBytes,
      compressedSha256: fixture.descriptor.compressedSha256,
      decompressedSizeBytes: fixture.descriptor.decompressedSizeBytes,
      decompressedSha256: fixture.descriptor.decompressedSha256,
    } as const;
    const root = requireRoot(
      rootPayload({ rootKeys: [key], manifestKeys: [key] }),
      key.keyId,
    );

    const mismatches: readonly Partial<SyntheticDualFormFirmwareManifestPayloadV2>[] =
      [
        { targetIdentifier: "synthetic.rx.2g4" },
        {
          compressedSizeBytes: fixture.descriptor.compressedSizeBytes + 1,
        },
        { compressedSha256: "e".repeat(64) },
        {
          decompressedSizeBytes: fixture.descriptor.decompressedSizeBytes + 1,
        },
        { decompressedSha256: "f".repeat(64) },
      ];

    for (const mismatch of mismatches) {
      const verification = await verifyAgainstRoot({
        manifest: await signManifest(
          manifestPayload({ ...matchingFields, ...mismatch }),
          key,
        ),
        root,
      });
      const transition = requireReleaseTransition(
        requireTrustState(),
        verification,
      );
      expect(
        createSyntheticFirmwareCatalogCandidateEvidence({
          manifestRootVerification: verification,
          artifactValidation,
          rollbackEvidence: transition,
        }),
      ).toEqual({
        status: "BLOCKED",
        reason: "SYNTHETIC_DUAL_FORM_MANIFEST_ARTIFACT_MISMATCH",
      });
    }
  });
});
