import {
  currentArtifactManifestTrustStatus,
  firmwareManifestSignatureVerifierAssurances,
  maximumCompressedFirmwareArtifactSizeBytes,
  maximumFirmwareArtifactSizeBytes,
  signedFirmwareManifestCanonicalization,
  signedFirmwareManifestSignatureAlgorithm,
  signedSyntheticDualFormFirmwareManifestSchemaVersion,
  syntheticDualFormFirmwareManifestType,
  syntheticFirmwareExecutableByteForm,
  syntheticFirmwareExecutableFormat,
  type ArtifactManifestTrustStatus,
  type CancellationSignal,
  type FirmwareManifestSignatureVerification,
  type FirmwareManifestSignatureVerifier,
  type FirmwareManifestSignatureVerifierAssurance,
  type SignedSyntheticDualFormFirmwareManifestEnvelopeV2,
  type SyntheticDualFormFirmwareManifestPayloadV2,
} from "@elrs-easy/domain";

import {
  BoundedJsonError,
  canonicalizeBoundedJson,
  parseBoundedJson,
  type BoundedJsonLimits,
  type BoundedJsonValue,
} from "./bounded-json.js";
import { syntheticDualFormManifestParseRecords } from "./firmware-trust-internals.js";
import {
  assertNotAborted,
  copyExactUint8Array,
  isAbortError,
  readDataMethod,
  readOwnDataProperty,
} from "./sensitive-operation-helpers.js";

export const maximumSignedSyntheticDualFormFirmwareManifestBytes = 16 * 1024;
export const signedSyntheticDualFormFirmwareManifestDomain =
  "ELRS-EASY-SYNTHETIC-DUAL-FORM-MANIFEST-V2\n" as const;

export const signedSyntheticDualFormFirmwareManifestParseBlockReasons = [
  "SYNTHETIC_DUAL_FORM_MANIFEST_JSON_INVALID",
  "SYNTHETIC_DUAL_FORM_MANIFEST_DUPLICATE_KEY",
  "SYNTHETIC_DUAL_FORM_MANIFEST_LIMIT_EXCEEDED",
  "SYNTHETIC_DUAL_FORM_MANIFEST_UNSAFE_NUMBER",
  "SYNTHETIC_DUAL_FORM_MANIFEST_INVALID_UNICODE",
  "SYNTHETIC_DUAL_FORM_MANIFEST_SCHEMA_INVALID",
] as const;

export type SignedSyntheticDualFormFirmwareManifestParseBlockReason =
  (typeof signedSyntheticDualFormFirmwareManifestParseBlockReasons)[number];

export type ParsedSignedSyntheticDualFormFirmwareManifest = Readonly<{
  status: "PARSED_UNTRUSTED";
  manifest: SignedSyntheticDualFormFirmwareManifestEnvelopeV2;
  trustStatus: ArtifactManifestTrustStatus;
  copySignatureInput: () => Uint8Array;
}>;

export type SignedSyntheticDualFormFirmwareManifestParseResult =
  | ParsedSignedSyntheticDualFormFirmwareManifest
  | Readonly<{
      status: "BLOCKED";
      reason: SignedSyntheticDualFormFirmwareManifestParseBlockReason;
    }>;

export interface SyntheticDualFormFirmwareManifestVerificationKey {
  readonly assurance: "SYNTHETIC_ONLY";
  readonly keyId: string;
  readonly rawPublicKey: Uint8Array;
}

export const syntheticDualFormFirmwareManifestSignatureBlockReasons = [
  "SYNTHETIC_DUAL_FORM_MANIFEST_NOT_FROM_PARSER",
  "SYNTHETIC_DUAL_FORM_MANIFEST_KEY_INVALID",
  "SYNTHETIC_DUAL_FORM_MANIFEST_KEY_ID_MISMATCH",
  "SYNTHETIC_DUAL_FORM_MANIFEST_SIGNATURE_VERIFIER_INVALID",
  "SYNTHETIC_DUAL_FORM_MANIFEST_SIGNATURE_VERIFICATION_FAILED",
  "SYNTHETIC_DUAL_FORM_MANIFEST_SIGNATURE_INVALID",
] as const;

export type SyntheticDualFormFirmwareManifestSignatureBlockReason =
  (typeof syntheticDualFormFirmwareManifestSignatureBlockReasons)[number];

export type SyntheticDualFormFirmwareManifestSignatureResult =
  | Readonly<{
      status: "VERIFIED_UNTRUSTED";
      verification: FirmwareManifestSignatureVerification;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticDualFormFirmwareManifestSignatureBlockReason;
    }>;

const manifestJsonLimits: BoundedJsonLimits = Object.freeze({
  maximumUtf8Bytes: maximumSignedSyntheticDualFormFirmwareManifestBytes,
  maximumDepth: 5,
  maximumStringCodeUnits: 512,
  maximumArrayElements: 8,
  maximumObjectMembers: 24,
  maximumTotalValues: 128,
});

const payloadFields = [
  "manifestSchema",
  "manifestType",
  "channel",
  "targetIdentifier",
  "artifactName",
  "artifactMediaType",
  "compression",
  "decompressedByteForm",
  "executableFormat",
  "compressedSizeBytes",
  "compressedSha256",
  "decompressedSizeBytes",
  "decompressedSha256",
  "releaseSequence",
  "signingRole",
  "requiredRootMetadataVersion",
] as const;

const canonicalSha256Pattern = /^[0-9a-f]{64}$/u;
const targetIdentifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const syntheticKeyIdPattern = /^synthetic:[a-z0-9][a-z0-9._-]{0,111}$/u;
const artifactNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,124}\.gz$/u;
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

function rebuildPayload(
  value: BoundedJsonValue,
): SyntheticDualFormFirmwareManifestPayloadV2 | null {
  if (
    !hasExactFields(value, payloadFields) ||
    value.manifestSchema !==
      signedSyntheticDualFormFirmwareManifestSchemaVersion ||
    value.manifestType !== syntheticDualFormFirmwareManifestType ||
    value.channel !== "synthetic" ||
    typeof value.targetIdentifier !== "string" ||
    !targetIdentifierPattern.test(value.targetIdentifier) ||
    typeof value.artifactName !== "string" ||
    !artifactNamePattern.test(value.artifactName) ||
    value.artifactMediaType !== "application/gzip" ||
    value.compression !== "gzip" ||
    value.decompressedByteForm !== syntheticFirmwareExecutableByteForm ||
    value.executableFormat !== syntheticFirmwareExecutableFormat ||
    !isPositiveSafeInteger(value.compressedSizeBytes) ||
    value.compressedSizeBytes < 18 ||
    value.compressedSizeBytes > maximumCompressedFirmwareArtifactSizeBytes ||
    typeof value.compressedSha256 !== "string" ||
    !canonicalSha256Pattern.test(value.compressedSha256) ||
    !isPositiveSafeInteger(value.decompressedSizeBytes) ||
    value.decompressedSizeBytes < 24 ||
    value.decompressedSizeBytes > maximumFirmwareArtifactSizeBytes ||
    typeof value.decompressedSha256 !== "string" ||
    !canonicalSha256Pattern.test(value.decompressedSha256) ||
    !isPositiveSafeInteger(value.releaseSequence) ||
    value.signingRole !== "synthetic" ||
    !isPositiveSafeInteger(value.requiredRootMetadataVersion)
  ) {
    return null;
  }

  return Object.freeze({
    manifestSchema: value.manifestSchema,
    manifestType: value.manifestType,
    channel: value.channel,
    targetIdentifier: value.targetIdentifier,
    artifactName: value.artifactName,
    artifactMediaType: value.artifactMediaType,
    compression: value.compression,
    decompressedByteForm: value.decompressedByteForm,
    executableFormat: value.executableFormat,
    compressedSizeBytes: value.compressedSizeBytes,
    compressedSha256: value.compressedSha256,
    decompressedSizeBytes: value.decompressedSizeBytes,
    decompressedSha256: value.decompressedSha256,
    releaseSequence: value.releaseSequence,
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
): SignedSyntheticDualFormFirmwareManifestParseBlockReason {
  switch (error.code) {
    case "DUPLICATE_KEY":
      return "SYNTHETIC_DUAL_FORM_MANIFEST_DUPLICATE_KEY";
    case "LIMIT_EXCEEDED":
      return "SYNTHETIC_DUAL_FORM_MANIFEST_LIMIT_EXCEEDED";
    case "UNSAFE_NUMBER":
      return "SYNTHETIC_DUAL_FORM_MANIFEST_UNSAFE_NUMBER";
    case "INVALID_UNICODE":
      return "SYNTHETIC_DUAL_FORM_MANIFEST_INVALID_UNICODE";
    case "INVALID_JSON":
      return "SYNTHETIC_DUAL_FORM_MANIFEST_JSON_INVALID";
  }
}

function blockedParse(
  reason: SignedSyntheticDualFormFirmwareManifestParseBlockReason,
): SignedSyntheticDualFormFirmwareManifestParseResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/** Parses only the fixed lab v2 wire format and grants no trust. */
export function parseSignedSyntheticDualFormFirmwareManifest(
  source: string,
): SignedSyntheticDualFormFirmwareManifestParseResult {
  if (typeof source !== "string") {
    return blockedParse("SYNTHETIC_DUAL_FORM_MANIFEST_JSON_INVALID");
  }

  let parsed: BoundedJsonValue;
  try {
    parsed = parseBoundedJson(source, manifestJsonLimits);
  } catch (error: unknown) {
    return blockedParse(
      error instanceof BoundedJsonError
        ? mapJsonFailure(error)
        : "SYNTHETIC_DUAL_FORM_MANIFEST_JSON_INVALID",
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
      signedSyntheticDualFormFirmwareManifestSchemaVersion ||
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
    return blockedParse("SYNTHETIC_DUAL_FORM_MANIFEST_SCHEMA_INVALID");
  }

  const payload = rebuildPayload(parsed.payload);
  const signature = decodeCanonicalBase64Url(
    parsed.signature.signatureBase64Url,
    64,
  );
  if (payload === null || signature === null) {
    return blockedParse("SYNTHETIC_DUAL_FORM_MANIFEST_SCHEMA_INVALID");
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
    `${signedSyntheticDualFormFirmwareManifestDomain}${canonicalizeBoundedJson(unsignedEnvelope)}`,
  );
  const manifest: SignedSyntheticDualFormFirmwareManifestEnvelopeV2 =
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
  const result: ParsedSignedSyntheticDualFormFirmwareManifest = Object.freeze({
    status: "PARSED_UNTRUSTED",
    manifest,
    trustStatus: currentArtifactManifestTrustStatus,
    copySignatureInput: () => signatureInput.slice(),
  });
  syntheticDualFormManifestParseRecords.set(result, {
    keyId: parsed.signature.keyId,
    signature: signature.slice(),
    signatureInput: signatureInput.slice(),
    requiredRootMetadataVersion: payload.requiredRootMetadataVersion,
    targetIdentifier: payload.targetIdentifier,
    artifactName: payload.artifactName,
    compressedSizeBytes: payload.compressedSizeBytes,
    compressedSha256: payload.compressedSha256,
    decompressedSizeBytes: payload.decompressedSizeBytes,
    decompressedSha256: payload.decompressedSha256,
    releaseSequence: payload.releaseSequence,
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
  reason: SyntheticDualFormFirmwareManifestSignatureBlockReason,
): SyntheticDualFormFirmwareManifestSignatureResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/** Exercises v2 Ed25519 mechanics without admitting the caller-supplied key. */
export async function verifySyntheticDualFormFirmwareManifestSignature(input: {
  readonly parsed: ParsedSignedSyntheticDualFormFirmwareManifest;
  readonly key: SyntheticDualFormFirmwareManifestVerificationKey;
  readonly verifier: FirmwareManifestSignatureVerifier;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticDualFormFirmwareManifestSignatureResult> {
  const parsedRecord =
    typeof input.parsed === "object" && input.parsed !== null
      ? syntheticDualFormManifestParseRecords.get(input.parsed)
      : undefined;
  if (parsedRecord === undefined) {
    return blockedVerification("SYNTHETIC_DUAL_FORM_MANIFEST_NOT_FROM_PARSER");
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
    return blockedVerification("SYNTHETIC_DUAL_FORM_MANIFEST_KEY_INVALID");
  }
  if (keyId !== parsedRecord.keyId) {
    return blockedVerification("SYNTHETIC_DUAL_FORM_MANIFEST_KEY_ID_MISMATCH");
  }

  const verifierAssurance = readOwnDataProperty(input.verifier, "assurance");
  const verifyEd25519 = readDataMethod(input.verifier, "verifyEd25519");
  if (!isVerifierAssurance(verifierAssurance) || verifyEd25519 === null) {
    return blockedVerification(
      "SYNTHETIC_DUAL_FORM_MANIFEST_SIGNATURE_VERIFIER_INVALID",
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
      "SYNTHETIC_DUAL_FORM_MANIFEST_SIGNATURE_VERIFICATION_FAILED",
    );
  }

  if (valid !== true) {
    return blockedVerification(
      "SYNTHETIC_DUAL_FORM_MANIFEST_SIGNATURE_INVALID",
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
