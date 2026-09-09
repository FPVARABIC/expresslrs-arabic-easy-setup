import {
  currentArtifactManifestTrustStatus,
  firmwareManifestSignatureVerifierAssurances,
  maximumCompressedFirmwareArtifactSizeBytes,
  maximumSyntheticCorrespondingSourceBundleSizeBytes,
  maximumSyntheticNoticeBundleSizeBytes,
  signedFirmwareManifestCanonicalization,
  signedFirmwareManifestSignatureAlgorithm,
  signedSyntheticFirmwareDistributionManifestSchemaVersion,
  syntheticFirmwareDistributionManifestType,
  type ArtifactManifestTrustStatus,
  type CancellationSignal,
  type FirmwareManifestSignatureVerification,
  type FirmwareManifestSignatureVerifier,
  type FirmwareManifestSignatureVerifierAssurance,
  type SignedSyntheticFirmwareDistributionManifestEnvelopeV1,
  type SyntheticFirmwareDistributionManifestPayloadV1,
  type SyntheticFirmwareDistributionObjectV1,
} from "@elrs-easy/domain";

import {
  BoundedJsonError,
  canonicalizeBoundedJson,
  parseBoundedJson,
  type BoundedJsonLimits,
  type BoundedJsonValue,
} from "./bounded-json.js";
import { syntheticDistributionManifestParseRecords } from "./firmware-trust-internals.js";
import {
  assertNotAborted,
  copyExactUint8Array,
  isAbortError,
  readDataMethod,
  readOwnDataProperty,
} from "./sensitive-operation-helpers.js";

export const maximumSignedSyntheticFirmwareDistributionManifestBytes =
  16 * 1024;
export const signedSyntheticFirmwareDistributionManifestDomain =
  "ELRS-EASY-SYNTHETIC-DISTRIBUTION-MANIFEST-V1\n" as const;

export const signedSyntheticFirmwareDistributionManifestParseBlockReasons = [
  "SYNTHETIC_DISTRIBUTION_MANIFEST_JSON_INVALID",
  "SYNTHETIC_DISTRIBUTION_MANIFEST_DUPLICATE_KEY",
  "SYNTHETIC_DISTRIBUTION_MANIFEST_LIMIT_EXCEEDED",
  "SYNTHETIC_DISTRIBUTION_MANIFEST_UNSAFE_NUMBER",
  "SYNTHETIC_DISTRIBUTION_MANIFEST_INVALID_UNICODE",
  "SYNTHETIC_DISTRIBUTION_MANIFEST_SCHEMA_INVALID",
] as const;

export type SignedSyntheticFirmwareDistributionManifestParseBlockReason =
  (typeof signedSyntheticFirmwareDistributionManifestParseBlockReasons)[number];

export type ParsedSignedSyntheticFirmwareDistributionManifest = Readonly<{
  status: "PARSED_UNTRUSTED";
  manifest: SignedSyntheticFirmwareDistributionManifestEnvelopeV1;
  trustStatus: ArtifactManifestTrustStatus;
  copySignatureInput: () => Uint8Array;
}>;

export type SignedSyntheticFirmwareDistributionManifestParseResult =
  | ParsedSignedSyntheticFirmwareDistributionManifest
  | Readonly<{
      status: "BLOCKED";
      reason: SignedSyntheticFirmwareDistributionManifestParseBlockReason;
    }>;

export interface SyntheticFirmwareDistributionManifestVerificationKey {
  readonly assurance: "SYNTHETIC_ONLY";
  readonly keyId: string;
  readonly rawPublicKey: Uint8Array;
}

export const syntheticFirmwareDistributionManifestSignatureBlockReasons = [
  "SYNTHETIC_DISTRIBUTION_MANIFEST_NOT_FROM_PARSER",
  "SYNTHETIC_DISTRIBUTION_MANIFEST_KEY_INVALID",
  "SYNTHETIC_DISTRIBUTION_MANIFEST_KEY_ID_MISMATCH",
  "SYNTHETIC_DISTRIBUTION_MANIFEST_SIGNATURE_VERIFIER_INVALID",
  "SYNTHETIC_DISTRIBUTION_MANIFEST_SIGNATURE_VERIFICATION_FAILED",
  "SYNTHETIC_DISTRIBUTION_MANIFEST_SIGNATURE_INVALID",
] as const;

export type SyntheticFirmwareDistributionManifestSignatureBlockReason =
  (typeof syntheticFirmwareDistributionManifestSignatureBlockReasons)[number];

export type SyntheticFirmwareDistributionManifestSignatureResult =
  | Readonly<{
      status: "VERIFIED_UNTRUSTED";
      verification: FirmwareManifestSignatureVerification;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticFirmwareDistributionManifestSignatureBlockReason;
    }>;

const manifestJsonLimits: BoundedJsonLimits = Object.freeze({
  maximumUtf8Bytes: maximumSignedSyntheticFirmwareDistributionManifestBytes,
  maximumDepth: 7,
  maximumStringCodeUnits: 1_024,
  maximumArrayElements: 8,
  maximumObjectMembers: 24,
  maximumTotalValues: 128,
});

const payloadFields = [
  "distributionSchema",
  "manifestType",
  "channel",
  "targetIdentifier",
  "releaseSequence",
  "artifact",
  "correspondingSource",
  "notices",
  "signingRole",
  "requiredRootMetadataVersion",
] as const;
const objectFields = [
  "objectRole",
  "name",
  "url",
  "mediaType",
  "sizeBytes",
  "sha256",
] as const;

const canonicalSha256Pattern = /^[0-9a-f]{64}$/u;
const targetIdentifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const syntheticKeyIdPattern = /^synthetic:[a-z0-9][a-z0-9._-]{0,111}$/u;
const artifactNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,124}\.gz$/u;
const sourceNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.tar\.gz$/u;
const noticesNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,116}\.notices\.json$/u;
const base64UrlAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const utf8Encoder = new TextEncoder();

function isJsonObject(
  value: BoundedJsonValue,
): value is { [key: string]: BoundedJsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactFields<const TFields extends readonly string[]>(
  value: BoundedJsonValue,
  fields: TFields,
): value is { [TField in TFields[number]]: BoundedJsonValue } {
  if (!isJsonObject(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

function isPositiveSafeInteger(value: BoundedJsonValue): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isCanonicalSyntheticUrl(value: string, name: string): boolean {
  if (!/^[\x21-\x7e]+$/u.test(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.hostname.endsWith(".invalid") &&
      parsed.href === value &&
      parsed.pathname.endsWith(`/${name}`)
    );
  } catch {
    return false;
  }
}

function rebuildObject(input: {
  readonly value: BoundedJsonValue;
  readonly objectRole: "firmware-artifact" | "corresponding-source" | "notices";
  readonly mediaType: "application/gzip" | "application/json";
  readonly namePattern: RegExp;
  readonly minimumSizeBytes: number;
  readonly maximumSizeBytes: number;
}): SyntheticFirmwareDistributionObjectV1 | null {
  const value = input.value;
  if (
    !hasExactFields(value, objectFields) ||
    value.objectRole !== input.objectRole ||
    typeof value.name !== "string" ||
    !input.namePattern.test(value.name) ||
    typeof value.url !== "string" ||
    !isCanonicalSyntheticUrl(value.url, value.name) ||
    value.mediaType !== input.mediaType ||
    !isPositiveSafeInteger(value.sizeBytes) ||
    value.sizeBytes < input.minimumSizeBytes ||
    value.sizeBytes > input.maximumSizeBytes ||
    typeof value.sha256 !== "string" ||
    !canonicalSha256Pattern.test(value.sha256)
  ) {
    return null;
  }
  return Object.freeze({
    objectRole: value.objectRole,
    name: value.name,
    url: value.url,
    mediaType: value.mediaType,
    sizeBytes: value.sizeBytes,
    sha256: value.sha256,
  });
}

function rebuildPayload(
  value: BoundedJsonValue,
): SyntheticFirmwareDistributionManifestPayloadV1 | null {
  if (
    !hasExactFields(value, payloadFields) ||
    value.distributionSchema !==
      signedSyntheticFirmwareDistributionManifestSchemaVersion ||
    value.manifestType !== syntheticFirmwareDistributionManifestType ||
    value.channel !== "synthetic" ||
    typeof value.targetIdentifier !== "string" ||
    !targetIdentifierPattern.test(value.targetIdentifier) ||
    !isPositiveSafeInteger(value.releaseSequence) ||
    value.signingRole !== "synthetic" ||
    !isPositiveSafeInteger(value.requiredRootMetadataVersion)
  ) {
    return null;
  }

  const artifact = rebuildObject({
    value: value.artifact,
    objectRole: "firmware-artifact",
    mediaType: "application/gzip",
    namePattern: artifactNamePattern,
    minimumSizeBytes: 18,
    maximumSizeBytes: maximumCompressedFirmwareArtifactSizeBytes,
  });
  const correspondingSource = rebuildObject({
    value: value.correspondingSource,
    objectRole: "corresponding-source",
    mediaType: "application/gzip",
    namePattern: sourceNamePattern,
    minimumSizeBytes: 18,
    maximumSizeBytes: maximumSyntheticCorrespondingSourceBundleSizeBytes,
  });
  const notices = rebuildObject({
    value: value.notices,
    objectRole: "notices",
    mediaType: "application/json",
    namePattern: noticesNamePattern,
    minimumSizeBytes: 2,
    maximumSizeBytes: maximumSyntheticNoticeBundleSizeBytes,
  });
  if (artifact === null || correspondingSource === null || notices === null) {
    return null;
  }

  const origins = [artifact.url, correspondingSource.url, notices.url].map(
    (url) => new URL(url).origin,
  );
  if (!origins.every((origin) => origin === origins[0])) {
    return null;
  }
  const objectNames = new Set([
    artifact.name,
    correspondingSource.name,
    notices.name,
  ]);
  const objectUrls = new Set([
    artifact.url,
    correspondingSource.url,
    notices.url,
  ]);
  if (objectNames.size !== 3 || objectUrls.size !== 3) {
    return null;
  }

  return Object.freeze({
    distributionSchema: value.distributionSchema,
    manifestType: value.manifestType,
    channel: value.channel,
    targetIdentifier: value.targetIdentifier,
    releaseSequence: value.releaseSequence,
    artifact:
      artifact as SyntheticFirmwareDistributionManifestPayloadV1["artifact"],
    correspondingSource:
      correspondingSource as SyntheticFirmwareDistributionManifestPayloadV1["correspondingSource"],
    notices:
      notices as SyntheticFirmwareDistributionManifestPayloadV1["notices"],
    signingRole: value.signingRole,
    requiredRootMetadataVersion: value.requiredRootMetadataVersion,
  });
}

function encodeBase64Url(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += base64UrlAlphabet[first >> 2];
    result += base64UrlAlphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      result += base64UrlAlphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) {
      result += base64UrlAlphabet[third & 0x3f];
    }
  }
  return result;
}

function decodeCanonicalBase64Url(
  value: BoundedJsonValue,
  expectedByteLength: number,
): Uint8Array | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("=") ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    return null;
  }
  const decoded: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  for (const character of value) {
    const digit = base64UrlAlphabet.indexOf(character);
    if (digit < 0) {
      return null;
    }
    bitBuffer = (bitBuffer << 6) | digit;
    bitCount += 6;
    while (bitCount >= 8) {
      bitCount -= 8;
      decoded.push((bitBuffer >> bitCount) & 0xff);
      bitBuffer &= (1 << bitCount) - 1;
    }
  }
  if (bitBuffer !== 0 || decoded.length !== expectedByteLength) {
    return null;
  }
  const bytes = Uint8Array.from(decoded);
  return encodeBase64Url(bytes) === value ? bytes : null;
}

function mapJsonFailure(
  error: BoundedJsonError,
): SignedSyntheticFirmwareDistributionManifestParseBlockReason {
  switch (error.code) {
    case "DUPLICATE_KEY":
      return "SYNTHETIC_DISTRIBUTION_MANIFEST_DUPLICATE_KEY";
    case "LIMIT_EXCEEDED":
      return "SYNTHETIC_DISTRIBUTION_MANIFEST_LIMIT_EXCEEDED";
    case "UNSAFE_NUMBER":
      return "SYNTHETIC_DISTRIBUTION_MANIFEST_UNSAFE_NUMBER";
    case "INVALID_UNICODE":
      return "SYNTHETIC_DISTRIBUTION_MANIFEST_INVALID_UNICODE";
    case "INVALID_JSON":
      return "SYNTHETIC_DISTRIBUTION_MANIFEST_JSON_INVALID";
  }
}

function blockedParse(
  reason: SignedSyntheticFirmwareDistributionManifestParseBlockReason,
): SignedSyntheticFirmwareDistributionManifestParseResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/** Parses only the exact Synthetic distribution wire format and grants no trust. */
export function parseSignedSyntheticFirmwareDistributionManifest(
  source: string,
): SignedSyntheticFirmwareDistributionManifestParseResult {
  if (typeof source !== "string") {
    return blockedParse("SYNTHETIC_DISTRIBUTION_MANIFEST_JSON_INVALID");
  }
  let parsed: BoundedJsonValue;
  try {
    parsed = parseBoundedJson(source, manifestJsonLimits);
  } catch (error: unknown) {
    return blockedParse(
      error instanceof BoundedJsonError
        ? mapJsonFailure(error)
        : "SYNTHETIC_DISTRIBUTION_MANIFEST_JSON_INVALID",
    );
  }

  if (
    !hasExactFields(parsed, [
      "schemaVersion",
      "canonicalization",
      "payload",
      "signature",
    ]) ||
    parsed.schemaVersion !==
      signedSyntheticFirmwareDistributionManifestSchemaVersion ||
    parsed.canonicalization !== signedFirmwareManifestCanonicalization ||
    !hasExactFields(parsed.signature, [
      "algorithm",
      "keyId",
      "signatureBase64Url",
    ]) ||
    parsed.signature.algorithm !== signedFirmwareManifestSignatureAlgorithm ||
    typeof parsed.signature.keyId !== "string" ||
    !syntheticKeyIdPattern.test(parsed.signature.keyId) ||
    typeof parsed.signature.signatureBase64Url !== "string"
  ) {
    return blockedParse("SYNTHETIC_DISTRIBUTION_MANIFEST_SCHEMA_INVALID");
  }

  const payload = rebuildPayload(parsed.payload);
  const signature = decodeCanonicalBase64Url(
    parsed.signature.signatureBase64Url,
    64,
  );
  if (payload === null || signature === null) {
    return blockedParse("SYNTHETIC_DISTRIBUTION_MANIFEST_SCHEMA_INVALID");
  }

  const unsignedEnvelope = Object.assign(
    Object.create(null) as { [key: string]: BoundedJsonValue },
    {
      schemaVersion: parsed.schemaVersion,
      canonicalization: parsed.canonicalization,
      payload: parsed.payload,
    },
  );
  const signatureInput = utf8Encoder.encode(
    `${signedSyntheticFirmwareDistributionManifestDomain}${canonicalizeBoundedJson(unsignedEnvelope)}`,
  );
  const manifest: SignedSyntheticFirmwareDistributionManifestEnvelopeV1 =
    Object.freeze({
      schemaVersion: parsed.schemaVersion,
      canonicalization: parsed.canonicalization,
      payload,
      signature: Object.freeze({
        algorithm: parsed.signature.algorithm,
        keyId: parsed.signature.keyId,
        signatureBase64Url: parsed.signature.signatureBase64Url,
      }),
    });
  const result: ParsedSignedSyntheticFirmwareDistributionManifest =
    Object.freeze({
      status: "PARSED_UNTRUSTED",
      manifest,
      trustStatus: currentArtifactManifestTrustStatus,
      copySignatureInput: () => signatureInput.slice(),
    });
  syntheticDistributionManifestParseRecords.set(result, {
    keyId: parsed.signature.keyId,
    signature: signature.slice(),
    signatureInput: signatureInput.slice(),
    requiredRootMetadataVersion: payload.requiredRootMetadataVersion,
    targetIdentifier: payload.targetIdentifier,
    releaseSequence: payload.releaseSequence,
    artifact: payload.artifact,
    correspondingSource: payload.correspondingSource,
    notices: payload.notices,
  });
  return result;
}

function isVerifierAssurance(
  value: unknown,
): value is FirmwareManifestSignatureVerifierAssurance {
  return firmwareManifestSignatureVerifierAssurances.some(
    (assurance) => assurance === value,
  );
}

function blockedVerification(
  reason: SyntheticFirmwareDistributionManifestSignatureBlockReason,
): SyntheticFirmwareDistributionManifestSignatureResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/** Exercises Ed25519 mechanics without admitting the Synthetic key. */
export async function verifySyntheticFirmwareDistributionManifestSignature(input: {
  readonly parsed: ParsedSignedSyntheticFirmwareDistributionManifest;
  readonly key: SyntheticFirmwareDistributionManifestVerificationKey;
  readonly verifier: FirmwareManifestSignatureVerifier;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticFirmwareDistributionManifestSignatureResult> {
  const parsedRecord =
    typeof input.parsed === "object" && input.parsed !== null
      ? syntheticDistributionManifestParseRecords.get(input.parsed)
      : undefined;
  if (parsedRecord === undefined) {
    return blockedVerification(
      "SYNTHETIC_DISTRIBUTION_MANIFEST_NOT_FROM_PARSER",
    );
  }

  const keyAssurance = readOwnDataProperty(input.key, "assurance");
  const keyId = readOwnDataProperty(input.key, "keyId");
  const rawPublicKey = copyExactUint8Array(
    readOwnDataProperty(input.key, "rawPublicKey"),
  );
  if (
    keyAssurance !== "SYNTHETIC_ONLY" ||
    typeof keyId !== "string" ||
    !syntheticKeyIdPattern.test(keyId) ||
    rawPublicKey?.byteLength !== 32
  ) {
    return blockedVerification("SYNTHETIC_DISTRIBUTION_MANIFEST_KEY_INVALID");
  }
  if (keyId !== parsedRecord.keyId) {
    return blockedVerification(
      "SYNTHETIC_DISTRIBUTION_MANIFEST_KEY_ID_MISMATCH",
    );
  }

  const verifierAssurance = readOwnDataProperty(input.verifier, "assurance");
  const verifyEd25519 = readDataMethod(input.verifier, "verifyEd25519");
  if (!isVerifierAssurance(verifierAssurance) || verifyEd25519 === null) {
    return blockedVerification(
      "SYNTHETIC_DISTRIBUTION_MANIFEST_SIGNATURE_VERIFIER_INVALID",
    );
  }

  let valid: unknown;
  try {
    assertNotAborted(input.signal);
    valid = await Reflect.apply(verifyEd25519, input.verifier, [
      parsedRecord.signatureInput.slice(),
      parsedRecord.signature.slice(),
      rawPublicKey.slice(),
      input.signal,
    ]);
    assertNotAborted(input.signal);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }
    return blockedVerification(
      "SYNTHETIC_DISTRIBUTION_MANIFEST_SIGNATURE_VERIFICATION_FAILED",
    );
  }
  if (valid !== true) {
    return blockedVerification(
      "SYNTHETIC_DISTRIBUTION_MANIFEST_SIGNATURE_INVALID",
    );
  }

  const verification: FirmwareManifestSignatureVerification = Object.freeze({
    status: "VALID_UNTRUSTED",
    algorithm: signedFirmwareManifestSignatureAlgorithm,
    assurance: verifierAssurance,
    keyAssurance,
    keyId,
    trustStatus: currentArtifactManifestTrustStatus,
  });
  return Object.freeze({ status: "VERIFIED_UNTRUSTED", verification });
}
