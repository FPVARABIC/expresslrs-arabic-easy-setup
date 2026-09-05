import { describe, expect, it } from "vitest";

import type { ExpressLrsIdentity } from "./session";
import { matchHardwareIdentityToOfficialTargets } from "./target-match";
import type { OfficialTarget } from "./parity-types";

const identity: ExpressLrsIdentity = {
  validation: "CRSF_DEVICE_INFO",
  role: "tx",
  address: 0xee,
  requestOrigin: 0x10,
  productName: "Vendor Super TX 2.4GHz",
  firmwareVersion: "4.1.0",
  serialMarker: "ELRS",
  hardwareVersion: 1,
  softwareVersion: 0x00040100,
  parameterVersion: 0,
  parameterCount: 10,
  usb: { usbVendorId: 0x303a, usbProductId: 0x1001 },
};

function target(id: string, productName: string): OfficialTarget {
  return {
    id,
    role: "tx",
    vendorKey: "vendor",
    vendorName: "Vendor",
    radioKey: "tx_2400",
    targetKey: id.split("/").at(-1) ?? id,
    config: {
      productName,
      platform: "esp32",
      firmware: (id.split("/").at(-1) ?? id).toUpperCase(),
      luaName: null,
      layoutFile: null,
      logoFile: null,
      uploadMethods: ["uart", "download"],
      minVersion: null,
      customLayout: {},
      overlay: null,
      raw: {},
    },
  };
}

describe("official target matching", () => {
  it("authorizes only one exact product-name match", () => {
    const exact = target("vendor/tx_2400/super", identity.productName);
    const result = matchHardwareIdentityToOfficialTargets({
      identity,
      targets: [exact, target("vendor/tx_2400/other", "Vendor Other TX")],
    });

    expect(result.confidence).toBe("EXACT");
    expect(result.selected?.id).toBe(exact.id);
  });

  it("authorizes only one exact firmware-key match", () => {
    const exact = target("vendor/tx_2400/super", "Different product name");
    const exactFirmware = "UNIFIED_ESP32_2400_TX";
    const result = matchHardwareIdentityToOfficialTargets({
      identity: { ...identity, productName: exactFirmware },
      targets: [
        {
          ...exact,
          config: { ...exact.config, firmware: exactFirmware },
        },
        target("vendor/tx_2400/other", "Vendor Other TX"),
      ],
    });

    expect(result.confidence).toBe("EXACT");
    expect(result.selected?.id).toBe(exact.id);
  });

  it("does not authorize duplicate exact-equality matches", () => {
    const result = matchHardwareIdentityToOfficialTargets({
      identity,
      targets: [
        target("vendor/tx_2400/super-a", identity.productName),
        target("vendor/tx_2400/super-b", identity.productName),
      ],
    });

    expect(result.confidence).toBe("AMBIGUOUS");
    expect(result.selected).toBeNull();
  });

  it("keeps contained firmware keys plus token overlap heuristic", () => {
    const heuristic = target(
      "vendor/tx_2400/special-module",
      "Acme Special Model",
    );
    const result = matchHardwareIdentityToOfficialTargets({
      identity: {
        ...identity,
        productName: "Unified ESP32 2400 TX Special Model",
      },
      targets: [
        {
          ...heuristic,
          config: {
            ...heuristic.config,
            firmware: "Unified_ESP32_2400_TX",
          },
        },
      ],
    });

    expect(result.candidates[0]?.score).toBeGreaterThanOrEqual(100);
    expect(result.candidates[0]?.evidence).toContain("firmware-key-contained");
    expect(result.confidence).toBe("LIKELY");
    expect(result.selected).toBeNull();
  });

  it("does not silently authorize a likely or ambiguous match", () => {
    const result = matchHardwareIdentityToOfficialTargets({
      identity,
      targets: [
        target("vendor/tx_2400/super-a", "Vendor Super A"),
        target("vendor/tx_2400/super-b", "Vendor Super B"),
      ],
    });

    expect(result.confidence).toBe("AMBIGUOUS");
    expect(result.selected).toBeNull();
  });

  it("excludes the wrong device role", () => {
    const rx = {
      ...target("vendor/rx_2400/super", identity.productName),
      role: "rx" as const,
    };
    const result = matchHardwareIdentityToOfficialTargets({
      identity,
      targets: [rx],
    });

    expect(result.confidence).toBe("NOT_FOUND");
  });
});
