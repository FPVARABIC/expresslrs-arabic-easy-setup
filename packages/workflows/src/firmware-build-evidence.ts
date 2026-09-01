import {
  currentArtifactManifestTrustStatus,
  firmwareArtifactDigestAssurances,
  maximumSyntheticFirmwareBuildOutputChunks,
  maximumSyntheticFirmwareBuildOutputChunkSizeBytes,
  maximumSyntheticFirmwareBuildRecipeBytes,
  syntheticDeclaredBuildInputIds,
  syntheticFirmwareBuildRecipeInputIds,
  syntheticFirmwareBuildRecipeSchemaVersion,
  syntheticFirmwareBuildRecipeType,
  syntheticFirmwareFixtureBuildReceiptType,
  type CancellationSignal,
  type FirmwareArtifactDigestAssurance,
  type FirmwareArtifactDigestProvider,
  type SyntheticFirmwareBuildRecipeInputV1,
  type SyntheticFirmwareBuildRecipeOutputV1,
  type SyntheticFirmwareBuildRecipeV1,
  type SyntheticFirmwareFixtureBuildOutputProvider,
  type SyntheticFirmwareFixtureBuildReceipt,
} from "@elrs-easy/domain";

import {
  BoundedJsonError,
  canonicalizeBoundedJson,
  parseBoundedJson,
  type BoundedJsonFailureCode,
  type BoundedJsonLimits,
  type BoundedJsonValue,
} from "./bounded-json.js";
import type { SyntheticFirmwareSourceReviewEvidenceResult } from "./firmware-source-evidence.js";
import {
  syntheticDistributionManifestRootVerificationRecords,
  syntheticFirmwareBuildOutputComparisonRecords,
  syntheticFirmwareBuildRecipeInspectionRecords,
  syntheticFirmwareSourceReviewRecords,
  syntheticSourceInventoryInspectionRecords,
  type SyntheticFirmwareBuildRecipeInputRecord,
} from "./firmware-trust-internals.js";
import {
  assertNotAborted,
  copyExactUint8Array,
  isAbortError,
  readDataMethod,
  readOwnDataProperty,
} from "./sensitive-operation-helpers.js";

export const syntheticFirmwareBuildRecipeInspectionBlockReasons = [
  "SYNTHETIC_SOURCE_REVIEW_EVIDENCE_NOT_PROVEN",
  "SYNTHETIC_BUILD_RECIPE_SOURCE_LINK_NOT_PROVEN",
  "SYNTHETIC_BUILD_RECIPE_BYTES_INVALID",
  "SYNTHETIC_BUILD_RECIPE_SIZE_MISMATCH",
  "SYNTHETIC_BUILD_RECIPE_DIGEST_PROVIDER_INVALID",
  "SYNTHETIC_BUILD_RECIPE_DIGEST_FAILED",
  "SYNTHETIC_BUILD_RECIPE_DIGEST_INVALID",
  "SYNTHETIC_BUILD_RECIPE_DIGEST_MISMATCH",
  "SYNTHETIC_BUILD_RECIPE_JSON_INVALID",
  "SYNTHETIC_BUILD_RECIPE_DUPLICATE_KEY",
  "SYNTHETIC_BUILD_RECIPE_LIMIT_EXCEEDED",
  "SYNTHETIC_BUILD_RECIPE_UNSAFE_NUMBER",
  "SYNTHETIC_BUILD_RECIPE_INVALID_UNICODE",
  "SYNTHETIC_BUILD_RECIPE_NOT_CANONICAL",
  "SYNTHETIC_BUILD_RECIPE_SCHEMA_INVALID",
  "SYNTHETIC_BUILD_RECIPE_RELEASE_MISMATCH",
  "SYNTHETIC_BUILD_RECIPE_INPUT_MISMATCH",
  "SYNTHETIC_BUILD_RECIPE_OUTPUT_MISMATCH",
] as const;

export type SyntheticFirmwareBuildRecipeInspectionBlockReason =
  (typeof syntheticFirmwareBuildRecipeInspectionBlockReasons)[number];

export type SyntheticFirmwareBuildRecipeInspectionStage =
  | "SOURCE_REVIEW_EVIDENCE"
  | "RECIPE_INPUT"
  | "RECIPE_SCHEMA"
  | "SOURCE_LINKAGE"
  | "OUTPUT_LINKAGE";

export type SyntheticFirmwareBuildRecipeInspectionResult =
  | Readonly<{
      status: "VERIFIED_SYNTHETIC_FIRMWARE_BUILD_RECIPE";
      validationLevel: "SYNTHETIC_ONLY";
      trustStatus: typeof currentArtifactManifestTrustStatus;
      recipeCanonicalization: "RFC8785";
      recipePath: string;
      recipeSizeBytes: number;
      recipeSha256: string;
      recipeLinkedInputCount: 5;
      declaredBuildInputCount: 6;
      buildInputDisposition: "FIVE_INPUTS_LINKED_AND_CONFIGURATION_SELF_HASHED";
      outputDisposition: "EXACT_SIGNED_SYNTHETIC_ARTIFACT_IDENTITY_LINKED";
      reproducibilityDisposition: "NOT_PROVEN";
      byteDisposition: "HASHED_INSPECTED_AND_DISCARDED";
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE";
      targetIdentifier: string;
      rootVersion: number;
      releaseSequence: number;
      artifactName: string;
      artifactSizeBytes: number;
      artifactSha256: string;
    }>
  | Readonly<{
      status: "BLOCKED";
      stage: SyntheticFirmwareBuildRecipeInspectionStage;
      reason: SyntheticFirmwareBuildRecipeInspectionBlockReason;
    }>;

export const syntheticFirmwareBuildOutputComparisonBlockReasons = [
  "SYNTHETIC_SOURCE_REVIEW_EVIDENCE_NOT_PROVEN",
  "SYNTHETIC_BUILD_RECIPE_INSPECTION_NOT_PROVEN",
  "SYNTHETIC_BUILD_COMPARISON_EVIDENCE_MISMATCH",
  "SYNTHETIC_BUILD_OUTPUT_PROVIDER_INVALID",
  "SYNTHETIC_BUILD_OUTPUT_DIGEST_PROVIDER_INVALID",
  "SYNTHETIC_BUILD_OUTPUT_PROVIDER_FAILED",
  "SYNTHETIC_BUILD_OUTPUT_CHUNK_INVALID",
  "SYNTHETIC_BUILD_OUTPUT_CHUNK_SIZE_LIMIT_EXCEEDED",
  "SYNTHETIC_BUILD_OUTPUT_CHUNK_LIMIT_EXCEEDED",
  "SYNTHETIC_BUILD_OUTPUT_SIZE_MISMATCH",
  "SYNTHETIC_BUILD_RECEIPT_INVALID",
  "SYNTHETIC_BUILD_RECEIPT_MISMATCH",
  "SYNTHETIC_BUILD_OUTPUT_DIGEST_FAILED",
  "SYNTHETIC_BUILD_OUTPUT_DIGEST_INVALID",
  "SYNTHETIC_BUILD_OUTPUT_DIGEST_MISMATCH",
] as const;

export type SyntheticFirmwareBuildOutputComparisonBlockReason =
  (typeof syntheticFirmwareBuildOutputComparisonBlockReasons)[number];

export type SyntheticFirmwareBuildOutputComparisonStage =
  "EVIDENCE" | "PROVIDER" | "OUTPUT_STREAM" | "RECEIPT" | "OUTPUT_DIGEST";

export type SyntheticFirmwareBuildOutputComparisonEvidenceResult =
  | Readonly<{
      status: "SYNTHETIC_FIRMWARE_BUILD_OUTPUT_COMPARISON_EVIDENCE";
      validationLevel: "SYNTHETIC_ONLY";
      trustStatus: typeof currentArtifactManifestTrustStatus;
      recipeStatus: "VERIFIED_SYNTHETIC_FIRMWARE_BUILD_RECIPE";
      providerAssurance: "SYNTHETIC_ONLY";
      digestAssurance: FirmwareArtifactDigestAssurance;
      catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC";
      toolchainDisposition: "NOT_INVOKED_PROVIDER_RECEIPT_ONLY";
      receiptDisposition: "EXACT_SYNTHETIC_RECEIPT_MATCHED";
      outputComparisonDisposition: "CORE_SHA256_MATCHED_SIGNED_SYNTHETIC_ARTIFACT";
      independenceDisposition: "SEPARATE_SYNTHETIC_PROVIDER_BOUNDARY_ONLY";
      reproducibilityDisposition: "NOT_PROVEN_SINGLE_SYNTHETIC_PROVIDER";
      byteDisposition: "HASHED_COMPARED_AND_DISCARDED";
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE";
      targetIdentifier: string;
      rootVersion: number;
      releaseSequence: number;
      recipeSha256: string;
      artifactName: string;
      artifactSizeBytes: number;
      artifactSha256: string;
    }>
  | Readonly<{
      status: "BLOCKED";
      stage: SyntheticFirmwareBuildOutputComparisonStage;
      reason: SyntheticFirmwareBuildOutputComparisonBlockReason;
    }>;

interface DigestRuntime {
  readonly provider: FirmwareArtifactDigestProvider;
  readonly method: FirmwareArtifactDigestProvider["digestSha256"];
  readonly assurance: FirmwareArtifactDigestAssurance;
}

type CanonicalJsonBlockReason =
  BoundedJsonFailureCode | "NON_UTF8" | "NOT_CANONICAL";

type CanonicalJsonResult =
  | Readonly<{ status: "READY"; value: BoundedJsonValue }>
  | Readonly<{ status: "BLOCKED"; reason: CanonicalJsonBlockReason }>;

const recipeLimits: BoundedJsonLimits = Object.freeze({
  maximumUtf8Bytes: maximumSyntheticFirmwareBuildRecipeBytes,
  maximumDepth: 5,
  maximumStringCodeUnits: 256,
  maximumArrayElements: syntheticFirmwareBuildRecipeInputIds.length,
  maximumObjectMembers: 6,
  maximumTotalValues: 96,
});
const recipeFields = [
  "buildRecipeSchema",
  "recipeType",
  "targetIdentifier",
  "releaseSequence",
  "inputs",
  "output",
] as const;
const recipeInputFields = [
  "buildInputId",
  "sourcePath",
  "sizeBytes",
  "sha256",
] as const;
const recipeOutputFields = [
  "name",
  "mediaType",
  "sizeBytes",
  "sha256",
] as const;
const receiptFields = [
  "receiptSchema",
  "receiptType",
  "targetIdentifier",
  "releaseSequence",
  "recipeSha256",
  "declaredInputCount",
  "outputName",
  "outputMediaType",
  "outputSizeBytes",
  "outputSha256",
] as const;
const canonicalSha256Pattern = /^[0-9a-f]{64}$/u;
const targetIdentifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const archivePathPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,95}$/u;
const objectNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function recipeBlocked(
  stage: SyntheticFirmwareBuildRecipeInspectionStage,
  reason: SyntheticFirmwareBuildRecipeInspectionBlockReason,
): SyntheticFirmwareBuildRecipeInspectionResult {
  return Object.freeze({ status: "BLOCKED", stage, reason });
}

function comparisonBlocked(
  stage: SyntheticFirmwareBuildOutputComparisonStage,
  reason: SyntheticFirmwareBuildOutputComparisonBlockReason,
): SyntheticFirmwareBuildOutputComparisonEvidenceResult {
  return Object.freeze({ status: "BLOCKED", stage, reason });
}

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

function isCanonicalArchivePath(value: string): boolean {
  return (
    archivePathPattern.test(value) &&
    !value.includes("//") &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    value.split("/").every((segment) => segment !== "." && segment !== "..")
  );
}

function parseCanonicalJson(bytes: Uint8Array): CanonicalJsonResult {
  let source: string;
  try {
    source = textDecoder.decode(bytes);
  } catch {
    return Object.freeze({ status: "BLOCKED", reason: "NON_UTF8" });
  }
  try {
    const value = parseBoundedJson(source, recipeLimits);
    if (canonicalizeBoundedJson(value) !== source) {
      return Object.freeze({ status: "BLOCKED", reason: "NOT_CANONICAL" });
    }
    return Object.freeze({ status: "READY", value });
  } catch (error: unknown) {
    return Object.freeze({
      status: "BLOCKED",
      reason:
        error instanceof BoundedJsonError
          ? error.code
          : ("INVALID_JSON" as const),
    });
  }
}

function recipeJsonReason(
  reason: CanonicalJsonBlockReason,
): SyntheticFirmwareBuildRecipeInspectionBlockReason {
  switch (reason) {
    case "DUPLICATE_KEY":
      return "SYNTHETIC_BUILD_RECIPE_DUPLICATE_KEY";
    case "LIMIT_EXCEEDED":
      return "SYNTHETIC_BUILD_RECIPE_LIMIT_EXCEEDED";
    case "UNSAFE_NUMBER":
      return "SYNTHETIC_BUILD_RECIPE_UNSAFE_NUMBER";
    case "INVALID_UNICODE":
    case "NON_UTF8":
      return "SYNTHETIC_BUILD_RECIPE_INVALID_UNICODE";
    case "NOT_CANONICAL":
      return "SYNTHETIC_BUILD_RECIPE_NOT_CANONICAL";
    default:
      return "SYNTHETIC_BUILD_RECIPE_JSON_INVALID";
  }
}

function rebuildRecipeInput(
  value: BoundedJsonValue,
  expectedId: (typeof syntheticFirmwareBuildRecipeInputIds)[number],
): SyntheticFirmwareBuildRecipeInputV1 | null {
  if (!hasExactFields(value, recipeInputFields)) {
    return null;
  }
  if (
    value.buildInputId !== expectedId ||
    typeof value.sourcePath !== "string" ||
    !isCanonicalArchivePath(value.sourcePath) ||
    !isPositiveSafeInteger(value.sizeBytes) ||
    typeof value.sha256 !== "string" ||
    !canonicalSha256Pattern.test(value.sha256)
  ) {
    return null;
  }
  return Object.freeze({
    buildInputId: expectedId,
    sourcePath: value.sourcePath,
    sizeBytes: value.sizeBytes,
    sha256: value.sha256,
  });
}

function rebuildRecipeOutput(
  value: BoundedJsonValue,
): SyntheticFirmwareBuildRecipeOutputV1 | null {
  if (!hasExactFields(value, recipeOutputFields)) {
    return null;
  }
  if (
    typeof value.name !== "string" ||
    !objectNamePattern.test(value.name) ||
    value.mediaType !== "application/gzip" ||
    !isPositiveSafeInteger(value.sizeBytes) ||
    typeof value.sha256 !== "string" ||
    !canonicalSha256Pattern.test(value.sha256)
  ) {
    return null;
  }
  return Object.freeze({
    name: value.name,
    mediaType: "application/gzip",
    sizeBytes: value.sizeBytes,
    sha256: value.sha256,
  });
}

function rebuildRecipe(
  value: BoundedJsonValue,
): SyntheticFirmwareBuildRecipeV1 | null {
  if (
    !hasExactFields(value, recipeFields) ||
    value.buildRecipeSchema !== syntheticFirmwareBuildRecipeSchemaVersion ||
    value.recipeType !== syntheticFirmwareBuildRecipeType ||
    typeof value.targetIdentifier !== "string" ||
    !targetIdentifierPattern.test(value.targetIdentifier) ||
    !isPositiveSafeInteger(value.releaseSequence) ||
    !Array.isArray(value.inputs) ||
    value.inputs.length !== syntheticFirmwareBuildRecipeInputIds.length
  ) {
    return null;
  }
  const inputs: SyntheticFirmwareBuildRecipeInputV1[] = [];
  for (
    let index = 0;
    index < syntheticFirmwareBuildRecipeInputIds.length;
    index += 1
  ) {
    const expectedId = syntheticFirmwareBuildRecipeInputIds[index]!;
    const input = rebuildRecipeInput(value.inputs[index]!, expectedId);
    if (input === null) {
      return null;
    }
    inputs.push(input);
  }
  const output = rebuildRecipeOutput(value.output);
  if (output === null) {
    return null;
  }
  return Object.freeze({
    buildRecipeSchema: syntheticFirmwareBuildRecipeSchemaVersion,
    recipeType: syntheticFirmwareBuildRecipeType,
    targetIdentifier: value.targetIdentifier,
    releaseSequence: value.releaseSequence,
    inputs: Object.freeze(inputs),
    output,
  });
}

function captureDigestRuntime(value: unknown): DigestRuntime | null {
  const assurance = readOwnDataProperty(value, "assurance");
  const method = readDataMethod(value, "digestSha256");
  if (
    !firmwareArtifactDigestAssurances.some(
      (candidate) => candidate === assurance,
    ) ||
    method === null
  ) {
    return null;
  }
  return Object.freeze({
    provider: value as FirmwareArtifactDigestProvider,
    method: method as FirmwareArtifactDigestProvider["digestSha256"],
    assurance: assurance as FirmwareArtifactDigestAssurance,
  });
}

async function digestBytes(input: {
  readonly runtime: DigestRuntime;
  readonly bytes: Uint8Array;
  readonly signal?: CancellationSignal;
}): Promise<
  | Readonly<{ status: "READY"; sha256: string }>
  | Readonly<{ status: "BLOCKED"; reason: "FAILED" | "INVALID" }>
> {
  const providerBytes = input.bytes.slice();
  let value: unknown;
  try {
    assertNotAborted(input.signal);
    value = await Reflect.apply(input.runtime.method, input.runtime.provider, [
      providerBytes,
      input.signal,
    ]);
    assertNotAborted(input.signal);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }
    return Object.freeze({ status: "BLOCKED", reason: "FAILED" });
  } finally {
    providerBytes.fill(0);
  }
  if (typeof value !== "string" || !canonicalSha256Pattern.test(value)) {
    return Object.freeze({ status: "BLOCKED", reason: "INVALID" });
  }
  return Object.freeze({ status: "READY", sha256: value });
}

function sameRecipeInput(
  actual: SyntheticFirmwareBuildRecipeInputV1,
  expected: SyntheticFirmwareBuildRecipeInputRecord,
): boolean {
  return (
    actual.buildInputId === expected.buildInputId &&
    actual.sourcePath === expected.sourcePath &&
    actual.sizeBytes === expected.sizeBytes &&
    actual.sha256 === expected.sha256
  );
}

/**
 * Verifies the exact canonical recipe carried by the already-inspected
 * `build-configuration` source entry. Recipe bytes never leave this call.
 */
export async function inspectSyntheticFirmwareBuildRecipe(input: {
  readonly sourceReviewEvidence: SyntheticFirmwareSourceReviewEvidenceResult;
  readonly buildRecipeBytes: Uint8Array;
  readonly digestProvider: FirmwareArtifactDigestProvider;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticFirmwareBuildRecipeInspectionResult> {
  const sourceReviewEvidence = readOwnDataProperty(
    input,
    "sourceReviewEvidence",
  );
  const sourceReviewRecord =
    typeof sourceReviewEvidence === "object" && sourceReviewEvidence !== null
      ? syntheticFirmwareSourceReviewRecords.get(sourceReviewEvidence)
      : undefined;
  if (sourceReviewRecord === undefined) {
    return recipeBlocked(
      "SOURCE_REVIEW_EVIDENCE",
      "SYNTHETIC_SOURCE_REVIEW_EVIDENCE_NOT_PROVEN",
    );
  }
  const sourceRecord = syntheticSourceInventoryInspectionRecords.get(
    sourceReviewRecord.sourceInspection,
  );
  const rootRecord =
    sourceRecord === undefined
      ? undefined
      : syntheticDistributionManifestRootVerificationRecords.get(
          sourceRecord.distributionRootVerification,
        );
  if (sourceRecord === undefined || rootRecord === undefined) {
    return recipeBlocked(
      "SOURCE_REVIEW_EVIDENCE",
      "SYNTHETIC_BUILD_RECIPE_SOURCE_LINK_NOT_PROVEN",
    );
  }
  const configurationEntry = sourceRecord.entries.find(
    (entry) => entry.buildInputId === "build-configuration",
  );
  if (configurationEntry === undefined) {
    return recipeBlocked(
      "SOURCE_REVIEW_EVIDENCE",
      "SYNTHETIC_BUILD_RECIPE_SOURCE_LINK_NOT_PROVEN",
    );
  }

  const recipeBytes = copyExactUint8Array(
    readOwnDataProperty(input, "buildRecipeBytes"),
  );
  if (
    recipeBytes === null ||
    recipeBytes.byteLength === 0 ||
    recipeBytes.byteLength > maximumSyntheticFirmwareBuildRecipeBytes
  ) {
    return recipeBlocked(
      "RECIPE_INPUT",
      "SYNTHETIC_BUILD_RECIPE_BYTES_INVALID",
    );
  }
  const signal = readOwnDataProperty(input, "signal") as
    CancellationSignal | undefined;
  try {
    if (recipeBytes.byteLength !== configurationEntry.sizeBytes) {
      return recipeBlocked(
        "RECIPE_INPUT",
        "SYNTHETIC_BUILD_RECIPE_SIZE_MISMATCH",
      );
    }
    const digestRuntime = captureDigestRuntime(
      readOwnDataProperty(input, "digestProvider"),
    );
    if (digestRuntime === null) {
      return recipeBlocked(
        "RECIPE_INPUT",
        "SYNTHETIC_BUILD_RECIPE_DIGEST_PROVIDER_INVALID",
      );
    }
    const digest = await digestBytes({
      runtime: digestRuntime,
      bytes: recipeBytes,
      ...(signal === undefined ? {} : { signal }),
    });
    if (digest.status === "BLOCKED") {
      return recipeBlocked(
        "RECIPE_INPUT",
        digest.reason === "FAILED"
          ? "SYNTHETIC_BUILD_RECIPE_DIGEST_FAILED"
          : "SYNTHETIC_BUILD_RECIPE_DIGEST_INVALID",
      );
    }
    if (digest.sha256 !== configurationEntry.sha256) {
      return recipeBlocked(
        "RECIPE_INPUT",
        "SYNTHETIC_BUILD_RECIPE_DIGEST_MISMATCH",
      );
    }

    const parsed = parseCanonicalJson(recipeBytes);
    if (parsed.status === "BLOCKED") {
      return recipeBlocked("RECIPE_SCHEMA", recipeJsonReason(parsed.reason));
    }
    const recipe = rebuildRecipe(parsed.value);
    if (recipe === null) {
      return recipeBlocked(
        "RECIPE_SCHEMA",
        "SYNTHETIC_BUILD_RECIPE_SCHEMA_INVALID",
      );
    }
    if (
      recipe.targetIdentifier !== sourceRecord.targetIdentifier ||
      recipe.targetIdentifier !== rootRecord.targetIdentifier ||
      recipe.releaseSequence !== sourceRecord.releaseSequence ||
      recipe.releaseSequence !== rootRecord.releaseSequence
    ) {
      return recipeBlocked(
        "SOURCE_LINKAGE",
        "SYNTHETIC_BUILD_RECIPE_RELEASE_MISMATCH",
      );
    }

    const expectedInputs: SyntheticFirmwareBuildRecipeInputRecord[] = [];
    for (const buildInputId of syntheticFirmwareBuildRecipeInputIds) {
      const entry = sourceRecord.entries.find(
        (candidate) => candidate.buildInputId === buildInputId,
      );
      if (entry === undefined) {
        return recipeBlocked(
          "SOURCE_LINKAGE",
          "SYNTHETIC_BUILD_RECIPE_SOURCE_LINK_NOT_PROVEN",
        );
      }
      expectedInputs.push(
        Object.freeze({
          buildInputId,
          sourcePath: entry.path,
          sizeBytes: entry.sizeBytes,
          sha256: entry.sha256,
        }),
      );
    }
    if (
      recipe.inputs.length !== expectedInputs.length ||
      recipe.inputs.some(
        (recipeInput, index) =>
          !sameRecipeInput(recipeInput, expectedInputs[index]!),
      )
    ) {
      return recipeBlocked(
        "SOURCE_LINKAGE",
        "SYNTHETIC_BUILD_RECIPE_INPUT_MISMATCH",
      );
    }
    if (
      recipe.output.name !== rootRecord.artifact.name ||
      recipe.output.mediaType !== rootRecord.artifact.mediaType ||
      recipe.output.sizeBytes !== rootRecord.artifact.sizeBytes ||
      recipe.output.sha256 !== rootRecord.artifact.sha256
    ) {
      return recipeBlocked(
        "OUTPUT_LINKAGE",
        "SYNTHETIC_BUILD_RECIPE_OUTPUT_MISMATCH",
      );
    }

    const result: SyntheticFirmwareBuildRecipeInspectionResult = Object.freeze({
      status: "VERIFIED_SYNTHETIC_FIRMWARE_BUILD_RECIPE",
      validationLevel: "SYNTHETIC_ONLY",
      trustStatus: currentArtifactManifestTrustStatus,
      recipeCanonicalization: "RFC8785",
      recipePath: configurationEntry.path,
      recipeSizeBytes: configurationEntry.sizeBytes,
      recipeSha256: configurationEntry.sha256,
      recipeLinkedInputCount: 5,
      declaredBuildInputCount: syntheticDeclaredBuildInputIds.length as 6,
      buildInputDisposition: "FIVE_INPUTS_LINKED_AND_CONFIGURATION_SELF_HASHED",
      outputDisposition: "EXACT_SIGNED_SYNTHETIC_ARTIFACT_IDENTITY_LINKED",
      reproducibilityDisposition: "NOT_PROVEN",
      byteDisposition: "HASHED_INSPECTED_AND_DISCARDED",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
      targetIdentifier: sourceRecord.targetIdentifier,
      rootVersion: rootRecord.rootVersion,
      releaseSequence: sourceRecord.releaseSequence,
      artifactName: rootRecord.artifact.name,
      artifactSizeBytes: rootRecord.artifact.sizeBytes,
      artifactSha256: rootRecord.artifact.sha256,
    });
    syntheticFirmwareBuildRecipeInspectionRecords.set(result, {
      sourceReviewEvidence: sourceReviewEvidence as object,
      targetIdentifier: sourceRecord.targetIdentifier,
      rootVersion: rootRecord.rootVersion,
      releaseSequence: sourceRecord.releaseSequence,
      recipePath: configurationEntry.path,
      recipeSizeBytes: configurationEntry.sizeBytes,
      recipeSha256: configurationEntry.sha256,
      inputs: Object.freeze(expectedInputs),
      output: Object.freeze({ ...recipe.output }),
    });
    return result;
  } finally {
    recipeBytes.fill(0);
  }
}

function hasExactReceiptDataProperties(
  value: unknown,
): value is SyntheticFirmwareFixtureBuildReceipt {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== receiptFields.length ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          !receiptFields.includes(key as (typeof receiptFields)[number]),
      )
    ) {
      return false;
    }
    return receiptFields.every((field) => {
      const descriptor = descriptors[field];
      return (
        descriptor !== undefined &&
        "value" in descriptor &&
        descriptor.enumerable === true
      );
    });
  } catch {
    return false;
  }
}

function receiptMatches(
  receipt: SyntheticFirmwareFixtureBuildReceipt,
  record: {
    readonly targetIdentifier: string;
    readonly releaseSequence: number;
    readonly recipeSha256: string;
    readonly output: Readonly<{
      readonly name: string;
      readonly mediaType: "application/gzip";
      readonly sizeBytes: number;
      readonly sha256: string;
    }>;
  },
  measuredSizeBytes: number,
): boolean {
  return (
    readOwnDataProperty(receipt, "receiptSchema") === "1" &&
    readOwnDataProperty(receipt, "receiptType") ===
      syntheticFirmwareFixtureBuildReceiptType &&
    readOwnDataProperty(receipt, "targetIdentifier") ===
      record.targetIdentifier &&
    readOwnDataProperty(receipt, "releaseSequence") ===
      record.releaseSequence &&
    readOwnDataProperty(receipt, "recipeSha256") === record.recipeSha256 &&
    readOwnDataProperty(receipt, "declaredInputCount") ===
      syntheticDeclaredBuildInputIds.length &&
    readOwnDataProperty(receipt, "outputName") === record.output.name &&
    readOwnDataProperty(receipt, "outputMediaType") ===
      record.output.mediaType &&
    readOwnDataProperty(receipt, "outputSizeBytes") === measuredSizeBytes &&
    measuredSizeBytes === record.output.sizeBytes &&
    readOwnDataProperty(receipt, "outputSha256") === record.output.sha256
  );
}

/**
 * Compares output from a separate Synthetic fixture provider with the exact
 * signed distribution artifact. No toolchain is invoked and no bytes escape.
 */
export async function compareSyntheticFirmwareFixtureBuildOutput(input: {
  readonly sourceReviewEvidence: SyntheticFirmwareSourceReviewEvidenceResult;
  readonly recipeInspection: SyntheticFirmwareBuildRecipeInspectionResult;
  readonly provider: SyntheticFirmwareFixtureBuildOutputProvider;
  readonly digestProvider: FirmwareArtifactDigestProvider;
  readonly signal?: CancellationSignal;
}): Promise<SyntheticFirmwareBuildOutputComparisonEvidenceResult> {
  const sourceReviewEvidence = readOwnDataProperty(
    input,
    "sourceReviewEvidence",
  );
  const sourceReviewRecord =
    typeof sourceReviewEvidence === "object" && sourceReviewEvidence !== null
      ? syntheticFirmwareSourceReviewRecords.get(sourceReviewEvidence)
      : undefined;
  if (sourceReviewRecord === undefined) {
    return comparisonBlocked(
      "EVIDENCE",
      "SYNTHETIC_SOURCE_REVIEW_EVIDENCE_NOT_PROVEN",
    );
  }
  const recipeInspection = readOwnDataProperty(input, "recipeInspection");
  const recipeRecord =
    typeof recipeInspection === "object" && recipeInspection !== null
      ? syntheticFirmwareBuildRecipeInspectionRecords.get(recipeInspection)
      : undefined;
  if (recipeRecord === undefined) {
    return comparisonBlocked(
      "EVIDENCE",
      "SYNTHETIC_BUILD_RECIPE_INSPECTION_NOT_PROVEN",
    );
  }
  if (
    recipeRecord.sourceReviewEvidence !== sourceReviewEvidence ||
    recipeRecord.targetIdentifier !== sourceReviewRecord.targetIdentifier ||
    recipeRecord.releaseSequence !== sourceReviewRecord.releaseSequence ||
    recipeRecord.output.sha256 !== sourceReviewRecord.artifactSha256
  ) {
    return comparisonBlocked(
      "EVIDENCE",
      "SYNTHETIC_BUILD_COMPARISON_EVIDENCE_MISMATCH",
    );
  }

  const provider = readOwnDataProperty(input, "provider");
  const assurance = readOwnDataProperty(provider, "assurance");
  const produceFixtureBuildOutput = readDataMethod(
    provider,
    "produceFixtureBuildOutput",
  );
  if (assurance !== "SYNTHETIC_ONLY" || produceFixtureBuildOutput === null) {
    return comparisonBlocked(
      "PROVIDER",
      "SYNTHETIC_BUILD_OUTPUT_PROVIDER_INVALID",
    );
  }
  const digestRuntime = captureDigestRuntime(
    readOwnDataProperty(input, "digestProvider"),
  );
  if (digestRuntime === null) {
    return comparisonBlocked(
      "PROVIDER",
      "SYNTHETIC_BUILD_OUTPUT_DIGEST_PROVIDER_INVALID",
    );
  }
  const signal = readOwnDataProperty(input, "signal") as
    CancellationSignal | undefined;
  const request = Object.freeze({
    schemaVersion: "1" as const,
    operation: "SYNTHETIC_FIXTURE_OUTPUT_COMPARISON" as const,
    targetIdentifier: recipeRecord.targetIdentifier,
    releaseSequence: recipeRecord.releaseSequence,
    recipe: Object.freeze({
      sourcePath: recipeRecord.recipePath,
      sizeBytes: recipeRecord.recipeSizeBytes,
      sha256: recipeRecord.recipeSha256,
    }),
    inputs: recipeRecord.inputs,
    expectedOutput: recipeRecord.output,
  });

  const chunks: Uint8Array[] = [];
  const clearChunks = (): void => {
    for (const chunk of chunks) {
      chunk.fill(0);
    }
    chunks.length = 0;
  };
  const sinkAbort = Object.freeze({});
  let accepting = true;
  let chunkCount = 0;
  let byteLength = 0;
  let sinkFailure: SyntheticFirmwareBuildOutputComparisonBlockReason | null =
    null;
  const emitChunk = (value: Uint8Array): void => {
    if (!accepting) {
      return;
    }
    assertNotAborted(signal);
    if (sinkFailure !== null) {
      throw sinkAbort;
    }
    const chunk = copyExactUint8Array(value);
    if (chunk === null || chunk.byteLength === 0) {
      sinkFailure = "SYNTHETIC_BUILD_OUTPUT_CHUNK_INVALID";
      throw sinkAbort;
    }
    if (chunk.byteLength > maximumSyntheticFirmwareBuildOutputChunkSizeBytes) {
      sinkFailure = "SYNTHETIC_BUILD_OUTPUT_CHUNK_SIZE_LIMIT_EXCEEDED";
      throw sinkAbort;
    }
    chunkCount += 1;
    if (chunkCount > maximumSyntheticFirmwareBuildOutputChunks) {
      sinkFailure = "SYNTHETIC_BUILD_OUTPUT_CHUNK_LIMIT_EXCEEDED";
      throw sinkAbort;
    }
    const nextByteLength = byteLength + chunk.byteLength;
    if (nextByteLength > recipeRecord.output.sizeBytes) {
      sinkFailure = "SYNTHETIC_BUILD_OUTPUT_SIZE_MISMATCH";
      throw sinkAbort;
    }
    chunks.push(chunk);
    byteLength = nextByteLength;
  };

  let receipt: unknown;
  try {
    assertNotAborted(signal);
    receipt = await Reflect.apply(produceFixtureBuildOutput, provider, [
      request,
      emitChunk,
      signal,
    ]);
    assertNotAborted(signal);
  } catch (error: unknown) {
    accepting = false;
    if (isAbortError(error)) {
      clearChunks();
      throw error;
    }
    clearChunks();
    return comparisonBlocked(
      "OUTPUT_STREAM",
      sinkFailure ?? "SYNTHETIC_BUILD_OUTPUT_PROVIDER_FAILED",
    );
  }
  accepting = false;
  if (sinkFailure !== null) {
    clearChunks();
    return comparisonBlocked("OUTPUT_STREAM", sinkFailure);
  }
  if (byteLength !== recipeRecord.output.sizeBytes) {
    clearChunks();
    return comparisonBlocked(
      "OUTPUT_STREAM",
      "SYNTHETIC_BUILD_OUTPUT_SIZE_MISMATCH",
    );
  }
  if (!hasExactReceiptDataProperties(receipt)) {
    clearChunks();
    return comparisonBlocked("RECEIPT", "SYNTHETIC_BUILD_RECEIPT_INVALID");
  }
  if (!receiptMatches(receipt, recipeRecord, byteLength)) {
    clearChunks();
    return comparisonBlocked("RECEIPT", "SYNTHETIC_BUILD_RECEIPT_MISMATCH");
  }

  const outputBytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    outputBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const digest = await (async () => {
    try {
      return await digestBytes({
        runtime: digestRuntime,
        bytes: outputBytes,
        ...(signal === undefined ? {} : { signal }),
      });
    } finally {
      outputBytes.fill(0);
      clearChunks();
    }
  })();
  if (digest.status === "BLOCKED") {
    return comparisonBlocked(
      "OUTPUT_DIGEST",
      digest.reason === "FAILED"
        ? "SYNTHETIC_BUILD_OUTPUT_DIGEST_FAILED"
        : "SYNTHETIC_BUILD_OUTPUT_DIGEST_INVALID",
    );
  }
  if (digest.sha256 !== recipeRecord.output.sha256) {
    return comparisonBlocked(
      "OUTPUT_DIGEST",
      "SYNTHETIC_BUILD_OUTPUT_DIGEST_MISMATCH",
    );
  }

  const result: SyntheticFirmwareBuildOutputComparisonEvidenceResult =
    Object.freeze({
      status: "SYNTHETIC_FIRMWARE_BUILD_OUTPUT_COMPARISON_EVIDENCE",
      validationLevel: "SYNTHETIC_ONLY",
      trustStatus: currentArtifactManifestTrustStatus,
      recipeStatus: "VERIFIED_SYNTHETIC_FIRMWARE_BUILD_RECIPE",
      providerAssurance: "SYNTHETIC_ONLY",
      digestAssurance: digestRuntime.assurance,
      catalogDisposition: "NOT_ADMITTED_UNTRUSTED_SYNTHETIC",
      toolchainDisposition: "NOT_INVOKED_PROVIDER_RECEIPT_ONLY",
      receiptDisposition: "EXACT_SYNTHETIC_RECEIPT_MATCHED",
      outputComparisonDisposition:
        "CORE_SHA256_MATCHED_SIGNED_SYNTHETIC_ARTIFACT",
      independenceDisposition: "SEPARATE_SYNTHETIC_PROVIDER_BOUNDARY_ONLY",
      reproducibilityDisposition: "NOT_PROVEN_SINGLE_SYNTHETIC_PROVIDER",
      byteDisposition: "HASHED_COMPARED_AND_DISCARDED",
      writeDisposition: "BLOCKED_SYNTHETIC_FIXTURE",
      targetIdentifier: recipeRecord.targetIdentifier,
      rootVersion: recipeRecord.rootVersion,
      releaseSequence: recipeRecord.releaseSequence,
      recipeSha256: recipeRecord.recipeSha256,
      artifactName: recipeRecord.output.name,
      artifactSizeBytes: recipeRecord.output.sizeBytes,
      artifactSha256: recipeRecord.output.sha256,
    });
  syntheticFirmwareBuildOutputComparisonRecords.set(result, {
    sourceReviewEvidence: sourceReviewEvidence as object,
    recipeInspection: recipeInspection as object,
    targetIdentifier: recipeRecord.targetIdentifier,
    releaseSequence: recipeRecord.releaseSequence,
    recipeSha256: recipeRecord.recipeSha256,
    artifactSha256: recipeRecord.output.sha256,
  });
  return result;
}
