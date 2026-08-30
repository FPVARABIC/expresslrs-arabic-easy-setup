import { describe, expect, it, vi } from "vitest";

import {
  CrsfAddress,
  CrsfCommandStep,
  CrsfFrameType,
  CrsfStreamParser,
  asExtendedFrame,
  concatBytes,
  encodeCrsfExtendedFrame,
} from "./crsf";
import {
  ExpressLrsHardwareSession,
  type ExpressLrsSettingsBackup,
} from "./session";
import type {
  HardwareSerialPort,
  HardwareSerialReader,
  HardwareSerialWriter,
} from "./serial";

class ByteQueue {
  readonly #values: Uint8Array[] = [];
  #waiting:
    ((value: Readonly<{ done: boolean; value?: Uint8Array }>) => void) | null =
    null;
  #closed = false;

  public push(value: Uint8Array): void {
    if (this.#closed) return;
    if (this.#waiting !== null) {
      const resolve = this.#waiting;
      this.#waiting = null;
      queueMicrotask(() => resolve({ done: false, value }));
    } else {
      this.#values.push(value);
    }
  }

  public read(): Promise<Readonly<{ done: boolean; value?: Uint8Array }>> {
    const value = this.#values.shift();
    if (value !== undefined) {
      return Promise.resolve({ done: false, value });
    }
    if (this.#closed) {
      return Promise.resolve({ done: true });
    }
    return new Promise((resolve) => {
      this.#waiting = resolve;
    });
  }

  public close(): void {
    this.#closed = true;
    if (this.#waiting !== null) {
      const resolve = this.#waiting;
      this.#waiting = null;
      resolve({ done: true });
    }
  }
}

function terminated(value: string): Uint8Array {
  return new TextEncoder().encode(`${value}\0`);
}

function parameterEntry(
  id: number,
  data: Uint8Array,
  origin = CrsfAddress.transmitter,
): Uint8Array {
  return encodeCrsfExtendedFrame({
    address: CrsfAddress.radio,
    type: CrsfFrameType.parameterEntry,
    destination: CrsfAddress.usb,
    origin,
    data: concatBytes(new Uint8Array([id, 0]), data),
  });
}

function selectionParameter(value: number): Uint8Array {
  return concatBytes(
    new Uint8Array([0, 9]),
    terminated("Packet Rate"),
    terminated("50Hz;100Hz;250Hz"),
    new Uint8Array([value, 0, 2, 0]),
    terminated("Hz"),
  );
}

function commandParameter(step: number, information = ""): Uint8Array {
  return concatBytes(
    new Uint8Array([0, 13]),
    terminated("Bind"),
    new Uint8Array([step, 200]),
    terminated(information),
  );
}

function infoParameter(): Uint8Array {
  return concatBytes(
    new Uint8Array([0, 12]),
    terminated("4.1.0 ISM2G4"),
    terminated("a9d4a9c"),
  );
}

function deviceInfo(): Uint8Array {
  return encodeCrsfExtendedFrame({
    address: CrsfAddress.radio,
    type: CrsfFrameType.deviceInfo,
    destination: CrsfAddress.usb,
    origin: CrsfAddress.transmitter,
    data: concatBytes(
      terminated("Example TX 2.4GHz"),
      new Uint8Array([0x45, 0x4c, 0x52, 0x53, 0, 0, 0, 0, 0, 4, 1, 0, 3, 0]),
    ),
  });
}

function fakeHardware(): {
  readonly port: HardwareSerialPort;
  readonly requestPort: ReturnType<typeof vi.fn>;
  readonly writes: readonly Uint8Array[];
} {
  const queue = new ByteQueue();
  const parser = new CrsfStreamParser();
  const writes: Uint8Array[] = [];
  let selectedRate = 1;

  const reader: HardwareSerialReader = {
    read: () => queue.read(),
    cancel: async () => queue.close(),
    releaseLock: vi.fn(),
  };
  const writer: HardwareSerialWriter = {
    write: async (data) => {
      writes.push(data.slice());
      for (const frame of parser.push(data)) {
        const extended = asExtendedFrame(frame);
        if (frame.type === CrsfFrameType.devicePing) {
          queue.push(deviceInfo());
        } else if (
          frame.type === CrsfFrameType.parameterRead &&
          extended !== null
        ) {
          const id = extended.data[0];
          if (id === 1) {
            queue.push(parameterEntry(1, selectionParameter(selectedRate)));
          }
          if (id === 2) {
            queue.push(
              parameterEntry(2, commandParameter(CrsfCommandStep.idle)),
            );
          }
          if (id === 3) queue.push(parameterEntry(3, infoParameter()));
        } else if (
          frame.type === CrsfFrameType.parameterWrite &&
          extended !== null
        ) {
          const id = extended.data[0];
          const value = extended.data[1];
          if (id === 1 && value !== undefined) selectedRate = value;
          if (id === 2 && value === CrsfCommandStep.click) {
            queue.push(
              parameterEntry(
                2,
                commandParameter(CrsfCommandStep.executing, "Binding..."),
              ),
            );
          }
          if (id === 2 && value === CrsfCommandStep.query) {
            queue.push(
              parameterEntry(
                2,
                commandParameter(CrsfCommandStep.idle, "Bind mode active"),
              ),
            );
          }
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
    getInfo: () => ({ usbVendorId: 0x303a, usbProductId: 0x1001 }),
  };
  return {
    port,
    requestPort: vi.fn().mockResolvedValue(port),
    writes,
  };
}

describe("real ExpressLRS CRSF hardware session", () => {
  it("requires DEVICE_INFO, enumerates every parameter, and creates a complete backup", async () => {
    const hardware = fakeHardware();

    const outcome = await ExpressLrsHardwareSession.connect({
      role: "tx",
      navigatorObject: { serial: { requestPort: hardware.requestPort } },
      secureContext: true,
    });

    expect(outcome.status).toBe("CONNECTED");
    if (outcome.status !== "CONNECTED") return;
    expect(outcome.identity).toEqual(
      expect.objectContaining({
        role: "tx",
        requestOrigin: CrsfAddress.usb,
        productName: "Example TX 2.4GHz",
        firmwareVersion: "4.1.0",
        serialMarker: "ELRS",
        parameterCount: 3,
      }),
    );
    expect(outcome.parameters.map((item) => item.name)).toEqual([
      "Packet Rate",
      "Bind",
      "4.1.0 ISM2G4",
    ]);
    expect(outcome.session.createSettingsBackup(new Date(0))).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        createdAt: "1970-01-01T00:00:00.000Z",
        values: [
          expect.objectContaining({
            parameterId: 1,
            name: "Packet Rate",
            value: 1,
          }),
        ],
      }),
    );
    await outcome.session.close();
  });

  it("writes a setting and only reports success after an exact read-back", async () => {
    const hardware = fakeHardware();
    const outcome = await ExpressLrsHardwareSession.connect({
      role: "tx",
      navigatorObject: { serial: { requestPort: hardware.requestPort } },
      secureContext: true,
    });
    expect(outcome.status).toBe("CONNECTED");
    if (outcome.status !== "CONNECTED") return;

    const result = await outcome.session.writeParameter(1, 2);

    expect(result.verified).toBe(true);
    expect(result.parameter).toEqual(
      expect.objectContaining({ kind: "selection", value: 2 }),
    );
    await outcome.session.close();
  });

  it("executes the real TX Bind command and waits for device acknowledgement", async () => {
    const hardware = fakeHardware();
    const outcome = await ExpressLrsHardwareSession.connect({
      role: "tx",
      navigatorObject: { serial: { requestPort: hardware.requestPort } },
      secureContext: true,
    });
    expect(outcome.status).toBe("CONNECTED");
    if (outcome.status !== "CONNECTED") return;

    const result = await outcome.session.startBinding();

    expect(result).toEqual({
      stage: "TX_BIND_COMMAND_ACKNOWLEDGED",
      verified: true,
      information: "Bind mode active",
    });
    await outcome.session.close();
  });

  it("rejects a settings backup belonging to another device identity", async () => {
    const hardware = fakeHardware();
    const outcome = await ExpressLrsHardwareSession.connect({
      role: "tx",
      navigatorObject: { serial: { requestPort: hardware.requestPort } },
      secureContext: true,
    });
    expect(outcome.status).toBe("CONNECTED");
    if (outcome.status !== "CONNECTED") return;
    const backup: ExpressLrsSettingsBackup = {
      ...outcome.session.createSettingsBackup(new Date(0)),
      identity: {
        ...outcome.identity,
        productName: "Different target",
      },
    };

    await expect(
      outcome.session.restoreSettingsBackup(backup),
    ).rejects.toMatchObject({
      code: "BACKUP_MISMATCH",
    });
    await outcome.session.close();
  });
});
