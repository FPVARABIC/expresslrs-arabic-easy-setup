import {
  CoreOperationError,
  type DeviceSession,
  type SessionOwner,
} from "@elrs-easy/domain";

import type { DeviceSessionManager } from "./contracts.js";

export interface SessionClock {
  now(): string;
}

export interface SessionIdFactory {
  next(): string;
}

const systemClock: SessionClock = {
  now: () => new Date().toISOString(),
};

const randomIdFactory: SessionIdFactory = {
  next: () => globalThis.crypto.randomUUID(),
};

function sameOwner(left: SessionOwner, right: SessionOwner): boolean {
  return left.id === right.id && left.kind === right.kind;
}

/** One in-process owner may hold a device at a time. */
export class ExclusiveDeviceSessionManager implements DeviceSessionManager {
  readonly #sessionsByDevice = new Map<string, DeviceSession>();
  readonly #clock: SessionClock;
  readonly #ids: SessionIdFactory;

  public constructor(input?: {
    readonly clock?: SessionClock;
    readonly ids?: SessionIdFactory;
  }) {
    this.#clock = input?.clock ?? systemClock;
    this.#ids = input?.ids ?? randomIdFactory;
  }

  public acquire(input: {
    readonly deviceId: string;
    readonly owner: SessionOwner;
  }): DeviceSession {
    const deviceId = input.deviceId.trim();
    if (deviceId.length === 0) {
      throw new TypeError("Device id must not be empty");
    }

    const current = this.#sessionsByDevice.get(deviceId);
    if (current !== undefined) {
      if (sameOwner(current.owner, input.owner)) {
        return current;
      }
      throw new CoreOperationError({
        code: "DEVICE_BUSY",
        reason: "DEVICE_SESSION_OWNED_BY_ANOTHER_OPERATION",
        details: { deviceId },
        retryable: true,
      });
    }

    const session = Object.freeze({
      id: this.#ids.next(),
      deviceId,
      owner: Object.freeze({ ...input.owner }),
      acquiredAt: this.#clock.now(),
    });
    this.#sessionsByDevice.set(deviceId, session);
    return session;
  }

  public release(session: DeviceSession): void {
    this.assertHeld(session);
    this.#sessionsByDevice.delete(session.deviceId);
  }

  public assertHeld(session: DeviceSession): void {
    const current = this.#sessionsByDevice.get(session.deviceId);
    if (
      current === undefined ||
      current.id !== session.id ||
      !sameOwner(current.owner, session.owner)
    ) {
      throw new CoreOperationError({
        code: "CONNECTION_LOST",
        reason: "DEVICE_SESSION_IS_NOT_HELD",
        details: { deviceId: session.deviceId },
        retryable: true,
      });
    }
  }

  public current(deviceId: string): DeviceSession | null {
    return this.#sessionsByDevice.get(deviceId) ?? null;
  }
}
