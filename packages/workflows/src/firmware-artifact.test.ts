import type { FirmwareUpdateArtifact } from "@elrs-easy/compatibility";
import { describe, expect, it } from "vitest";

import { snapshotFirmwareUpdateArtifact } from "./firmware-artifact.js";

const artifactSha256 =
  "2d71b8db0ff7388c78ebfa3e6f4d74f4d67887e9a5d75665c509ead24f9c88ee";

function mutableArtifact(): FirmwareUpdateArtifact {
  return {
    targetId: "fixture.tx.alpha-2g4",
    firmwareVersion: "4.2.0",
    sha256: artifactSha256,
    provenance: {
      schemaVersion: "1",
      applicationVersion: "0.0.0",
      coreVersion: "0.0.0",
      upstreamRepository: "https://example.invalid/expresslrs-synthetic",
      upstreamVersion: "synthetic-fixture",
      upstreamCommitSha: "0".repeat(40),
      patchSetVersion: "synthetic-none",
      targetId: "fixture.tx.alpha-2g4",
      buildConfigurationDigest: `sha256:${"1".repeat(64)}`,
      toolchainIdentity: "synthetic/no-build",
      builtAt: "2026-08-20T08:00:00.000Z",
      artifactSizeBytes: 4096,
      artifactSha256,
    },
  };
}

describe("Firmware update artifact snapshot", () => {
  it("rebuilds and deep-freezes a coherent provenance envelope", () => {
    const source = mutableArtifact();
    const snapshot = snapshotFirmwareUpdateArtifact(source);

    expect(snapshot.status).toBe("READY");
    if (snapshot.status !== "READY") {
      return;
    }
    expect(snapshot.artifact.provenance).toMatchObject({
      schemaVersion: "1",
      targetId: source.targetId,
      artifactSizeBytes: 4096,
      artifactSha256,
    });
    expect(snapshot.provenanceValidation).toBe("COHERENCE_ONLY");
    expect(Object.isFrozen(snapshot.artifact)).toBe(true);
    expect(Object.isFrozen(snapshot.artifact.provenance)).toBe(true);

    (source as { firmwareVersion: string }).firmwareVersion = "9.9.9";
    (source.provenance as { targetId: string }).targetId = "fixture.rx.mutated";
    expect(snapshot.artifact.firmwareVersion).toBe("4.2.0");
    expect(snapshot.artifact.provenance.targetId).toBe("fixture.tx.alpha-2g4");
  });

  it("rejects malformed descriptor digests before provenance is trusted", () => {
    expect(
      snapshotFirmwareUpdateArtifact({
        ...mutableArtifact(),
        sha256: "not-a-canonical-sha256",
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DESCRIPTOR_INVALID",
    });
  });

  it.each([
    ["schemaVersion", "2"],
    ["upstreamRepository", "https://user:secret@example.invalid/repo"],
    ["upstreamCommitSha", "short"],
    ["buildConfigurationDigest", "sha256:not-a-digest"],
    ["builtAt", "2026-08-20"],
    ["artifactSizeBytes", 0],
  ] as const)("rejects invalid provenance field %s", (field, value) => {
    const artifact = mutableArtifact();
    Object.assign(artifact.provenance, { [field]: value });

    expect(snapshotFirmwareUpdateArtifact(artifact)).toEqual({
      status: "BLOCKED",
      reason: "ARTIFACT_PROVENANCE_INVALID",
    });
  });

  it("rejects Target or digest disagreement across the envelope", () => {
    const wrongTarget = mutableArtifact();
    Object.assign(wrongTarget.provenance, {
      targetId: "fixture.rx.beta-subghz",
    });
    const wrongDigest = mutableArtifact();
    Object.assign(wrongDigest.provenance, {
      artifactSha256: "a".repeat(64),
    });

    expect(snapshotFirmwareUpdateArtifact(wrongTarget)).toEqual({
      status: "BLOCKED",
      reason: "ARTIFACT_PROVENANCE_MISMATCH",
    });
    expect(snapshotFirmwareUpdateArtifact(wrongDigest)).toEqual({
      status: "BLOCKED",
      reason: "ARTIFACT_PROVENANCE_MISMATCH",
    });
  });

  it("never executes artifact or provenance accessors", () => {
    let artifactGetterCalls = 0;
    const hostileArtifact = Object.defineProperty(
      { ...mutableArtifact() },
      "targetId",
      {
        get() {
          artifactGetterCalls += 1;
          return "fixture.tx.alpha-2g4";
        },
      },
    );
    expect(snapshotFirmwareUpdateArtifact(hostileArtifact)).toEqual({
      status: "BLOCKED",
      reason: "FIRMWARE_ARTIFACT_DESCRIPTOR_INVALID",
    });
    expect(artifactGetterCalls).toBe(0);

    let provenanceGetterCalls = 0;
    const hostileProvenance = mutableArtifact();
    Object.defineProperty(hostileProvenance.provenance, "artifactSha256", {
      get() {
        provenanceGetterCalls += 1;
        return artifactSha256;
      },
    });
    expect(snapshotFirmwareUpdateArtifact(hostileProvenance)).toEqual({
      status: "BLOCKED",
      reason: "ARTIFACT_PROVENANCE_INVALID",
    });
    expect(provenanceGetterCalls).toBe(0);
  });

  it("does not enumerate unknown artifact fields", () => {
    let ownKeyCalls = 0;
    const source = mutableArtifact();
    const proxy = new Proxy(source, {
      ownKeys() {
        ownKeyCalls += 1;
        throw new Error("unknown-secret-field");
      },
    });

    expect(snapshotFirmwareUpdateArtifact(proxy).status).toBe("READY");
    expect(ownKeyCalls).toBe(0);
  });
});
