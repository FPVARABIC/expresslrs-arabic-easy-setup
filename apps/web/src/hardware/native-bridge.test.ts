import { describe, expect, it, vi } from "vitest";

import {
  nativeBridgeNavigator,
  readNativeHardwareBridge,
} from "./native-bridge";
import {
  devicePathBlocker,
  readPlatformCapabilities,
} from "./platform-capabilities";

function bridge(overrides: Record<string, unknown> = {}): unknown {
  return { version: 1, serial: { requestPort: vi.fn() }, ...overrides };
}

describe("native hardware bridge", () => {
  it("is absent when no host injected one", () => {
    expect(readNativeHardwareBridge({})).toBeNull();
  });

  it("accepts a host that declares the version and a port factory", () => {
    const injected = bridge();
    expect(readNativeHardwareBridge({ elrsNativeBridge: injected })).toBe(
      injected,
    );
  });

  it("ignores a bridge declaring a version this build does not understand", () => {
    expect(
      readNativeHardwareBridge({ elrsNativeBridge: bridge({ version: 2 }) }),
    ).toBeNull();
  });

  it("ignores a bridge without a usable port factory", () => {
    expect(
      readNativeHardwareBridge({
        elrsNativeBridge: bridge({ serial: { requestPort: "not a function" } }),
      }),
    ).toBeNull();
    expect(
      readNativeHardwareBridge({ elrsNativeBridge: { version: 1 } }),
    ).toBeNull();
  });

  it("presents the bridge as the serial API the session layer already takes", () => {
    const injected = readNativeHardwareBridge({
      elrsNativeBridge: bridge(),
    });
    expect(injected).not.toBeNull();
    expect(nativeBridgeNavigator(injected!).serial).toBe(injected!.serial);
  });
});

describe("platform capabilities", () => {
  it("reads the APIs themselves rather than a user-agent string", () => {
    const capabilities = readPlatformCapabilities({
      navigator: { serial: {}, usb: {}, userAgentData: { platform: "Linux" } },
      isSecureContext: true,
    });

    expect(capabilities).toMatchObject({
      webSerial: true,
      webUsb: true,
      secureContext: true,
      nativeBridge: false,
      platformHint: "Linux",
    });
    expect(devicePathBlocker(capabilities)).toBeNull();
  });

  it("names an insecure context as the blocker before anything else", () => {
    const capabilities = readPlatformCapabilities({
      navigator: {},
      isSecureContext: false,
    });

    expect(devicePathBlocker(capabilities)).toBe("INSECURE_CONTEXT");
  });

  it("distinguishes a USB-only browser from one with no transport at all", () => {
    expect(
      devicePathBlocker(
        readPlatformCapabilities({
          navigator: { usb: {} },
          isSecureContext: true,
        }),
      ),
    ).toBe("USB_ONLY");
    expect(
      devicePathBlocker(
        readPlatformCapabilities({
          navigator: {},
          isSecureContext: true,
        }),
      ),
    ).toBe("NO_SERIAL_TRANSPORT");
  });

  it("treats an injected bridge as a working device path without Web Serial", () => {
    const capabilities = readPlatformCapabilities({
      navigator: {},
      isSecureContext: true,
      elrsNativeBridge: bridge(),
    });

    expect(capabilities.nativeBridge).toBe(true);
    expect(devicePathBlocker(capabilities)).toBeNull();
  });
});
