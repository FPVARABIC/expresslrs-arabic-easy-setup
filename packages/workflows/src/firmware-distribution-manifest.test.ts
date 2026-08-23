import {
  type CancellationSignal,
  type FirmwareArtifactDecompressionProvider,
  type FirmwareArtifactDigestProvider,
  type FirmwareManifestSignatureVerifier,
  type FirmwareTrustClock,
  type SignedFirmwareRootMetadataEnvelopeV1,
  type SignedSyntheticDualFormFirmwareManifestEnvelopeV2,
  type SignedSyntheticFirmwareDistributionManifestEnvelopeV1,
  type SyntheticCompressedFirmwareArtifactDescriptorV1,
  type SyntheticDualFormFirmwareManifestPayloadV2,
  type SyntheticFirmwareDistributionManifestPayloadV1,
  type SyntheticFirmwareDistributionObjectRole,
  type SyntheticFirmwareAcquisitionChunkSink,
  type SyntheticFirmwareObjectAcquisitionRequest,
  type SyntheticFirmwareObjectAcquisitionProvider,
  type SyntheticFirmwareRootMetadataPayloadV1,
  type SyntheticFirmwareRootPublicKeyV1,
} from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import {
  acquireSyntheticFirmwareDistributionObject,
  type SyntheticFirmwareAcquisitionResult,
} from "./firmware-acquisition.js";
import { createSyntheticFirmwareCatalogCandidateEvidence } from "./firmware-catalog-candidate.js";
import {
  validateSyntheticCompressedFirmwareArtifact,
  type SyntheticCompressedFirmwareArtifactValidation,
} from "./firmware-compressed-artifact.js";
import { createSyntheticFirmwareDistributionCandidateEvidence } from "./firmware-distribution-candidate.js";
import {
  maximumSignedSyntheticFirmwareDistributionManifestBytes,
  parseSignedSyntheticFirmwareDistributionManifest,
  signedSyntheticFirmwareDistributionManifestDomain,
  verifySyntheticFirmwareDistributionManifestSignature,
  type ParsedSignedSyntheticFirmwareDistributionManifest,
} from "./firmware-distribution-manifest.js";
import {
  parseSignedSyntheticDualFormFirmwareManifest,
  type ParsedSignedSyntheticDualFormFirmwareManifest,
} from "./firmware-dual-form-manifest.js";
import {
  parseSignedFirmwareRootMetadata,
  verifySyntheticDualFormFirmwareManifestAgainstRoot,
  verifySyntheticFirmwareDistributionManifestAgainstRoot,
  type ParsedSignedFirmwareRootMetadata,
  type SyntheticFirmwareDistributionManifestRootVerificationResult,
} from "./firmware-root-metadata.js";
import {
  advanceSyntheticFirmwareReleaseState,
  parseSyntheticFirmwareTrustState,
} from "./firmware-trust-state.js";

const zeroSignatureBase64Url = "A".repeat(86);
const textEncoder = new TextEncoder();
const checkedAt = "2026-08-21T12:00:00.000Z";

interface TestKey {
  readonly keyId: string;
  readonly keyPair: CryptoKeyPair;
  readonly rootKey: SyntheticFirmwareRootPublicKeyV1;
}

interface DistributionFixture {
  readonly decompressedBytes: Uint8Array;
  readonly artifactBytes: Uint8Array;
  readonly sourceBytes: Uint8Array;
  readonly noticesBytes: Uint8Array;
  readonly artifactDescriptor: SyntheticCompressedFirmwareArtifactDescriptorV1;
  readonly distributionPayload: SyntheticFirmwareDistributionManifestPayloadV1;
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

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes.slice()),
  );
  return Array.from(digest, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

const digestProvider: FirmwareArtifactDigestProvider = Object.freeze({
  assurance: "CRYPTOGRAPHIC",
  digestSha256: sha256,
});

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
    rootKey: Object.freeze({
      keyId,
      keyType: "ed25519",
      algorithm: "Ed25519",
      publicKeyBase64Url: encodeBase64Url(publicKey),
    }),
  });
}

function distributionPayload(
  overrides: Partial<SyntheticFirmwareDistributionManifestPayloadV1> = {},
): SyntheticFirmwareDistributionManifestPayloadV1 {
  return {
    distributionSchema: "1",
    manifestType: "synthetic-firmware-distribution-manifest",
    channel: "synthetic",
    targetIdentifier: "synthetic.tx.2g4",
    releaseSequence: 7,
    artifact: {
      objectRole: "firmware-artifact",
      name: "synthetic-firmware.bin.gz",
      url: "https://fixtures.example.invalid/releases/synthetic-firmware.bin.gz",
      mediaType: "application/gzip",
      sizeBytes: 128,
      sha256: "a".repeat(64),
    },
    correspondingSource: {
      objectRole: "corresponding-source",
      name: "synthetic-source.tar.gz",
      url: "https://fixtures.example.invalid/releases/synthetic-source.tar.gz",
      mediaType: "application/gzip",
      sizeBytes: 256,
      sha256: "b".repeat(64),
    },
    notices: {
      objectRole: "notices",
      name: "synthetic.notices.json",
      url: "https://fixtures.example.invalid/releases/synthetic.notices.json",
      mediaType: "application/json",
      sizeBytes: 32,
      sha256: "c".repeat(64),
    },
    signingRole: "synthetic",
    requiredRootMetadataVersion: 1,
    ...overrides,
  };
}

function distributionEnvelope(
  payload: SyntheticFirmwareDistributionManifestPayloadV1,
  input: { readonly keyId?: string; readonly signature?: string } = {},
): SignedSyntheticFirmwareDistributionManifestEnvelopeV1 {
  return {
    schemaVersion: "1",
    canonicalization: "RFC8785",
    payload,
    signature: {
      algorithm: "Ed25519",
      keyId: input.keyId ?? "synthetic:distribution-test-key",
      signatureBase64Url: input.signature ?? zeroSignatureBase64Url,
    },
  };
}

function requireDistributionManifest(
  source: string,
): ParsedSignedSyntheticFirmwareDistributionManifest {
  const parsed = parseSignedSyntheticFirmwareDistributionManifest(source);
  expect(parsed.status).toBe("PARSED_UNTRUSTED");
  if (parsed.status !== "PARSED_UNTRUSTED") {
    throw new Error(`distribution fixture did not parse: ${parsed.reason}`);
  }
  return parsed;
}

async function signDistributionManifest(
  payload: SyntheticFirmwareDistributionManifestPayloadV1,
  key: TestKey,
): Promise<ParsedSignedSyntheticFirmwareDistributionManifest> {
  const placeholder = requireDistributionManifest(
    JSON.stringify(distributionEnvelope(payload, { keyId: key.keyId })),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "Ed25519" },
      key.keyPair.privateKey,
      Uint8Array.from(placeholder.copySignatureInput()),
    ),
  );
  return requireDistributionManifest(
    JSON.stringify(
      distributionEnvelope(payload, {
        keyId: key.keyId,
        signature: encodeBase64Url(signature),
      }),
    ),
  );
}

function rootPayload(
  keys: readonly TestKey[],
  input: { readonly version?: number; readonly threshold?: number } = {},
): SyntheticFirmwareRootMetadataPayloadV1 {
  return {
    rootSchema: "1",
    metadataType: "synthetic-root",
    version: input.version ?? 1,
    notBefore: "2026-08-20T00:00:00.000Z",
    expiresAt: "2026-09-20T00:00:00.000Z",
    keys: keys.map((key) => key.rootKey),
    roles: [
      {
        name: "root",
        channel: "synthetic",
        keyIds: [keys[0]?.keyId ?? "synthetic:missing"],
        threshold: 1,
      },
      {
        name: "synthetic",
        channel: "synthetic",
        keyIds: keys.map((key) => key.keyId),
        threshold: input.threshold ?? 1,
      },
    ],
  };
}

function requireRoot(
  payload: SyntheticFirmwareRootMetadataPayloadV1,
): ParsedSignedFirmwareRootMetadata {
  const envelope: SignedFirmwareRootMetadataEnvelopeV1 = {
    schemaVersion: "1",
    canonicalization: "RFC8785",
    payload,
    signatures: [
      {
        algorithm: "Ed25519",
        keyId: payload.roles[0]?.keyIds[0] ?? "synthetic:missing",
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

const signatureVerifier: FirmwareManifestSignatureVerifier = Object.freeze({
  assurance: "CRYPTOGRAPHIC",
  async verifyEd25519(
    signatureInput: Uint8Array,
    signature: Uint8Array,
    rawPublicKey: Uint8Array,
  ) {
    const publicKey = await crypto.subtle.importKey(
      "raw",
      rawPublicKey.slice(),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      { name: "Ed25519" },
      publicKey,
      signature.slice(),
      signatureInput.slice(),
    );
  },
});

function clock(now = checkedAt): FirmwareTrustClock {
  return Object.freeze({
    assurance: "SYNTHETIC_ONLY",
    async readUtcNow() {
      return now;
    },
  });
}

async function verifyDistributionAgainstRoot(input: {
  readonly manifest: ParsedSignedSyntheticFirmwareDistributionManifest;
  readonly root: ParsedSignedFirmwareRootMetadata;
  readonly now?: string;
}): Promise<SyntheticFirmwareDistributionManifestRootVerificationResult> {
  return verifySyntheticFirmwareDistributionManifestAgainstRoot({
    root: input.root,
    manifest: input.manifest,
    clock: clock(input.now),
    verifier: signatureVerifier,
  });
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

function syntheticExecutable(): Uint8Array {
  const target = textEncoder.encode("synthetic.tx.2g4");
  const payload = new Uint8Array([0x10, 0x20, 0x30, 0x40]);
  const bytes = new Uint8Array(22 + target.byteLength + payload.byteLength);
  bytes.set(textEncoder.encode("ELRSEASYFWIMAGE!"), 0);
  bytes[16] = 1;
  bytes[17] = target.byteLength;
  new DataView(bytes.buffer).setUint32(18, payload.byteLength, false);
  bytes.set(target, 22);
  bytes.set(payload, 22 + target.byteLength);
  return bytes;
}

async function createFixture(): Promise<DistributionFixture> {
  const decompressedBytes = syntheticExecutable();
  const artifactBytes = gzip(decompressedBytes);
  const sourceBytes = gzip(
    textEncoder.encode("synthetic corresponding source"),
  );
  const noticesBytes = textEncoder.encode('{"licenses":[]}');
  const artifactSha256 = await sha256(artifactBytes);
  const sourceSha256 = await sha256(sourceBytes);
  const noticesSha256 = await sha256(noticesBytes);
  return {
    decompressedBytes,
    artifactBytes,
    sourceBytes,
    noticesBytes,
    artifactDescriptor: {
      schemaVersion: "1",
      artifactType: "synthetic-compressed-firmware-artifact",
      compression: "gzip",
      decompressedByteForm: "SYNTHETIC_EXECUTABLE_FIXTURE",
      executableFormat: "ELRS_EASY_SYNTHETIC_EXECUTABLE_V1",
      targetIdentifier: "synthetic.tx.2g4",
      compressedSizeBytes: artifactBytes.byteLength,
      compressedSha256: artifactSha256,
      decompressedSizeBytes: decompressedBytes.byteLength,
      decompressedSha256: await sha256(decompressedBytes),
    },
    distributionPayload: distributionPayload({
      artifact: {
        objectRole: "firmware-artifact",
        name: "synthetic-firmware.bin.gz",
        url: "https://fixtures.example.invalid/releases/synthetic-firmware.bin.gz",
        mediaType: "application/gzip",
        sizeBytes: artifactBytes.byteLength,
        sha256: artifactSha256,
      },
      correspondingSource: {
        objectRole: "corresponding-source",
        name: "synthetic-source.tar.gz",
        url: "https://fixtures.example.invalid/releases/synthetic-source.tar.gz",
        mediaType: "application/gzip",
        sizeBytes: sourceBytes.byteLength,
        sha256: sourceSha256,
      },
      notices: {
        objectRole: "notices",
        name: "synthetic.notices.json",
        url: "https://fixtures.example.invalid/releases/synthetic.notices.json",
        mediaType: "application/json",
        sizeBytes: noticesBytes.byteLength,
        sha256: noticesSha256,
      },
    }),
  };
}

function bytesForRole(
  fixture: DistributionFixture,
  role: SyntheticFirmwareDistributionObjectRole,
): Uint8Array {
  switch (role) {
    case "firmware-artifact":
      return fixture.artifactBytes;
    case "corresponding-source":
      return fixture.sourceBytes;
    case "notices":
      return fixture.noticesBytes;
  }
}

function acquisitionProvider(
  fixture: DistributionFixture,
  mutate?: (
    receipt: Record<string, unknown>,
    request: Readonly<Record<string, unknown>>,
  ) => void,
): SyntheticFirmwareObjectAcquisitionProvider {
  return Object.freeze({
    assurance: "SYNTHETIC_ONLY",
    async acquireExactObject(
      request: SyntheticFirmwareObjectAcquisitionRequest,
      emitChunk: SyntheticFirmwareAcquisitionChunkSink,
    ) {
      const bytes = bytesForRole(fixture, request.objectRole).slice();
      const split = Math.max(1, Math.floor(bytes.byteLength / 2));
      const first = bytes.slice(0, split);
      emitChunk(first);
      first.fill(0);
      emitChunk(bytes.slice(split));
      const receipt: Record<string, unknown> = {
        sourceUrl: request.url,
        finalUrl: request.url,
        statusCode: 200,
        mediaType: request.mediaType,
        receivedSizeBytes: bytes.byteLength,
      };
      mutate?.(
        receipt,
        request as unknown as Readonly<Record<string, unknown>>,
      );
      return receipt as unknown as Awaited<
        ReturnType<
          SyntheticFirmwareObjectAcquisitionProvider["acquireExactObject"]
        >
      >;
    },
  });
}

async function acquireAll(input: {
  readonly fixture: DistributionFixture;
  readonly verification: SyntheticFirmwareDistributionManifestRootVerificationResult;
}): Promise<readonly SyntheticFirmwareAcquisitionResult[]> {
  const provider = acquisitionProvider(input.fixture);
  return Promise.all(
    (["firmware-artifact", "corresponding-source", "notices"] as const).map(
      (objectRole) =>
        acquireSyntheticFirmwareDistributionObject({
          distributionRootVerification: input.verification,
          objectRole,
          provider,
          digestProvider,
        }),
    ),
  );
}

function dualFormPayload(
  fixture: DistributionFixture,
): SyntheticDualFormFirmwareManifestPayloadV2 {
  return {
    manifestSchema: "2",
    manifestType: "synthetic-dual-form-firmware-manifest",
    channel: "synthetic",
    targetIdentifier: "synthetic.tx.2g4",
    artifactName: fixture.distributionPayload.artifact.name,
    artifactMediaType: "application/gzip",
    compression: "gzip",
    decompressedByteForm: "SYNTHETIC_EXECUTABLE_FIXTURE",
    executableFormat: "ELRS_EASY_SYNTHETIC_EXECUTABLE_V1",
    compressedSizeBytes: fixture.artifactDescriptor.compressedSizeBytes,
    compressedSha256: fixture.artifactDescriptor.compressedSha256,
    decompressedSizeBytes: fixture.artifactDescriptor.decompressedSizeBytes,
    decompressedSha256: fixture.artifactDescriptor.decompressedSha256,
    releaseSequence: fixture.distributionPayload.releaseSequence,
    signingRole: "synthetic",
    requiredRootMetadataVersion: 1,
  };
}

function requireDualFormManifest(
  source: string,
): ParsedSignedSyntheticDualFormFirmwareManifest {
  const parsed = parseSignedSyntheticDualFormFirmwareManifest(source);
  expect(parsed.status).toBe("PARSED_UNTRUSTED");
  if (parsed.status !== "PARSED_UNTRUSTED") {
    throw new Error(`dual-form fixture did not parse: ${parsed.reason}`);
  }
  return parsed;
}

async function signDualFormManifest(
  payload: SyntheticDualFormFirmwareManifestPayloadV2,
  key: TestKey,
): Promise<ParsedSignedSyntheticDualFormFirmwareManifest> {
  const envelope = (
    signatureBase64Url: string,
  ): SignedSyntheticDualFormFirmwareManifestEnvelopeV2 => ({
    schemaVersion: "2",
    canonicalization: "RFC8785",
    payload,
    signature: {
      algorithm: "Ed25519",
      keyId: key.keyId,
      signatureBase64Url,
    },
  });
  const placeholder = requireDualFormManifest(
    JSON.stringify(envelope(zeroSignatureBase64Url)),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "Ed25519" },
      key.keyPair.privateKey,
      Uint8Array.from(placeholder.copySignatureInput()),
    ),
  );
  return requireDualFormManifest(
    JSON.stringify(envelope(encodeBase64Url(signature))),
  );
}

async function validateArtifact(
  fixture: DistributionFixture,
): Promise<SyntheticCompressedFirmwareArtifactValidation> {
  const decompressionProvider: FirmwareArtifactDecompressionProvider = {
    assurance: "SYNTHETIC_ONLY",
    async decompressGzip(_bytes, emitChunk) {
      emitChunk(fixture.decompressedBytes.slice());
    },
  };
  return validateSyntheticCompressedFirmwareArtifact({
    descriptor: fixture.artifactDescriptor,
    compressedBytes: fixture.artifactBytes,
    digestProvider,
    decompressionProvider,
  });
}

async function createCatalogCandidate(input: {
  readonly fixture: DistributionFixture;
  readonly key: TestKey;
  readonly root: ParsedSignedFirmwareRootMetadata;
  readonly dualPayload?: SyntheticDualFormFirmwareManifestPayloadV2;
}) {
  const manifest = await signDualFormManifest(
    input.dualPayload ?? dualFormPayload(input.fixture),
    input.key,
  );
  const verification = await verifySyntheticDualFormFirmwareManifestAgainstRoot(
    {
      root: input.root,
      manifest,
      clock: clock(),
      verifier: signatureVerifier,
    },
  );
  const state = parseSyntheticFirmwareTrustState(
    JSON.stringify({
      schemaVersion: "1",
      stateType: "synthetic-firmware-trust-state",
      highestRootMetadataVersion: 1,
      releaseFloors: [],
    }),
  );
  if (state.status !== "PARSED_UNPERSISTED") {
    throw new Error("trust-state fixture did not parse");
  }
  const rollbackEvidence = advanceSyntheticFirmwareReleaseState({
    state,
    verification,
  });
  return createSyntheticFirmwareCatalogCandidateEvidence({
    manifestRootVerification: verification,
    artifactValidation: await validateArtifact(input.fixture),
    rollbackEvidence,
  });
}

describe("Synthetic distribution Manifest and bounded acquisition", () => {
  it("parses one immutable exact envelope under its own signature domain", () => {
    const parsed = requireDistributionManifest(
      JSON.stringify(distributionEnvelope(distributionPayload())),
    );
    const first = parsed.copySignatureInput();
    expect(new TextDecoder().decode(first)).toMatch(
      new RegExp(`^${signedSyntheticFirmwareDistributionManifestDomain}`),
    );
    first.fill(0);
    expect(parsed.copySignatureInput()).not.toEqual(first);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.manifest.payload.artifact)).toBe(true);
  });

  it("rejects unsafe wire variants, origins, names, and object identities", () => {
    const valid = distributionEnvelope(distributionPayload());
    const duplicate = JSON.stringify(valid).replace(
      '"distributionSchema":"1"',
      '"distributionSchema":"1","distributionSchema":"1"',
    );
    expect(parseSignedSyntheticFirmwareDistributionManifest(duplicate)).toEqual(
      {
        status: "BLOCKED",
        reason: "SYNTHETIC_DISTRIBUTION_MANIFEST_DUPLICATE_KEY",
      },
    );
    expect(
      parseSignedSyntheticFirmwareDistributionManifest(
        `${" ".repeat(maximumSignedSyntheticFirmwareDistributionManifestBytes)}${JSON.stringify(valid)}`,
      ),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DISTRIBUTION_MANIFEST_LIMIT_EXCEEDED",
    });

    const invalidPayloads: readonly Partial<SyntheticFirmwareDistributionManifestPayloadV1>[] =
      [
        {
          artifact: {
            ...valid.payload.artifact,
            url: "http://fixtures.example.invalid/releases/synthetic-firmware.bin.gz",
          },
        },
        {
          artifact: {
            ...valid.payload.artifact,
            url: `${valid.payload.artifact.url}?download=1`,
          },
        },
        {
          correspondingSource: {
            ...valid.payload.correspondingSource,
            url: "https://other.example.invalid/releases/synthetic-source.tar.gz",
          },
        },
        {
          correspondingSource: {
            ...valid.payload.correspondingSource,
            name: "source.zip",
          },
        },
        {
          notices: {
            ...valid.payload.notices,
            mediaType: "application/gzip",
          } as unknown as SyntheticFirmwareDistributionManifestPayloadV1["notices"],
        },
      ];
    for (const overrides of invalidPayloads) {
      expect(
        parseSignedSyntheticFirmwareDistributionManifest(
          JSON.stringify(
            distributionEnvelope({ ...valid.payload, ...overrides }),
          ),
        ),
      ).toEqual({
        status: "BLOCKED",
        reason: "SYNTHETIC_DISTRIBUTION_MANIFEST_SCHEMA_INVALID",
      });
    }
  });

  it("verifies Ed25519 while rejecting clones, wrong keys, and false results", async () => {
    const key = await createTestKey("synthetic:distribution-signature");
    const other = await createTestKey("synthetic:distribution-other");
    const parsed = await signDistributionManifest(distributionPayload(), key);

    await expect(
      verifySyntheticFirmwareDistributionManifestSignature({
        parsed,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: key.keyId,
          rawPublicKey: new Uint8Array(
            await crypto.subtle.exportKey("raw", key.keyPair.publicKey),
          ),
        },
        verifier: signatureVerifier,
      }),
    ).resolves.toMatchObject({ status: "VERIFIED_UNTRUSTED" });
    await expect(
      verifySyntheticFirmwareDistributionManifestSignature({
        parsed: { ...parsed },
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: key.keyId,
          rawPublicKey: new Uint8Array(32),
        },
        verifier: signatureVerifier,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DISTRIBUTION_MANIFEST_NOT_FROM_PARSER",
    });
    await expect(
      verifySyntheticFirmwareDistributionManifestSignature({
        parsed,
        key: {
          assurance: "SYNTHETIC_ONLY",
          keyId: other.keyId,
          rawPublicKey: new Uint8Array(32),
        },
        verifier: signatureVerifier,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DISTRIBUTION_MANIFEST_KEY_ID_MISMATCH",
    });
  });

  it("resolves only the exact authorized signer through a fresh Synthetic root", async () => {
    const key = await createTestKey("synthetic:distribution-root");
    const root = requireRoot(rootPayload([key]));
    const manifest = await signDistributionManifest(distributionPayload(), key);
    const result = await verifyDistributionAgainstRoot({ manifest, root });
    expect(result).toMatchObject({
      status: "VERIFIED_DISTRIBUTION_AGAINST_UNTRUSTED_ROOT",
      distributionSchema: "1",
      rootVersion: 1,
      targetIdentifier: "synthetic.tx.2g4",
      releaseSequence: 7,
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
    });
    await expect(
      verifyDistributionAgainstRoot({
        manifest,
        root,
        now: "2026-10-01T00:00:00.000Z",
      }),
    ).resolves.toEqual({ status: "BLOCKED", reason: "FIRMWARE_ROOT_EXPIRED" });
    await expect(
      verifySyntheticFirmwareDistributionManifestAgainstRoot({
        root,
        manifest: { ...manifest },
        clock: clock(),
        verifier: signatureVerifier,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DISTRIBUTION_MANIFEST_NOT_FROM_PARSER",
    });
  });

  it("streams, hashes, and discards each exact named distribution object", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:distribution-acquisition");
    const root = requireRoot(rootPayload([key]));
    const verification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(
        fixture.distributionPayload,
        key,
      ),
    });
    const results = await acquireAll({ fixture, verification });
    expect(results.map((result) => result.status)).toEqual([
      "VERIFIED_SYNTHETIC_ACQUISITION",
      "VERIFIED_SYNTHETIC_ACQUISITION",
      "VERIFIED_SYNTHETIC_ACQUISITION",
    ]);
    for (const result of results) {
      expect(result).toMatchObject({
        validationLevel: "SYNTHETIC_ONLY",
        acquisitionAssurance: "SYNTHETIC_ONLY",
        digestAssurance: "CRYPTOGRAPHIC",
        byteDisposition: "HASHED_AND_DISCARDED",
        writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
      });
      expect(Reflect.ownKeys(result)).not.toContain("bytes");
      expect(Reflect.ownKeys(result)).not.toContain("copyBytes");
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it("rejects forged root evidence and invalid acquisition providers", async () => {
    const fixture = await createFixture();
    const fakeVerification = {
      status: "VERIFIED_DISTRIBUTION_AGAINST_UNTRUSTED_ROOT",
    } as SyntheticFirmwareDistributionManifestRootVerificationResult;
    await expect(
      acquireSyntheticFirmwareDistributionObject({
        distributionRootVerification: fakeVerification,
        objectRole: "firmware-artifact",
        provider: acquisitionProvider(fixture),
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "DISTRIBUTION_EVIDENCE",
      reason: "SYNTHETIC_DISTRIBUTION_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
    });

    const key = await createTestKey("synthetic:distribution-provider");
    const root = requireRoot(rootPayload([key]));
    const verification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(
        fixture.distributionPayload,
        key,
      ),
    });
    await expect(
      acquireSyntheticFirmwareDistributionObject({
        distributionRootVerification: verification,
        objectRole: "firmware-artifact",
        provider: {
          assurance: "SYNTHETIC_ONLY",
        } as SyntheticFirmwareObjectAcquisitionProvider,
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "PROVIDER",
      reason: "SYNTHETIC_ACQUISITION_PROVIDER_INVALID",
    });
  });

  it("fails closed on malformed, excessive, short, or late stream chunks", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:distribution-stream");
    const root = requireRoot(rootPayload([key]));
    const verification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(
        fixture.distributionPayload,
        key,
      ),
    });

    const runs: readonly {
      readonly emit: (sink: (chunk: Uint8Array) => void) => void;
      readonly reason: string;
    }[] = [
      {
        emit: (sink) => sink(new Uint8Array()),
        reason: "SYNTHETIC_ACQUISITION_CHUNK_INVALID",
      },
      {
        emit: (sink) => sink(new Uint8Array(64 * 1024 + 1)),
        reason: "SYNTHETIC_ACQUISITION_CHUNK_SIZE_LIMIT_EXCEEDED",
      },
      {
        emit: (sink) => sink(fixture.artifactBytes.slice(0, -1)),
        reason: "SYNTHETIC_ACQUISITION_OBJECT_SIZE_MISMATCH",
      },
      {
        emit: (sink) => sink(new Uint8Array(fixture.artifactBytes.length + 1)),
        reason: "SYNTHETIC_ACQUISITION_OBJECT_SIZE_MISMATCH",
      },
    ];
    for (const run of runs) {
      const provider: SyntheticFirmwareObjectAcquisitionProvider = {
        assurance: "SYNTHETIC_ONLY",
        async acquireExactObject(request, emitChunk) {
          run.emit(emitChunk);
          return {
            sourceUrl: request.url,
            finalUrl: request.url,
            statusCode: 200,
            mediaType: request.mediaType,
            receivedSizeBytes: request.expectedSizeBytes,
          };
        },
      };
      await expect(
        acquireSyntheticFirmwareDistributionObject({
          distributionRootVerification: verification,
          objectRole: "firmware-artifact",
          provider,
          digestProvider,
        }),
      ).resolves.toMatchObject({ status: "BLOCKED", reason: run.reason });
    }

    let lateSink: ((chunk: Uint8Array) => void) | undefined;
    const provider: SyntheticFirmwareObjectAcquisitionProvider = {
      assurance: "SYNTHETIC_ONLY",
      async acquireExactObject(request, emitChunk) {
        lateSink = emitChunk;
        emitChunk(fixture.artifactBytes.slice());
        return {
          sourceUrl: request.url,
          finalUrl: request.url,
          statusCode: 200,
          mediaType: request.mediaType,
          receivedSizeBytes: request.expectedSizeBytes,
        };
      },
    };
    const result = await acquireSyntheticFirmwareDistributionObject({
      distributionRootVerification: verification,
      objectRole: "firmware-artifact",
      provider,
      digestProvider,
    });
    expect(result.status).toBe("VERIFIED_SYNTHETIC_ACQUISITION");
    expect(() => lateSink?.(new Uint8Array([1]))).not.toThrow();
  });

  it("enforces the 4,096-chunk ceiling independently of total size", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:distribution-chunk-count");
    const root = requireRoot(rootPayload([key]));
    const bytes = new Uint8Array(4_097).fill(1);
    const payload = {
      ...fixture.distributionPayload,
      artifact: {
        ...fixture.distributionPayload.artifact,
        sizeBytes: bytes.byteLength,
        sha256: await sha256(bytes),
      },
    };
    const verification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(payload, key),
    });
    const provider: SyntheticFirmwareObjectAcquisitionProvider = {
      assurance: "SYNTHETIC_ONLY",
      async acquireExactObject(request, emitChunk) {
        for (const byte of bytes) {
          emitChunk(new Uint8Array([byte]));
        }
        return {
          sourceUrl: request.url,
          finalUrl: request.url,
          statusCode: 200,
          mediaType: request.mediaType,
          receivedSizeBytes: bytes.byteLength,
        };
      },
    };
    await expect(
      acquireSyntheticFirmwareDistributionObject({
        distributionRootVerification: verification,
        objectRole: "firmware-artifact",
        provider,
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "STREAM",
      reason: "SYNTHETIC_ACQUISITION_CHUNK_LIMIT_EXCEEDED",
    });
  });

  it("requires an exact non-redirect receipt before hashing", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:distribution-receipt");
    const root = requireRoot(rootPayload([key]));
    const verification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(
        fixture.distributionPayload,
        key,
      ),
    });

    for (const mutate of [
      (receipt: Record<string, unknown>) => {
        receipt.finalUrl = "https://fixtures.example.invalid/redirected.bin.gz";
      },
      (receipt: Record<string, unknown>) => {
        receipt.statusCode = 206;
      },
      (receipt: Record<string, unknown>) => {
        receipt.mediaType = "application/json";
      },
      (receipt: Record<string, unknown>) => {
        receipt.receivedSizeBytes = 1;
      },
    ]) {
      await expect(
        acquireSyntheticFirmwareDistributionObject({
          distributionRootVerification: verification,
          objectRole: "firmware-artifact",
          provider: acquisitionProvider(fixture, mutate),
          digestProvider,
        }),
      ).resolves.toEqual({
        status: "BLOCKED",
        stage: "RECEIPT",
        reason: "SYNTHETIC_ACQUISITION_RECEIPT_MISMATCH",
      });
    }
  });

  it("blocks digest mismatch and propagates cancellation", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:distribution-digest");
    const root = requireRoot(rootPayload([key]));
    const verification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(
        fixture.distributionPayload,
        key,
      ),
    });
    await expect(
      acquireSyntheticFirmwareDistributionObject({
        distributionRootVerification: verification,
        objectRole: "firmware-artifact",
        provider: acquisitionProvider(fixture),
        digestProvider: {
          assurance: "CRYPTOGRAPHIC",
          async digestSha256() {
            return "0".repeat(64);
          },
        },
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "DIGEST",
      reason: "FIRMWARE_ARTIFACT_DIGEST_MISMATCH",
    });

    const signal: CancellationSignal = { aborted: true };
    await expect(
      acquireSyntheticFirmwareDistributionObject({
        distributionRootVerification: verification,
        objectRole: "firmware-artifact",
        provider: acquisitionProvider(fixture),
        digestProvider,
        signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("joins only exact branded catalog, artifact, source, and notice evidence", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:distribution-candidate");
    const root = requireRoot(rootPayload([key]));
    const catalogCandidate = await createCatalogCandidate({
      fixture,
      key,
      root,
    });
    const distributionRootVerification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(
        fixture.distributionPayload,
        key,
      ),
    });
    const [firmwareAcquisition, sourceAcquisition, noticesAcquisition] =
      await acquireAll({ fixture, verification: distributionRootVerification });
    const result = createSyntheticFirmwareDistributionCandidateEvidence({
      catalogCandidate,
      distributionRootVerification,
      firmwareAcquisition: firmwareAcquisition!,
      correspondingSourceAcquisition: sourceAcquisition!,
      noticesAcquisition: noticesAcquisition!,
    });
    expect(result).toEqual({
      status: "SYNTHETIC_DISTRIBUTION_CANDIDATE_EVIDENCE",
      validationLevel: "SYNTHETIC_ONLY",
      distributionManifestStatus:
        "VERIFIED_DISTRIBUTION_AGAINST_UNTRUSTED_ROOT",
      acquisitionStatus: "VERIFIED_SYNTHETIC_ACQUISITION",
      correspondingSourceDisposition:
        "EXACT_BYTES_VERIFIED_CONTENTS_UNINSPECTED",
      noticesDisposition: "EXACT_BYTES_VERIFIED_CONTENTS_UNINSPECTED",
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
      catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC",
      byteDisposition: "HASHED_AND_DISCARDED",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
      targetIdentifier: "synthetic.tx.2g4",
      rootVersion: 1,
      releaseSequence: 7,
      artifactName: fixture.distributionPayload.artifact.name,
      artifactSizeBytes: fixture.artifactBytes.byteLength,
      artifactSha256: fixture.distributionPayload.artifact.sha256,
      correspondingSourceName:
        fixture.distributionPayload.correspondingSource.name,
      correspondingSourceSizeBytes: fixture.sourceBytes.byteLength,
      correspondingSourceSha256:
        fixture.distributionPayload.correspondingSource.sha256,
      noticesName: fixture.distributionPayload.notices.name,
      noticesSizeBytes: fixture.noticesBytes.byteLength,
      noticesSha256: fixture.distributionPayload.notices.sha256,
    });
    expect(JSON.stringify(result)).not.toContain("ELRSEASYFWIMAGE");
    expect(Reflect.ownKeys(result)).not.toContain("bytes");
  });

  it("rejects cloned or cross-root final evidence and v2 object mismatch", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:distribution-cross-wire");
    const root = requireRoot(rootPayload([key]));
    const catalogCandidate = await createCatalogCandidate({
      fixture,
      key,
      root,
    });
    const distributionRootVerification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(
        fixture.distributionPayload,
        key,
      ),
    });
    const [firmwareAcquisition, sourceAcquisition, noticesAcquisition] =
      await acquireAll({ fixture, verification: distributionRootVerification });
    const common = {
      catalogCandidate,
      distributionRootVerification,
      firmwareAcquisition: firmwareAcquisition!,
      correspondingSourceAcquisition: sourceAcquisition!,
      noticesAcquisition: noticesAcquisition!,
    };

    expect(
      createSyntheticFirmwareDistributionCandidateEvidence({
        ...common,
        catalogCandidate: { ...catalogCandidate },
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_CATALOG_CANDIDATE_NOT_PROVEN",
    });
    expect(
      createSyntheticFirmwareDistributionCandidateEvidence({
        ...common,
        firmwareAcquisition: { ...firmwareAcquisition! },
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_FIRMWARE_ACQUISITION_NOT_PROVEN",
    });

    const otherRoot = requireRoot(rootPayload([key]));
    const otherVerification = await verifyDistributionAgainstRoot({
      root: otherRoot,
      manifest: await signDistributionManifest(
        fixture.distributionPayload,
        key,
      ),
    });
    const otherAcquisitions = await acquireAll({
      fixture,
      verification: otherVerification,
    });
    expect(
      createSyntheticFirmwareDistributionCandidateEvidence({
        ...common,
        distributionRootVerification: otherVerification,
        firmwareAcquisition: otherAcquisitions[0]!,
        correspondingSourceAcquisition: otherAcquisitions[1]!,
        noticesAcquisition: otherAcquisitions[2]!,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DISTRIBUTION_ROOT_MISMATCH",
    });

    const mismatchedCatalog = await createCatalogCandidate({
      fixture,
      key,
      root,
      dualPayload: {
        ...dualFormPayload(fixture),
        artifactName: "different-firmware.bin.gz",
      },
    });
    expect(
      createSyntheticFirmwareDistributionCandidateEvidence({
        ...common,
        catalogCandidate: mismatchedCatalog,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DISTRIBUTION_ARTIFACT_MISMATCH",
    });
  });

  it("never invokes accessors while proving final evidence", async () => {
    let getterExecuted = false;
    const input = Object.create(null) as Record<string, unknown>;
    for (const key of [
      "catalogCandidate",
      "distributionRootVerification",
      "firmwareAcquisition",
      "correspondingSourceAcquisition",
      "noticesAcquisition",
    ]) {
      Object.defineProperty(input, key, {
        enumerable: true,
        get() {
          getterExecuted = true;
          return {};
        },
      });
    }
    expect(
      createSyntheticFirmwareDistributionCandidateEvidence(
        input as Parameters<
          typeof createSyntheticFirmwareDistributionCandidateEvidence
        >[0],
      ),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_CATALOG_CANDIDATE_NOT_PROVEN",
    });
    expect(getterExecuted).toBe(false);
  });
});
