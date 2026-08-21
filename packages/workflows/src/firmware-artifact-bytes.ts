import {
  firmwareArtifactDigestAssurances,
  maximumFirmwareArtifactSizeBytes,
  type CancellationSignal,
  type FirmwareArtifactByteVerification,
  type FirmwareArtifactDigestAssurance,
  type FirmwareArtifactDigestProvider,
} from "@elrs-easy/domain";

import {
  assertNotAborted,
  copyExactUint8Array,
  isAbortError,
  readDataMethod,
  readOwnDataProperty,
} from "./sensitive-operation-helpers.js";

export const firmwareArtifactByteBlockReasons = [
  "FIRMWARE_ARTIFACT_BYTES_INVALID",
  "FIRMWARE_ARTIFACT_SIZE_LIMIT_EXCEEDED",
  "FIRMWARE_ARTIFACT_SIZE_MISMATCH",
  "FIRMWARE_ARTIFACT_DIGEST_PROVIDER_INVALID",
  "FIRMWARE_ARTIFACT_DIGEST_FAILED",
  "FIRMWARE_ARTIFACT_DIGEST_INVALID",
  "FIRMWARE_ARTIFACT_DIGEST_MISMATCH",
] as const;

export type FirmwareArtifactByteBlockReason =
  (typeof firmwareArtifactByteBlockReasons)[number];

export type FirmwareArtifactByteSnapshot =
  | {
      readonly status: "READY";
      readonly byteLength: number;
      readonly copyBytes: () => Uint8Array;
    }
  | {
      readonly status: "BLOCKED";
      readonly reason:
        | "FIRMWARE_ARTIFACT_BYTES_INVALID"
        | "FIRMWARE_ARTIFACT_SIZE_LIMIT_EXCEEDED";
    };

export type VerifiedFirmwareArtifactBytes =
  | {
      readonly status: "VERIFIED";
      readonly verification: FirmwareArtifactByteVerification;
      readonly copyBytes: () => Uint8Array;
    }
  | {
      readonly status: "BLOCKED";
      readonly reason: FirmwareArtifactByteBlockReason;
    };

const canonicalSha256Pattern = /^[0-9a-f]{64}$/u;
/**
 * Copies caller-controlled bytes before the operation machine publishes IDLE.
 * Later mutation of the original view therefore cannot change what is hashed
 * or handed to a provider.
 */
export function snapshotFirmwareArtifactBytes(
  value: unknown,
): FirmwareArtifactByteSnapshot {
  const bytes = copyExactUint8Array(value);
  if (bytes === null || bytes.byteLength === 0) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_BYTES_INVALID",
    });
  }
  if (bytes.byteLength > maximumFirmwareArtifactSizeBytes) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_SIZE_LIMIT_EXCEEDED",
    });
  }

  return Object.freeze({
    status: "READY",
    byteLength: bytes.byteLength,
    copyBytes: () => bytes.slice(),
  });
}

function isDigestAssurance(
  value: unknown,
): value is FirmwareArtifactDigestAssurance {
  return firmwareArtifactDigestAssurances.some(
    (assurance) => assurance === value,
  );
}

/**
 * Checks exact byte length and SHA-256 before any update provider is invoked.
 * The returned closure supplies fresh copies so validation or preparation
 * cannot mutate the bytes later handed to the writer.
 */
export async function verifyFirmwareArtifactBytes(input: {
  readonly snapshot: FirmwareArtifactByteSnapshot;
  readonly expectedByteLength: number;
  readonly expectedSha256: string;
  readonly digestProvider: FirmwareArtifactDigestProvider;
  readonly signal?: CancellationSignal;
}): Promise<VerifiedFirmwareArtifactBytes> {
  if (input.snapshot.status === "BLOCKED") {
    return input.snapshot;
  }
  if (input.snapshot.byteLength !== input.expectedByteLength) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_SIZE_MISMATCH",
    });
  }

  const assurance = readOwnDataProperty(input.digestProvider, "assurance");
  const digestMethod = readDataMethod(input.digestProvider, "digestSha256");
  if (!isDigestAssurance(assurance) || digestMethod === null) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DIGEST_PROVIDER_INVALID",
    });
  }

  let sha256: unknown;
  try {
    assertNotAborted(input.signal);
    sha256 = await Reflect.apply(digestMethod, input.digestProvider, [
      input.snapshot.copyBytes(),
      input.signal,
    ]);
    assertNotAborted(input.signal);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DIGEST_FAILED",
    });
  }

  if (typeof sha256 !== "string" || !canonicalSha256Pattern.test(sha256)) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DIGEST_INVALID",
    });
  }
  if (sha256 !== input.expectedSha256) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DIGEST_MISMATCH",
    });
  }

  const verification: FirmwareArtifactByteVerification = Object.freeze({
    status: "VERIFIED",
    algorithm: "SHA-256",
    assurance,
    byteLength: input.snapshot.byteLength,
    sha256,
  });
  return Object.freeze({
    status: "VERIFIED",
    verification,
    copyBytes: input.snapshot.copyBytes,
  });
}
