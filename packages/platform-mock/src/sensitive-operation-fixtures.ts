import type { FirmwareUpdateArtifact } from "@elrs-easy/compatibility";

import { fixtureById, type SyntheticDeviceFixture } from "./fixtures.js";

function reconnectFixture(
  fixture: SyntheticDeviceFixture,
  descriptorId: string,
  fixtureId: string,
): SyntheticDeviceFixture {
  return Object.freeze({
    ...fixture,
    fixtureId,
    descriptor: Object.freeze({ ...fixture.descriptor, id: descriptorId }),
  });
}

const defaultSyntheticArtifactSha256 =
  "2d71b8db0ff7388c78ebfa3e6f4d74f4d67887e9a5d75665c509ead24f9c88ee";

/** Creates coherent metadata only; no Firmware bytes or signed manifest exist. */
export function createSyntheticFirmwareArtifact(input: {
  readonly targetId: string;
  readonly firmwareVersion?: string;
  readonly sha256?: string;
}): FirmwareUpdateArtifact {
  const firmwareVersion = input.firmwareVersion ?? "4.2.0";
  const sha256 = input.sha256 ?? defaultSyntheticArtifactSha256;
  return Object.freeze({
    targetId: input.targetId,
    firmwareVersion,
    sha256,
    provenance: Object.freeze({
      schemaVersion: "1",
      applicationVersion: "0.0.0",
      coreVersion: "0.0.0",
      upstreamRepository: "https://example.invalid/expresslrs-synthetic",
      upstreamVersion: "synthetic-fixture",
      upstreamCommitSha: "0".repeat(40),
      patchSetVersion: "synthetic-none",
      targetId: input.targetId,
      buildConfigurationDigest: `sha256:${"1".repeat(64)}`,
      toolchainIdentity: "synthetic/no-build",
      builtAt: "2026-08-20T08:00:00.000Z",
      artifactSizeBytes: 4096,
      artifactSha256: sha256,
    }),
  });
}

export const compatibleFirmwareArtifact = createSyntheticFirmwareArtifact({
  targetId: "fixture.tx.alpha-2g4",
});

export const majorVersionMismatchArtifact = createSyntheticFirmwareArtifact({
  targetId: "fixture.tx.alpha-2g4",
  firmwareVersion: "5.0.0",
  sha256: "78f1cd5204bfa17cd4bcab089755335057f1258fced4f6fb79e791e4f53a9c40",
});

const initial = fixtureById("known-tx-2g4");

export const sensitiveOperationFixtures = Object.freeze({
  initial,
  sameDeviceAfterReboot: initial,
  sameTargetDifferentDevice: reconnectFixture(
    initial,
    "mock-device-tx-2g4-clone",
    "known-tx-2g4-clone",
  ),
  wrongTargetAfterReboot: reconnectFixture(
    fixtureById("known-rx-subghz"),
    initial.descriptor.id,
    "wrong-target-at-expected-descriptor",
  ),
  ambiguousAfterReconnect: reconnectFixture(
    fixtureById("ambiguous-family"),
    initial.descriptor.id,
    "ambiguous-at-expected-descriptor",
  ),
});
