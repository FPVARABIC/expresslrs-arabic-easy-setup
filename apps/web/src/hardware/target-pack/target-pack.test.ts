import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  TargetPackIntegrityError,
  assertPackMatchesRelease,
  assertPackMatchesTargetsSha,
  resetTargetPackVerification,
  targetPackCatalogJson,
  targetPackCovers,
  targetPackLayout,
  targetPackLogo,
  targetPackManifest,
  verifyTargetPack,
} from "./index";
import { packLayouts, packTargetsJson } from "./pack-data";
import { prepareOfficialFirmwarePackage } from "../firmware-package";
import type {
  ExpressLrsFirmwareOptions,
  OfficialRelease,
  OfficialTarget,
} from "../parity-types";

/**
 * The pack exists so that what gets written to a device does not depend on
 * what upstream published this morning. These tests are the negative half of
 * that: each one is a way the guarantee could quietly be lost.
 */

beforeEach(() => {
  resetTargetPackVerification();
});

describe("the pack states its own provenance honestly", () => {
  it("does not claim to be the release's own snapshot", () => {
    expect(targetPackManifest.provenance.claim).toBe(
      "NOT_THE_RELEASE_SNAPSHOT",
    );
    expect(targetPackManifest.provenance.reason).toMatch(/no ref/iu);
  });

  it("pins a full Targets commit and records every digest", () => {
    expect(targetPackManifest.targetsRepository.sha).toMatch(/^[0-9a-f]{40}$/u);
    expect(targetPackManifest.targetsJsonSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(targetPackManifest.layoutArchiveSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(targetPackManifest.logoArchiveSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(targetPackManifest.packVersion).toBeGreaterThan(0);
    expect(Date.parse(targetPackManifest.createdAt)).not.toBeNaN();
  });

  it("verifies the shipped pack against its own manifest", async () => {
    await expect(verifyTargetPack()).resolves.toBeUndefined();
  });
});

describe("integrity failures are errors, never a fallback", () => {
  it("refuses a catalog whose bytes changed after the manifest was written", async () => {
    // The mutable-mirror case: content moved underneath us.
    await expect(
      verifyTargetPack({ targetsJson: `${packTargetsJson} ` }),
    ).rejects.toMatchObject({ reason: "TARGETS_JSON_DIGEST_MISMATCH" });
  });

  it("refuses a layout whose bytes changed", async () => {
    const [name] = Object.keys(packLayouts);
    const tampered = { ...packLayouts, [name!]: "{}" };
    await expect(verifyTargetPack({ layouts: tampered })).rejects.toMatchObject(
      { reason: "LAYOUT_DIGEST_MISMATCH" },
    );
  });

  it("refuses a pack missing a layout the manifest records", async () => {
    const rest = { ...packLayouts };
    delete rest[Object.keys(packLayouts)[0]!];
    await expect(verifyTargetPack({ layouts: rest })).rejects.toMatchObject({
      reason: "LAYOUT_MISSING",
    });
  });

  it("refuses a layout the manifest does not account for", async () => {
    const extra = { ...packLayouts, "RX/smuggled.json": "{}" };
    await expect(verifyTargetPack({ layouts: extra })).rejects.toMatchObject({
      reason: "LAYOUT_UNEXPECTED",
    });
  });

  it("names the Targets commit when a different one is claimed", () => {
    expect(() => assertPackMatchesTargetsSha("0".repeat(40))).toThrow(
      TargetPackIntegrityError,
    );
    expect(() =>
      assertPackMatchesTargetsSha(targetPackManifest.targetsRepository.sha),
    ).not.toThrow();
  });

  it("refuses a release the pack was never validated against", () => {
    let thrown: unknown;
    try {
      assertPackMatchesRelease("9.9.9");
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TargetPackIntegrityError);
    const message = (thrown as Error).message;
    // The reason has to be actionable, not a shrug.
    expect(message).toContain("9.9.9");
    expect(message).toContain(targetPackManifest.targetsRepository.sha);
    expect(message).toMatch(/Validate a pack/iu);
    for (const release of targetPackManifest.validatedReleases) {
      expect(() => assertPackMatchesRelease(release.label)).not.toThrow();
    }
  });

  it("says a Target outside the pack is newer, not blocked by the build", async () => {
    let thrown: unknown;
    try {
      await targetPackLayout("RX", "A Receiver That Does Not Exist Yet.json");
    } catch (error: unknown) {
      thrown = error;
    }
    const message = (thrown as Error).message;
    expect((thrown as TargetPackIntegrityError).reason).toBe(
      "LAYOUT_NOT_IN_PACK",
    );
    expect(message).toMatch(/newer than the pack/iu);
    expect(message).toMatch(/stays visible/iu);
    // Never a build-stage excuse.
    expect(message).not.toMatch(
      /not available yet|locked in this|coming soon/iu,
    );
  });
});

describe("the pack is usable offline and never reaches the network", () => {
  it("serves the catalog with no fetch at all", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const json = await targetPackCatalogJson();

    expect(json).toBe(packTargetsJson);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("serves a layout and a logo with no fetch at all", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const layoutName = Object.keys(packLayouts).find((name) =>
      name.startsWith("TX/"),
    );
    const [role, file] = layoutName!.split("/") as ["TX", string];

    const layout = await targetPackLayout(role, file);
    const logo = await targetPackLogo(
      Object.keys(targetPackManifest.logoSha256)[0]!,
    );

    expect(layout.length).toBeGreaterThan(0);
    expect(logo?.byteLength).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("reports coverage without throwing, so a UI can explain rather than hide", () => {
    const known = Object.keys(packLayouts)
      .find((name) => name.startsWith("RX/"))!
      .slice("RX/".length);

    expect(targetPackCovers("RX", known)).toBe(true);
    expect(targetPackCovers("RX", "Not In The Pack.json")).toBe(false);
    // A Target that appends no layout is trivially covered.
    expect(targetPackCovers("RX", null)).toBe(true);
  });
});

describe("packaging never touches a mutable hardware path", () => {
  const release: OfficialRelease = {
    label: "4.1.0",
    revision: "release410",
    channel: "release",
  };
  const options: ExpressLrsFirmwareOptions = {
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
    rxAsTxMode: "off",
    airportEnabled: false,
  };

  function esp8285Image(): Uint8Array {
    const bytes = new Uint8Array(0x1020);
    bytes[0x1000] = 0xe9;
    bytes[0x1001] = 1;
    const view = new DataView(bytes.buffer);
    view.setUint32(0x1008, 0x4020_1010, true);
    view.setUint32(0x100c, 4, true);
    bytes.set([1, 2, 3, 4], 0x1010);
    bytes[0x1014] = 0xef;
    return bytes;
  }

  const layoutName = Object.keys(packLayouts)
    .find((name) => name.startsWith("RX/"))!
    .slice("RX/".length);

  const target: OfficialTarget = {
    id: "vendor/rx_2400/packed",
    role: "rx",
    vendorKey: "vendor",
    vendorName: "Vendor",
    radioKey: "rx_2400",
    targetKey: "packed",
    config: {
      productName: "Packed RX",
      platform: "esp8285",
      firmware: "PACKED_RX_2400",
      luaName: null,
      layoutFile: layoutName,
      logoFile: null,
      uploadMethods: ["uart"],
      minVersion: "3.0.0",
      customLayout: {},
      overlay: null,
      raw: {},
    },
  };

  it("requests only the firmware image, never a hardware layout", async () => {
    const firmwareUrl =
      "https://expresslrs.github.io/web-flasher/assets/firmware/release410/FCC/PACKED_RX_2400/firmware.bin";
    const fetchImplementation = vi.fn(async (url: string | URL | Request) =>
      String(url) === firmwareUrl
        ? new Response(esp8285Image().slice().buffer as ArrayBuffer)
        : new Response(null, { status: 404 }),
    );

    await prepareOfficialFirmwarePackage({
      release,
      target,
      options,
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });

    const requested = fetchImplementation.mock.calls.map((call) =>
      String(call[0]),
    );
    expect(requested).toEqual([firmwareUrl]);
    expect(requested.some((url) => url.includes("/hardware/"))).toBe(false);
  });

  it("refuses to package a release the pack was not validated for", async () => {
    // 4.0.0 clears the version-compatibility checks — it is not newer than the
    // reviewed firmware and satisfies the Target's minVersion — so what stops
    // it is the pack alone.
    await expect(
      prepareOfficialFirmwarePackage({
        release: { label: "4.0.0", revision: "r400", channel: "release" },
        target,
        options,
        fetchImplementation: vi.fn() as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ reason: "RELEASE_NOT_IN_PACK" });
  });

  it("refuses a Target whose layout the pack does not carry", async () => {
    await expect(
      prepareOfficialFirmwarePackage({
        release,
        target: {
          ...target,
          config: { ...target.config, layoutFile: "Unknown Device.json" },
        },
        options,
        fetchImplementation: vi.fn(
          async () =>
            new Response(esp8285Image().slice().buffer as ArrayBuffer),
        ) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ reason: "LAYOUT_NOT_IN_PACK" });
  });
});
