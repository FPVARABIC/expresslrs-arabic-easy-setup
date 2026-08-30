import { describe, expect, it, vi } from "vitest";

import { prepareOfficialFirmwarePackage } from "./firmware-package";
import type { OfficialRelease, OfficialTarget } from "./parity-types";

const release: OfficialRelease = {
  label: "4.1.0",
  revision: "release410",
  channel: "release",
};

const target: OfficialTarget = {
  id: "vendor/tx_2400/module",
  role: "tx",
  vendorKey: "vendor",
  vendorName: "Vendor",
  radioKey: "tx_2400",
  targetKey: "module",
  config: {
    productName: "Module",
    platform: "esp32",
    firmware: "MODULE",
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

describe("firmware package option gate", () => {
  it("fails before network acquisition when an option is NaN", async () => {
    const fetchImplementation = vi.fn();

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target,
        options: {
          region: "EU_CE",
          domain: Number.NaN,
          bindPhrase: "",
          wifiSsid: "",
          wifiPassword: "",
          wifiAutoOnInterval: 60,
          fanRuntime: 30,
          telemetryInterval: 240,
          uartInverted: false,
          unlockHigherPower: false,
          receiverUartBaud: 420000,
          receiverInvertTx: false,
          lockOnFirstConnection: true,
          r9mmMiniSbus: false,
          receiverAsTransmitter: false,
        },
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ field: "domain" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
