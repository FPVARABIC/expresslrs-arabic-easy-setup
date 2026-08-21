import { describe, expect, it } from "vitest";

import {
  currentArtifactManifestTrustStatus,
  firmwareArtifactDecompressionAssurances,
  firmwareRootMetadataCanonicalization,
  firmwareRootMetadataSchemaVersion,
  firmwareRootMetadataSignatureAlgorithm,
  firmwareTrustClockAssurances,
  firmwareUpdateProviderAssurances,
  maximumCompressedFirmwareArtifactSizeBytes,
  maximumFirmwareArtifactDecompressionChunks,
  maximumFirmwareArtifactDecompressionChunkSizeBytes,
  maximumFirmwareArtifactSizeBytes,
  signedFirmwareManifestCanonicalization,
  signedFirmwareManifestSchemaVersion,
  signedFirmwareManifestSignatureAlgorithm,
  syntheticCompressedFirmwareArtifactSchemaVersion,
  syntheticCompressedFirmwareArtifactType,
  syntheticFirmwareExecutableByteForm,
  syntheticFirmwareExecutableFormat,
  syntheticFirmwareRootMetadataType,
  syntheticFirmwareRootRoles,
  syntheticFirmwareTrustStateSchemaVersion,
  syntheticFirmwareTrustStateType,
  type SignedFirmwareManifestEnvelope,
} from "./firmware.js";

describe("Firmware trust constants", () => {
  it("keeps real writers and manifest trust unadmitted", () => {
    expect(firmwareUpdateProviderAssurances).toEqual(["SYNTHETIC_ONLY"]);
    expect(currentArtifactManifestTrustStatus).toBe("UNVERIFIED_NO_TRUST_ROOT");
  });

  it("pins the signed-manifest wire design without treating it as verified", () => {
    const envelope: SignedFirmwareManifestEnvelope<{ readonly id: string }> = {
      schemaVersion: signedFirmwareManifestSchemaVersion,
      canonicalization: signedFirmwareManifestCanonicalization,
      payload: { id: "synthetic-manifest" },
      signature: {
        algorithm: signedFirmwareManifestSignatureAlgorithm,
        keyId: "untrusted-example-key",
        signatureBase64Url: "untrusted-example-signature",
      },
    };

    expect(envelope).toMatchObject({
      schemaVersion: "1",
      canonicalization: "RFC8785",
      signature: { algorithm: "Ed25519" },
    });
    expect(maximumFirmwareArtifactSizeBytes).toBe(64 * 1024 * 1024);
  });

  it("keeps root metadata, time, and rollback state Synthetic-only", () => {
    expect({
      schemaVersion: firmwareRootMetadataSchemaVersion,
      canonicalization: firmwareRootMetadataCanonicalization,
      algorithm: firmwareRootMetadataSignatureAlgorithm,
      metadataType: syntheticFirmwareRootMetadataType,
      roles: syntheticFirmwareRootRoles,
    }).toEqual({
      schemaVersion: "1",
      canonicalization: "RFC8785",
      algorithm: "Ed25519",
      metadataType: "synthetic-root",
      roles: ["root", "synthetic"],
    });
    expect(firmwareTrustClockAssurances).toEqual(["SYNTHETIC_ONLY"]);
    expect({
      schemaVersion: syntheticFirmwareTrustStateSchemaVersion,
      stateType: syntheticFirmwareTrustStateType,
    }).toEqual({
      schemaVersion: "1",
      stateType: "synthetic-firmware-trust-state",
    });
  });

  it("pins bounded compressed fixtures without admitting writable bytes", () => {
    expect(firmwareArtifactDecompressionAssurances).toEqual(["SYNTHETIC_ONLY"]);
    expect(maximumCompressedFirmwareArtifactSizeBytes).toBe(16 * 1024 * 1024);
    expect(maximumFirmwareArtifactDecompressionChunkSizeBytes).toBe(64 * 1024);
    expect(maximumFirmwareArtifactDecompressionChunks).toBe(4096);
    expect({
      schemaVersion: syntheticCompressedFirmwareArtifactSchemaVersion,
      artifactType: syntheticCompressedFirmwareArtifactType,
      byteForm: syntheticFirmwareExecutableByteForm,
      executableFormat: syntheticFirmwareExecutableFormat,
    }).toEqual({
      schemaVersion: "1",
      artifactType: "synthetic-compressed-firmware-artifact",
      byteForm: "SYNTHETIC_EXECUTABLE_FIXTURE",
      executableFormat: "ELRS_EASY_SYNTHETIC_EXECUTABLE_V1",
    });
  });
});
