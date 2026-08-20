import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { translate } from "@elrs-easy/i18n";
import { App } from "./App";

describe("Arabic-first Web foundation", () => {
  it("renders Easy Mode in Arabic and applies RTL from the first app render", () => {
    render(<App />);

    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("heading", { name: "ما الذي تريد فعله؟", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ربط جهاز جديد/ })).toBeInTheDocument();
    expect(screen.getByText("أجهزة محاكاة فقط", { exact: false })).toBeInTheDocument();
  });

  it("switches direction with the English fallback locale", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("heading", { name: "What would you like to do?", level: 1 })).toBeInTheDocument();
  });

  it("falls back to English when a non-critical Arabic message is unavailable", () => {
    expect(translate("ar", "debug.englishOnly")).toBe("English fallback verified");
  });

  it("blocks sensitive operations when target evidence is ambiguous", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Target غير محسوم" }));

    expect(screen.getByRole("heading", { name: "العمليات الحساسة متوقفة" })).toBeInTheDocument();
    expect(screen.getByText("لن يخمّن التطبيق أبدًا", { exact: false })).toBeInTheDocument();
  });
});
