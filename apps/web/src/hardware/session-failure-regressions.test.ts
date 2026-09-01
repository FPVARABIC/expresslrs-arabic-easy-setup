import { describe, expect, it, vi } from "vitest";

import {
  CrsfAddress,
  CrsfFrameType,
  CrsfStreamParser,
  asExtendedFrame,
  concatBytes,
  encodeCrsfExtendedFrame,
} from "./crsf";
import { ExpressLrsHardwareSession } from "./session";
import type {
  HardwareSerialPort,
  HardwareSerialReader,
  HardwareSerialWriter,
} from "./serial";

class Queue {
  readonly #items: Uint8Array[] = [];
  #waiting:
    | ((value: Readonly<{ done: boolean; value?: Uint8Array }>) => void)
    | null = null;
  #closed = false;

  push(value: Uint8Array): void {
    if (this.#closed) return;
    if (this.#waiting !== null) {
      const resolve = this.#waiting;
      this.#waiting = null;
      resolve({ done: false, value });
      return;
    }
    this.#items.push(value);
  }

  read(): Promise<Readonly<{ done: boolean; value?: Uint8Array }>> {
    const value = this.#items.shift();
    if (value !== undefined) return Promise.resolve({ done: false, value });
    if (this.#closed) return Promise.resolve({ done: true });
    return new Promise((resolve) => {
      this.#waiting = resolve;
    });
  }

  close(): void {
    this.#closed = true;
    this.#waiting?.({ done: true });
    this.#waiting = null;
  }
}

function terminated(value: string): Uint8Array {
  return new TextEncoder().encode(`${value}\0`);
}

function deviceInfo(role: "tx" | "rx", parameterCount = 1): Uint8Array {
  return encodeCrsfExtendedFrame({
    address: CrsfAddress.radio,
    type: CrsfFrameType.deviceInfo,
    destination: CrsfAddress.usb,
    origin:
      role === "tx" ? CrsfAddress.transmitter : CrsfAddress.receiver,
    data: concatBytes(
      terminated(role === "tx" ? "Audit TX" : "Audit RX"),
      new Uint8Array([
        0x45,
        0x4c,
        0x52,
        0x53,
        0,
        0,
        0,
        1,
        0,
        4,
        1,
        0,
        parameterCount,
        0,
      ]),
    ),
  });
}

function selectionEntry(hidden: boolean, value: number): Uint8Array {
  return encodeCrsfExtendedFrame({
    address: CrsfAddress.radio,
    type: CrsfFrameType.parameterEntry,
    destination: CrsfAddress.usb,
    origin: CrsfAddress.transmitter,
    data: concatBytes(
      new Uint8Array([1, 0, 0, 9 | (hidden ? 0x80 : 0)]),
      terminated("Packet Rate"),
      terminated("50Hz;100Hz;250Hz"),
      new Uint8Array([value, 0, 2, 0]),
      terminated("Hz"),
    ),
  });
}

function emulatedPort(input: {
  readonly deviceRole?: "tx" | "rx";
  readonly hidden?: boolean;
  readonly ignoreWrites?: boolean;
}) {
  const queue = new Queue();
  const parser = new CrsfStreamParser();
  let current = 1;
  const reader: HardwareSerialReader = {
    read: () => queue.read(),
    cancel: async () => queue.close(),
    releaseLock: vi.fn(),
  };
  const writer: HardwareSerialWriter = {
    write: async (bytes) => {
      for (const frame of parser.push(bytes)) {
        const extended = asExtendedFrame(frame);
        if (frame.type === CrsfFrameType.devicePing) {
          queue.push(deviceInfo(input.deviceRole ?? "tx"));
        } else if (
          frame.type === CrsfFrameType.parameterRead &&
          extended?.data[0] === 1
        ) {
          queue.push(selectionEntry(input.hidden ?? false, current));
        } else if (
          frame.type === CrsfFrameType.parameterWrite &&
          extended?.data[0] === 1 &&
          extended.data[1] !== undefined &&
          input.ignoreWrites !== true
        ) {
          current = extended.data[1];
        }
      }
    },
    releaseLock: vi.fn(),
  };
  const port: HardwareSerialPort = {
    readable: { getReader: () => reader },
    writable: { getWriter: () => writer },
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { port };
}

describe("hardware session failure regressions", () => {
  it("fails closed and closes the port when the selected TX/RX role is wrong", async () => {
    const { port } = emulatedPort({ deviceRole: "tx" });
    const outcome = await ExpressLrsHardwareSession.connect({
      role: "rx",
      navigatorObject: {
        serial: { requestPort: vi.fn().mockResolvedValue(port) },
      },
      secureContext: true,
    });

    expect(outcome.status).not.toBe("CONNECTED");
    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it("excludes hidden device parameters from backup and refuses to write them", async () => {
    const { port } = emulatedPort({ hidden: true });
    const outcome = await ExpressLrsHardwareSession.connect({
      role: "tx",
      navigatorObject: {
        serial: { requestPort: vi.fn().mockResolvedValue(port) },
      },
      secureContext: true,
    });
    expect(outcome.status).toBe("CONNECTED");
    if (outcome.status !== "CONNECTED") return;

    expect(outcome.session.createSettingsBackup(new Date(0)).values).toEqual(
      [],
    );
    await expect(outcome.session.writeParameter(1, 2)).rejects.toBeDefined();
    await outcome.session.close();
  });

  it("does not report a settings write as successful when read-back retains the old value", async () => {
    const { port } = emulatedPort({ ignoreWrites: true });
    const outcome = await ExpressLrsHardwareSession.connect({
      role: "tx",
      navigatorObject: {
        serial: { requestPort: vi.fn().mockResolvedValue(port) },
      },
      secureContext: true,
    });
    expect(outcome.status).toBe("CONNECTED");
    if (outcome.status !== "CONNECTED") return;

    await expect(outcome.session.writeParameter(1, 2)).rejects.toBeDefined();
    await outcome.session.close();
  });
});
