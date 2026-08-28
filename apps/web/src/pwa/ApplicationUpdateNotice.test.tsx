import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApplicationUpdateNotice } from "./ApplicationUpdateNotice";

describe("ApplicationUpdateNotice", () => {
  it("does not register or render in a disabled development host", () => {
    const register = vi.fn();
    render(<ApplicationUpdateNotice enabled={false} register={register} />);

    expect(register).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the Arabic-first notice only after a waiting worker is reported", async () => {
    document.documentElement.lang = "ar";
    const register = vi.fn(async (input: { onWaiting?: () => void }) => {
      input.onWaiting?.();
      return "REGISTERED" as const;
    });
    render(<ApplicationUpdateNotice enabled register={register} />);
    fireEvent.load(window);

    await waitFor(() =>
      expect(screen.getByText("تحديث التطبيق جاهز")).toBeInTheDocument(),
    );
    expect(screen.getByRole("status").textContent).not.toMatch(/[؟?]/u);
  });

  it("tracks a language change without re-registering the worker", async () => {
    document.documentElement.lang = "ar";
    const register = vi.fn(async (input: { onWaiting?: () => void }) => {
      input.onWaiting?.();
      return "REGISTERED" as const;
    });
    render(<ApplicationUpdateNotice enabled register={register} />);
    fireEvent.load(window);
    await screen.findByText("تحديث التطبيق جاهز");

    document.documentElement.lang = "en";
    await screen.findByText("App update ready");
    expect(register).toHaveBeenCalledTimes(1);
  });
});
