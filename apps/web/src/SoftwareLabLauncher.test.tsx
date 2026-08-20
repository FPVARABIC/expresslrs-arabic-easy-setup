import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SoftwareLabLauncher } from "./SoftwareLabLauncher";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("software lab launcher", () => {
  it("renders a links-only same-origin route from the normal application", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    window.history.replaceState(
      {},
      "",
      "/configurator?mode=easy#device-summary",
    );
    document.documentElement.lang = "ar";

    render(<SoftwareLabLauncher />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/configurator?mode=easy&view=software-labs#device-summary",
    );
    expect(screen.getByText("SIMULATION_ONLY")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
