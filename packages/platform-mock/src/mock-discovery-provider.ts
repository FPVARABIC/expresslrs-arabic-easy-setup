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

export type MockFailureStage =
  "DISCOVER" | "READ_IDENTITY" | "READ_CAPABILITIES";

export interface MockDiscoveryCall {
  readonly method: "discover" | "readIdentity" | "readCapabilities";
  readonly deviceId: string | null;
}

function assertNotAborted(signal?: CancellationSignal): void {
  if (signal?.aborted === true) {
    const error = new Error("The synthetic operation was cancelled");
    error.name = "AbortError";
    throw error;
  }
}

export class MockDiscoveryProvider implements DiscoveryProvider {
  public readonly id = "synthetic-discovery";
  readonly #fixtures: ReadonlyMap<string, SyntheticDeviceFixture>;
  readonly #failureStage: MockFailureStage | null;
  readonly #calls: MockDiscoveryCall[] = [];

  public constructor(
    fixtures: readonly SyntheticDeviceFixture[],
    failureStage: MockFailureStage | null = null,
  ) {
    this.#fixtures = new Map(
      fixtures.map((fixture) => [fixture.descriptor.id, fixture] as const),
    );
    this.#failureStage = failureStage;
  }

  public get calls(): readonly MockDiscoveryCall[] {
    return Object.freeze([...this.#calls]);
  }

  public async discover(
    signal?: CancellationSignal,
  ): Promise<readonly DeviceDescriptor[]> {
    assertNotAborted(signal);
    this.#calls.push({ method: "discover", deviceId: null });
    this.#maybeFail("DISCOVER");
    return [...this.#fixtures.values()].map((fixture) => fixture.descriptor);
  }

  public async readIdentity(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly DeviceIdentityEvidence[]> {
    assertNotAborted(signal);
    this.#calls.push({ method: "readIdentity", deviceId: session.deviceId });
    this.#maybeFail("READ_IDENTITY");
    return this.#fixture(session).evidence;
  }

  public async readCapabilities(
    session: DeviceSession,
    signal?: CancellationSignal,
  ): Promise<readonly Capability[]> {
    assertNotAborted(signal);
    this.#calls.push({
      method: "readCapabilities",
      deviceId: session.deviceId,
    });
    this.#maybeFail("READ_CAPABILITIES");
    return this.#fixture(session).capabilities;
  }

  #fixture(session: DeviceSession): SyntheticDeviceFixture {
    const fixture = this.#fixtures.get(session.deviceId);
    if (fixture === undefined) {
      throw new CoreOperationError({
        code: "DEVICE_NOT_FOUND",
        reason: "SYNTHETIC_DEVICE_NOT_FOUND",
        details: { deviceId: session.deviceId },
        retryable: false,
      });
    }
    return fixture;
  }

  #maybeFail(stage: MockFailureStage): void {
    if (this.#failureStage === stage) {
      throw new CoreOperationError({
        code: "CONNECTION_LOST",
        reason: `SYNTHETIC_FAILURE_${stage}`,
        details: { stage },
        retryable: true,
      });
    }
  }
}
