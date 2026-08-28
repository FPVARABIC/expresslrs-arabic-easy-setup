import { describe, expect, it, vi } from "vitest";

import {
  closeWebSerialPort,
  connectWebSerialReadOnly,
  type WebSerialPort,
} from "./webSerialConnection";

function serialPort(): WebSerialPort {
  return {
    ondisconnect: null,
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getInfo: () => ({ usbVendorId: 0x303a, usbProductId: 0x1001 }),
  };
}

describe("read-only Web Serial connection", () => {
  it("fails closed when Web Serial is unavailable or the context is insecure", async () => {
    await expect(
      connectWebSerialReadOnly({ navigatorObject: {}, secureContext: true }),
    ).resolves.toEqual({ status: "UNSUPPORTED" });
    await expect(
      connectWebSerialReadOnly({
        navigatorObject: { serial: { requestPort: vi.fn() } },
        secureContext: false,
      }),
    ).resolves.toEqual({ status: "INSECURE_CONTEXT" });
  });

  it("opens one explicitly selected port without performing a write", async () => {
    const port = serialPort();
    const requestPort = vi.fn().mockResolvedValue(port);

    const outcome = await connectWebSerialReadOnly({
      navigatorObject: { serial: { requestPort } },
      secureContext: true,
    });

    expect(requestPort).toHaveBeenCalledTimes(1);
    expect(port.open).toHaveBeenCalledWith({ baudRate: 115_200 });
    expect(outcome).toMatchObject({
      status: "CONNECTED",
      info: { usbVendorId: 0x303a, usbProductId: 0x1001 },
      baudRate: 115_200,
    });
    expect(Object.keys(port)).not.toContain("write");
  });

  it("distinguishes user cancellation and permission denial", async () => {
    await expect(
      connectWebSerialReadOnly({
        navigatorObject: {
          serial: {
            requestPort: vi
              .fn()
              .mockRejectedValue(
                new DOMException("cancelled", "NotFoundError"),
              ),
          },
        },
        secureContext: true,
      }),
    ).resolves.toEqual({ status: "CANCELLED" });

    await expect(
      connectWebSerialReadOnly({
        navigatorObject: {
          serial: {
            requestPort: vi
              .fn()
              .mockRejectedValue(new DOMException("denied", "SecurityError")),
          },
        },
        secureContext: true,
      }),
    ).resolves.toEqual({ status: "PERMISSION_DENIED" });
  });

  it("closes an opened port explicitly", async () => {
    const port = serialPort();

    await expect(closeWebSerialPort(port)).resolves.toBe(true);
    expect(port.close).toHaveBeenCalledTimes(1);
  });
});
