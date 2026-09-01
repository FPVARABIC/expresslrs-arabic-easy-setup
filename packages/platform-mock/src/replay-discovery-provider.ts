import type { DiscoveryProvider } from "@elrs-easy/device";
import {
  CoreOperationError,
  type CancellationSignal,
  type Capability,
  type DeviceDescriptor,
  type DeviceIdentityEvidence,
  type DeviceSession,
} from "@elrs-easy/domain";

import type { SyntheticDeviceFixture } from "./fixtures.js";

function assertNotAborted(signal?: CancellationSignal): void {
  if (signal?.aborted === true) {
    const error = new Error("The synthetic replay was cancelled");
    error.name = "AbortError";
    throw error;
  }
}

export interface DiscoveryReplayEntry {
  readonly descriptor: DeviceDescriptor;
  readonly evidence: readonly DeviceIdentityEvidence[];
  readonly capabilities: readonly Capability[];
}

export interface DiscoveryReplay {
  readonly schemaVersion: "1";
  readonly replayId: string;
  readonly capturedAt: string;
  readonly dataClassification: "SYNTHETIC_NON_SENSITIVE";
  readonly entries: readonly DiscoveryReplayEntry[];
}

export function createSyntheticDiscoveryReplay(input: {
  readonly replayId: string;
  readonly capturedAt: string;
  readonly fixtures: readonly SyntheticDeviceFixture[];
}): DiscoveryReplay {
  if (input.replayId.trim().length === 0) {
    throw new TypeError("Replay id must not be empty");
  }
  return Object.freeze({
    schemaVersion: "1",
    replayId: input.replayId,
    capturedAt: input.capturedAt,
    dataClassification: "SYNTHETIC_NON_SENSITIVE",
    entries: Object.freeze(
      input.fixtures.map((fixture) =>
        Object.freeze({
          descriptor: Object.freeze({ ...fixture.descriptor }),
          evidence: Object.freeze([...fixture.evidence]),
          capabilities: Object.freeze([...fixture.capabilities]),
        }),
      ),
    ),
  });
}

/** Replays a privacy-classified deterministic discovery trace. */
export class ReplayDiscoveryProvider implements DiscoveryProvider {
  public readonly id: string;
  readonly #entries: ReadonlyMap<string, DiscoveryReplayEntry>;

  public constructor(replay: DiscoveryReplay) {
    if (replay.dataClassification !== "SYNTHETIC_NON_SENSITIVE") {
      throw new TypeError(
        "Only reviewed synthetic replay data is allowed in M1",
      );
    }
    this.id = `synthetic-replay:${replay.replayId}`;
    this.#entries = new Map(
      replay.entries.map((entry) => [entry.descriptor.id, entry] as const),
    );
  }

  public async discover(
    signal?: CancellationSignal,
  ): Promise<readonly DeviceDescriptor[]> {
    assertNotAborted(signal);
    return Object.freeze(
      [...this.#entries.values()].map((entry) => entry.descriptor),
    );
  }

  public async readIdentity(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly DeviceIdentityEvidence[]> {
    assertNotAborted(signal);
    return this.#entry(session).evidence;
  }

  public async readCapabilities(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly Capability[]> {
    assertNotAborted(signal);
    return this.#entry(session).capabilities;
  }

  #entry(session: DeviceSession): DiscoveryReplayEntry {
    const entry = this.#entries.get(session.deviceId);
    if (entry === undefined) {
      throw new CoreOperationError({
        code: "DEVICE_NOT_FOUND",
        reason: "REPLAY_DEVICE_NOT_FOUND",
        details: { deviceId: session.deviceId },
        retryable: false,
      });
    }
    return entry;
  }
}
