import type { FirmwareArtifactDescriptor } from "@elrs-easy/compatibility";

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

export const majorVersionMismatchArtifact: FirmwareArtifactDescriptor =
  Object.freeze({
    ...compatibleFirmwareArtifact,
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
