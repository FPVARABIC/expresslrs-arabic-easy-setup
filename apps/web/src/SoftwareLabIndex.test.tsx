import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SoftwareLabIndex } from "./SoftwareLabIndex";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("software lab index", () => {
  it("renders Arabic-first links to isolated M3 and M4 routes without network access", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    window.history.replaceState(
      {},
      "",
      "/configurator?mode=easy&view=software-labs#device-summary",
    );

    render(<SoftwareLabIndex />);

    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("M3 · PREVIEW_BOUND_APPROVAL")).toBeInTheDocument();
    expect(
      screen.getByText("M4 · PROVENANCE_BOUND_APPROVAL"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("SIMULATION_ONLY")).toHaveLength(2);
    expect(
      screen.getByText((_, element) =>
        element?.classList.contains("status-pill")
          ? element.textContent?.includes("SIMULATION_ONLY") === true
          : false,
      ),
    ).toBeInTheDocument();

    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(
      "/configurator?mode=easy&view=binding-preview#device-summary",
    );
    expect(hrefs).toContain(
      "/configurator?mode=easy&view=firmware-preview#device-summary",
    );
    expect(hrefs).toContain("/configurator?mode=easy#device-summary");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("switches the index direction to English without changing route isolation", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/?view=software-labs");
    render(<SoftwareLabIndex />);

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/?view=binding-preview");
    expect(hrefs).toContain("/?view=firmware-preview");
  });
});
