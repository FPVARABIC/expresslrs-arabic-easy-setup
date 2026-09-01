import {
  currentArtifactManifestTrustStatus,
  firmwareManifestSignatureVerifierAssurances,
  maximumFirmwareArtifactSizeBytes,
  signedFirmwareManifestCanonicalization,
  signedFirmwareManifestSchemaVersion,
  signedFirmwareManifestSignatureAlgorithm,
  type ArtifactManifestTrustStatus,
  type CancellationSignal,
  type FirmwareManifestBuildOption,
  type FirmwareManifestNamedDigest,
  type FirmwareManifestPlatformVersion,
  type FirmwareManifestSignatureVerification,
  type FirmwareManifestSignatureVerifier,
  type FirmwareManifestSignatureVerifierAssurance,
  type SignedFirmwareManifestEnvelope,
  type SyntheticFirmwareManifestPayloadV1,
} from "@elrs-easy/domain";

import {
  BoundedJsonError,
  canonicalizeBoundedJson,
  parseBoundedJson,
  type BoundedJsonLimits,
  type BoundedJsonValue,
} from "./bounded-json.js";
import {
  assertNotAborted,
  isAbortError,
  readOwnDataProperty,
} from "./sensitive-operation-helpers.js";

export const maximumSignedFirmwareManifestBytes = 64 * 1024;
export const signedFirmwareManifestDomain =
  "ELRS-EASY-FIRMWARE-MANIFEST-V1\n" as const;

export const signedFirmwareManifestParseBlockReasons = [
  "FIRMWARE_MANIFEST_JSON_INVALID",
  "FIRMWARE_MANIFEST_DUPLICATE_KEY",
  "FIRMWARE_MANIFEST_LIMIT_EXCEEDED",
  "FIRMWARE_MANIFEST_UNSAFE_NUMBER",
  "FIRMWARE_MANIFEST_INVALID_UNICODE",
  "FIRMWARE_MANIFEST_SCHEMA_INVALID",
] as const;

export type SignedFirmwareManifestParseBlockReason =
  (typeof signedFirmwareManifestParseBlockReasons)[number];

export type ParsedSignedFirmwareManifest = Readonly<{
  status: "PARSED_UNTRUSTED";
  manifest: SignedFirmwareManifestEnvelope<SyntheticFirmwareManifestPayloadV1>;
  trustStatus: ArtifactManifestTrustStatus;
  copySignatureInput: () => Uint8Array;
}>;

export type SignedFirmwareManifestParseResult =
  | ParsedSignedFirmwareManifest
  | Readonly<{
      status: "BLOCKED";
      reason: SignedFirmwareManifestParseBlockReason;
    }>;

export interface SyntheticFirmwareManifestVerificationKey {
  readonly assurance: "SYNTHETIC_ONLY";
  readonly keyId: string;
  readonly rawPublicKey: Uint8Array;
}

export const syntheticFirmwareManifestSignatureBlockReasons = [
  "FIRMWARE_MANIFEST_NOT_FROM_PARSER",
  "SYNTHETIC_MANIFEST_KEY_INVALID",
  "FIRMWARE_MANIFEST_KEY_ID_MISMATCH",
  "FIRMWARE_MANIFEST_SIGNATURE_VERIFIER_INVALID",
  "FIRMWARE_MANIFEST_SIGNATURE_VERIFICATION_FAILED",
  "FIRMWARE_MANIFEST_SIGNATURE_INVALID",
] as const;

export type SyntheticFirmwareManifestSignatureBlockReason =
  (typeof syntheticFirmwareManifestSignatureBlockReasons)[number];

export type SyntheticFirmwareManifestSignatureResult =
  | Readonly<{
      status: "VERIFIED_UNTRUSTED";
      verification: FirmwareManifestSignatureVerification;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticFirmwareManifestSignatureBlockReason;
    }>;

const manifestJsonLimits: BoundedJsonLimits = Object.freeze({
  maximumUtf8Bytes: maximumSignedFirmwareManifestBytes,
  maximumDepth: 8,
  maximumStringCodeUnits: 2_048,
  maximumArrayElements: 64,
  maximumObjectMembers: 64,
  maximumTotalValues: 1_024,
});

const payloadFields = [
  "manifestSchema",
  "applicationVersion",
  "coreVersion",
  "channel",
  "upstreamRepository",
  "upstreamTag",
  "upstreamFullSha",
  "upstreamSourceArchiveSha256",
  "targetsRepository",
  "targetsFullSha",
  "targetsSnapshotSha256",
  "patchSetId",
  "patches",
  "dirtyTree",
  "toolchainOrContainerDigest",
  "platformioVersion",
  "platformVersions",
  "dependencyLockDigest",
  "targetIdentifier",
  "productIdentifier",
  "mcu",
  "radio",
  "band",
  "regulatoryDomain",
  "nonSecretBuildOptions",
  "artifactName",
  "artifactMediaType",
  "artifactCompression",
  "artifactByteForm",
  "artifactSizeBytes",
  "artifactSha256",
  "buildSourceEpoch",
  "testsAndValidationLevel",
  "correspondingSourceUrl",
  "noticeBundle",
  "releaseSequence",
  "publishedAt",
  "minimumApplicationVersion",
  "minimumCoreVersion",
  "signingRole",
  "requiredRootMetadataVersion",
] as const;

const canonicalSha256Pattern = /^[0-9a-f]{64}$/u;
const canonicalGitShaPattern = /^[0-9a-f]{40}$/u;
const canonicalDigestPattern = /^sha256:[0-9a-f]{64}$/u;
const canonicalTokenPattern = /^[A-Za-z0-9][A-Za-z0-9._+:/-]{0,127}$/u;
const canonicalLowerIdentifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const syntheticKeyIdPattern = /^synthetic:[a-z0-9][a-z0-9._-]{0,111}$/u;
const artifactNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const syntheticBuildOptionNamePattern =
  /^synthetic\.[a-z0-9][a-z0-9._-]{0,63}$/u;
const base64UrlAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const exactUint8ArrayPrototype = Uint8Array.prototype;
const utf8Encoder = new TextEncoder();

interface ParsedManifestRecord {
  readonly keyId: string;
  readonly signature: Uint8Array;
  readonly signatureInput: Uint8Array;
}

const parsedManifestRecords = new WeakMap<object, ParsedManifestRecord>();

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

function isBoundedCanonicalString(
  value: BoundedJsonValue,
  maximumLength = 256,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value === value.trim()
  );
}

function isCanonicalToken(value: BoundedJsonValue): value is string {
  return typeof value === "string" && canonicalTokenPattern.test(value);
}

function isCanonicalLowerIdentifier(value: BoundedJsonValue): value is string {
  return (
    typeof value === "string" && canonicalLowerIdentifierPattern.test(value)
  );
}

function isSafeHttpsUrl(value: BoundedJsonValue): value is string {
  if (!isBoundedCanonicalString(value, 512)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0
    );
  } catch {
    return false;
  }
}

function isCanonicalUtcTimestamp(value: BoundedJsonValue): value is string {
  if (!isBoundedCanonicalString(value, 32) || !value.endsWith("Z")) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isPositiveSafeInteger(value: BoundedJsonValue): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: BoundedJsonValue): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function rebuildNamedDigests(
  value: BoundedJsonValue,
): readonly FirmwareManifestNamedDigest[] | null {
  if (!Array.isArray(value) || value.length > 32) {
    return null;
  }
  const ids = new Set<string>();
  const result: FirmwareManifestNamedDigest[] = [];
  for (const item of value) {
    if (!hasExactFields(item, ["id", "sha256"])) {
      return null;
    }
    const id = item.id;
    const sha256 = item.sha256;
    if (
      !isCanonicalToken(id) ||
      ids.has(id) ||
      typeof sha256 !== "string" ||
      !canonicalSha256Pattern.test(sha256)
    ) {
      return null;
    }
    ids.add(id);
    result.push(Object.freeze({ id, sha256 }));
  }
  return Object.freeze(result);
}

function rebuildPlatformVersions(
  value: BoundedJsonValue,
): readonly FirmwareManifestPlatformVersion[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    return null;
  }
  const names = new Set<string>();
  const result: FirmwareManifestPlatformVersion[] = [];
  for (const item of value) {
    if (!hasExactFields(item, ["name", "version"])) {
      return null;
    }
    const name = item.name;
    const version = item.version;
    if (
      !isCanonicalToken(name) ||
      names.has(name) ||
      !isCanonicalToken(version)
    ) {
      return null;
    }
    names.add(name);
    result.push(Object.freeze({ name, version }));
  }
  return Object.freeze(result);
}

function rebuildBuildOptions(
  value: BoundedJsonValue,
): readonly FirmwareManifestBuildOption[] | null {
  if (!Array.isArray(value) || value.length > 32) {
    return null;
  }
  const names = new Set<string>();
  const result: FirmwareManifestBuildOption[] = [];
  for (const item of value) {
    if (!hasExactFields(item, ["name", "value"])) {
      return null;
    }
    const name = item.name;
    const optionValue = item.value;
    if (
      typeof name !== "string" ||
      !syntheticBuildOptionNamePattern.test(name) ||
      names.has(name) ||
      !isBoundedCanonicalString(optionValue, 256)
    ) {
      return null;
    }
    names.add(name);
    result.push(Object.freeze({ name, value: optionValue }));
  }
  return Object.freeze(result);
}

function rebuildValidationLevels(
  value: BoundedJsonValue,
): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    return null;
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (!isCanonicalToken(item) || seen.has(item)) {
      return null;
    }
    seen.add(item);
    result.push(item);
  }
  return Object.freeze(result);
}

function rebuildPayload(
  value: BoundedJsonValue,
): SyntheticFirmwareManifestPayloadV1 | null {
  if (!hasExactFields(value, payloadFields)) {
    return null;
  }

  const patches = rebuildNamedDigests(value.patches);
  const platformVersions = rebuildPlatformVersions(value.platformVersions);
  const nonSecretBuildOptions = rebuildBuildOptions(
    value.nonSecretBuildOptions,
  );
  const testsAndValidationLevel = rebuildValidationLevels(
    value.testsAndValidationLevel,
  );
  const noticeBundle = value.noticeBundle;
  if (
    patches === null ||
    platformVersions === null ||
    nonSecretBuildOptions === null ||
    testsAndValidationLevel === null ||
    !hasExactFields(noticeBundle, ["url", "sha256"]) ||
    !isSafeHttpsUrl(noticeBundle.url) ||
    typeof noticeBundle.sha256 !== "string" ||
    !canonicalSha256Pattern.test(noticeBundle.sha256) ||
    value.manifestSchema !== signedFirmwareManifestSchemaVersion ||
    !isCanonicalToken(value.applicationVersion) ||
    !isCanonicalToken(value.coreVersion) ||
    value.channel !== "synthetic" ||
    !isSafeHttpsUrl(value.upstreamRepository) ||
    !isCanonicalToken(value.upstreamTag) ||
    typeof value.upstreamFullSha !== "string" ||
    !canonicalGitShaPattern.test(value.upstreamFullSha) ||
    typeof value.upstreamSourceArchiveSha256 !== "string" ||
    !canonicalSha256Pattern.test(value.upstreamSourceArchiveSha256) ||
    !isSafeHttpsUrl(value.targetsRepository) ||
    typeof value.targetsFullSha !== "string" ||
    !canonicalGitShaPattern.test(value.targetsFullSha) ||
    typeof value.targetsSnapshotSha256 !== "string" ||
    !canonicalSha256Pattern.test(value.targetsSnapshotSha256) ||
    !isCanonicalToken(value.patchSetId) ||
    typeof value.dirtyTree !== "boolean" ||
    typeof value.toolchainOrContainerDigest !== "string" ||
    !canonicalDigestPattern.test(value.toolchainOrContainerDigest) ||
    !isCanonicalToken(value.platformioVersion) ||
    typeof value.dependencyLockDigest !== "string" ||
    !canonicalDigestPattern.test(value.dependencyLockDigest) ||
    !isCanonicalLowerIdentifier(value.targetIdentifier) ||
    !isCanonicalToken(value.productIdentifier) ||
    !isCanonicalToken(value.mcu) ||
    !isCanonicalToken(value.radio) ||
    !isCanonicalToken(value.band) ||
    !isCanonicalToken(value.regulatoryDomain) ||
    typeof value.artifactName !== "string" ||
    !artifactNamePattern.test(value.artifactName) ||
    value.artifactMediaType !== "application/octet-stream" ||
    value.artifactCompression !== "none" ||
    value.artifactByteForm !== "RAW_TO_WRITE" ||
    !isPositiveSafeInteger(value.artifactSizeBytes) ||
    value.artifactSizeBytes > maximumFirmwareArtifactSizeBytes ||
    typeof value.artifactSha256 !== "string" ||
    !canonicalSha256Pattern.test(value.artifactSha256) ||
    !isNonNegativeSafeInteger(value.buildSourceEpoch) ||
    !isSafeHttpsUrl(value.correspondingSourceUrl) ||
    !isPositiveSafeInteger(value.releaseSequence) ||
    !isCanonicalUtcTimestamp(value.publishedAt) ||
    !isCanonicalToken(value.minimumApplicationVersion) ||
    !isCanonicalToken(value.minimumCoreVersion) ||
    value.signingRole !== "synthetic" ||
    !isPositiveSafeInteger(value.requiredRootMetadataVersion)
  ) {
    return null;
  }

  return Object.freeze({
    manifestSchema: value.manifestSchema,
    applicationVersion: value.applicationVersion,
    coreVersion: value.coreVersion,
    channel: value.channel,
    upstreamRepository: value.upstreamRepository,
    upstreamTag: value.upstreamTag,
    upstreamFullSha: value.upstreamFullSha,
    upstreamSourceArchiveSha256: value.upstreamSourceArchiveSha256,
    targetsRepository: value.targetsRepository,
    targetsFullSha: value.targetsFullSha,
    targetsSnapshotSha256: value.targetsSnapshotSha256,
    patchSetId: value.patchSetId,
    patches,
    dirtyTree: value.dirtyTree,
    toolchainOrContainerDigest: value.toolchainOrContainerDigest,
    platformioVersion: value.platformioVersion,
    platformVersions,
    dependencyLockDigest: value.dependencyLockDigest,
    targetIdentifier: value.targetIdentifier,
    productIdentifier: value.productIdentifier,
    mcu: value.mcu,
    radio: value.radio,
    band: value.band,
    regulatoryDomain: value.regulatoryDomain,
    nonSecretBuildOptions,
    artifactName: value.artifactName,
    artifactMediaType: value.artifactMediaType,
    artifactCompression: value.artifactCompression,
    artifactByteForm: value.artifactByteForm,
    artifactSizeBytes: value.artifactSizeBytes,
    artifactSha256: value.artifactSha256,
    buildSourceEpoch: value.buildSourceEpoch,
    testsAndValidationLevel,
    correspondingSourceUrl: value.correspondingSourceUrl,
    noticeBundle: Object.freeze({
      url: noticeBundle.url,
      sha256: noticeBundle.sha256,
    }),
    releaseSequence: value.releaseSequence,
    publishedAt: value.publishedAt,
    minimumApplicationVersion: value.minimumApplicationVersion,
    minimumCoreVersion: value.minimumCoreVersion,
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
): SignedFirmwareManifestParseBlockReason {
  switch (error.code) {
    case "DUPLICATE_KEY":
      return "FIRMWARE_MANIFEST_DUPLICATE_KEY";
    case "LIMIT_EXCEEDED":
      return "FIRMWARE_MANIFEST_LIMIT_EXCEEDED";
    case "UNSAFE_NUMBER":
      return "FIRMWARE_MANIFEST_UNSAFE_NUMBER";
    case "INVALID_UNICODE":
      return "FIRMWARE_MANIFEST_INVALID_UNICODE";
    case "INVALID_JSON":
      return "FIRMWARE_MANIFEST_JSON_INVALID";
  }
}

function blockedParse(
  reason: SignedFirmwareManifestParseBlockReason,
): SignedFirmwareManifestParseResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/**
 * Parses the fixed v1 wire format, rebuilds an immutable allowlisted payload,
 * and prepares the exact detached-signature bytes. It does not grant trust.
 */
export function parseSignedFirmwareManifest(
  source: string,
): SignedFirmwareManifestParseResult {
  if (typeof source !== "string") {
    return blockedParse("FIRMWARE_MANIFEST_JSON_INVALID");
  }
  let parsed: BoundedJsonValue;
  try {
    parsed = parseBoundedJson(source, manifestJsonLimits);
  } catch (error: unknown) {
    return blockedParse(
      error instanceof BoundedJsonError
        ? mapJsonFailure(error)
        : "FIRMWARE_MANIFEST_JSON_INVALID",
    );
  }

  if (
    !hasExactFields(parsed, [
      "schemaVersion",
      "canonicalization",
      "payload",
      "signature",
    ]) ||
    parsed.schemaVersion !== signedFirmwareManifestSchemaVersion ||
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
    return blockedParse("FIRMWARE_MANIFEST_SCHEMA_INVALID");
  }

  const payload = rebuildPayload(parsed.payload);
  const signature = decodeCanonicalBase64Url(
    parsed.signature.signatureBase64Url,
    64,
  );
  if (payload === null || signature === null) {
    return blockedParse("FIRMWARE_MANIFEST_SCHEMA_INVALID");
  }

  const unsignedEnvelope = Object.assign(
    Object.create(null) as {
      [key: string]: BoundedJsonValue;
    },
    {
      schemaVersion: parsed.schemaVersion,
      canonicalization: parsed.canonicalization,
      payload: parsed.payload,
    },
  );
  const canonicalJson = canonicalizeBoundedJson(unsignedEnvelope);
  const signatureInput = utf8Encoder.encode(
    `${signedFirmwareManifestDomain}${canonicalJson}`,
  );
  const manifest: SignedFirmwareManifestEnvelope<SyntheticFirmwareManifestPayloadV1> =
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
  const result: ParsedSignedFirmwareManifest = Object.freeze({
    status: "PARSED_UNTRUSTED",
    manifest,
    trustStatus: currentArtifactManifestTrustStatus,
    copySignatureInput: () => signatureInput.slice(),
  });
  parsedManifestRecords.set(result, {
    keyId: parsed.signature.keyId,
    signature: signature.slice(),
    signatureInput: signatureInput.slice(),
  });
  return result;
}

function copyExactUint8Array(
  value: unknown,
  expectedByteLength: number,
): Uint8Array | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  try {
    if (Object.getPrototypeOf(value) !== exactUint8ArrayPrototype) {
      return null;
    }
    const copy = Uint8Array.prototype.slice.call(value) as Uint8Array;
    return copy.byteLength === expectedByteLength ? copy : null;
  } catch {
    return null;
  }
}

function readDataMethod(
  value: unknown,
  key: PropertyKey,
): ((...arguments_: unknown[]) => unknown) | null {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return null;
  }
  try {
    let current: object | null = value;
    for (let depth = 0; current !== null && depth < 8; depth += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined) {
        return "value" in descriptor && typeof descriptor.value === "function"
          ? (descriptor.value as (...arguments_: unknown[]) => unknown)
          : null;
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch {
    return null;
  }
  return null;
}

function isVerifierAssurance(
  value: unknown,
): value is FirmwareManifestSignatureVerifierAssurance {
  return firmwareManifestSignatureVerifierAssurances.some(
    (assurance) => assurance === value,
  );
}

function blockedVerification(
  reason: SyntheticFirmwareManifestSignatureBlockReason,
): SyntheticFirmwareManifestSignatureResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/**
 * Exercises Ed25519 with a caller-supplied Synthetic key. Even a valid result
 * is explicitly untrusted and cannot authorize a catalog entry or writer.
 */
export async function verifySyntheticFirmwareManifestSignature(input: {
  readonly parsed: ParsedSignedFirmwareManifest;
  readonly key: SyntheticFirmwareManifestVerificationKey;
  readonly verifier: FirmwareManifestSignatureVerifier;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticFirmwareManifestSignatureResult> {
  const parsedRecord =
    typeof input.parsed === "object" && input.parsed !== null
      ? parsedManifestRecords.get(input.parsed)
      : undefined;
  if (parsedRecord === undefined) {
    return blockedVerification("FIRMWARE_MANIFEST_NOT_FROM_PARSER");
  }

  const keyAssurance = readOwnDataProperty(input.key, "assurance");
  const keyId = readOwnDataProperty(input.key, "keyId");
  const rawPublicKey = copyExactUint8Array(
    readOwnDataProperty(input.key, "rawPublicKey"),
    32,
  );
  if (
    keyAssurance !== "SYNTHETIC_ONLY" ||
    typeof keyId !== "string" ||
    !syntheticKeyIdPattern.test(keyId) ||
    rawPublicKey === null
  ) {
    return blockedVerification("SYNTHETIC_MANIFEST_KEY_INVALID");
  }
  if (keyId !== parsedRecord.keyId) {
    return blockedVerification("FIRMWARE_MANIFEST_KEY_ID_MISMATCH");
  }

  const verifierAssurance = readOwnDataProperty(input.verifier, "assurance");
  const verifyEd25519 = readDataMethod(input.verifier, "verifyEd25519");
  if (!isVerifierAssurance(verifierAssurance) || verifyEd25519 === null) {
    return blockedVerification("FIRMWARE_MANIFEST_SIGNATURE_VERIFIER_INVALID");
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
      "FIRMWARE_MANIFEST_SIGNATURE_VERIFICATION_FAILED",
    );
  }

  if (valid !== true) {
    return blockedVerification("FIRMWARE_MANIFEST_SIGNATURE_INVALID");
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
