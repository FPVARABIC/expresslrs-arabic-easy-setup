import { describe, expect, it, vi } from "vitest";

import {
  nativeBridgeNavigator,
  readNativeHardwareBridge,
  readNativeHostIdentity,
} from "./native-bridge";
import {
  devicePathBlocker,
  readGrantedDevices,
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

describe("device environment reporting", () => {
  it("reads the browser version from the structured brand list", () => {
    const capabilities = readPlatformCapabilities({
      navigator: {
        userAgentData: {
          platform: "Android",
          brands: [
            { brand: "Not/A)Brand", version: "99" },
            { brand: "Chromium", version: "154" },
          ],
        },
      },
      isSecureContext: true,
    });

    // The decoy brand Chromium ships is not a browser.
    expect(capabilities.browserVersion).toBe("Chromium 154");
    expect(capabilities.android).toBe(true);
  });

  it("falls back to the user-agent string only for name and version", () => {
    const capabilities = readPlatformCapabilities({
      navigator: {
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/154.0.0.0 Mobile Safari/537.36",
      },
      isSecureContext: true,
    });

    expect(capabilities.browserVersion).toBe("Chrome 154.0.0.0");
    expect(capabilities.android).toBe(true);
  });

  it("does not call a desktop platform Android", () => {
    expect(
      readPlatformCapabilities({
        navigator: { userAgentData: { platform: "Linux" } },
        isSecureContext: true,
      }).android,
    ).toBe(false);
  });

  it("reports a permissions-policy refusal instead of guessing", () => {
    const denied = readPlatformCapabilities({
      navigator: { serial: {} },
      isSecureContext: true,
      document: { permissionsPolicy: { allowsFeature: () => false } },
    });
    expect(denied.serialPolicyAllowed).toBe(false);

    const unknown = readPlatformCapabilities({
      navigator: { serial: {} },
      isSecureContext: true,
    });
    expect(unknown.serialPolicyAllowed).toBeNull();
  });

  it("counts the devices this origin was already granted", async () => {
    const base = readPlatformCapabilities({ isSecureContext: true });
    const granted = await readGrantedDevices(base, {
      navigator: {
        serial: { getPorts: async () => [{}, {}] },
        usb: { getDevices: async () => [] },
      },
    });

    expect(granted.grantedSerialPorts).toBe(2);
    // Zero granted devices is the normal state before a first grant.
    expect(granted.grantedUsbDevices).toBe(0);
  });

  it("reports null rather than zero when the browser refuses to answer", async () => {
    const granted = await readGrantedDevices(
      readPlatformCapabilities({ isSecureContext: true }),
      {
        navigator: {
          serial: {
            getPorts: async () => {
              throw new Error("refused");
            },
          },
        },
      },
    );

    expect(granted.grantedSerialPorts).toBeNull();
    expect(granted.grantedUsbDevices).toBeNull();
  });
});

describe("native host identity", () => {
  const web =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const native =
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  it("is absent in a browser, where there is no host to report one", () => {
    expect(readNativeHostIdentity({})).toBeNull();
  });

  it("is absent when a host injects a bridge but reports no identity", () => {
    expect(readNativeHostIdentity({ elrsNativeBridge: bridge() })).toBeNull();
  });

  it("reads the digests and bridge state a host reports", () => {
    const identity = readNativeHostIdentity({
      elrsNativeBridge: bridge({
        host: {
          webBuildSha256: web,
          nativeSourceSha256: native,
          bridge: "AVAILABLE",
        },
      }),
    });

    expect(identity).toEqual({
      webBuildSha256: web,
      nativeSourceSha256: native,
      bridge: "AVAILABLE",
    });
  });

  it("keeps an unavailable bridge visible with its exact reason", () => {
    const identity = readNativeHostIdentity({
      elrsNativeBridge: bridge({
        host: {
          webBuildSha256: web,
          nativeSourceSha256: native,
          bridge: "WEB_MESSAGE_LISTENER_UNSUPPORTED",
        },
      }),
    });

    expect(identity?.bridge).toBe("WEB_MESSAGE_LISTENER_UNSUPPORTED");
  });

  it("records a build with no bundled web assets as absent rather than unknown", () => {
    const identity = readNativeHostIdentity({
      elrsNativeBridge: bridge({
        host: { webBuildSha256: "absent", nativeSourceSha256: native },
      }),
    });

    expect(identity?.webBuildSha256).toBe("absent");
  });

  it("drops a field that is not a digest instead of displaying it as one", () => {
    const identity = readNativeHostIdentity({
      elrsNativeBridge: bridge({
        host: {
          webBuildSha256: web,
          // Upper-case hex and a free-text reason are a host reporting
          // something this build does not understand, not an identity.
          nativeSourceSha256: native.toUpperCase(),
          bridge: "lowercase is not a reason code",
        },
      }),
    });

    expect(identity).toEqual({
      webBuildSha256: web,
      nativeSourceSha256: null,
      bridge: null,
    });
  });

  it("is absent when nothing a host reports survives validation", () => {
    // Not an object of nulls: a host that reports nothing usable is
    // indistinguishable from one that reports nothing, and the interface must
    // not show three empty fields as though they said something.
    expect(
      readNativeHostIdentity({
        elrsNativeBridge: bridge({
          host: { webBuildSha256: 42, nativeSourceSha256: null, bridge: "" },
        }),
      }),
    ).toBeNull();
  });
});
