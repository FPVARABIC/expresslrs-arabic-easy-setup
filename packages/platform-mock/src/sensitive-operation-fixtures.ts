import type { FirmwareUpdateArtifact } from "@elrs-easy/compatibility";
import type {
  CancellationSignal,
  FirmwareArtifactDigestProvider,
} from "@elrs-easy/domain";

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
  "bb50289f8b754449c732d87f74370bea84c1a4e496f39389f428065b20057c9d";
const syntheticFirmwareArtifactSizeBytes = 4096;

export function createSyntheticFirmwareArtifactBytes(): Uint8Array {
  const bytes = new Uint8Array(syntheticFirmwareArtifactSizeBytes);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (index * 31 + 17) % 251;
  }
  return bytes;
}

/**
 * Fixture-only digest boundary. It recognizes the complete deterministic byte
 * sequence and remains labeled Synthetic; Browser Web Crypto is tested in its
 * own adapter.
 */
export const syntheticFirmwareArtifactDigestProvider: FirmwareArtifactDigestProvider =
  Object.freeze({
    assurance: "SYNTHETIC_ONLY",
    async digestSha256(
      bytes: Uint8Array,
      signal?: CancellationSignal,
    ): Promise<string> {
      if (signal?.aborted === true) {
        const error = new Error("The Synthetic digest was cancelled");
        error.name = "AbortError";
        throw error;
      }
      const expected = createSyntheticFirmwareArtifactBytes();
      if (
        bytes.byteLength !== expected.byteLength ||
        bytes.some((value, index) => value !== expected[index])
      ) {
        return "0".repeat(64);
      }
      return defaultSyntheticArtifactSha256;
    },
  });

/** Creates coherent Synthetic metadata for the deterministic fixture bytes. */
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
      artifactSizeBytes: syntheticFirmwareArtifactSizeBytes,
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
