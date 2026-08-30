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
    const rx = { ...target("vendor/rx_2400/super", identity.productName), role: "rx" as const };
    const result = matchHardwareIdentityToOfficialTargets({
      identity,
      targets: [rx],
    });

    expect(result.confidence).toBe("NOT_FOUND");
  });
});
