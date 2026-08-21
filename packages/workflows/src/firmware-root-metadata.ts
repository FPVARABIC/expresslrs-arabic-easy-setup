import {
  currentArtifactManifestTrustStatus,
  firmwareManifestSignatureVerifierAssurances,
  firmwareRootMetadataCanonicalization,
  firmwareRootMetadataSchemaVersion,
  firmwareRootMetadataSignatureAlgorithm,
  firmwareTrustClockAssurances,
  syntheticFirmwareRootMetadataType,
  syntheticFirmwareRootRoles,
  type ArtifactManifestTrustStatus,
  type CancellationSignal,
  type FirmwareManifestSignatureVerifier,
  type FirmwareManifestSignatureVerifierAssurance,
  type FirmwareTrustClock,
  type FirmwareTrustClockAssurance,
  type SignedFirmwareManifestSignature,
  type SignedFirmwareRootMetadataEnvelopeV1,
  type SyntheticFirmwareRootMetadataPayloadV1,
  type SyntheticFirmwareRootPublicKeyV1,
  type SyntheticFirmwareRootRole,
  type SyntheticFirmwareRootRoleV1,
} from "@elrs-easy/domain";

import {
  BoundedJsonError,
  canonicalizeBoundedJson,
  parseBoundedJson,
  type BoundedJsonLimits,
  type BoundedJsonValue,
} from "./bounded-json.js";
import {
  syntheticFirmwareManifestSignatureBlockReasons,
  verifySyntheticFirmwareManifestSignature,
  type ParsedSignedFirmwareManifest,
  type SyntheticFirmwareManifestSignatureBlockReason,
} from "./firmware-manifest.js";
import {
  syntheticManifestRootVerificationRecords,
  syntheticRootRotationRecords,
} from "./firmware-trust-internals.js";
import {
  assertNotAborted,
  isAbortError,
  readOwnDataProperty,
} from "./sensitive-operation-helpers.js";

export const maximumSignedFirmwareRootMetadataBytes = 64 * 1024;
export const signedFirmwareRootMetadataDomain =
  "ELRS-EASY-FIRMWARE-ROOT-V1\n" as const;

export const signedFirmwareRootMetadataParseBlockReasons = [
  "FIRMWARE_ROOT_JSON_INVALID",
  "FIRMWARE_ROOT_DUPLICATE_KEY",
  "FIRMWARE_ROOT_LIMIT_EXCEEDED",
  "FIRMWARE_ROOT_UNSAFE_NUMBER",
  "FIRMWARE_ROOT_INVALID_UNICODE",
  "FIRMWARE_ROOT_SCHEMA_INVALID",
] as const;

export type SignedFirmwareRootMetadataParseBlockReason =
  (typeof signedFirmwareRootMetadataParseBlockReasons)[number];

export type ParsedSignedFirmwareRootMetadata = Readonly<{
  status: "PARSED_UNTRUSTED";
  metadata: SignedFirmwareRootMetadataEnvelopeV1;
  trustStatus: ArtifactManifestTrustStatus;
  copySignatureInput: () => Uint8Array;
}>;

export type SignedFirmwareRootMetadataParseResult =
  | ParsedSignedFirmwareRootMetadata
  | Readonly<{
      status: "BLOCKED";
      reason: SignedFirmwareRootMetadataParseBlockReason;
    }>;

export const syntheticFirmwareRootRotationBlockReasons = [
  "FIRMWARE_ROOT_NOT_FROM_PARSER",
  "FIRMWARE_ROOT_VERSION_NOT_SEQUENTIAL",
  "FIRMWARE_ROOT_KEY_ID_REBOUND",
  "FIRMWARE_ROOT_SIGNATURE_VERIFIER_INVALID",
  "FIRMWARE_ROOT_SIGNATURE_VERIFICATION_FAILED",
  "FIRMWARE_ROOT_CURRENT_THRESHOLD_NOT_MET",
  "FIRMWARE_ROOT_INCOMING_THRESHOLD_NOT_MET",
] as const;

export type SyntheticFirmwareRootRotationBlockReason =
  (typeof syntheticFirmwareRootRotationBlockReasons)[number];

export type SyntheticFirmwareRootRotationResult =
  | Readonly<{
      status: "ROTATION_VERIFIED_UNTRUSTED";
      currentVersion: number;
      incomingVersion: number;
      currentThreshold: number;
      incomingThreshold: number;
      currentVerifiedKeyIds: readonly string[];
      incomingVerifiedKeyIds: readonly string[];
      verifierAssurance: FirmwareManifestSignatureVerifierAssurance;
      trustStatus: ArtifactManifestTrustStatus;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticFirmwareRootRotationBlockReason;
    }>;

export const syntheticFirmwareRootFreshnessBlockReasons = [
  "FIRMWARE_ROOT_NOT_FROM_PARSER",
  "FIRMWARE_ROOT_CLOCK_INVALID",
  "FIRMWARE_ROOT_CLOCK_READ_FAILED",
  "FIRMWARE_ROOT_NOT_YET_VALID",
  "FIRMWARE_ROOT_EXPIRED",
] as const;

export type SyntheticFirmwareRootFreshnessBlockReason =
  (typeof syntheticFirmwareRootFreshnessBlockReasons)[number];

export type SyntheticFirmwareRootFreshnessResult =
  | Readonly<{
      status: "FRESH_UNTRUSTED";
      rootVersion: number;
      checkedAt: string;
      notBefore: string;
      expiresAt: string;
      clockAssurance: FirmwareTrustClockAssurance;
      trustStatus: ArtifactManifestTrustStatus;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticFirmwareRootFreshnessBlockReason;
    }>;

export const syntheticFirmwareManifestRootBlockReasons = [
  ...syntheticFirmwareRootFreshnessBlockReasons,
  ...syntheticFirmwareManifestSignatureBlockReasons,
  "FIRMWARE_MANIFEST_ROOT_VERSION_MISMATCH",
  "FIRMWARE_MANIFEST_ROOT_ROLE_THRESHOLD_UNSUPPORTED",
  "FIRMWARE_MANIFEST_ROOT_KEY_NOT_AUTHORIZED",
] as const;

export type SyntheticFirmwareManifestRootBlockReason =
  (typeof syntheticFirmwareManifestRootBlockReasons)[number];

export type SyntheticFirmwareManifestRootVerificationResult =
  | Readonly<{
      status: "VERIFIED_AGAINST_UNTRUSTED_ROOT";
      rootVersion: number;
      role: "synthetic";
      roleThreshold: 1;
      keyId: string;
      checkedAt: string;
      clockAssurance: FirmwareTrustClockAssurance;
      verifierAssurance: FirmwareManifestSignatureVerifierAssurance;
      targetIdentifier: string;
      releaseSequence: number;
      artifactSha256: string;
      trustStatus: ArtifactManifestTrustStatus;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticFirmwareManifestRootBlockReason;
    }>;

const rootJsonLimits: BoundedJsonLimits = Object.freeze({
  maximumUtf8Bytes: maximumSignedFirmwareRootMetadataBytes,
  maximumDepth: 8,
  maximumStringCodeUnits: 2_048,
  maximumArrayElements: 64,
  maximumObjectMembers: 64,
  maximumTotalValues: 1_024,
});

const syntheticKeyIdPattern = /^synthetic:[a-z0-9][a-z0-9._-]{0,111}$/u;
const canonicalLowerIdentifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const canonicalSha256Pattern = /^[0-9a-f]{64}$/u;
const base64UrlAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const utf8Encoder = new TextEncoder();

interface RootRoleRecord {
  readonly keyIds: readonly string[];
  readonly threshold: number;
}

interface ParsedRootRecord {
  readonly version: number;
  readonly notBeforeMilliseconds: number;
  readonly expiresAtMilliseconds: number;
  readonly keys: ReadonlyMap<string, Uint8Array>;
  readonly roles: ReadonlyMap<SyntheticFirmwareRootRole, RootRoleRecord>;
  readonly signatures: ReadonlyMap<string, Uint8Array>;
  readonly signatureInput: Uint8Array;
}

const parsedRootRecords = new WeakMap<object, ParsedRootRecord>();

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

function parseCanonicalUtcTimestamp(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 32 ||
    value !== value.trim() ||
    !value.endsWith("Z")
  ) {
    return null;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
    ? milliseconds
    : null;
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

function rebuildKeys(value: BoundedJsonValue): {
  readonly publicKeys: readonly SyntheticFirmwareRootPublicKeyV1[];
  readonly decodedKeys: ReadonlyMap<string, Uint8Array>;
} | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    return null;
  }
  const publicKeys: SyntheticFirmwareRootPublicKeyV1[] = [];
  const decodedKeys = new Map<string, Uint8Array>();
  for (const item of value) {
    if (
      !hasExactFields(item, [
        "keyId",
        "keyType",
        "algorithm",
        "publicKeyBase64Url",
      ]) ||
      typeof item.keyId !== "string" ||
      !syntheticKeyIdPattern.test(item.keyId) ||
      decodedKeys.has(item.keyId) ||
      item.keyType !== "ed25519" ||
      item.algorithm !== firmwareRootMetadataSignatureAlgorithm
    ) {
      return null;
    }
    const decoded = decodeCanonicalBase64Url(item.publicKeyBase64Url, 32);
    if (decoded === null || typeof item.publicKeyBase64Url !== "string") {
      return null;
    }
    decodedKeys.set(item.keyId, decoded.slice());
    publicKeys.push(
      Object.freeze({
        keyId: item.keyId,
        keyType: item.keyType,
        algorithm: item.algorithm,
        publicKeyBase64Url: item.publicKeyBase64Url,
      }),
    );
  }
  return Object.freeze({
    publicKeys: Object.freeze(publicKeys),
    decodedKeys,
  });
}

function isSyntheticRootRole(
  value: BoundedJsonValue,
): value is SyntheticFirmwareRootRole {
  return syntheticFirmwareRootRoles.some((role) => role === value);
}

function rebuildRoles(
  value: BoundedJsonValue,
  availableKeys: ReadonlyMap<string, Uint8Array>,
): {
  readonly publicRoles: readonly SyntheticFirmwareRootRoleV1[];
  readonly roleRecords: ReadonlyMap<SyntheticFirmwareRootRole, RootRoleRecord>;
} | null {
  if (
    !Array.isArray(value) ||
    value.length !== syntheticFirmwareRootRoles.length
  ) {
    return null;
  }
  const publicRoles: SyntheticFirmwareRootRoleV1[] = [];
  const roleRecords = new Map<SyntheticFirmwareRootRole, RootRoleRecord>();
  const referencedKeys = new Set<string>();
  for (const item of value) {
    if (
      !hasExactFields(item, ["name", "channel", "keyIds", "threshold"]) ||
      !isSyntheticRootRole(item.name) ||
      roleRecords.has(item.name) ||
      item.channel !== "synthetic" ||
      !Array.isArray(item.keyIds) ||
      item.keyIds.length === 0 ||
      item.keyIds.length > 16 ||
      !isPositiveSafeInteger(item.threshold) ||
      item.threshold > item.keyIds.length
    ) {
      return null;
    }
    const keyIds: string[] = [];
    const roleKeyIds = new Set<string>();
    for (const keyId of item.keyIds) {
      if (
        typeof keyId !== "string" ||
        !syntheticKeyIdPattern.test(keyId) ||
        roleKeyIds.has(keyId) ||
        !availableKeys.has(keyId)
      ) {
        return null;
      }
      roleKeyIds.add(keyId);
      referencedKeys.add(keyId);
      keyIds.push(keyId);
    }
    const frozenKeyIds = Object.freeze(keyIds);
    roleRecords.set(
      item.name,
      Object.freeze({ keyIds: frozenKeyIds, threshold: item.threshold }),
    );
    publicRoles.push(
      Object.freeze({
        name: item.name,
        channel: item.channel,
        keyIds: frozenKeyIds,
        threshold: item.threshold,
      }),
    );
  }
  if (
    roleRecords.size !== syntheticFirmwareRootRoles.length ||
    referencedKeys.size !== availableKeys.size
  ) {
    return null;
  }
  return Object.freeze({
    publicRoles: Object.freeze(publicRoles),
    roleRecords,
  });
}

function rebuildSignatures(value: BoundedJsonValue): {
  readonly publicSignatures: readonly SignedFirmwareManifestSignature[];
  readonly decodedSignatures: ReadonlyMap<string, Uint8Array>;
} | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    return null;
  }
  const publicSignatures: SignedFirmwareManifestSignature[] = [];
  const decodedSignatures = new Map<string, Uint8Array>();
  for (const item of value) {
    if (
      !hasExactFields(item, ["algorithm", "keyId", "signatureBase64Url"]) ||
      item.algorithm !== firmwareRootMetadataSignatureAlgorithm ||
      typeof item.keyId !== "string" ||
      !syntheticKeyIdPattern.test(item.keyId) ||
      decodedSignatures.has(item.keyId)
    ) {
      return null;
    }
    const decoded = decodeCanonicalBase64Url(item.signatureBase64Url, 64);
    if (decoded === null || typeof item.signatureBase64Url !== "string") {
      return null;
    }
    decodedSignatures.set(item.keyId, decoded.slice());
    publicSignatures.push(
      Object.freeze({
        algorithm: item.algorithm,
        keyId: item.keyId,
        signatureBase64Url: item.signatureBase64Url,
      }),
    );
  }
  return Object.freeze({
    publicSignatures: Object.freeze(publicSignatures),
    decodedSignatures,
  });
}

function mapJsonFailure(
  error: BoundedJsonError,
): SignedFirmwareRootMetadataParseBlockReason {
  switch (error.code) {
    case "DUPLICATE_KEY":
      return "FIRMWARE_ROOT_DUPLICATE_KEY";
    case "LIMIT_EXCEEDED":
      return "FIRMWARE_ROOT_LIMIT_EXCEEDED";
    case "UNSAFE_NUMBER":
      return "FIRMWARE_ROOT_UNSAFE_NUMBER";
    case "INVALID_UNICODE":
      return "FIRMWARE_ROOT_INVALID_UNICODE";
    case "INVALID_JSON":
      return "FIRMWARE_ROOT_JSON_INVALID";
  }
}

function blockedParse(
  reason: SignedFirmwareRootMetadataParseBlockReason,
): SignedFirmwareRootMetadataParseResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/** Parses and freezes Synthetic root metadata without admitting it as trust. */
export function parseSignedFirmwareRootMetadata(
  source: string,
): SignedFirmwareRootMetadataParseResult {
  if (typeof source !== "string") {
    return blockedParse("FIRMWARE_ROOT_JSON_INVALID");
  }
  let parsed: BoundedJsonValue;
  try {
    parsed = parseBoundedJson(source, rootJsonLimits);
  } catch (error: unknown) {
    return blockedParse(
      error instanceof BoundedJsonError
        ? mapJsonFailure(error)
        : "FIRMWARE_ROOT_JSON_INVALID",
    );
  }

  if (
    !hasExactFields(parsed, [
      "schemaVersion",
      "canonicalization",
      "payload",
      "signatures",
    ]) ||
    parsed.schemaVersion !== firmwareRootMetadataSchemaVersion ||
    parsed.canonicalization !== firmwareRootMetadataCanonicalization ||
    !hasExactFields(parsed.payload, [
      "rootSchema",
      "metadataType",
      "version",
      "notBefore",
      "expiresAt",
      "keys",
      "roles",
    ]) ||
    parsed.payload.rootSchema !== firmwareRootMetadataSchemaVersion ||
    parsed.payload.metadataType !== syntheticFirmwareRootMetadataType ||
    !isPositiveSafeInteger(parsed.payload.version)
  ) {
    return blockedParse("FIRMWARE_ROOT_SCHEMA_INVALID");
  }

  const notBeforeMilliseconds = parseCanonicalUtcTimestamp(
    parsed.payload.notBefore,
  );
  const expiresAtMilliseconds = parseCanonicalUtcTimestamp(
    parsed.payload.expiresAt,
  );
  const keys = rebuildKeys(parsed.payload.keys);
  const roles =
    keys === null ? null : rebuildRoles(parsed.payload.roles, keys.decodedKeys);
  const signatures = rebuildSignatures(parsed.signatures);
  if (
    notBeforeMilliseconds === null ||
    expiresAtMilliseconds === null ||
    notBeforeMilliseconds >= expiresAtMilliseconds ||
    keys === null ||
    roles === null ||
    signatures === null ||
    typeof parsed.payload.notBefore !== "string" ||
    typeof parsed.payload.expiresAt !== "string"
  ) {
    return blockedParse("FIRMWARE_ROOT_SCHEMA_INVALID");
  }

  const payload: SyntheticFirmwareRootMetadataPayloadV1 = Object.freeze({
    rootSchema: parsed.payload.rootSchema,
    metadataType: parsed.payload.metadataType,
    version: parsed.payload.version,
    notBefore: parsed.payload.notBefore,
    expiresAt: parsed.payload.expiresAt,
    keys: keys.publicKeys,
    roles: roles.publicRoles,
  });
  const metadata: SignedFirmwareRootMetadataEnvelopeV1 = Object.freeze({
    schemaVersion: parsed.schemaVersion,
    canonicalization: parsed.canonicalization,
    payload,
    signatures: signatures.publicSignatures,
  });
  const unsignedEnvelope = Object.assign(
    Object.create(null) as { [key: string]: BoundedJsonValue },
    {
      schemaVersion: parsed.schemaVersion,
      canonicalization: parsed.canonicalization,
      payload: parsed.payload,
    },
  );
  const signatureInput = utf8Encoder.encode(
    `${signedFirmwareRootMetadataDomain}${canonicalizeBoundedJson(unsignedEnvelope)}`,
  );
  const result: ParsedSignedFirmwareRootMetadata = Object.freeze({
    status: "PARSED_UNTRUSTED",
    metadata,
    trustStatus: currentArtifactManifestTrustStatus,
    copySignatureInput: () => signatureInput.slice(),
  });
  parsedRootRecords.set(result, {
    version: parsed.payload.version,
    notBeforeMilliseconds,
    expiresAtMilliseconds,
    keys: keys.decodedKeys,
    roles: roles.roleRecords,
    signatures: signatures.decodedSignatures,
    signatureInput: signatureInput.slice(),
  });
  return result;
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

function bytesEqual(first: Uint8Array, second: Uint8Array): boolean {
  if (first.byteLength !== second.byteLength) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < first.byteLength; index += 1) {
    difference |= (first[index] ?? 0) ^ (second[index] ?? 0);
  }
  return difference === 0;
}

function hasReboundKeyId(
  current: ParsedRootRecord,
  incoming: ParsedRootRecord,
): boolean {
  for (const [keyId, currentBytes] of current.keys) {
    const incomingBytes = incoming.keys.get(keyId);
    if (
      incomingBytes !== undefined &&
      !bytesEqual(currentBytes, incomingBytes)
    ) {
      return true;
    }
  }
  return false;
}

function blockedRotation(
  reason: SyntheticFirmwareRootRotationBlockReason,
): SyntheticFirmwareRootRotationResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

interface VerifierContext {
  readonly assurance: FirmwareManifestSignatureVerifierAssurance;
  readonly method: (...arguments_: unknown[]) => unknown;
}

function readVerifierContext(
  verifier: FirmwareManifestSignatureVerifier,
): VerifierContext | null {
  const assurance = readOwnDataProperty(verifier, "assurance");
  const method = readDataMethod(verifier, "verifyEd25519");
  return isVerifierAssurance(assurance) && method !== null
    ? Object.freeze({ assurance, method })
    : null;
}

async function verifyRoleThreshold(input: {
  readonly role: RootRoleRecord;
  readonly keys: ReadonlyMap<string, Uint8Array>;
  readonly signatures: ReadonlyMap<string, Uint8Array>;
  readonly signatureInput: Uint8Array;
  readonly verifier: FirmwareManifestSignatureVerifier;
  readonly verifierContext: VerifierContext;
  readonly signal?: CancellationSignal;
}): Promise<readonly string[] | "PROVIDER_FAILED"> {
  const verified: string[] = [];
  for (const keyId of input.role.keyIds) {
    const key = input.keys.get(keyId);
    const signature = input.signatures.get(keyId);
    if (key === undefined || signature === undefined) {
      continue;
    }
    let valid: unknown;
    try {
      assertNotAborted(input.signal);
      valid = await Reflect.apply(
        input.verifierContext.method,
        input.verifier,
        [
          input.signatureInput.slice(),
          signature.slice(),
          key.slice(),
          input.signal,
        ],
      );
      assertNotAborted(input.signal);
    } catch (error: unknown) {
      if (isAbortError(error)) {
        throw error;
      }
      return "PROVIDER_FAILED";
    }
    if (valid === true) {
      verified.push(keyId);
      if (verified.length >= input.role.threshold) {
        break;
      }
    }
  }
  return Object.freeze(verified);
}

/**
 * Verifies one TUF-style sequential rotation with both old and new root
 * thresholds. The current root is still caller-supplied and untrusted here.
 */
export async function verifySyntheticFirmwareRootRotation(input: {
  readonly current: ParsedSignedFirmwareRootMetadata;
  readonly incoming: ParsedSignedFirmwareRootMetadata;
  readonly verifier: FirmwareManifestSignatureVerifier;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticFirmwareRootRotationResult> {
  const currentRecord =
    typeof input.current === "object" && input.current !== null
      ? parsedRootRecords.get(input.current)
      : undefined;
  const incomingRecord =
    typeof input.incoming === "object" && input.incoming !== null
      ? parsedRootRecords.get(input.incoming)
      : undefined;
  if (currentRecord === undefined || incomingRecord === undefined) {
    return blockedRotation("FIRMWARE_ROOT_NOT_FROM_PARSER");
  }
  if (incomingRecord.version !== currentRecord.version + 1) {
    return blockedRotation("FIRMWARE_ROOT_VERSION_NOT_SEQUENTIAL");
  }
  if (hasReboundKeyId(currentRecord, incomingRecord)) {
    return blockedRotation("FIRMWARE_ROOT_KEY_ID_REBOUND");
  }
  const verifierContext = readVerifierContext(input.verifier);
  if (verifierContext === null) {
    return blockedRotation("FIRMWARE_ROOT_SIGNATURE_VERIFIER_INVALID");
  }
  const currentRole = currentRecord.roles.get("root");
  const incomingRole = incomingRecord.roles.get("root");
  if (currentRole === undefined || incomingRole === undefined) {
    return blockedRotation("FIRMWARE_ROOT_NOT_FROM_PARSER");
  }

  const currentVerified = await verifyRoleThreshold({
    role: currentRole,
    keys: currentRecord.keys,
    signatures: incomingRecord.signatures,
    signatureInput: incomingRecord.signatureInput,
    verifier: input.verifier,
    verifierContext,
    signal: input.signal,
  });
  if (currentVerified === "PROVIDER_FAILED") {
    return blockedRotation("FIRMWARE_ROOT_SIGNATURE_VERIFICATION_FAILED");
  }
  if (currentVerified.length < currentRole.threshold) {
    return blockedRotation("FIRMWARE_ROOT_CURRENT_THRESHOLD_NOT_MET");
  }

  const incomingVerified = await verifyRoleThreshold({
    role: incomingRole,
    keys: incomingRecord.keys,
    signatures: incomingRecord.signatures,
    signatureInput: incomingRecord.signatureInput,
    verifier: input.verifier,
    verifierContext,
    signal: input.signal,
  });
  if (incomingVerified === "PROVIDER_FAILED") {
    return blockedRotation("FIRMWARE_ROOT_SIGNATURE_VERIFICATION_FAILED");
  }
  if (incomingVerified.length < incomingRole.threshold) {
    return blockedRotation("FIRMWARE_ROOT_INCOMING_THRESHOLD_NOT_MET");
  }

  const result: SyntheticFirmwareRootRotationResult = Object.freeze({
    status: "ROTATION_VERIFIED_UNTRUSTED",
    currentVersion: currentRecord.version,
    incomingVersion: incomingRecord.version,
    currentThreshold: currentRole.threshold,
    incomingThreshold: incomingRole.threshold,
    currentVerifiedKeyIds: currentVerified,
    incomingVerifiedKeyIds: incomingVerified,
    verifierAssurance: verifierContext.assurance,
    trustStatus: currentArtifactManifestTrustStatus,
  });
  syntheticRootRotationRecords.set(result, {
    currentRoot: input.current,
    incomingRoot: input.incoming,
    currentVersion: currentRecord.version,
    incomingVersion: incomingRecord.version,
  });
  return result;
}

function blockedFreshness(
  reason: SyntheticFirmwareRootFreshnessBlockReason,
): SyntheticFirmwareRootFreshnessResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/** Uses one fixed, assurance-labelled time for a complete evaluation cycle. */
export async function evaluateSyntheticFirmwareRootFreshness(input: {
  readonly root: ParsedSignedFirmwareRootMetadata;
  readonly clock: FirmwareTrustClock;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticFirmwareRootFreshnessResult> {
  const rootRecord =
    typeof input.root === "object" && input.root !== null
      ? parsedRootRecords.get(input.root)
      : undefined;
  if (rootRecord === undefined) {
    return blockedFreshness("FIRMWARE_ROOT_NOT_FROM_PARSER");
  }
  const assurance = readOwnDataProperty(input.clock, "assurance");
  const readUtcNow = readDataMethod(input.clock, "readUtcNow");
  if (
    !firmwareTrustClockAssurances.some(
      (candidate) => candidate === assurance,
    ) ||
    readUtcNow === null
  ) {
    return blockedFreshness("FIRMWARE_ROOT_CLOCK_INVALID");
  }

  let checkedAt: unknown;
  try {
    assertNotAborted(input.signal);
    checkedAt = await Reflect.apply(readUtcNow, input.clock, [input.signal]);
    assertNotAborted(input.signal);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }
    return blockedFreshness("FIRMWARE_ROOT_CLOCK_READ_FAILED");
  }
  const checkedAtMilliseconds = parseCanonicalUtcTimestamp(checkedAt);
  if (checkedAtMilliseconds === null || typeof checkedAt !== "string") {
    return blockedFreshness("FIRMWARE_ROOT_CLOCK_INVALID");
  }
  if (checkedAtMilliseconds < rootRecord.notBeforeMilliseconds) {
    return blockedFreshness("FIRMWARE_ROOT_NOT_YET_VALID");
  }
  if (checkedAtMilliseconds >= rootRecord.expiresAtMilliseconds) {
    return blockedFreshness("FIRMWARE_ROOT_EXPIRED");
  }

  return Object.freeze({
    status: "FRESH_UNTRUSTED",
    rootVersion: rootRecord.version,
    checkedAt,
    notBefore: input.root.metadata.payload.notBefore,
    expiresAt: input.root.metadata.payload.expiresAt,
    clockAssurance: assurance as FirmwareTrustClockAssurance,
    trustStatus: currentArtifactManifestTrustStatus,
  });
}

function blockedManifestRoot(
  reason: SyntheticFirmwareManifestRootBlockReason,
): SyntheticFirmwareManifestRootVerificationResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

interface ParsedManifestFacts {
  readonly keyId: string;
  readonly requiredRootMetadataVersion: number;
  readonly targetIdentifier: string;
  readonly releaseSequence: number;
  readonly artifactSha256: string;
}

function readParsedManifestFacts(
  parsed: ParsedSignedFirmwareManifest,
): ParsedManifestFacts | null {
  const manifest = readOwnDataProperty(parsed, "manifest");
  const payload = readOwnDataProperty(manifest, "payload");
  const signature = readOwnDataProperty(manifest, "signature");
  const channel = readOwnDataProperty(payload, "channel");
  const signingRole = readOwnDataProperty(payload, "signingRole");
  const requiredRootMetadataVersion = readOwnDataProperty(
    payload,
    "requiredRootMetadataVersion",
  );
  const targetIdentifier = readOwnDataProperty(payload, "targetIdentifier");
  const releaseSequence = readOwnDataProperty(payload, "releaseSequence");
  const artifactSha256 = readOwnDataProperty(payload, "artifactSha256");
  const keyId = readOwnDataProperty(signature, "keyId");
  return channel === "synthetic" &&
    signingRole === "synthetic" &&
    typeof keyId === "string" &&
    syntheticKeyIdPattern.test(keyId) &&
    typeof requiredRootMetadataVersion === "number" &&
    Number.isSafeInteger(requiredRootMetadataVersion) &&
    requiredRootMetadataVersion > 0 &&
    typeof targetIdentifier === "string" &&
    canonicalLowerIdentifierPattern.test(targetIdentifier) &&
    typeof releaseSequence === "number" &&
    Number.isSafeInteger(releaseSequence) &&
    releaseSequence > 0 &&
    typeof artifactSha256 === "string" &&
    canonicalSha256Pattern.test(artifactSha256)
    ? Object.freeze({
        keyId,
        requiredRootMetadataVersion,
        targetIdentifier,
        releaseSequence,
        artifactSha256,
      })
    : null;
}

/**
 * Resolves a Synthetic Manifest key through parsed root metadata and verifies
 * it. Because the root itself is not admitted, success remains untrusted.
 */
export async function verifySyntheticFirmwareManifestAgainstRoot(input: {
  readonly root: ParsedSignedFirmwareRootMetadata;
  readonly manifest: ParsedSignedFirmwareManifest;
  readonly clock: FirmwareTrustClock;
  readonly verifier: FirmwareManifestSignatureVerifier;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticFirmwareManifestRootVerificationResult> {
  const rootRecord =
    typeof input.root === "object" && input.root !== null
      ? parsedRootRecords.get(input.root)
      : undefined;
  if (rootRecord === undefined) {
    return blockedManifestRoot("FIRMWARE_ROOT_NOT_FROM_PARSER");
  }
  const facts = readParsedManifestFacts(input.manifest);
  if (facts === null) {
    return blockedManifestRoot("FIRMWARE_MANIFEST_NOT_FROM_PARSER");
  }
  if (facts.requiredRootMetadataVersion !== rootRecord.version) {
    return blockedManifestRoot("FIRMWARE_MANIFEST_ROOT_VERSION_MISMATCH");
  }
  const role = rootRecord.roles.get("synthetic");
  if (role === undefined || role.threshold !== 1) {
    return blockedManifestRoot(
      "FIRMWARE_MANIFEST_ROOT_ROLE_THRESHOLD_UNSUPPORTED",
    );
  }
  if (!role.keyIds.includes(facts.keyId)) {
    return blockedManifestRoot("FIRMWARE_MANIFEST_ROOT_KEY_NOT_AUTHORIZED");
  }
  const rawPublicKey = rootRecord.keys.get(facts.keyId);
  if (rawPublicKey === undefined) {
    return blockedManifestRoot("FIRMWARE_MANIFEST_ROOT_KEY_NOT_AUTHORIZED");
  }

  const freshness = await evaluateSyntheticFirmwareRootFreshness({
    root: input.root,
    clock: input.clock,
    signal: input.signal,
  });
  if (freshness.status === "BLOCKED") {
    return blockedManifestRoot(freshness.reason);
  }
  const signature = await verifySyntheticFirmwareManifestSignature({
    parsed: input.manifest,
    key: {
      assurance: "SYNTHETIC_ONLY",
      keyId: facts.keyId,
      rawPublicKey: rawPublicKey.slice(),
    },
    verifier: input.verifier,
    signal: input.signal,
  });
  if (signature.status === "BLOCKED") {
    return blockedManifestRoot(
      signature.reason as SyntheticFirmwareManifestSignatureBlockReason,
    );
  }

  const result: SyntheticFirmwareManifestRootVerificationResult = Object.freeze(
    {
      status: "VERIFIED_AGAINST_UNTRUSTED_ROOT",
      rootVersion: rootRecord.version,
      role: "synthetic",
      roleThreshold: 1,
      keyId: facts.keyId,
      checkedAt: freshness.checkedAt,
      clockAssurance: freshness.clockAssurance,
      verifierAssurance: signature.verification.assurance,
      targetIdentifier: facts.targetIdentifier,
      releaseSequence: facts.releaseSequence,
      artifactSha256: facts.artifactSha256,
      trustStatus: currentArtifactManifestTrustStatus,
    },
  );
  syntheticManifestRootVerificationRecords.set(result, {
    parsedRoot: input.root,
    rootVersion: rootRecord.version,
    targetIdentifier: facts.targetIdentifier,
    releaseSequence: facts.releaseSequence,
    artifactSha256: facts.artifactSha256,
  });
  return result;
}
