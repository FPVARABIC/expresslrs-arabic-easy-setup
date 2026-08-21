import {
  currentArtifactManifestTrustStatus,
  syntheticFirmwareTrustStateSchemaVersion,
  syntheticFirmwareTrustStateType,
  type ArtifactManifestTrustStatus,
  type SyntheticFirmwareReleaseFloorV1,
  type SyntheticFirmwareTrustStateV1,
} from "@elrs-easy/domain";

import {
  BoundedJsonError,
  canonicalizeBoundedJson,
  parseBoundedJson,
  type BoundedJsonLimits,
  type BoundedJsonValue,
} from "./bounded-json.js";
import type {
  SyntheticFirmwareManifestRootVerificationResult,
  SyntheticFirmwareRootRotationResult,
} from "./firmware-root-metadata.js";
import {
  syntheticManifestRootVerificationRecords,
  syntheticRootRotationRecords,
} from "./firmware-trust-internals.js";

export const maximumSyntheticFirmwareTrustStateBytes = 32 * 1024;

export const syntheticFirmwareTrustStateParseBlockReasons = [
  "FIRMWARE_TRUST_STATE_JSON_INVALID",
  "FIRMWARE_TRUST_STATE_DUPLICATE_KEY",
  "FIRMWARE_TRUST_STATE_LIMIT_EXCEEDED",
  "FIRMWARE_TRUST_STATE_UNSAFE_NUMBER",
  "FIRMWARE_TRUST_STATE_INVALID_UNICODE",
  "FIRMWARE_TRUST_STATE_SCHEMA_INVALID",
] as const;

export type SyntheticFirmwareTrustStateParseBlockReason =
  (typeof syntheticFirmwareTrustStateParseBlockReasons)[number];

export type ParsedSyntheticFirmwareTrustState = Readonly<{
  status: "PARSED_UNPERSISTED";
  state: SyntheticFirmwareTrustStateV1;
  assurance: "SYNTHETIC_ONLY";
  trustStatus: ArtifactManifestTrustStatus;
  copySerializedState: () => string;
}>;

export type SyntheticFirmwareTrustStateParseResult =
  | ParsedSyntheticFirmwareTrustState
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticFirmwareTrustStateParseBlockReason;
    }>;

export const syntheticFirmwareRootStateTransitionBlockReasons = [
  "FIRMWARE_TRUST_STATE_NOT_FROM_PARSER",
  "FIRMWARE_ROOT_ROTATION_NOT_VERIFIED",
  "FIRMWARE_ROOT_ROLLBACK",
  "FIRMWARE_ROOT_STATE_MISMATCH",
] as const;

export type SyntheticFirmwareRootStateTransitionBlockReason =
  (typeof syntheticFirmwareRootStateTransitionBlockReasons)[number];

export type SyntheticFirmwareRootStateTransitionResult =
  | Readonly<{
      status: "ADVANCED_UNPERSISTED";
      change: "ROOT_VERSION";
      previousRootVersion: number;
      highestRootMetadataVersion: number;
      state: ParsedSyntheticFirmwareTrustState;
      assurance: "SYNTHETIC_ONLY";
      trustStatus: ArtifactManifestTrustStatus;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticFirmwareRootStateTransitionBlockReason;
    }>;

export const syntheticFirmwareReleaseStateTransitionBlockReasons = [
  "FIRMWARE_TRUST_STATE_NOT_FROM_PARSER",
  "FIRMWARE_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
  "FIRMWARE_ROOT_ROLLBACK",
  "FIRMWARE_ROOT_STATE_NOT_ADVANCED",
  "FIRMWARE_RELEASE_ROLLBACK",
  "FIRMWARE_RELEASE_SEQUENCE_CONFLICT",
  "FIRMWARE_TRUST_STATE_CAPACITY_EXCEEDED",
] as const;

export type SyntheticFirmwareReleaseStateTransitionBlockReason =
  (typeof syntheticFirmwareReleaseStateTransitionBlockReasons)[number];

export type SyntheticFirmwareReleaseStateTransitionResult =
  | Readonly<{
      status: "ADVANCED_UNPERSISTED" | "UNCHANGED_UNPERSISTED";
      change: "RELEASE_SEQUENCE" | "NONE";
      highestRootMetadataVersion: number;
      targetIdentifier: string;
      highestReleaseSequence: number;
      state: ParsedSyntheticFirmwareTrustState;
      assurance: "SYNTHETIC_ONLY";
      trustStatus: ArtifactManifestTrustStatus;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: SyntheticFirmwareReleaseStateTransitionBlockReason;
    }>;

const stateJsonLimits: BoundedJsonLimits = Object.freeze({
  maximumUtf8Bytes: maximumSyntheticFirmwareTrustStateBytes,
  maximumDepth: 5,
  maximumStringCodeUnits: 256,
  maximumArrayElements: 128,
  maximumObjectMembers: 16,
  maximumTotalValues: 1_024,
});

const canonicalLowerIdentifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const canonicalSha256Pattern = /^[0-9a-f]{64}$/u;
const utf8Encoder = new TextEncoder();

interface TrustStateRecord {
  readonly state: SyntheticFirmwareTrustStateV1;
  readonly serialized: string;
}

const parsedTrustStateRecords = new WeakMap<object, TrustStateRecord>();

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

function isNonNegativeSafeInteger(value: BoundedJsonValue): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: BoundedJsonValue): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function floorIdentity(floor: {
  readonly channel: "synthetic";
  readonly targetIdentifier: string;
}): string {
  return `${floor.channel}\u0000${floor.targetIdentifier}`;
}

function compareFloorIdentity(
  first: SyntheticFirmwareReleaseFloorV1,
  second: SyntheticFirmwareReleaseFloorV1,
): number {
  const firstIdentity = floorIdentity(first);
  const secondIdentity = floorIdentity(second);
  return firstIdentity < secondIdentity
    ? -1
    : firstIdentity > secondIdentity
      ? 1
      : 0;
}

function rebuildReleaseFloors(
  value: BoundedJsonValue,
  highestRootMetadataVersion: number,
): readonly SyntheticFirmwareReleaseFloorV1[] | null {
  if (!Array.isArray(value) || value.length > 128) {
    return null;
  }
  const identities = new Set<string>();
  const floors: SyntheticFirmwareReleaseFloorV1[] = [];
  for (const item of value) {
    if (
      !hasExactFields(item, [
        "channel",
        "targetIdentifier",
        "highestReleaseSequence",
        "artifactSha256",
        "acceptedRootMetadataVersion",
      ]) ||
      item.channel !== "synthetic" ||
      typeof item.targetIdentifier !== "string" ||
      !canonicalLowerIdentifierPattern.test(item.targetIdentifier) ||
      !isPositiveSafeInteger(item.highestReleaseSequence) ||
      typeof item.artifactSha256 !== "string" ||
      !canonicalSha256Pattern.test(item.artifactSha256) ||
      !isPositiveSafeInteger(item.acceptedRootMetadataVersion) ||
      item.acceptedRootMetadataVersion > highestRootMetadataVersion
    ) {
      return null;
    }
    const floor = Object.freeze({
      channel: item.channel,
      targetIdentifier: item.targetIdentifier,
      highestReleaseSequence: item.highestReleaseSequence,
      artifactSha256: item.artifactSha256,
      acceptedRootMetadataVersion: item.acceptedRootMetadataVersion,
    });
    const identity = floorIdentity(floor);
    if (identities.has(identity)) {
      return null;
    }
    identities.add(identity);
    floors.push(floor);
  }
  floors.sort(compareFloorIdentity);
  return Object.freeze(floors);
}

function stateAsBoundedJson(
  state: SyntheticFirmwareTrustStateV1,
): BoundedJsonValue {
  const releaseFloors = state.releaseFloors.map((floor) =>
    Object.assign(Object.create(null) as { [key: string]: BoundedJsonValue }, {
      channel: floor.channel,
      targetIdentifier: floor.targetIdentifier,
      highestReleaseSequence: floor.highestReleaseSequence,
      artifactSha256: floor.artifactSha256,
      acceptedRootMetadataVersion: floor.acceptedRootMetadataVersion,
    }),
  );
  return Object.assign(
    Object.create(null) as { [key: string]: BoundedJsonValue },
    {
      schemaVersion: state.schemaVersion,
      stateType: state.stateType,
      highestRootMetadataVersion: state.highestRootMetadataVersion,
      releaseFloors,
    },
  );
}

function createParsedState(input: {
  readonly highestRootMetadataVersion: number;
  readonly releaseFloors: readonly SyntheticFirmwareReleaseFloorV1[];
}): ParsedSyntheticFirmwareTrustState {
  const releaseFloors = Object.freeze(
    input.releaseFloors.map((floor) =>
      Object.freeze({
        channel: floor.channel,
        targetIdentifier: floor.targetIdentifier,
        highestReleaseSequence: floor.highestReleaseSequence,
        artifactSha256: floor.artifactSha256,
        acceptedRootMetadataVersion: floor.acceptedRootMetadataVersion,
      }),
    ),
  );
  const state: SyntheticFirmwareTrustStateV1 = Object.freeze({
    schemaVersion: syntheticFirmwareTrustStateSchemaVersion,
    stateType: syntheticFirmwareTrustStateType,
    highestRootMetadataVersion: input.highestRootMetadataVersion,
    releaseFloors,
  });
  const serialized = canonicalizeBoundedJson(stateAsBoundedJson(state));
  const result: ParsedSyntheticFirmwareTrustState = Object.freeze({
    status: "PARSED_UNPERSISTED",
    state,
    assurance: "SYNTHETIC_ONLY",
    trustStatus: currentArtifactManifestTrustStatus,
    copySerializedState: () => serialized,
  });
  parsedTrustStateRecords.set(result, { state, serialized });
  return result;
}

function mapJsonFailure(
  error: BoundedJsonError,
): SyntheticFirmwareTrustStateParseBlockReason {
  switch (error.code) {
    case "DUPLICATE_KEY":
      return "FIRMWARE_TRUST_STATE_DUPLICATE_KEY";
    case "LIMIT_EXCEEDED":
      return "FIRMWARE_TRUST_STATE_LIMIT_EXCEEDED";
    case "UNSAFE_NUMBER":
      return "FIRMWARE_TRUST_STATE_UNSAFE_NUMBER";
    case "INVALID_UNICODE":
      return "FIRMWARE_TRUST_STATE_INVALID_UNICODE";
    case "INVALID_JSON":
      return "FIRMWARE_TRUST_STATE_JSON_INVALID";
  }
}

function blockedParse(
  reason: SyntheticFirmwareTrustStateParseBlockReason,
): SyntheticFirmwareTrustStateParseResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/** Strict codec for the proposed rollback-state record; it performs no I/O. */
export function parseSyntheticFirmwareTrustState(
  source: string,
): SyntheticFirmwareTrustStateParseResult {
  if (typeof source !== "string") {
    return blockedParse("FIRMWARE_TRUST_STATE_JSON_INVALID");
  }
  let parsed: BoundedJsonValue;
  try {
    parsed = parseBoundedJson(source, stateJsonLimits);
  } catch (error: unknown) {
    return blockedParse(
      error instanceof BoundedJsonError
        ? mapJsonFailure(error)
        : "FIRMWARE_TRUST_STATE_JSON_INVALID",
    );
  }
  if (
    !hasExactFields(parsed, [
      "schemaVersion",
      "stateType",
      "highestRootMetadataVersion",
      "releaseFloors",
    ]) ||
    parsed.schemaVersion !== syntheticFirmwareTrustStateSchemaVersion ||
    parsed.stateType !== syntheticFirmwareTrustStateType ||
    !isNonNegativeSafeInteger(parsed.highestRootMetadataVersion)
  ) {
    return blockedParse("FIRMWARE_TRUST_STATE_SCHEMA_INVALID");
  }
  const floors = rebuildReleaseFloors(
    parsed.releaseFloors,
    parsed.highestRootMetadataVersion,
  );
  if (
    floors === null ||
    (parsed.highestRootMetadataVersion === 0 && floors.length > 0)
  ) {
    return blockedParse("FIRMWARE_TRUST_STATE_SCHEMA_INVALID");
  }
  return createParsedState({
    highestRootMetadataVersion: parsed.highestRootMetadataVersion,
    releaseFloors: floors,
  });
}

export function createEmptySyntheticFirmwareTrustState(): ParsedSyntheticFirmwareTrustState {
  return createParsedState({
    highestRootMetadataVersion: 0,
    releaseFloors: [],
  });
}

function blockedRootTransition(
  reason: SyntheticFirmwareRootStateTransitionBlockReason,
): SyntheticFirmwareRootStateTransitionResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/** Advances only from an internally verified N -> N+1 rotation result. */
export function advanceSyntheticFirmwareRootState(input: {
  readonly state: ParsedSyntheticFirmwareTrustState;
  readonly rotation: SyntheticFirmwareRootRotationResult;
}): SyntheticFirmwareRootStateTransitionResult {
  const stateRecord =
    typeof input.state === "object" && input.state !== null
      ? parsedTrustStateRecords.get(input.state)
      : undefined;
  if (stateRecord === undefined) {
    return blockedRootTransition("FIRMWARE_TRUST_STATE_NOT_FROM_PARSER");
  }
  const rotationRecord =
    typeof input.rotation === "object" && input.rotation !== null
      ? syntheticRootRotationRecords.get(input.rotation)
      : undefined;
  if (rotationRecord === undefined) {
    return blockedRootTransition("FIRMWARE_ROOT_ROTATION_NOT_VERIFIED");
  }
  if (
    rotationRecord.incomingVersion <=
    stateRecord.state.highestRootMetadataVersion
  ) {
    return blockedRootTransition("FIRMWARE_ROOT_ROLLBACK");
  }
  if (
    rotationRecord.currentVersion !==
    stateRecord.state.highestRootMetadataVersion
  ) {
    return blockedRootTransition("FIRMWARE_ROOT_STATE_MISMATCH");
  }
  const nextState = createParsedState({
    highestRootMetadataVersion: rotationRecord.incomingVersion,
    releaseFloors: stateRecord.state.releaseFloors,
  });
  return Object.freeze({
    status: "ADVANCED_UNPERSISTED",
    change: "ROOT_VERSION",
    previousRootVersion: rotationRecord.currentVersion,
    highestRootMetadataVersion: rotationRecord.incomingVersion,
    state: nextState,
    assurance: "SYNTHETIC_ONLY",
    trustStatus: currentArtifactManifestTrustStatus,
  });
}

function blockedReleaseTransition(
  reason: SyntheticFirmwareReleaseStateTransitionBlockReason,
): SyntheticFirmwareReleaseStateTransitionResult {
  return Object.freeze({ status: "BLOCKED", reason });
}

/**
 * Proposes a monotonic release-floor snapshot after Manifest/root verification.
 * The caller must not mistake this immutable value for an atomic persistence.
 */
export function advanceSyntheticFirmwareReleaseState(input: {
  readonly state: ParsedSyntheticFirmwareTrustState;
  readonly verification: SyntheticFirmwareManifestRootVerificationResult;
}): SyntheticFirmwareReleaseStateTransitionResult {
  const stateRecord =
    typeof input.state === "object" && input.state !== null
      ? parsedTrustStateRecords.get(input.state)
      : undefined;
  if (stateRecord === undefined) {
    return blockedReleaseTransition("FIRMWARE_TRUST_STATE_NOT_FROM_PARSER");
  }
  const verificationRecord =
    typeof input.verification === "object" && input.verification !== null
      ? syntheticManifestRootVerificationRecords.get(input.verification)
      : undefined;
  if (verificationRecord === undefined) {
    return blockedReleaseTransition(
      "FIRMWARE_MANIFEST_ROOT_VERIFICATION_NOT_PROVEN",
    );
  }
  const highestRoot = stateRecord.state.highestRootMetadataVersion;
  if (verificationRecord.rootVersion < highestRoot) {
    return blockedReleaseTransition("FIRMWARE_ROOT_ROLLBACK");
  }
  if (verificationRecord.rootVersion > highestRoot) {
    return blockedReleaseTransition("FIRMWARE_ROOT_STATE_NOT_ADVANCED");
  }

  const identity = `synthetic\u0000${verificationRecord.targetIdentifier}`;
  const currentFloor = stateRecord.state.releaseFloors.find(
    (floor) => floorIdentity(floor) === identity,
  );
  if (
    currentFloor !== undefined &&
    verificationRecord.releaseSequence < currentFloor.highestReleaseSequence
  ) {
    return blockedReleaseTransition("FIRMWARE_RELEASE_ROLLBACK");
  }
  if (
    currentFloor !== undefined &&
    verificationRecord.releaseSequence === currentFloor.highestReleaseSequence
  ) {
    if (verificationRecord.artifactSha256 !== currentFloor.artifactSha256) {
      return blockedReleaseTransition("FIRMWARE_RELEASE_SEQUENCE_CONFLICT");
    }
    return Object.freeze({
      status: "UNCHANGED_UNPERSISTED",
      change: "NONE",
      highestRootMetadataVersion: highestRoot,
      targetIdentifier: verificationRecord.targetIdentifier,
      highestReleaseSequence: currentFloor.highestReleaseSequence,
      state: input.state,
      assurance: "SYNTHETIC_ONLY",
      trustStatus: currentArtifactManifestTrustStatus,
    });
  }

  const nextFloor: SyntheticFirmwareReleaseFloorV1 = Object.freeze({
    channel: "synthetic",
    targetIdentifier: verificationRecord.targetIdentifier,
    highestReleaseSequence: verificationRecord.releaseSequence,
    artifactSha256: verificationRecord.artifactSha256,
    acceptedRootMetadataVersion: verificationRecord.rootVersion,
  });
  const nextFloors = stateRecord.state.releaseFloors
    .filter((floor) => floorIdentity(floor) !== identity)
    .concat(nextFloor)
    .sort(compareFloorIdentity);
  const candidateState: SyntheticFirmwareTrustStateV1 = {
    schemaVersion: syntheticFirmwareTrustStateSchemaVersion,
    stateType: syntheticFirmwareTrustStateType,
    highestRootMetadataVersion: highestRoot,
    releaseFloors: nextFloors,
  };
  if (
    nextFloors.length > stateJsonLimits.maximumArrayElements ||
    utf8Encoder.encode(
      canonicalizeBoundedJson(stateAsBoundedJson(candidateState)),
    ).byteLength > maximumSyntheticFirmwareTrustStateBytes
  ) {
    return blockedReleaseTransition("FIRMWARE_TRUST_STATE_CAPACITY_EXCEEDED");
  }
  const nextState = createParsedState({
    highestRootMetadataVersion: highestRoot,
    releaseFloors: nextFloors,
  });
  return Object.freeze({
    status: "ADVANCED_UNPERSISTED",
    change: "RELEASE_SEQUENCE",
    highestRootMetadataVersion: highestRoot,
    targetIdentifier: verificationRecord.targetIdentifier,
    highestReleaseSequence: verificationRecord.releaseSequence,
    state: nextState,
    assurance: "SYNTHETIC_ONLY",
    trustStatus: currentArtifactManifestTrustStatus,
  });
}
