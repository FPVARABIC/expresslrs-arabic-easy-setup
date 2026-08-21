import { describe, expect, it } from "vitest";

import {
  currentArtifactManifestTrustStatus,
  firmwareRootMetadataCanonicalization,
  firmwareRootMetadataSchemaVersion,
  firmwareRootMetadataSignatureAlgorithm,
  firmwareTrustClockAssurances,
  firmwareUpdateProviderAssurances,
  maximumFirmwareArtifactSizeBytes,
  signedFirmwareManifestCanonicalization,
  signedFirmwareManifestSchemaVersion,
  signedFirmwareManifestSignatureAlgorithm,
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
});
