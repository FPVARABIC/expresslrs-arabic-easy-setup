import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BindingPreviewLab } from "./BindingPreviewLab";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("M3 Binding preview Web lab", () => {
  it("renders Arabic-first and prepares a value-only preview automatically", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    render(<BindingPreviewLab />);

    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(
      await screen.findByText("Synthetic TX Alpha 2.4"),
    ).toBeInTheDocument();
    expect(screen.getByText("SIMULATION_ONLY")).toBeInTheDocument();
    expect(
      screen.getByText("BINDING_RELATIONSHIP_WILL_CHANGE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "RECONNECT_SAME_DEVICE · REIDENTIFY_SAME_TARGET · LINK_ESTABLISHED",
      ),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("switches the isolated lab to English without changing its safety level", async () => {
    const user = userEvent.setup();
    render(<BindingPreviewLab />);
    await screen.findByText("Synthetic TX Alpha 2.4");

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(
      screen.getByRole("heading", { name: "Connect a new device", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("SIMULATION_ONLY")).toBeInTheDocument();
  });

  it("executes only after the displayed preview is explicitly confirmed", async () => {
    const user = userEvent.setup();
    render(<BindingPreviewLab />);
    await screen.findByText("Synthetic TX Alpha 2.4");

    await user.click(
      screen.getByRole("button", { name: "تأكيد وتشغيل المحاكاة" }),
    );

    expect(
      await screen.findByText(/نتيجة Core التجريبية: SUCCESS/),
    ).toBeInTheDocument();
    expect(screen.getByText(/تم التحقق عبر/)).toBeInTheDocument();
  });

  it("removes the confirm action when runtime Binding evidence is absent", async () => {
    const user = userEvent.setup();
    render(<BindingPreviewLab />);
    await screen.findByText("Synthetic TX Alpha 2.4");

    await user.selectOptions(
      screen.getByLabelText("عاين حالة جهاز"),
      "tx-dual-band",
    );

    expect(
      await screen.findByText("RUNTIME_GUIDED_BIND_NOT_AVAILABLE"),
    ).toBeInTheDocument();
    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "تأكيد وتشغيل المحاكاة" }),
    ).not.toBeInTheDocument();
  });
});
