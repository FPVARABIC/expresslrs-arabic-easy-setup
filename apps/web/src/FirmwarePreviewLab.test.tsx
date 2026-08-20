import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FirmwarePreviewLab } from "./FirmwarePreviewLab";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("M4 Firmware preview Web lab", () => {
  it("renders Arabic-first and prepares a provenance-bound preview without network access", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    render(<FirmwarePreviewLab />);

    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(
      await screen.findByText(
        "FIRMWARE_WILL_BE_REPLACED · DEVICE_WILL_REBOOT · LINK_WILL_BE_INTERRUPTED",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6"),
    ).toBeInTheDocument();
    expect(screen.getByText(/firmware-verification:v1/)).toBeInTheDocument();
    expect(screen.getByText("SIMULATION_ONLY")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("switches the isolated lab to English without changing its safety level", async () => {
    const user = userEvent.setup();
    render(<FirmwarePreviewLab />);
    await screen.findByText(/firmware-verification:v1/);

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(
      screen.getByRole("heading", { name: "Update a device", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("SIMULATION_ONLY")).toBeInTheDocument();
  });

  it("executes only after the displayed artifact and provenance are confirmed", async () => {
    const user = userEvent.setup();
    render(<FirmwarePreviewLab />);
    await screen.findByText(/firmware-verification:v1/);

    await user.click(
      screen.getByRole("button", { name: "تأكيد وتشغيل المحاكاة" }),
    );

    expect(
      await screen.findByText(/نتيجة Core التجريبية: SUCCESS/),
    ).toBeInTheDocument();
    expect(screen.getByText(/تم التحقق عبر/)).toBeInTheDocument();
  });

  it("removes confirmation when the Firmware major version is incompatible", async () => {
    const user = userEvent.setup();
    render(<FirmwarePreviewLab />);
    await screen.findByText(/firmware-verification:v1/);

    await user.selectOptions(
      screen.getByLabelText("البرنامج الثابت (Firmware)"),
      "major-mismatch",
    );

    expect(
      await screen.findByText("FIRMWARE_MAJOR_UNSUPPORTED"),
    ).toBeInTheDocument();
    expect(screen.getByText("COMPATIBILITY_NOT_PROVEN")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "تأكيد وتشغيل المحاكاة" }),
    ).not.toBeInTheDocument();
  });

  it("removes confirmation when provenance does not bind the artifact", async () => {
    const user = userEvent.setup();
    render(<FirmwarePreviewLab />);
    await screen.findByText(/firmware-verification:v1/);

    await user.selectOptions(
      screen.getByLabelText("البرنامج الثابت (Firmware)"),
      "provenance-mismatch",
    );

    expect(
      await screen.findByText("PROVENANCE_ARTIFACT_MISMATCH"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("VERIFICATION_PLAN_UNAVAILABLE"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "تأكيد وتشغيل المحاكاة" }),
    ).not.toBeInTheDocument();
  });
});
