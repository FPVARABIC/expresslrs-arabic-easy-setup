import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NetworkModeNotice } from "./NetworkModeNotice";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  setOnline(true);
  document.documentElement.lang = "ar";
});

describe("NetworkModeNotice", () => {
  it("stays out of the ordinary UI while the browser is online", () => {
    setOnline(true);
    render(<NetworkModeNotice />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows concise Arabic limited-offline guidance only when needed", () => {
    document.documentElement.lang = "ar";
    setOnline(false);
    render(<NetworkModeNotice />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("وضع محدود بدون إنترنت");
    expect(status.textContent).not.toMatch(/[؟?]/u);
  });

  it("tracks the application language without owning a second language switch", async () => {
    document.documentElement.lang = "ar";
    setOnline(false);
    render(<NetworkModeNotice />);

    document.documentElement.lang = "en";
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Limited offline mode",
      ),
    );
  });

  it("disappears when connectivity returns", async () => {
    setOnline(false);
    render(<NetworkModeNotice />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
  });
});
