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
  type SyntheticFirmwareBuildOutputChunkSink,
  type SyntheticFirmwareFixtureBuildOutputProvider,
  type SyntheticFirmwareFixtureBuildRequest,
  type SyntheticFirmwareObjectAcquisitionRequest,
  type SyntheticFirmwareObjectAcquisitionProvider,
  type SyntheticFirmwareRootMetadataPayloadV1,
  type SyntheticFirmwareRootPublicKeyV1,
} from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import {
  canonicalizeBoundedJson,
  type BoundedJsonValue,
} from "./bounded-json.js";
import {
  acquireSyntheticFirmwareDistributionObject,
  type SyntheticFirmwareAcquisitionResult,
} from "./firmware-acquisition.js";
import {
  compareSyntheticFirmwareFixtureBuildOutput,
  inspectSyntheticFirmwareBuildRecipe,
} from "./firmware-build-evidence.js";
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
  createSyntheticFirmwareSourceReviewEvidence,
  inspectSyntheticCorrespondingSourceArchive,
  inspectSyntheticFirmwareNotices,
  type SyntheticFirmwareSourceReviewEvidenceResult,
  type SyntheticSourceInventoryInspectionResult,
} from "./firmware-source-evidence.js";
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
  readonly sourceArchiveBytes: Uint8Array;
  readonly sourceBytes: Uint8Array;
  readonly noticesBytes: Uint8Array;
  readonly buildRecipeBytes: Uint8Array;
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

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function canonicalTar(
  entries: readonly {
    readonly path: string;
    readonly bytes: Uint8Array;
  }[],
): Uint8Array {
  const archiveSize =
    entries.reduce(
      (total, entry) =>
        total + 512 + Math.ceil(entry.bytes.byteLength / 512) * 512,
      0,
    ) +
    2 * 512;
  const archive = new Uint8Array(archiveSize);
  let offset = 0;
  for (const entry of entries) {
    const header = archive.subarray(offset, offset + 512);
    writeAscii(header, 0, entry.path);
    writeAscii(header, 100, "0000644");
    writeAscii(header, 108, "0000000");
    writeAscii(header, 116, "0000000");
    writeAscii(
      header,
      124,
      entry.bytes.byteLength.toString(8).padStart(11, "0"),
    );
    writeAscii(header, 136, "00000000000");
    header.fill(0x20, 148, 156);
    header[156] = 0x30;
    writeAscii(header, 257, "ustar");
    header[263] = 0x30;
    header[264] = 0x30;
    let checksum = 0;
    for (const byte of header) {
      checksum += byte;
    }
    writeAscii(header, 148, checksum.toString(8).padStart(6, "0"));
    header[154] = 0;
    header[155] = 0x20;
    offset += 512;
    archive.set(entry.bytes, offset);
    offset += Math.ceil(entry.bytes.byteLength / 512) * 512;
  }
  return archive;
}

function canonicalJsonBytes(value: BoundedJsonValue): Uint8Array {
  return textEncoder.encode(canonicalizeBoundedJson(value));
}

function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (
    let offset = 0;
    offset <= haystack.byteLength - needle.byteLength;
    offset += 1
  ) {
    for (let index = 0; index < needle.byteLength; index += 1) {
      if (haystack[offset + index] !== needle[index]) {
        continue outer;
      }
    }
    return offset;
  }
  return -1;
}

function syntheticExecutable(payloadSizeBytes = 4): Uint8Array {
  const target = textEncoder.encode("synthetic.tx.2g4");
  const payload = new Uint8Array(payloadSizeBytes);
  for (let index = 0; index < payload.byteLength; index += 1) {
    payload[index] = ((index + 1) * 0x10) & 0xff;
  }
  const bytes = new Uint8Array(22 + target.byteLength + payload.byteLength);
  bytes.set(textEncoder.encode("ELRSEASYFWIMAGE!"), 0);
  bytes[16] = 1;
  bytes[17] = target.byteLength;
  new DataView(bytes.buffer).setUint32(18, payload.byteLength, false);
  bytes.set(target, 22);
  bytes.set(payload, 22 + target.byteLength);
  return bytes;
}

async function createFixture(
  input: {
    readonly transformBuildRecipe?: (bytes: Uint8Array) => Uint8Array;
    readonly executablePayloadSizeBytes?: number;
  } = {},
): Promise<DistributionFixture> {
  const decompressedBytes = syntheticExecutable(
    input.executablePayloadSizeBytes ?? 4,
  );
  const artifactBytes = gzip(decompressedBytes);
  const artifactSha256 = await sha256(artifactBytes);
  const sourceFilesWithoutConfiguration = [
    {
      path: "LICENSES/project.txt",
      role: "LICENSE",
      buildInputId: null,
      bytes: textEncoder.encode("Synthetic fixture notice only."),
    },
    {
      path: "build/dependency-lock.json",
      role: "BUILD_INPUT",
      buildInputId: "dependency-lock",
      bytes: textEncoder.encode('{"dependencies":[]}'),
    },
    {
      path: "build/patch-set.json",
      role: "BUILD_INPUT",
      buildInputId: "patch-set",
      bytes: textEncoder.encode('{"patches":[]}'),
    },
    {
      path: "build/targets-snapshot.json",
      role: "BUILD_INPUT",
      buildInputId: "targets-snapshot",
      bytes: textEncoder.encode('{"target":"synthetic.tx.2g4"}'),
    },
    {
      path: "build/toolchain.txt",
      role: "BUILD_INPUT",
      buildInputId: "toolchain",
      bytes: textEncoder.encode("synthetic-toolchain@0"),
    },
    {
      path: "build/upstream-source.txt",
      role: "BUILD_INPUT",
      buildInputId: "upstream-source",
      bytes: textEncoder.encode("synthetic-upstream@0000000"),
    },
    {
      path: "src/main.cpp",
      role: "SOURCE",
      buildInputId: null,
      bytes: textEncoder.encode("void synthetic_fixture() {}\n"),
    },
  ];
  const recordsWithoutConfiguration = await Promise.all(
    sourceFilesWithoutConfiguration.map(async (entry) => ({
      sourcePath: entry.path,
      buildInputId: entry.buildInputId,
      sizeBytes: entry.bytes.byteLength,
      sha256: await sha256(entry.bytes),
    })),
  );
  const recipeInputIds = [
    "upstream-source",
    "targets-snapshot",
    "patch-set",
    "toolchain",
    "dependency-lock",
  ] as const;
  let buildRecipeBytes = canonicalJsonBytes({
    buildRecipeSchema: "1",
    recipeType: "synthetic-firmware-build-recipe",
    targetIdentifier: "synthetic.tx.2g4",
    releaseSequence: 7,
    inputs: recipeInputIds.map((buildInputId) => {
      const record = recordsWithoutConfiguration.find(
        (candidate) => candidate.buildInputId === buildInputId,
      )!;
      return {
        buildInputId,
        sourcePath: record.sourcePath,
        sizeBytes: record.sizeBytes,
        sha256: record.sha256,
      };
    }),
    output: {
      name: "synthetic-firmware.bin.gz",
      mediaType: "application/gzip",
      sizeBytes: artifactBytes.byteLength,
      sha256: artifactSha256,
    },
  } as BoundedJsonValue);
  if (input.transformBuildRecipe !== undefined) {
    buildRecipeBytes = input.transformBuildRecipe(buildRecipeBytes.slice());
  }
  const sourceFiles = [
    ...sourceFilesWithoutConfiguration,
    {
      path: "build/configuration.json",
      role: "BUILD_INPUT",
      buildInputId: "build-configuration",
      bytes: buildRecipeBytes,
    },
  ].sort((left, right) => (left.path < right.path ? -1 : 1));
  const inventoryEntries = await Promise.all(
    sourceFiles.map(async (entry) => ({
      path: entry.path,
      role: entry.role,
      buildInputId: entry.buildInputId,
      sizeBytes: entry.bytes.byteLength,
      sha256: await sha256(entry.bytes),
    })),
  );
  const inventoryBytes = canonicalJsonBytes({
    sourceInventorySchema: "1",
    inventoryType: "synthetic-corresponding-source-inventory",
    targetIdentifier: "synthetic.tx.2g4",
    releaseSequence: 7,
    artifactSha256,
    entries: inventoryEntries,
  } as BoundedJsonValue);
  const sourceArchiveBytes = canonicalTar([
    { path: "ELRS-EASY-SOURCE-INVENTORY.json", bytes: inventoryBytes },
    ...sourceFiles,
  ]);
  const sourceBytes = gzip(sourceArchiveBytes);
  const sourceSha256 = await sha256(sourceBytes);
  const licenseEntry = inventoryEntries.find(
    (entry) => entry.role === "LICENSE",
  )!;
  const noticesBytes = canonicalJsonBytes({
    noticeSchema: "1",
    noticeType: "synthetic-firmware-notices",
    targetIdentifier: "synthetic.tx.2g4",
    releaseSequence: 7,
    artifactSha256,
    correspondingSourceSha256: sourceSha256,
    entries: [
      {
        componentId: "synthetic-project",
        licenseExpression: "LicenseRef-Synthetic-Only",
        noticeSha256: licenseEntry.sha256,
        sourcePath: licenseEntry.path,
      },
    ],
  } as BoundedJsonValue);
  const noticesSha256 = await sha256(noticesBytes);
  return {
    decompressedBytes,
    artifactBytes,
    sourceArchiveBytes,
    sourceBytes,
    noticesBytes,
    buildRecipeBytes,
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

function fixtureBuildOutputProvider(
  fixture: DistributionFixture,
  input: {
    readonly outputBytes?: Uint8Array;
    readonly mutateReceipt?: (
      receipt: Record<string, unknown>,
      request: SyntheticFirmwareFixtureBuildRequest,
    ) => void;
  } = {},
): SyntheticFirmwareFixtureBuildOutputProvider {
  return Object.freeze({
    assurance: "SYNTHETIC_ONLY",
    async produceFixtureBuildOutput(
      request: SyntheticFirmwareFixtureBuildRequest,
      emitChunk: SyntheticFirmwareBuildOutputChunkSink,
    ) {
      const bytes = (input.outputBytes ?? fixture.artifactBytes).slice();
      const split = Math.max(1, Math.floor(bytes.byteLength / 2));
      const first = bytes.slice(0, split);
      emitChunk(first);
      first.fill(0);
      emitChunk(bytes.slice(split));
      const receipt: Record<string, unknown> = {
        receiptSchema: "1",
        receiptType: "synthetic-firmware-fixture-build-receipt",
        targetIdentifier: request.targetIdentifier,
        releaseSequence: request.releaseSequence,
        recipeSha256: request.recipe.sha256,
        declaredInputCount: 6,
        outputName: request.expectedOutput.name,
        outputMediaType: request.expectedOutput.mediaType,
        outputSizeBytes: bytes.byteLength,
        outputSha256: request.expectedOutput.sha256,
      };
      input.mutateReceipt?.(receipt, request);
      return receipt as unknown as Awaited<
        ReturnType<
          SyntheticFirmwareFixtureBuildOutputProvider["produceFixtureBuildOutput"]
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

function sourceDecompressionProvider(
  archiveBytes: Uint8Array,
): FirmwareArtifactDecompressionProvider {
  return Object.freeze({
    assurance: "SYNTHETIC_ONLY",
    async decompressGzip(
      _bytes: Uint8Array,
      emitChunk: (chunk: Uint8Array) => void,
    ) {
      const split = Math.max(1, Math.floor(archiveBytes.byteLength / 2));
      emitChunk(archiveBytes.slice(0, split));
      emitChunk(archiveBytes.slice(split));
    },
  });
}

async function inspectSource(input: {
  readonly fixture: DistributionFixture;
  readonly verification: SyntheticFirmwareDistributionManifestRootVerificationResult;
  readonly archiveBytes?: Uint8Array;
  readonly compressedBytes?: Uint8Array;
}): Promise<SyntheticSourceInventoryInspectionResult> {
  return inspectSyntheticCorrespondingSourceArchive({
    distributionRootVerification: input.verification,
    compressedSourceBytes: input.compressedBytes ?? input.fixture.sourceBytes,
    digestProvider,
    decompressionProvider: sourceDecompressionProvider(
      input.archiveBytes ?? input.fixture.sourceArchiveBytes,
    ),
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

async function createSourceReviewFixture(input: {
  readonly fixture: DistributionFixture;
  readonly key: TestKey;
  readonly root: ParsedSignedFirmwareRootMetadata;
}): Promise<
  Readonly<{
    verification: SyntheticFirmwareDistributionManifestRootVerificationResult;
    sourceReviewEvidence: SyntheticFirmwareSourceReviewEvidenceResult;
  }>
> {
  const catalogCandidate = await createCatalogCandidate(input);
  const verification = await verifyDistributionAgainstRoot({
    root: input.root,
    manifest: await signDistributionManifest(
      input.fixture.distributionPayload,
      input.key,
    ),
  });
  const acquisitions = await acquireAll({
    fixture: input.fixture,
    verification,
  });
  const distributionCandidate =
    createSyntheticFirmwareDistributionCandidateEvidence({
      catalogCandidate,
      distributionRootVerification: verification,
      firmwareAcquisition: acquisitions[0]!,
      correspondingSourceAcquisition: acquisitions[1]!,
      noticesAcquisition: acquisitions[2]!,
    });
  const sourceInspection = await inspectSource({
    fixture: input.fixture,
    verification,
  });
  const noticesInspection = await inspectSyntheticFirmwareNotices({
    distributionRootVerification: verification,
    sourceInspection,
    noticesBytes: input.fixture.noticesBytes,
    digestProvider,
  });
  return Object.freeze({
    verification,
    sourceReviewEvidence: createSyntheticFirmwareSourceReviewEvidence({
      distributionCandidate,
      sourceInspection,
      noticesInspection,
    }),
  });
}

async function createBuildEvidenceFixture(
  keyId: string,
  fixtureInput: Parameters<typeof createFixture>[0] = {},
) {
  const fixture = await createFixture(fixtureInput);
  const key = await createTestKey(keyId);
  const root = requireRoot(rootPayload([key]));
  const sourceReview = await createSourceReviewFixture({ fixture, key, root });
  const recipeInspection = await inspectSyntheticFirmwareBuildRecipe({
    sourceReviewEvidence: sourceReview.sourceReviewEvidence,
    buildRecipeBytes: fixture.buildRecipeBytes,
    digestProvider,
  });
  return Object.freeze({ fixture, sourceReview, recipeInspection });
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

  it("rejects forged roots, altered source bytes, and invalid digest providers", async () => {
    const fixture = await createFixture();
    await expect(
      inspectSyntheticCorrespondingSourceArchive({
        distributionRootVerification: {
          status: "VERIFIED_DISTRIBUTION_AGAINST_UNTRUSTED_ROOT",
        } as SyntheticFirmwareDistributionManifestRootVerificationResult,
        compressedSourceBytes: fixture.sourceBytes,
        digestProvider,
        decompressionProvider: sourceDecompressionProvider(
          fixture.sourceArchiveBytes,
        ),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "DISTRIBUTION_EVIDENCE",
      reason: "SYNTHETIC_DISTRIBUTION_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
    });

    const key = await createTestKey("synthetic:source-input");
    const root = requireRoot(rootPayload([key]));
    const verification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(
        fixture.distributionPayload,
        key,
      ),
    });
    const alteredBytes = fixture.sourceBytes.slice();
    alteredBytes[alteredBytes.byteLength - 1] =
      (alteredBytes[alteredBytes.byteLength - 1] ?? 0) ^ 1;
    await expect(
      inspectSource({
        fixture,
        verification,
        compressedBytes: alteredBytes,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "COMPRESSED_INPUT",
      reason: "SYNTHETIC_SOURCE_ARCHIVE_DIGEST_MISMATCH",
    });
    await expect(
      inspectSyntheticCorrespondingSourceArchive({
        distributionRootVerification: verification,
        compressedSourceBytes: fixture.sourceBytes,
        digestProvider: {
          assurance: "CRYPTOGRAPHIC",
        } as FirmwareArtifactDigestProvider,
        decompressionProvider: sourceDecompressionProvider(
          fixture.sourceArchiveBytes,
        ),
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "COMPRESSED_INPUT",
      reason: "SYNTHETIC_EVIDENCE_DIGEST_PROVIDER_INVALID",
    });
  });

  it("bounds source decompression chunks and propagates cancellation", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:source-decompression");
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
        reason: "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_INVALID",
      },
      {
        emit: (sink) => sink(new Uint8Array(64 * 1024 + 1)),
        reason: "SYNTHETIC_SOURCE_DECOMPRESSION_CHUNK_SIZE_LIMIT_EXCEEDED",
      },
    ];
    for (const run of runs) {
      await expect(
        inspectSyntheticCorrespondingSourceArchive({
          distributionRootVerification: verification,
          compressedSourceBytes: fixture.sourceBytes,
          digestProvider,
          decompressionProvider: {
            assurance: "SYNTHETIC_ONLY",
            async decompressGzip(_bytes, emitChunk) {
              run.emit(emitChunk);
            },
          },
        }),
      ).resolves.toMatchObject({
        status: "BLOCKED",
        stage: "DECOMPRESSION",
        reason: run.reason,
      });
    }

    await expect(
      inspectSyntheticCorrespondingSourceArchive({
        distributionRootVerification: verification,
        compressedSourceBytes: fixture.sourceBytes,
        digestProvider,
        decompressionProvider: sourceDecompressionProvider(
          fixture.sourceArchiveBytes,
        ),
        signal: { aborted: true },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("inspects exact source inventory and notices before a blocked source-review join", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:source-review");
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
    const distributionCandidate =
      createSyntheticFirmwareDistributionCandidateEvidence({
        catalogCandidate,
        distributionRootVerification,
        firmwareAcquisition: firmwareAcquisition!,
        correspondingSourceAcquisition: sourceAcquisition!,
        noticesAcquisition: noticesAcquisition!,
      });

    const sourceInspection = await inspectSource({
      fixture,
      verification: distributionRootVerification,
    });
    expect(sourceInspection).toMatchObject({
      status: "VERIFIED_SYNTHETIC_SOURCE_INVENTORY",
      validationLevel: "SYNTHETIC_ONLY",
      sourceArchiveFormat: "RESTRICTED_USTAR_GZIP_V1",
      inventoryCanonicalization: "RFC8785",
      decompressionLinkage: "GZIP_CRC32_AND_ISIZE_MATCHED_SYNTHETIC_ONLY",
      sourceEntryCount: 1,
      buildInputCount: 6,
      licenseEntryCount: 1,
      buildInputDisposition: "EXACT_DECLARED_INPUTS_LINKED_TO_ARCHIVE_ENTRIES",
      sourceCompleteness: "NOT_PROVEN",
      byteDisposition: "HASHED_INSPECTED_AND_DISCARDED",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
    });
    expect(Reflect.ownKeys(sourceInspection)).not.toContain("entries");
    expect(Reflect.ownKeys(sourceInspection)).not.toContain("bytes");

    const noticesInspection = await inspectSyntheticFirmwareNotices({
      distributionRootVerification,
      sourceInspection,
      noticesBytes: fixture.noticesBytes,
      digestProvider,
    });
    expect(noticesInspection).toMatchObject({
      status: "VERIFIED_SYNTHETIC_NOTICE_SCHEMA",
      noticeCanonicalization: "RFC8785",
      noticeEntryCount: 1,
      sourceLinkDisposition: "EXACT_LICENSE_ENTRIES_LINKED_BY_PATH_AND_SHA256",
      legalCompleteness: "NOT_PROVEN",
      byteDisposition: "HASHED_INSPECTED_AND_DISCARDED",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
    });

    const result = createSyntheticFirmwareSourceReviewEvidence({
      distributionCandidate,
      sourceInspection,
      noticesInspection,
    });
    expect(result).toEqual({
      status: "SYNTHETIC_FIRMWARE_SOURCE_REVIEW_EVIDENCE",
      validationLevel: "SYNTHETIC_ONLY",
      distributionStatus: "SYNTHETIC_DISTRIBUTION_CANDIDATE_EVIDENCE",
      sourceStatus: "VERIFIED_SYNTHETIC_SOURCE_INVENTORY",
      noticesStatus: "VERIFIED_SYNTHETIC_NOTICE_SCHEMA",
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
      catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC",
      buildInputDisposition: "EXACT_DECLARED_INPUTS_LINKED_TO_ARCHIVE_ENTRIES",
      correspondingSourceDisposition:
        "BOUNDED_INVENTORY_INSPECTED_COMPLETENESS_UNPROVEN",
      noticesDisposition:
        "SCHEMA_AND_SOURCE_LINKS_INSPECTED_LEGAL_COMPLETENESS_UNPROVEN",
      reproducibilityDisposition: "NOT_PROVEN",
      byteDisposition: "HASHED_INSPECTED_AND_DISCARDED",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
      targetIdentifier: "synthetic.tx.2g4",
      rootVersion: 1,
      releaseSequence: 7,
      artifactSha256: fixture.distributionPayload.artifact.sha256,
      correspondingSourceSha256:
        fixture.distributionPayload.correspondingSource.sha256,
      noticesSha256: fixture.distributionPayload.notices.sha256,
      sourceEntryCount: 1,
      buildInputCount: 6,
      noticeEntryCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain("void synthetic_fixture");
    expect(Reflect.ownKeys(result)).not.toContain("bytes");
  });

  it("rejects false decompression, malformed tar, and incomplete build-input declarations", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:source-adversarial");
    const root = requireRoot(rootPayload([key]));
    const verification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(
        fixture.distributionPayload,
        key,
      ),
    });

    const wrongOutput = fixture.sourceArchiveBytes.slice();
    wrongOutput[600] = (wrongOutput[600] ?? 0) ^ 1;
    await expect(
      inspectSource({
        fixture,
        verification,
        archiveBytes: wrongOutput,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "DECOMPRESSION",
      reason: "SYNTHETIC_SOURCE_GZIP_TRAILER_MISMATCH",
    });

    const malformedTar = fixture.sourceArchiveBytes.slice();
    malformedTar[148] = malformedTar[148] === 0x30 ? 0x31 : 0x30;
    const malformedGzip = gzip(malformedTar);
    const malformedPayload: SyntheticFirmwareDistributionManifestPayloadV1 = {
      ...fixture.distributionPayload,
      correspondingSource: {
        ...fixture.distributionPayload.correspondingSource,
        sizeBytes: malformedGzip.byteLength,
        sha256: await sha256(malformedGzip),
      },
    };
    const malformedVerification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(malformedPayload, key),
    });
    await expect(
      inspectSource({
        fixture,
        verification: malformedVerification,
        archiveBytes: malformedTar,
        compressedBytes: malformedGzip,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "ARCHIVE",
      reason: "SYNTHETIC_SOURCE_TAR_INVALID",
    });

    const incompleteInventoryTar = fixture.sourceArchiveBytes.slice();
    const buildInputToken = textEncoder.encode('"toolchain"');
    const buildInputOffset = findBytes(incompleteInventoryTar, buildInputToken);
    expect(buildInputOffset).toBeGreaterThanOrEqual(0);
    incompleteInventoryTar[buildInputOffset + buildInputToken.byteLength - 2] =
      0x4e;
    const incompleteInventoryGzip = gzip(incompleteInventoryTar);
    const incompletePayload: SyntheticFirmwareDistributionManifestPayloadV1 = {
      ...fixture.distributionPayload,
      correspondingSource: {
        ...fixture.distributionPayload.correspondingSource,
        sizeBytes: incompleteInventoryGzip.byteLength,
        sha256: await sha256(incompleteInventoryGzip),
      },
    };
    const incompleteVerification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(incompletePayload, key),
    });
    await expect(
      inspectSource({
        fixture,
        verification: incompleteVerification,
        archiveBytes: incompleteInventoryTar,
        compressedBytes: incompleteInventoryGzip,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "INVENTORY",
      reason: "SYNTHETIC_SOURCE_INVENTORY_SCHEMA_INVALID",
    });
  });

  it("requires canonical notices and exact source-license linkage", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:notice-adversarial");
    const root = requireRoot(rootPayload([key]));

    const nonCanonicalNotices = textEncoder.encode(
      ` ${new TextDecoder().decode(fixture.noticesBytes)}`,
    );
    const nonCanonicalPayload: SyntheticFirmwareDistributionManifestPayloadV1 =
      {
        ...fixture.distributionPayload,
        notices: {
          ...fixture.distributionPayload.notices,
          sizeBytes: nonCanonicalNotices.byteLength,
          sha256: await sha256(nonCanonicalNotices),
        },
      };
    const nonCanonicalVerification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(nonCanonicalPayload, key),
    });
    const sourceInspection = await inspectSource({
      fixture,
      verification: nonCanonicalVerification,
    });
    await expect(
      inspectSyntheticFirmwareNotices({
        distributionRootVerification: nonCanonicalVerification,
        sourceInspection,
        noticesBytes: nonCanonicalNotices,
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "NOTICE_SCHEMA",
      reason: "SYNTHETIC_NOTICE_NOT_CANONICAL",
    });

    const mismatchedNotices = fixture.noticesBytes.slice();
    const noticeDigestKey = textEncoder.encode('"noticeSha256":"');
    const noticeDigestKeyOffset = findBytes(mismatchedNotices, noticeDigestKey);
    expect(noticeDigestKeyOffset).toBeGreaterThanOrEqual(0);
    const noticeDigestOffset =
      noticeDigestKeyOffset + noticeDigestKey.byteLength;
    mismatchedNotices.fill(0x30, noticeDigestOffset, noticeDigestOffset + 64);
    const mismatchedPayload: SyntheticFirmwareDistributionManifestPayloadV1 = {
      ...fixture.distributionPayload,
      notices: {
        ...fixture.distributionPayload.notices,
        sizeBytes: mismatchedNotices.byteLength,
        sha256: await sha256(mismatchedNotices),
      },
    };
    const mismatchedVerification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(mismatchedPayload, key),
    });
    const matchingSourceInspection = await inspectSource({
      fixture,
      verification: mismatchedVerification,
    });
    await expect(
      inspectSyntheticFirmwareNotices({
        distributionRootVerification: mismatchedVerification,
        sourceInspection: matchingSourceInspection,
        noticesBytes: mismatchedNotices,
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "SOURCE_LINKAGE",
      reason: "SYNTHETIC_NOTICE_SOURCE_LINK_MISMATCH",
    });
  });

  it("rejects altered notice bytes before schema inspection", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:notice-input");
    const root = requireRoot(rootPayload([key]));
    const verification = await verifyDistributionAgainstRoot({
      root,
      manifest: await signDistributionManifest(
        fixture.distributionPayload,
        key,
      ),
    });
    const sourceInspection = await inspectSource({ fixture, verification });
    await expect(
      inspectSyntheticFirmwareNotices({
        distributionRootVerification: verification,
        sourceInspection,
        noticesBytes: fixture.noticesBytes.slice(0, -1),
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "NOTICE_INPUT",
      reason: "SYNTHETIC_NOTICE_SIZE_MISMATCH",
    });
    const alteredNotices = fixture.noticesBytes.slice();
    alteredNotices[10] = (alteredNotices[10] ?? 0) ^ 1;
    await expect(
      inspectSyntheticFirmwareNotices({
        distributionRootVerification: verification,
        sourceInspection,
        noticesBytes: alteredNotices,
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "NOTICE_INPUT",
      reason: "SYNTHETIC_NOTICE_DIGEST_MISMATCH",
    });
  });

  it("rejects cloned source evidence and cloned final-join inputs", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:source-branding");
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
    const acquisitions = await acquireAll({
      fixture,
      verification: distributionRootVerification,
    });
    const distributionCandidate =
      createSyntheticFirmwareDistributionCandidateEvidence({
        catalogCandidate,
        distributionRootVerification,
        firmwareAcquisition: acquisitions[0]!,
        correspondingSourceAcquisition: acquisitions[1]!,
        noticesAcquisition: acquisitions[2]!,
      });
    const sourceInspection = await inspectSource({
      fixture,
      verification: distributionRootVerification,
    });
    await expect(
      inspectSyntheticFirmwareNotices({
        distributionRootVerification,
        sourceInspection: { ...sourceInspection },
        noticesBytes: fixture.noticesBytes,
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "SOURCE_EVIDENCE",
      reason: "SYNTHETIC_SOURCE_INVENTORY_INSPECTION_NOT_PROVEN",
    });
    const noticesInspection = await inspectSyntheticFirmwareNotices({
      distributionRootVerification,
      sourceInspection,
      noticesBytes: fixture.noticesBytes,
      digestProvider,
    });
    expect(
      createSyntheticFirmwareSourceReviewEvidence({
        distributionCandidate: { ...distributionCandidate },
        sourceInspection,
        noticesInspection,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DISTRIBUTION_CANDIDATE_NOT_PROVEN",
    });
    expect(
      createSyntheticFirmwareSourceReviewEvidence({
        distributionCandidate,
        sourceInspection: { ...sourceInspection },
        noticesInspection,
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_SOURCE_INVENTORY_INSPECTION_NOT_PROVEN",
    });
  });

  it("links the canonical Synthetic recipe and compares an independent fixture output", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:build-comparison");
    const root = requireRoot(rootPayload([key]));
    const sourceReview = await createSourceReviewFixture({
      fixture,
      key,
      root,
    });
    const recipeSha256 = await sha256(fixture.buildRecipeBytes);

    const recipeInspection = await inspectSyntheticFirmwareBuildRecipe({
      sourceReviewEvidence: sourceReview.sourceReviewEvidence,
      buildRecipeBytes: fixture.buildRecipeBytes,
      digestProvider,
    });
    expect(recipeInspection).toEqual({
      status: "VERIFIED_SYNTHETIC_FIRMWARE_BUILD_RECIPE",
      validationLevel: "SYNTHETIC_ONLY",
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
      recipeCanonicalization: "RFC8785",
      recipePath: "build/configuration.json",
      recipeSizeBytes: fixture.buildRecipeBytes.byteLength,
      recipeSha256,
      recipeLinkedInputCount: 5,
      declaredBuildInputCount: 6,
      buildInputDisposition: "FIVE_INPUTS_LINKED_AND_CONFIGURATION_SELF_HASHED",
      outputDisposition: "EXACT_SIGNED_SYNTHETIC_ARTIFACT_IDENTITY_LINKED",
      reproducibilityDisposition: "NOT_PROVEN",
      byteDisposition: "HASHED_INSPECTED_AND_DISCARDED",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
      targetIdentifier: "synthetic.tx.2g4",
      rootVersion: 1,
      releaseSequence: 7,
      artifactName: "synthetic-firmware.bin.gz",
      artifactSizeBytes: fixture.artifactBytes.byteLength,
      artifactSha256: fixture.distributionPayload.artifact.sha256,
    });
    expect(Reflect.ownKeys(recipeInspection)).not.toContain("inputs");
    expect(Reflect.ownKeys(recipeInspection)).not.toContain("bytes");

    let observedRequest: SyntheticFirmwareFixtureBuildRequest | undefined;
    const result = await compareSyntheticFirmwareFixtureBuildOutput({
      sourceReviewEvidence: sourceReview.sourceReviewEvidence,
      recipeInspection,
      provider: fixtureBuildOutputProvider(fixture, {
        mutateReceipt(_receipt, request) {
          observedRequest = request;
        },
      }),
      digestProvider,
    });
    expect(observedRequest).toBeDefined();
    expect(Object.isFrozen(observedRequest)).toBe(true);
    expect(Object.isFrozen(observedRequest?.recipe)).toBe(true);
    expect(Object.isFrozen(observedRequest?.inputs)).toBe(true);
    expect(Object.isFrozen(observedRequest?.expectedOutput)).toBe(true);
    expect(observedRequest?.inputs.map((entry) => entry.buildInputId)).toEqual([
      "upstream-source",
      "targets-snapshot",
      "patch-set",
      "toolchain",
      "dependency-lock",
    ]);
    expect(result).toEqual({
      status: "SYNTHETIC_FIRMWARE_BUILD_OUTPUT_COMPARISON_EVIDENCE",
      validationLevel: "SYNTHETIC_ONLY",
      trustStatus: "UNVERIFIED_NO_TRUST_ROOT",
      recipeStatus: "VERIFIED_SYNTHETIC_FIRMWARE_BUILD_RECIPE",
      providerAssurance: "SYNTHETIC_ONLY",
      digestAssurance: "CRYPTOGRAPHIC",
      catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC",
      toolchainDisposition: "NOT_INVOKED_PROVIDER_RECEIPT_ONLY",
      receiptDisposition: "EXACT_SYNTHETIC_RECEIPT_MATCHED",
      outputComparisonDisposition:
        "CORE_SHA256_MATCHED_SIGNED_SYNTHETIC_ARTIFACT",
      independenceDisposition: "SEPARATE_SYNTHETIC_PROVIDER_BOUNDARY_ONLY",
      reproducibilityDisposition: "NOT_PROVEN_SINGLE_SYNTHETIC_PROVIDER",
      byteDisposition: "HASHED_COMPARED_AND_DISCARDED",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
      targetIdentifier: "synthetic.tx.2g4",
      rootVersion: 1,
      releaseSequence: 7,
      recipeSha256,
      artifactName: "synthetic-firmware.bin.gz",
      artifactSizeBytes: fixture.artifactBytes.byteLength,
      artifactSha256: fixture.distributionPayload.artifact.sha256,
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-toolchain@0");
    expect(Reflect.ownKeys(result)).not.toContain("bytes");
  });

  it("rejects unlinked, non-canonical, and contradictory Synthetic recipes", async () => {
    const baseFixture = await createFixture();
    const baseKey = await createTestKey("synthetic:build-recipe-base");
    const baseRoot = requireRoot(rootPayload([baseKey]));
    const baseReview = await createSourceReviewFixture({
      fixture: baseFixture,
      key: baseKey,
      root: baseRoot,
    });
    await expect(
      inspectSyntheticFirmwareBuildRecipe({
        sourceReviewEvidence: {
          ...baseReview.sourceReviewEvidence,
        },
        buildRecipeBytes: baseFixture.buildRecipeBytes,
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "SOURCE_REVIEW_EVIDENCE",
      reason: "SYNTHETIC_SOURCE_REVIEW_EVIDENCE_NOT_PROVEN",
    });

    const alteredBytes = baseFixture.buildRecipeBytes.slice();
    alteredBytes[alteredBytes.byteLength - 2] =
      (alteredBytes[alteredBytes.byteLength - 2] ?? 0) ^ 1;
    await expect(
      inspectSyntheticFirmwareBuildRecipe({
        sourceReviewEvidence: baseReview.sourceReviewEvidence,
        buildRecipeBytes: alteredBytes,
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "RECIPE_INPUT",
      reason: "SYNTHETIC_BUILD_RECIPE_DIGEST_MISMATCH",
    });

    const variants: readonly {
      readonly keyId: string;
      readonly transform: (bytes: Uint8Array) => Uint8Array;
      readonly stage: string;
      readonly reason: string;
    }[] = [
      {
        keyId: "synthetic:build-recipe-noncanonical",
        transform: (bytes) => {
          const output = new Uint8Array(bytes.byteLength + 1);
          output[0] = 0x20;
          output.set(bytes, 1);
          return output;
        },
        stage: "RECIPE_SCHEMA",
        reason: "SYNTHETIC_BUILD_RECIPE_NOT_CANONICAL",
      },
      {
        keyId: "synthetic:build-recipe-release",
        transform: (bytes) => {
          const source = new TextDecoder().decode(bytes);
          return textEncoder.encode(
            source.replace('"releaseSequence":7', '"releaseSequence":8'),
          );
        },
        stage: "SOURCE_LINKAGE",
        reason: "SYNTHETIC_BUILD_RECIPE_RELEASE_MISMATCH",
      },
      {
        keyId: "synthetic:build-recipe-output",
        transform: (bytes) => {
          const output = bytes.slice();
          const marker = textEncoder.encode(
            '"output":{"mediaType":"application/gzip"',
          );
          const markerOffset = findBytes(output, marker);
          expect(markerOffset).toBeGreaterThanOrEqual(0);
          const shaKey = textEncoder.encode('"sha256":"');
          const shaOffset = findBytes(output.subarray(markerOffset), shaKey);
          expect(shaOffset).toBeGreaterThanOrEqual(0);
          const valueOffset = markerOffset + shaOffset + shaKey.byteLength;
          output[valueOffset] = output[valueOffset] === 0x30 ? 0x31 : 0x30;
          return output;
        },
        stage: "OUTPUT_LINKAGE",
        reason: "SYNTHETIC_BUILD_RECIPE_OUTPUT_MISMATCH",
      },
    ];
    for (const variant of variants) {
      const fixture = await createFixture({
        transformBuildRecipe: variant.transform,
      });
      const key = await createTestKey(variant.keyId);
      const root = requireRoot(rootPayload([key]));
      const review = await createSourceReviewFixture({ fixture, key, root });
      await expect(
        inspectSyntheticFirmwareBuildRecipe({
          sourceReviewEvidence: review.sourceReviewEvidence,
          buildRecipeBytes: fixture.buildRecipeBytes,
          digestProvider,
        }),
      ).resolves.toEqual({
        status: "BLOCKED",
        stage: variant.stage,
        reason: variant.reason,
      });
    }
  });

  it("bounds Synthetic build output and rejects false receipts or output bytes", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:build-output-adversarial");
    const root = requireRoot(rootPayload([key]));
    const sourceReview = await createSourceReviewFixture({
      fixture,
      key,
      root,
    });
    const recipeInspection = await inspectSyntheticFirmwareBuildRecipe({
      sourceReviewEvidence: sourceReview.sourceReviewEvidence,
      buildRecipeBytes: fixture.buildRecipeBytes,
      digestProvider,
    });

    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        sourceReviewEvidence: sourceReview.sourceReviewEvidence,
        recipeInspection,
        provider: fixtureBuildOutputProvider(fixture, {
          mutateReceipt(receipt) {
            receipt.recipeSha256 = "0".repeat(64);
          },
        }),
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "RECEIPT",
      reason: "SYNTHETIC_BUILD_RECEIPT_MISMATCH",
    });

    const wrongBytes = fixture.artifactBytes.slice();
    wrongBytes[wrongBytes.byteLength - 1] =
      (wrongBytes[wrongBytes.byteLength - 1] ?? 0) ^ 1;
    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        sourceReviewEvidence: sourceReview.sourceReviewEvidence,
        recipeInspection,
        provider: fixtureBuildOutputProvider(fixture, {
          outputBytes: wrongBytes,
        }),
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "OUTPUT_DIGEST",
      reason: "SYNTHETIC_BUILD_OUTPUT_DIGEST_MISMATCH",
    });

    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        sourceReviewEvidence: sourceReview.sourceReviewEvidence,
        recipeInspection,
        provider: {
          assurance: "SYNTHETIC_ONLY",
          async produceFixtureBuildOutput(_request, emitChunk) {
            emitChunk(new Uint8Array());
            throw new Error("unreachable");
          },
        },
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "OUTPUT_STREAM",
      reason: "SYNTHETIC_BUILD_OUTPUT_CHUNK_INVALID",
    });

    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        sourceReviewEvidence: sourceReview.sourceReviewEvidence,
        recipeInspection,
        provider: fixtureBuildOutputProvider(fixture),
        digestProvider,
        signal: { aborted: true },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("maps every bounded recipe wire failure and rejects mismatched input identities", async () => {
    const variants: readonly {
      readonly keyId: string;
      readonly transform: (bytes: Uint8Array) => Uint8Array;
      readonly reason: string;
    }[] = [
      {
        keyId: "synthetic:build-recipe-duplicate",
        transform: (bytes) =>
          textEncoder.encode(
            new TextDecoder()
              .decode(bytes)
              .replace(
                '"buildRecipeSchema":"1"',
                '"buildRecipeSchema":"1","buildRecipeSchema":"1"',
              ),
          ),
        reason: "SYNTHETIC_BUILD_RECIPE_DUPLICATE_KEY",
      },
      {
        keyId: "synthetic:build-recipe-depth",
        transform: () => textEncoder.encode("[[[[[[0]]]]]]"),
        reason: "SYNTHETIC_BUILD_RECIPE_LIMIT_EXCEEDED",
      },
      {
        keyId: "synthetic:build-recipe-number",
        transform: (bytes) =>
          textEncoder.encode(
            new TextDecoder()
              .decode(bytes)
              .replace('"releaseSequence":7', '"releaseSequence":7.0'),
          ),
        reason: "SYNTHETIC_BUILD_RECIPE_UNSAFE_NUMBER",
      },
      {
        keyId: "synthetic:build-recipe-utf8",
        transform: () => new Uint8Array([0xff]),
        reason: "SYNTHETIC_BUILD_RECIPE_INVALID_UNICODE",
      },
      {
        keyId: "synthetic:build-recipe-json",
        transform: (bytes) => bytes.slice(0, -1),
        reason: "SYNTHETIC_BUILD_RECIPE_JSON_INVALID",
      },
      {
        keyId: "synthetic:build-recipe-schema",
        transform: (bytes) =>
          textEncoder.encode(
            new TextDecoder()
              .decode(bytes)
              .replace('"buildRecipeSchema":"1"', '"buildRecipeSchema":"2"'),
          ),
        reason: "SYNTHETIC_BUILD_RECIPE_SCHEMA_INVALID",
      },
      {
        keyId: "synthetic:build-recipe-input",
        transform: (bytes) => {
          const output = bytes.slice();
          const shaKey = textEncoder.encode('"sha256":"');
          const shaOffset = findBytes(output, shaKey);
          expect(shaOffset).toBeGreaterThanOrEqual(0);
          const valueOffset = shaOffset + shaKey.byteLength;
          output[valueOffset] = output[valueOffset] === 0x30 ? 0x31 : 0x30;
          return output;
        },
        reason: "SYNTHETIC_BUILD_RECIPE_INPUT_MISMATCH",
      },
    ];

    for (const variant of variants) {
      const context = await createBuildEvidenceFixture(variant.keyId, {
        transformBuildRecipe: variant.transform,
      });
      expect(context.recipeInspection).toEqual({
        status: "BLOCKED",
        stage:
          variant.reason === "SYNTHETIC_BUILD_RECIPE_INPUT_MISMATCH"
            ? "SOURCE_LINKAGE"
            : "RECIPE_SCHEMA",
        reason: variant.reason,
      });
    }
  });

  it("rejects invalid recipe bytes and every digest-provider failure mode", async () => {
    const context = await createBuildEvidenceFixture(
      "synthetic:build-recipe-digest",
    );
    const run = (
      buildRecipeBytes: Uint8Array,
      candidateDigestProvider: FirmwareArtifactDigestProvider,
    ) =>
      inspectSyntheticFirmwareBuildRecipe({
        sourceReviewEvidence: context.sourceReview.sourceReviewEvidence,
        buildRecipeBytes,
        digestProvider: candidateDigestProvider,
      });

    await expect(run(new Uint8Array(), digestProvider)).resolves.toEqual({
      status: "BLOCKED",
      stage: "RECIPE_INPUT",
      reason: "SYNTHETIC_BUILD_RECIPE_BYTES_INVALID",
    });
    await expect(
      run(new Uint8Array(64 * 1024 + 1), digestProvider),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "RECIPE_INPUT",
      reason: "SYNTHETIC_BUILD_RECIPE_BYTES_INVALID",
    });
    await expect(
      run(context.fixture.buildRecipeBytes.slice(0, -1), digestProvider),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "RECIPE_INPUT",
      reason: "SYNTHETIC_BUILD_RECIPE_SIZE_MISMATCH",
    });
    await expect(
      run(context.fixture.buildRecipeBytes, {
        assurance: "CRYPTOGRAPHIC",
      } as FirmwareArtifactDigestProvider),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "RECIPE_INPUT",
      reason: "SYNTHETIC_BUILD_RECIPE_DIGEST_PROVIDER_INVALID",
    });
    await expect(
      run(context.fixture.buildRecipeBytes, {
        assurance: "CRYPTOGRAPHIC",
        async digestSha256() {
          throw new Error("synthetic digest failure");
        },
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "RECIPE_INPUT",
      reason: "SYNTHETIC_BUILD_RECIPE_DIGEST_FAILED",
    });
    await expect(
      run(context.fixture.buildRecipeBytes, {
        assurance: "CRYPTOGRAPHIC",
        async digestSha256() {
          return "not-a-canonical-digest";
        },
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "RECIPE_INPUT",
      reason: "SYNTHETIC_BUILD_RECIPE_DIGEST_INVALID",
    });
    await expect(
      inspectSyntheticFirmwareBuildRecipe({
        sourceReviewEvidence: context.sourceReview.sourceReviewEvidence,
        buildRecipeBytes: context.fixture.buildRecipeBytes,
        digestProvider,
        signal: { aborted: true },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects invalid build providers, oversized streams, and incomplete output", async () => {
    const context = await createBuildEvidenceFixture(
      "synthetic:build-provider-failures",
    );
    const base = {
      sourceReviewEvidence: context.sourceReview.sourceReviewEvidence,
      recipeInspection: context.recipeInspection,
      digestProvider,
    } as const;

    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        ...base,
        provider: {
          assurance: "SYNTHETIC_ONLY",
        } as SyntheticFirmwareFixtureBuildOutputProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "PROVIDER",
      reason: "SYNTHETIC_BUILD_OUTPUT_PROVIDER_INVALID",
    });

    let providerCalled = false;
    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        ...base,
        provider: {
          assurance: "SYNTHETIC_ONLY",
          async produceFixtureBuildOutput() {
            providerCalled = true;
            throw new Error("must not run");
          },
        },
        digestProvider: {
          assurance: "CRYPTOGRAPHIC",
        } as FirmwareArtifactDigestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "PROVIDER",
      reason: "SYNTHETIC_BUILD_OUTPUT_DIGEST_PROVIDER_INVALID",
    });
    expect(providerCalled).toBe(false);

    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        ...base,
        provider: {
          assurance: "SYNTHETIC_ONLY",
          async produceFixtureBuildOutput() {
            throw new Error("synthetic provider failure");
          },
        },
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "OUTPUT_STREAM",
      reason: "SYNTHETIC_BUILD_OUTPUT_PROVIDER_FAILED",
    });

    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        ...base,
        provider: {
          assurance: "SYNTHETIC_ONLY",
          async produceFixtureBuildOutput(_request, emitChunk) {
            emitChunk(new Uint8Array(64 * 1024 + 1));
            throw new Error("unreachable");
          },
        },
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "OUTPUT_STREAM",
      reason: "SYNTHETIC_BUILD_OUTPUT_CHUNK_SIZE_LIMIT_EXCEEDED",
    });

    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        ...base,
        provider: {
          assurance: "SYNTHETIC_ONLY",
          async produceFixtureBuildOutput(request, emitChunk) {
            const bytes = context.fixture.artifactBytes.slice(0, -1);
            emitChunk(bytes);
            return {
              receiptSchema: "1",
              receiptType: "synthetic-firmware-fixture-build-receipt",
              targetIdentifier: request.targetIdentifier,
              releaseSequence: request.releaseSequence,
              recipeSha256: request.recipe.sha256,
              declaredInputCount: 6,
              outputName: request.expectedOutput.name,
              outputMediaType: request.expectedOutput.mediaType,
              outputSizeBytes: bytes.byteLength,
              outputSha256: request.expectedOutput.sha256,
            };
          },
        },
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "OUTPUT_STREAM",
      reason: "SYNTHETIC_BUILD_OUTPUT_SIZE_MISMATCH",
    });
  });

  it("enforces the build-output chunk count and preserves the first sink failure", async () => {
    const context = await createBuildEvidenceFixture(
      "synthetic:build-chunk-count",
      { executablePayloadSizeBytes: 5_000 },
    );
    const base = {
      sourceReviewEvidence: context.sourceReview.sourceReviewEvidence,
      recipeInspection: context.recipeInspection,
      digestProvider,
    } as const;
    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        ...base,
        provider: {
          assurance: "SYNTHETIC_ONLY",
          async produceFixtureBuildOutput(_request, emitChunk) {
            for (let index = 0; index <= 4_096; index += 1) {
              emitChunk(new Uint8Array([index & 0xff]));
            }
            throw new Error("unreachable");
          },
        },
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "OUTPUT_STREAM",
      reason: "SYNTHETIC_BUILD_OUTPUT_CHUNK_LIMIT_EXCEEDED",
    });

    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        ...base,
        provider: {
          assurance: "SYNTHETIC_ONLY",
          async produceFixtureBuildOutput(_request, emitChunk) {
            try {
              emitChunk(new Uint8Array());
            } catch {
              // Exercise a hostile provider that suppresses the first sink error.
            }
            emitChunk(new Uint8Array([1]));
            throw new Error("unreachable");
          },
        },
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "OUTPUT_STREAM",
      reason: "SYNTHETIC_BUILD_OUTPUT_CHUNK_INVALID",
    });
  });

  it("rejects accessor receipts and sanitizes output-digest failures", async () => {
    const context = await createBuildEvidenceFixture(
      "synthetic:build-receipt-digest",
    );
    const base = {
      sourceReviewEvidence: context.sourceReview.sourceReviewEvidence,
      recipeInspection: context.recipeInspection,
    } as const;
    let receiptGetterExecuted = false;
    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        ...base,
        provider: fixtureBuildOutputProvider(context.fixture, {
          mutateReceipt(receipt) {
            delete receipt.outputName;
            Object.defineProperty(receipt, "outputName", {
              enumerable: true,
              get() {
                receiptGetterExecuted = true;
                return "synthetic-firmware.bin.gz";
              },
            });
          },
        }),
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "RECEIPT",
      reason: "SYNTHETIC_BUILD_RECEIPT_INVALID",
    });
    expect(receiptGetterExecuted).toBe(false);

    for (const failure of [
      {
        provider: {
          assurance: "CRYPTOGRAPHIC" as const,
          async digestSha256() {
            throw new Error("synthetic output digest failure");
          },
        },
        reason: "SYNTHETIC_BUILD_OUTPUT_DIGEST_FAILED",
      },
      {
        provider: {
          assurance: "CRYPTOGRAPHIC" as const,
          async digestSha256() {
            return "invalid";
          },
        },
        reason: "SYNTHETIC_BUILD_OUTPUT_DIGEST_INVALID",
      },
    ] as const) {
      await expect(
        compareSyntheticFirmwareFixtureBuildOutput({
          ...base,
          provider: fixtureBuildOutputProvider(context.fixture),
          digestProvider: failure.provider,
        }),
      ).resolves.toEqual({
        status: "BLOCKED",
        stage: "OUTPUT_DIGEST",
        reason: failure.reason,
      });
    }
  });

  it("ignores late fixture output after completion", async () => {
    const context = await createBuildEvidenceFixture(
      "synthetic:build-late-output",
    );
    let lateSink: SyntheticFirmwareBuildOutputChunkSink | undefined;
    const result = await compareSyntheticFirmwareFixtureBuildOutput({
      sourceReviewEvidence: context.sourceReview.sourceReviewEvidence,
      recipeInspection: context.recipeInspection,
      provider: {
        assurance: "SYNTHETIC_ONLY",
        async produceFixtureBuildOutput(request, emitChunk) {
          lateSink = emitChunk;
          emitChunk(context.fixture.artifactBytes);
          return {
            receiptSchema: "1",
            receiptType: "synthetic-firmware-fixture-build-receipt",
            targetIdentifier: request.targetIdentifier,
            releaseSequence: request.releaseSequence,
            recipeSha256: request.recipe.sha256,
            declaredInputCount: 6,
            outputName: request.expectedOutput.name,
            outputMediaType: request.expectedOutput.mediaType,
            outputSizeBytes: context.fixture.artifactBytes.byteLength,
            outputSha256: request.expectedOutput.sha256,
          };
        },
      },
      digestProvider,
    });
    expect(result).toMatchObject({
      status: "SYNTHETIC_FIRMWARE_BUILD_OUTPUT_COMPARISON_EVIDENCE",
    });
    expect(() => lateSink?.(new Uint8Array([1]))).not.toThrow();
  });

  it("requires branded matching recipe evidence and never executes accessors", async () => {
    const fixture = await createFixture();
    const key = await createTestKey("synthetic:build-branding");
    const root = requireRoot(rootPayload([key]));
    const sourceReview = await createSourceReviewFixture({
      fixture,
      key,
      root,
    });
    const recipeInspection = await inspectSyntheticFirmwareBuildRecipe({
      sourceReviewEvidence: sourceReview.sourceReviewEvidence,
      buildRecipeBytes: fixture.buildRecipeBytes,
      digestProvider,
    });
    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        sourceReviewEvidence: sourceReview.sourceReviewEvidence,
        recipeInspection: { ...recipeInspection },
        provider: fixtureBuildOutputProvider(fixture),
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "EVIDENCE",
      reason: "SYNTHETIC_BUILD_RECIPE_INSPECTION_NOT_PROVEN",
    });

    const other = await createBuildEvidenceFixture(
      "synthetic:build-cross-wired",
    );
    await expect(
      compareSyntheticFirmwareFixtureBuildOutput({
        sourceReviewEvidence: sourceReview.sourceReviewEvidence,
        recipeInspection: other.recipeInspection,
        provider: fixtureBuildOutputProvider(fixture),
        digestProvider,
      }),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "EVIDENCE",
      reason: "SYNTHETIC_BUILD_COMPARISON_EVIDENCE_MISMATCH",
    });

    let getterExecuted = false;
    const comparisonInput = Object.create(null) as Record<string, unknown>;
    for (const field of [
      "sourceReviewEvidence",
      "recipeInspection",
      "provider",
      "digestProvider",
    ]) {
      Object.defineProperty(comparisonInput, field, {
        enumerable: true,
        get() {
          getterExecuted = true;
          return {};
        },
      });
    }
    await expect(
      compareSyntheticFirmwareFixtureBuildOutput(
        comparisonInput as Parameters<
          typeof compareSyntheticFirmwareFixtureBuildOutput
        >[0],
      ),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "EVIDENCE",
      reason: "SYNTHETIC_SOURCE_REVIEW_EVIDENCE_NOT_PROVEN",
    });
    expect(getterExecuted).toBe(false);

    const recipeInput = Object.create(null) as Record<string, unknown>;
    for (const field of [
      "sourceReviewEvidence",
      "buildRecipeBytes",
      "digestProvider",
    ]) {
      Object.defineProperty(recipeInput, field, {
        enumerable: true,
        get() {
          getterExecuted = true;
          return {};
        },
      });
    }
    await expect(
      inspectSyntheticFirmwareBuildRecipe(
        recipeInput as Parameters<
          typeof inspectSyntheticFirmwareBuildRecipe
        >[0],
      ),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "SOURCE_REVIEW_EVIDENCE",
      reason: "SYNTHETIC_SOURCE_REVIEW_EVIDENCE_NOT_PROVEN",
    });
    expect(getterExecuted).toBe(false);
  });

  it("never invokes accessors while inspecting or joining source evidence", async () => {
    let getterExecuted = false;
    const sourceInput = Object.create(null) as Record<string, unknown>;
    for (const key of [
      "distributionRootVerification",
      "compressedSourceBytes",
      "digestProvider",
      "decompressionProvider",
    ]) {
      Object.defineProperty(sourceInput, key, {
        enumerable: true,
        get() {
          getterExecuted = true;
          return {};
        },
      });
    }
    await expect(
      inspectSyntheticCorrespondingSourceArchive(
        sourceInput as Parameters<
          typeof inspectSyntheticCorrespondingSourceArchive
        >[0],
      ),
    ).resolves.toEqual({
      status: "BLOCKED",
      stage: "DISTRIBUTION_EVIDENCE",
      reason: "SYNTHETIC_DISTRIBUTION_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
    });
    expect(getterExecuted).toBe(false);

    const joinInput = Object.create(null) as Record<string, unknown>;
    for (const key of [
      "distributionCandidate",
      "sourceInspection",
      "noticesInspection",
    ]) {
      Object.defineProperty(joinInput, key, {
        enumerable: true,
        get() {
          getterExecuted = true;
          return {};
        },
      });
    }
    expect(
      createSyntheticFirmwareSourceReviewEvidence(
        joinInput as Parameters<
          typeof createSyntheticFirmwareSourceReviewEvidence
        >[0],
      ),
    ).toEqual({
      status: "BLOCKED",
      reason: "SYNTHETIC_DISTRIBUTION_CANDIDATE_NOT_PROVEN",
    });
    expect(getterExecuted).toBe(false);
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
