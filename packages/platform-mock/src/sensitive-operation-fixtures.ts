import type { FirmwareArtifactDescriptor } from "@elrs-easy/compatibility";
import type { ArtifactProvenance } from "@elrs-easy/domain";

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

export const compatibleFirmwareArtifact: FirmwareArtifactDescriptor =
  Object.freeze({
    targetId: "fixture.tx.alpha-2g4",
    firmwareVersion: "4.2.0",
    sha256: "2d71b8db0ff7388c78ebfa3e6f4d74f4d67887e9a5d75665c509ead24f9c88ee",
  });

export const compatibleFirmwareProvenance: ArtifactProvenance = Object.freeze({
  applicationVersion: "0.4.0-simulation",
  coreVersion: "0.4.0-simulation",
  upstreamRepository: "https://github.com/ExpressLRS/ExpressLRS",
  upstreamVersion: "4.1.0",
  upstreamCommitSha: "a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6",
  patchSetVersion: "synthetic-m4-preview-v1",
  targetId: compatibleFirmwareArtifact.targetId,
  buildConfigurationDigest: "c".repeat(64),
  toolchainIdentity: "synthetic-node-24-no-firmware-build",
  builtAt: "2026-08-20T08:00:00.000Z",
  artifactSha256: compatibleFirmwareArtifact.sha256,
});

export const majorVersionMismatchArtifact: FirmwareArtifactDescriptor =
  Object.freeze({
    ...compatibleFirmwareArtifact,
    firmwareVersion: "5.0.0",
    sha256: "78f1cd5204bfa17cd4bcab089755335057f1258fced4f6fb79e791e4f53a9c40",
  });

export const majorVersionMismatchProvenance: ArtifactProvenance = Object.freeze(
  {
    ...compatibleFirmwareProvenance,
    artifactSha256: majorVersionMismatchArtifact.sha256,
  },
);

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
