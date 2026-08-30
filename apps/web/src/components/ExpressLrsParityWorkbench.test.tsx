import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OfficialCatalog } from "../hardware/parity-types";

const mocks = vi.hoisted(() => ({
  loadCatalog: vi.fn(),
  loadCheckpoint: vi.fn(),
}));

vi.mock("../hardware/official-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hardware/official-catalog")>()),
  loadOfficialExpressLrsCatalog: mocks.loadCatalog,
}));

vi.mock("../hardware/recovery-package", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hardware/recovery-package")>()),
  loadRecoveryCheckpoint: mocks.loadCheckpoint,
  saveRecoveryCheckpoint: vi.fn().mockResolvedValue(undefined),
  clearRecoveryCheckpoint: vi.fn().mockResolvedValue(undefined),
}));

import { ExpressLrsParityWorkbench } from "./ExpressLrsParityWorkbench";

const catalog: OfficialCatalog = {
  source: "EXPRESSLRS_ARTIFACTORY",
  loadedAt: "2026-08-30T00:00:00.000Z",
  releases: [
    { label: "4.1.0", revision: "release410", channel: "release" },
  ],
  targets: [
    {
      id: "vendor/tx_2400/module",
      role: "tx",
      vendorKey: "vendor",
      vendorName: "Vendor",
      radioKey: "tx_2400",
      targetKey: "module",
      config: {
        productName: "Vendor TX Module",
        platform: "esp32",
        firmware: "VENDOR_TX",
        luaName: "vendor.lua",
        layoutFile: null,
        logoFile: null,
        uploadMethods: ["uart", "edgetx", "wifi", "download"],
        minVersion: null,
        customLayout: {},
        overlay: null,
        raw: {},
      },
    },
    {
      id: "vendor/rx_900/receiver",
      role: "rx",
      vendorKey: "vendor",
      vendorName: "Vendor",
      radioKey: "rx_900",
      targetKey: "receiver",
      config: {
        productName: "Vendor RX",
        platform: "esp8285",
        firmware: "VENDOR_RX",
        luaName: null,
        layoutFile: null,
        logoFile: null,
        uploadMethods: ["betaflight", "wifi", "download"],
        minVersion: null,
        customLayout: {},
        overlay: null,
        raw: {},
      },
    },
  ],
};

describe("primary ExpressLRS hardware workbench", () => {
  beforeEach(() => {
    mocks.loadCatalog.mockReset().mockResolvedValue(catalog);
    mocks.loadCheckpoint.mockReset().mockResolvedValue(null);
  });

  it("starts with real operations locked instead of presenting a mock success path", () => {
    render(<ExpressLrsParityWorkbench />);

    expect(
      screen.getByRole("heading", { name: "إعداد وتحديث ExpressLRS" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    ).toBeDisabled();
    expect(screen.queryByText(/معاينة آمنة/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/نجاح تجريبي/u)).not.toBeInTheDocument();
  });

  it("loads official TX/RX targets and requires an explicit regulatory region", async () => {
    const user = userEvent.setup();
    render(<ExpressLrsParityWorkbench />);

    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Vendor TX Module" })).toBeInTheDocument(),
    );
    expect(mocks.loadCatalog).toHaveBeenCalledTimes(1);
    const build = screen.getByRole("button", {
      name: "بناء Firmware الرسمي",
    });
    expect(build).toBeDisabled();

    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "EU_CE_2400",
    );
    expect(build).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "جهاز استقبال RX" }));
    expect(
      screen.getByRole("option", { name: "Vendor RX" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("المنطقة التنظيمية")).toHaveValue("");
    expect(build).toBeDisabled();
  });

  it("does not claim an internal ST-Link path when the Target does not expose it", async () => {
    const user = userEvent.setup();
    render(<ExpressLrsParityWorkbench />);
    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "USB مباشر / UART" })).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("option", { name: "ST-Link" }),
    ).not.toBeInTheDocument();
  });
});
