import { describe, expect, it, vi } from "vitest";

import {
  CrsfSerialLink,
  HardwareSerialError,
  readHardwareSerialPortInfo,
  type HardwareSerialPort,
  type HardwareSerialReader,
  type HardwareSerialWriter,
} from "./serial";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("hardware serial resource safety", () => {
  it("rejects impossible USB identifiers", () => {
    const port: HardwareSerialPort = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getInfo: () => ({ usbVendorId: 0x1_0000, usbProductId: -1 }),
    };

    expect(readHardwareSerialPortInfo(port)).toEqual({
      usbVendorId: null,
      usbProductId: null,
    });
  });

  it("releases a reader when writer acquisition fails", () => {
    const releaseLock = vi.fn();
    const reader: HardwareSerialReader = {
      read: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock,
    };
    const port: HardwareSerialPort = {
      readable: { getReader: () => reader },
      writable: {
        getWriter: () => {
          throw new Error("writer busy");
        },
      },
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const link = new CrsfSerialLink(port);
    expect(() => link.start()).toThrow(HardwareSerialError);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent close calls", async () => {
    const closeDeferred = deferred<void>();
    const readDeferred =
      deferred<Readonly<{ done: boolean; value?: Uint8Array }>>();
    const reader: HardwareSerialReader = {
      read: () => readDeferred.promise,
      cancel: async () => readDeferred.resolve({ done: true }),
      releaseLock: vi.fn(),
    };
    const writer: HardwareSerialWriter = {
      write: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    };
    const close = vi.fn(() => closeDeferred.promise);
    const port: HardwareSerialPort = {
      readable: { getReader: () => reader },
      writable: { getWriter: () => writer },
      open: vi.fn().mockResolvedValue(undefined),
      close,
    };

    const link = new CrsfSerialLink(port);
    link.start();
    const first = link.close();
    const second = link.close();
    const third = link.close();
    closeDeferred.resolve();

    await expect(Promise.all([first, second, third])).resolves.toEqual([
      true,
      true,
      true,
    ]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("allows a port-close retry after a transient failure", async () => {
    const readDeferred =
      deferred<Readonly<{ done: boolean; value?: Uint8Array }>>();
    const reader: HardwareSerialReader = {
      read: () => readDeferred.promise,
      cancel: async () => readDeferred.resolve({ done: true }),
      releaseLock: vi.fn(),
    };
    const writer: HardwareSerialWriter = {
      write: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    };
    const close = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("busy"))
      .mockResolvedValueOnce(undefined);
    const port: HardwareSerialPort = {
      readable: { getReader: () => reader },
      writable: { getWriter: () => writer },
      open: vi.fn().mockResolvedValue(undefined),
      close,
    };

    const link = new CrsfSerialLink(port);
    link.start();
    await expect(link.close()).resolves.toBe(false);
    await expect(link.close()).resolves.toBe(true);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("closes the browser port after unexpected EOF", async () => {
    const reader: HardwareSerialReader = {
      read: vi.fn().mockResolvedValue({ done: true }),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    };
    const writer: HardwareSerialWriter = {
      write: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const port: HardwareSerialPort = {
      readable: { getReader: () => reader },
      writable: { getWriter: () => writer },
      open: vi.fn().mockResolvedValue(undefined),
      close,
    };

    const link = new CrsfSerialLink(port);
    link.start();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(writer.releaseLock).toHaveBeenCalledTimes(1);
  });

  it("does not leave a cancelled frame waiter unhandled when writing fails", async () => {
    const readDeferred =
      deferred<Readonly<{ done: boolean; value?: Uint8Array }>>();
    const reader: HardwareSerialReader = {
      read: () => readDeferred.promise,
      cancel: async () => readDeferred.resolve({ done: true }),
      releaseLock: vi.fn(),
    };
    const writer: HardwareSerialWriter = {
      write: vi.fn().mockRejectedValue(new Error("disconnected")),
      releaseLock: vi.fn(),
    };
    const port: HardwareSerialPort = {
      readable: { getReader: () => reader },
      writable: { getWriter: () => writer },
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const link = new CrsfSerialLink(port);
    link.start();
    await expect(
      link.request(new Uint8Array([1]), () => true),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });
    await link.close();
  });
});
