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

let systemSessionSequence = 0;
const systemIdFactory: SessionIdFactory = {
  next: () =>
    `session-${Date.now().toString(36)}-${(++systemSessionSequence).toString(36)}`,
};

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
    this.#ids = input?.ids ?? systemIdFactory;
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
      throw new CoreOperationError({
        code: "DEVICE_BUSY",
        reason: "DEVICE_SESSION_ALREADY_OWNED",
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
    if (!this.isHeld(session)) {
      throw new CoreOperationError({
        code: "CONNECTION_LOST",
        reason: "DEVICE_SESSION_IS_NOT_HELD",
        details: { deviceId: session.deviceId },
        retryable: true,
      });
    }
  }

  public isHeld(session: DeviceSession): boolean {
    return this.#sessionsByDevice.get(session.deviceId) === session;
  }
}
