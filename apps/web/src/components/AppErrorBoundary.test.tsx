import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppErrorBoundary } from "./AppErrorBoundary";

function BrokenChild(): never {
  throw new Error("secret=must-not-render");
}

describe("AppErrorBoundary", () => {
  it("renders normal application content unchanged", () => {
    render(
      <AppErrorBoundary>
        <p>healthy child</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText("healthy child")).toBeInTheDocument();
  });

  it("renders a fixed Arabic fallback without reflecting the thrown error", () => {
    document.documentElement.lang = "ar";
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <BrokenChild />
      </AppErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("تعذر عرض التطبيق");
    expect(alert).toHaveTextContent("لم يُرسل أي أمر إلى الجهاز");
    expect(alert).not.toHaveTextContent("secret=must-not-render");
    consoleError.mockRestore();
  });

  it("uses the fixed English fallback when the document locale is English", () => {
    document.documentElement.lang = "en";
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <BrokenChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The app could not be displayed",
    );
    consoleError.mockRestore();
  });
});
