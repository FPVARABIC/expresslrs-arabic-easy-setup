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
    minVersion: "3.0.0",
    customLayout: {},
    overlay: null,
    raw: {},
  },
};

const validOptions = {
  region: "FCC",
  domain: 0,
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
} as const;

function stm32Target(raw: Readonly<Record<string, unknown>>): OfficialTarget {
  return {
    ...target,
    config: {
      ...target.config,
      platform: "stm32",
      uploadMethods: ["stlink", "download"],
      raw,
    },
  };
}

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

  it("fails before acquisition for unverified receiver-as-transmitter packaging", async () => {
    const fetchImplementation = vi.fn();

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: { ...target, role: "rx" },
        options: {
          region: "FCC",
          domain: 0,
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
          receiverAsTransmitter: true,
        },
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ field: "receiverAsTransmitter" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects a release older than the target minimum before acquisition", async () => {
    const fetchImplementation = vi.fn();

    await expect(
      prepareOfficialFirmwarePackage({
        release: { label: "3.6.4", revision: "old", channel: "release" },
        target: {
          ...target,
          config: { ...target.config, minVersion: "4.0.0" },
        },
        options: validOptions,
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "VERSION_UNSUPPORTED" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "a Sub-GHz domain for a 2.4 GHz target",
      radioKey: "tx_2400",
      region: "FCC",
      domain: 1,
    },
    {
      name: "a 2.4 GHz artifact directory for a Sub-GHz target",
      radioKey: "rx_900",
      region: "LBT",
      domain: 0,
    },
    {
      name: "a directory/domain pair from different regions",
      radioKey: "rx_900",
      region: "EU_868",
      domain: 1,
    },
    {
      name: "an unknown radio family",
      radioKey: "rx_unknown",
      region: "FCC",
      domain: 0,
    },
    {
      name: "a non-mirror artifact directory for a dual-band target",
      radioKey: "tx_dual",
      region: "EU_CE",
      domain: 2,
    },
  ])("rejects $name before acquisition", async (testCase) => {
    const fetchImplementation = vi.fn();

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: { ...target, radioKey: testCase.radioKey },
        options: {
          ...validOptions,
          region: testCase.region,
          domain: testCase.domain,
        },
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "REGULATORY_MISMATCH" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each([
    { region: "FCC", domain: 7 },
    { region: "LBT", domain: 0 },
  ])(
    "accepts independent dual-band artifact $region and low-band domain $domain",
    async (testCase) => {
      const fetchImplementation = vi.fn(
        async () => new Response(null, { status: 404 }),
      );

      await expect(
        prepareOfficialFirmwarePackage({
          release,
          target: { ...target, radioKey: "tx_dual" },
          options: { ...validOptions, ...testCase },
          fetchImplementation: fetchImplementation as unknown as typeof fetch,
        }),
      ).rejects.toMatchObject({ code: "REGION_NOT_FOUND" });
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
      expect(fetchImplementation).toHaveBeenCalledWith(
        expect.stringContaining(`/${testCase.region}/`),
        expect.any(Object),
      );
    },
  );

  it("rejects STM32 releases without mirrored package assets before acquisition", async () => {
    const fetchImplementation = vi.fn();

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: stm32Target({ stlink: { offset: "0x4000" } }),
        options: validOptions,
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_UNAVAILABLE" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each([
    { name: "missing stlink metadata", raw: {} },
    { name: "a numeric offset", raw: { stlink: { offset: 0x4000 } } },
    { name: "a zero offset", raw: { stlink: { offset: "0x0" } } },
    { name: "an unaligned offset", raw: { stlink: { offset: "0x1001" } } },
    { name: "an unverified offset", raw: { stlink: { offset: "0x10000" } } },
    { name: "a padded offset", raw: { stlink: { offset: " 0x4000" } } },
  ])("rejects STM32 target with $name before acquisition", async (testCase) => {
    const fetchImplementation = vi.fn();

    await expect(
      prepareOfficialFirmwarePackage({
        release: { label: "3.6.4", revision: "release364", channel: "release" },
        target: stm32Target(testCase.raw),
        options: validOptions,
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "STM32_OFFSET_UNVERIFIED" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each(["4.0.0", "4.1.0"])(
    "accepts release %s at or above the target minimum",
    async (label) => {
      const fetchImplementation = vi.fn(
        async () => new Response(null, { status: 404 }),
      );

      await expect(
        prepareOfficialFirmwarePackage({
          release: { label, revision: "accepted", channel: "release" },
          target: {
            ...target,
            config: { ...target.config, minVersion: "4.0.0" },
          },
          options: validOptions,
          fetchImplementation: fetchImplementation as unknown as typeof fetch,
        }),
      ).rejects.toMatchObject({ code: "REGION_NOT_FOUND" });
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["4.2.0", "5.0.0"])(
    "rejects unreviewed future release %s before acquisition",
    async (label) => {
      const fetchImplementation = vi.fn();

      await expect(
        prepareOfficialFirmwarePackage({
          release: { label, revision: "future", channel: "release" },
          target: {
            ...target,
            config: { ...target.config, minVersion: "4.0.0" },
          },
          options: validOptions,
          fetchImplementation: fetchImplementation as unknown as typeof fetch,
        }),
      ).rejects.toMatchObject({ code: "VERSION_UNSUPPORTED" });
      expect(fetchImplementation).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: "an unparsable stable release",
      candidate: { label: "latest", revision: "bad", channel: "release" },
      minVersion: "3.0.0",
    },
    {
      name: "an unverifiable branch for a version-gated target",
      candidate: { label: "master", revision: "branch", channel: "branch" },
      minVersion: "4.0.0",
    },
    {
      name: "a prerelease below its matching stable minimum",
      candidate: {
        label: "4.1.0-RC1",
        revision: "candidate",
        channel: "release",
      },
      minVersion: "4.1.0",
    },
    {
      name: "an unparsable target minimum",
      candidate: { label: "4.1.0", revision: "release", channel: "release" },
      minVersion: "minimum",
    },
  ] as const)("rejects $name before acquisition", async (testCase) => {
    const fetchImplementation = vi.fn();

    await expect(
      prepareOfficialFirmwarePackage({
        release: testCase.candidate,
        target: {
          ...target,
          config: { ...target.config, minVersion: testCase.minVersion },
        },
        options: validOptions,
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "VERSION_UNSUPPORTED" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects STM32 branch packaging before acquisition", async () => {
    const fetchImplementation = vi.fn();

    await expect(
      prepareOfficialFirmwarePackage({
        release: { label: "master", revision: "branch", channel: "branch" },
        target: {
          ...target,
          config: { ...target.config, platform: "stm32" },
        },
        options: validOptions,
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "VERSION_UNSUPPORTED" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects a target without a minimum version before acquisition", async () => {
    const fetchImplementation = vi.fn();

    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: {
          ...target,
          config: { ...target.config, minVersion: null },
        },
        options: validOptions,
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "VERSION_UNSUPPORTED" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
