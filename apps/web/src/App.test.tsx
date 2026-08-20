import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "@elrs-easy/i18n";
import type { BrowserFetch } from "@elrs-easy/platform-browser";
import { App } from "./App";

function realDeviceResponse(): Response {
  return new Response(
    JSON.stringify({
      settings: {
        product_name: "Example WiFi Receiver",
        target: "EXAMPLE_RX_2400",
        version: "4.1.0",
        "git-commit": "a9d4a9c",
        "module-type": "RX",
        "radio-type": "SX128X",
        has_low_band: false,
        has_high_band: true,
        reg_domain_high: "ISM_2400",
        custom_hardware: false,
        ssid: "private-device-ssid",
      },
      config: { uid: [1, 2, 3, 4, 5, 6] },
      options: {
        "wifi-ssid": "private-home-network",
        "wifi-password": "private-password",
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Arabic-first Web foundation", () => {
  it("renders Easy Mode in Arabic and applies RTL from the first app render", () => {
    render(<App />);

    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(
      screen.getByRole("heading", { name: "ما الذي تريد فعله؟", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ربط جهاز جديد/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("قراءة Wi-Fi تجريبية فقط", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "اقرأ معلومات جهاز ExpressLRS عبر Wi-Fi",
      }),
    ).toBeInTheDocument();
  });

  it("switches direction with the English fallback locale", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(
      screen.getByRole("heading", {
        name: "What would you like to do?",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Read your ExpressLRS device over Wi-Fi",
      }),
    ).toBeInTheDocument();
  });

  it("does not contact the local network before explicit user intent", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    render(<App />);

    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    ).toBeInTheDocument();
  });

  it("reads one official endpoint and presents only unvalidated reported facts", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn<BrowserFetch>(async () => realDeviceResponse());
    vi.stubGlobal("fetch", fetch);
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );

    expect(
      await screen.findByText("تم جمع معلومات الجهاز"),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe("http://10.0.0.1/config");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    expect(screen.getByText("Example WiFi Receiver")).toBeInTheDocument();
    expect(screen.getByText("EXAMPLE_RX_2400")).toBeInTheDocument();
    expect(screen.getByText("أبلغ عنه الجهاز")).toBeInTheDocument();
    expect(screen.getByText("Target غير مؤكّد")).toBeInTheDocument();
    expect(screen.queryByText("private-device-ssid")).not.toBeInTheDocument();
    expect(screen.queryByText("private-home-network")).not.toBeInTheDocument();
    expect(screen.queryByText("private-password")).not.toBeInTheDocument();
    expect(screen.queryByText("1,2,3,4,5,6")).not.toBeInTheDocument();
  });

  it("cancels an in-flight local read and ignores its stale completion", async () => {
    const user = userEvent.setup();
    let requestSignal: AbortSignal | undefined;
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetch = vi.fn(
      async (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          requestSignal = init.signal as AbortSignal;
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );
    expect(
      await screen.findByText("نقرأ إعدادات الجهاز بصورة آمنة…"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "إلغاء القراءة" }));

    expect(requestSignal?.aborted).toBe(true);
    expect(
      await screen.findByText("أُلغيت القراءة. لم يُطلب أي تغيير على الجهاز."),
    ).toBeInTheDocument();

    resolveFetch?.(realDeviceResponse());
    await Promise.resolve();
    expect(screen.queryByText("تم جمع معلومات الجهاز")).not.toBeInTheDocument();
  });

  it("shows a localized retry path after a read failure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );

    expect(await screen.findByText("تعذرت قراءة الجهاز")).toBeInTheDocument();
    expect(
      screen.getByText("السبب: انقطع الاتصال بالجهاز."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "إعادة المحاولة" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("تم جمع معلومات الجهاز")).not.toBeInTheDocument();
  });

  it("does not offer a blind retry for a non-retryable device schema", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ settings: {}, config: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );

    expect(await screen.findByText("تعذرت قراءة الجهاز")).toBeInTheDocument();
    expect(
      screen.getByText("لا تفيد إعادة المحاولة التلقائية", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "إعادة المحاولة" }),
    ).not.toBeInTheDocument();
  });

  it("localizes the selected scenario values in Arabic and English", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText("مرسل TX Alpha 2.4")).toBeInTheDocument();
    expect(screen.getByText("بيانات جهاز تجريبية")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByText("TX Alpha 2.4")).toBeInTheDocument();
    expect(screen.getByText("Synthetic fixture")).toBeInTheDocument();
  });

  it("falls back to English when a non-critical Arabic message is unavailable", () => {
    expect(translate("ar", "debug.englishOnly")).toBe(
      "English fallback verified",
    );
  });

  it("blocks sensitive operations when target evidence is ambiguous", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Target غير محسوم" }));

    expect(
      screen.getByRole("heading", { name: "العمليات الحساسة متوقفة" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("لن يخمّن التطبيق أبدًا", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ربط جهاز جديد/ }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /تحديث جهاز/ })).toBeDisabled();
    expect(screen.queryByText(/SUCCESS/u)).not.toBeInTheDocument();
  });

  it("requires explicit confirmation before Binding can report verified success", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /ربط جهاز جديد/ }));

    expect(
      screen.getByRole("button", { name: "تأكيد وتشغيل المحاكاة" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/SUCCESS/u)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "تأكيد وتشغيل المحاكاة" }),
    );

    expect(
      await screen.findByText(/نتيجة Core التجريبية: SUCCESS.*أحداث منظمة/u),
    ).toBeInTheDocument();
  });

  it("does not report Setup success before a Setup workflow exists", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /إعداد جهاز/ }));

    expect(
      screen.getByText("لا يتم تشغيل Workflow للإعداد أو التشخيص", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/SUCCESS/u)).not.toBeInTheDocument();
  });

  it("supports keyboard focus and activation for an Easy Mode task", async () => {
    const user = userEvent.setup();
    render(<App />);
    const update = screen.getByRole("button", { name: /تحديث جهاز/ });

    update.focus();
    expect(document.activeElement).toBe(update);
    await user.keyboard("{Enter}");

    expect(screen.queryByText(/SUCCESS/u)).not.toBeInTheDocument();
    const confirm = screen.getByRole("button", {
      name: "تأكيد وتشغيل المحاكاة",
    });
    confirm.focus();
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(/نتيجة Core التجريبية: SUCCESS/u),
    ).toBeInTheDocument();
  });

  it("keeps Bind and Update disabled when no device is connected", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "لا يوجد جهاز" }));

    expect(
      screen.getByRole("button", { name: /ربط جهاز جديد/ }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /تحديث جهاز/ })).toBeDisabled();
    expect(screen.queryByText(/SUCCESS/u)).not.toBeInTheDocument();
  });

  it("copies only the documented privacy-safe support payload", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    await user.click(screen.getByRole("switch", { name: "الوضع المتقدم" }));
    expect(
      screen.getByText("لا تُنسخ معرّفات الجلسة", { exact: false }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "نسخ التفاصيل التقنية" }),
    );

    expect(writeText).toHaveBeenCalledTimes(1);
    const serialized = String(writeText.mock.calls[0]?.[0]);
    const payload = JSON.parse(serialized) as {
      readonly schemaVersion: string;
      readonly safeDetails: Readonly<Record<string, unknown>>;
      readonly redactedFields: readonly string[];
      readonly excludedFields: readonly string[];
    };

    expect(payload).toEqual({
      schemaVersion: "1",
      safeDetails: {
        confidence: "confirmed",
        providerId: "synthetic-foundation",
        targetId: "fixture.tx.alpha-2g4",
        validationLevel: "SYNTHETIC",
      },
      redactedFields: [],
      excludedFields: [],
    });
    expect(serialized).not.toContain("MOCK-RX24-7F3A");
    expect(serialized).not.toContain("runtime-target");
    expect(serialized).not.toContain("type=TX");
    expect(serialized).not.toMatch(
      /bindingPhrase|bindingIdentity|wifiPassword|serialNumber|secret|uid/iu,
    );
    expect(screen.getAllByText("تم نسخ التفاصيل").length).toBeGreaterThan(0);
  });

  it("reports clipboard permission failure without claiming success", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    await user.click(screen.getByRole("switch", { name: "الوضع المتقدم" }));
    await user.click(
      screen.getByRole("button", { name: "نسخ التفاصيل التقنية" }),
    );

    expect(
      await screen.findByText(
        "تعذر النسخ. تحقق من إذن الحافظة ثم أعد المحاولة.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("تم نسخ التفاصيل")).not.toBeInTheDocument();
  });

  for (const width of [360, 1440] as const) {
    it(`renders the same accessible task shell at a ${width}px viewport`, () => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      window.dispatchEvent(new Event("resize"));
      render(<App />);

      expect(document.querySelectorAll("button.task-card")).toHaveLength(4);
      expect(document.querySelector(".app-shell")).toHaveAttribute(
        "dir",
        "rtl",
      );
    });
  }
});
