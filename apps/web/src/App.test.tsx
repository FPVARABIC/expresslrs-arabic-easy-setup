import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "@elrs-easy/i18n";
import type { BrowserFetch } from "@elrs-easy/platform-browser";
import { App } from "./App";

function realDeviceResponse(
  settings: Readonly<Record<string, unknown>> = {},
): Response {
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
        ...settings,
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

async function openAdvanced(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("switch", { name: "الوضع المتقدم" }));
}

describe("Arabic-first Web foundation", () => {
  it("renders Easy Mode in Arabic and applies RTL from the first app render", () => {
    render(<App />);

    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(
      screen.getByRole("heading", { name: "إعداد الجهاز", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ربط المرسل والمستقبل/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /التحديث إلى أحدث إصدار/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /الإعدادات الضرورية/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("العتاد غير مختبر", { exact: false }),
    ).toBeInTheDocument();
    const easyTasks = screen.getByRole("heading", {
      name: "العمليات الأساسية",
      level: 2,
    });
    const advancedHeading = screen.getByRole("heading", {
      name: "التفاصيل التقنية",
    });
    expect(
      easyTasks.compareDocumentPosition(advancedHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        name: "اقرأ معلومات جهاز ExpressLRS عبر Wi-Fi",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "حالة الجهاز للقراءة فقط" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("أدلة هوية الجهاز")).not.toBeInTheDocument();
    expect(document.querySelectorAll("button.task-card")).toHaveLength(3);
    expect(document.body.textContent).not.toMatch(/[؟?]/u);
  });

  it("switches direction with the English fallback locale", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(
      screen.getByRole("heading", {
        name: "Set up the device",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Read your ExpressLRS device over Wi-Fi",
      }),
    ).not.toBeInTheDocument();
  });

  it("does not contact the local network before explicit user intent", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    render(<App />);

    expect(fetch).not.toHaveBeenCalled();
    await openAdvanced(user);
    expect(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "حالة الجهاز للقراءة فقط" }),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads one official endpoint and presents only unvalidated reported facts", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn<BrowserFetch>(async () => realDeviceResponse());
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    await openAdvanced(user);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );

    expect(
      await screen.findByText("تم جمع معلومات الجهاز", {
        selector: ".real-result-summary strong",
      }),
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
    expect(
      screen.getByText(
        "هذه لقطة من آخر قراءة مكتملة، وليست حالة اتصال مباشرة.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("اكتملت آخر قراءة")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "إعادة قراءة معلومات الجهاز" }),
    ).toBeInTheDocument();
    const healthPanel = screen.getByRole("region", {
      name: "حالة الجهاز للقراءة فقط",
    });
    expect(
      within(healthPanel).getByText("العمليات الحساسة متوقفة"),
    ).toBeInTheDocument();
    expect(within(healthPanel).getAllByRole("term")).toHaveLength(6);
    expect(within(healthPanel).getAllByRole("definition")).toHaveLength(6);
    expect(
      within(healthPanel).getByText("الإعدادات الضرورية"),
    ).toBeInTheDocument();
    expect(within(healthPanel).getByText("مكتمل")).toBeInTheDocument();
    const compatibilityRow = within(healthPanel)
      .getByText("تعريف الجهاز (Target)")
      .closest("div");
    expect(compatibilityRow).not.toBeNull();
    expect(
      within(compatibilityRow as HTMLElement).getByText("غير معروف"),
    ).toBeInTheDocument();
    expect(within(healthPanel).queryByRole("button")).not.toBeInTheDocument();
    expect(healthPanel.textContent).not.toMatch(
      /Example|EXAMPLE|4\.1\.0|private/iu,
    );
    expect(healthPanel.textContent).not.toMatch(/[؟?]/u);
    expect(screen.queryByText("private-device-ssid")).not.toBeInTheDocument();
    expect(screen.queryByText("private-home-network")).not.toBeInTheDocument();
    expect(screen.queryByText("private-password")).not.toBeInTheDocument();
    expect(screen.queryByText("1,2,3,4,5,6")).not.toBeInTheDocument();
  });

  it("cancels an in-flight local read and ignores its stale completion", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
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
    await openAdvanced(user);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );
    expect(
      await screen.findByText("نقرأ إعدادات الجهاز بصورة آمنة…", {
        selector: ".real-result-summary strong",
      }),
    ).toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "إلغاء القراءة" });
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.click(cancel);

    expect(requestSignal?.aborted).toBe(true);
    const cancelled = await screen.findByText(
      "أُلغيت القراءة. لم يُطلب أي تغيير على الجهاز.",
      { selector: ".real-result-summary strong" },
    );
    expect(cancelled).toBeInTheDocument();
    await waitFor(() =>
      expect(cancelled.closest(".real-result-summary")).toHaveFocus(),
    );

    const cancelledProgress = document.querySelector(
      ".real-progress-list",
    ) as HTMLElement;
    expect(cancelledProgress).toBeInTheDocument();
    expect(
      within(cancelledProgress).getByText("نجهّز طلبًا للقراءة فقط"),
    ).toBeInTheDocument();
    expect(
      within(cancelledProgress).getByText(
        "نحاول الوصول إلى عنوان الجهاز المختار",
      ),
    ).toBeInTheDocument();
    const cancelledStage = within(cancelledProgress)
      .getByText("أُلغيت القراءة")
      .closest("li") as HTMLElement;
    expect(within(cancelledStage).getByText("×")).toBeInTheDocument();
    expect(within(cancelledProgress).queryByText("✓")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "نسخ تفاصيل الدعم الآمنة" }),
    );
    const cancelledReport = JSON.parse(
      String(writeText.mock.calls[0]?.[0]),
    ) as {
      readonly operation: Readonly<Record<string, unknown>>;
      readonly evidenceSummary: {
        readonly stageCategories: readonly string[];
      };
    };
    expect(cancelledReport.operation).toMatchObject({
      outcome: "CANCELLED",
      attempts: 1,
      reconnectState: "NOT_ATTEMPTED",
    });
    expect(cancelledReport.evidenceSummary.stageCategories).toEqual([
      "PREPARING",
      "DISCOVERING",
      "CANCELLED",
    ]);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );
    await screen.findByText("تعذرت قراءة الجهاز", {
      selector: ".real-result-summary strong",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("إذا تعذرت القراءة، فتحقق من وضع Wi-Fi", {
        exact: false,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("أعد الجهاز إلى وضع Wi-Fi", { exact: false }),
    ).not.toBeInTheDocument();

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
    await openAdvanced(user);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );

    expect(
      await screen.findByText("تعذرت قراءة الجهاز", {
        selector: ".real-result-summary strong",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "السبب: تعذر الوصول إلى الجهاز، أو توقفت القراءة قبل أن تكتمل.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("إذا تعذرت القراءة، فتحقق من وضع Wi-Fi", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "إعادة المحاولة" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("تم جمع معلومات الجهاز")).not.toBeInTheDocument();
    const failedProgress = document.querySelector(
      ".real-progress-list",
    ) as HTMLElement;
    const failedStage = within(failedProgress)
      .getByText("توقفت القراءة قبل أن تكتمل")
      .closest("li") as HTMLElement;
    expect(within(failedStage).getByText("!")).toBeInTheDocument();
    expect(within(failedProgress).queryByText("✓")).not.toBeInTheDocument();
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
    await openAdvanced(user);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );

    expect(
      await screen.findByText("تعذرت قراءة الجهاز", {
        selector: ".real-result-summary strong",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("لا تفيد إعادة المحاولة التلقائية", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("فاختر عنوانًا رسميًا آخر", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("إذا تعذرت القراءة، فتحقق من وضع Wi-Fi", {
        exact: false,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "إعادة المحاولة" }),
    ).not.toBeInTheDocument();
  });

  it("copies a fixed-category real-device support report without device data", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => realDeviceResponse()),
    );
    render(<App />);
    await openAdvanced(user);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );
    await screen.findByText("تم جمع معلومات الجهاز", {
      selector: ".real-result-summary strong",
    });
    await user.click(
      screen.getByRole("button", { name: "نسخ تفاصيل الدعم الآمنة" }),
    );

    expect(writeText).toHaveBeenCalledTimes(1);
    const serialized = String(writeText.mock.calls[0]?.[0]);
    const report = JSON.parse(serialized) as {
      readonly reportType: string;
      readonly hardwareValidation: string;
      readonly operation: Readonly<Record<string, unknown>>;
      readonly evidenceSummary: {
        readonly factCategories: readonly string[];
        readonly stageCategories: readonly string[];
      };
      readonly privacy: Readonly<Record<string, unknown>>;
    };

    expect(report).toMatchObject({
      reportType: "READ_ONLY_DEVICE_DIAGNOSTIC",
      hardwareValidation: "NONE",
      operation: {
        outcome: "SUCCESS",
        attempts: 1,
        reconnectState: "NOT_ATTEMPTED",
      },
      privacy: {
        rawValuesIncluded: false,
        rawFieldNamesIncluded: false,
        deviceIdentifiersIncluded: false,
        credentialsIncluded: false,
        persistedByApplication: false,
      },
    });
    expect(report.evidenceSummary.factCategories).toContain("TARGET");
    expect(report.evidenceSummary.stageCategories).toContain("SUCCESS");
    expect(serialized).not.toMatch(
      /EXAMPLE_RX_2400|Example WiFi Receiver|private-device-ssid|private-home-network|private-password|1,2,3,4,5,6|10\.0\.0\.1/iu,
    );
    expect(screen.getByText("نُسخت تفاصيل الدعم الآمنة")).toBeInTheDocument();
  });

  it("guides a manual reconnect and confirms only snapshot consistency", async () => {
    const user = userEvent.setup();
    let requestNumber = 0;
    const fetch = vi.fn<BrowserFetch>(async () => {
      requestNumber += 1;
      return requestNumber === 2
        ? new Response("missing", { status: 404 })
        : realDeviceResponse();
    });
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    await openAdvanced(user);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );
    await screen.findByText("تم جمع معلومات الجهاز", {
      selector: ".real-result-summary strong",
    });
    await user.click(
      screen.getByRole("button", { name: "إعادة قراءة معلومات الجهاز" }),
    );

    await screen.findByText("تعذرت قراءة الجهاز", {
      selector: ".real-result-summary strong",
    });
    expect(screen.queryByText("EXAMPLE_RX_2400")).not.toBeInTheDocument();
    expect(
      screen.getByText("أعد الجهاز إلى وضع Wi-Fi", { exact: false }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "إعادة المحاولة" }));

    await screen.findByText("تم جمع معلومات الجهاز", {
      selector: ".real-result-summary strong",
    });
    expect(
      screen.getByText("تطابقت قيم Target وإصدار Firmware", {
        exact: false,
      }),
    ).toBeInTheDocument();
    const healthPanel = screen.getByRole("region", {
      name: "حالة الجهاز للقراءة فقط",
    });
    const connectionRow = within(healthPanel)
      .getByText("الاتصال")
      .closest("div");
    expect(connectionRow).not.toBeNull();
    expect(
      within(connectionRow as HTMLElement).getByText("مكتمل"),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retains a changed-snapshot check through cancel and transport quarantine", async () => {
    const user = userEvent.setup();
    let requestNumber = 0;
    let resolveQuarantinedFetch: ((response: Response) => void) | undefined;
    const fetch = vi.fn<BrowserFetch>(async () => {
      requestNumber += 1;
      if (requestNumber === 1) {
        return realDeviceResponse();
      }
      if (requestNumber === 2) {
        return new Response("missing", { status: 404 });
      }
      if (requestNumber === 3) {
        return new Promise<Response>((resolve) => {
          resolveQuarantinedFetch = resolve;
        });
      }
      return realDeviceResponse({ target: "DIFFERENT_RX_2400" });
    });
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    await openAdvanced(user);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );
    await screen.findByText("تم جمع معلومات الجهاز", {
      selector: ".real-result-summary strong",
    });
    await user.click(
      screen.getByRole("button", { name: "إعادة قراءة معلومات الجهاز" }),
    );
    await screen.findByText("تعذرت قراءة الجهاز", {
      selector: ".real-result-summary strong",
    });
    await user.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    const cancel = await screen.findByRole("button", { name: "إلغاء القراءة" });
    await user.click(cancel);
    await screen.findByText("أُلغيت القراءة. لم يُطلب أي تغيير على الجهاز.", {
      selector: ".real-result-summary strong",
    });
    expect(
      screen.getByText("أعد الجهاز إلى وضع Wi-Fi", { exact: false }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );
    await screen.findByText("تعذرت قراءة الجهاز", {
      selector: ".real-result-summary strong",
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      screen.getByText("أعد الجهاز إلى وضع Wi-Fi", { exact: false }),
    ).toBeInTheDocument();

    resolveQuarantinedFetch?.(realDeviceResponse());
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    await user.click(screen.getByRole("button", { name: "إعادة المحاولة" }));

    expect(
      await screen.findByText("اختلفت قيمة واحدة أو أكثر", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("DIFFERENT_RX_2400")).toBeInTheDocument();
    expect(requestNumber).toBe(4);
  });

  it("does not label an ordinary successful refresh as a reconnect check", async () => {
    const user = userEvent.setup();
    let requestNumber = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<BrowserFetch>(async () => {
        requestNumber += 1;
        return realDeviceResponse({
          target: requestNumber === 1 ? "EXAMPLE_RX_2400" : "DIFFERENT_RX_2400",
        });
      }),
    );
    render(<App />);
    await openAdvanced(user);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );
    await screen.findByText("تم جمع معلومات الجهاز", {
      selector: ".real-result-summary strong",
    });
    await user.click(
      screen.getByRole("button", { name: "إعادة قراءة معلومات الجهاز" }),
    );
    await screen.findByText("DIFFERENT_RX_2400");

    expect(
      screen.queryByText("بعد استعادة الاتصال", { exact: false }),
    ).not.toBeInTheDocument();
    expect(requestNumber).toBe(2);
  });

  it("does not steal focus when the user moves away during a slow read", async () => {
    const user = userEvent.setup();
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    render(<App />);
    await openAdvanced(user);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );
    const cancel = await screen.findByRole("button", { name: "إلغاء القراءة" });
    await waitFor(() => expect(cancel).toHaveFocus());
    const english = screen.getByRole("button", { name: "English" });
    await user.click(english);
    expect(english).toHaveFocus();

    resolveFetch?.(realDeviceResponse());
    await screen.findByText("Device facts collected", {
      selector: ".real-result-summary strong",
    });
    expect(english).toHaveFocus();
  });

  it("reports real support clipboard failure without claiming success", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => realDeviceResponse()),
    );
    render(<App />);
    await openAdvanced(user);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );
    await screen.findByText("تم جمع معلومات الجهاز", {
      selector: ".real-result-summary strong",
    });
    await user.click(
      screen.getByRole("button", { name: "نسخ تفاصيل الدعم الآمنة" }),
    );

    expect(
      await screen.findByText(
        "تعذر نسخ تفاصيل الدعم. تحقق من إذن الحافظة ثم حاول مرة أخرى.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("نُسخت تفاصيل الدعم الآمنة"),
    ).not.toBeInTheDocument();
  });

  it("invalidates a pending support copy when the selected origin changes", async () => {
    const user = userEvent.setup();
    let resolveCopy: (() => void) | undefined;
    const writeText = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve;
        }),
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => realDeviceResponse()),
    );
    render(<App />);
    await openAdvanced(user);

    await user.click(
      screen.getByRole("button", { name: "قراءة معلومات الجهاز" }),
    );
    await screen.findByText("تم جمع معلومات الجهاز", {
      selector: ".real-result-summary strong",
    });
    await user.click(
      screen.getByRole("button", { name: "نسخ تفاصيل الدعم الآمنة" }),
    );
    const copying = await screen.findByRole("button", {
      name: "جارٍ نسخ تفاصيل الدعم الآمنة…",
    });
    expect(copying).toBeDisabled();
    expect(copying).toHaveAttribute("aria-busy", "true");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "عنوان جهاز ExpressLRS" }),
      "http://elrs_rx.local",
    );
    resolveCopy?.();
    await Promise.resolve();

    expect(
      screen.queryByText("نُسخت تفاصيل الدعم الآمنة"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "نسخ تفاصيل الدعم الآمنة" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("تم جمع معلومات الجهاز")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "حالة الجهاز للقراءة فقط" }),
    ).not.toBeInTheDocument();
  });

  it("localizes the selected scenario values in Arabic and English", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText("جهاز ExpressLRS")).toBeInTheDocument();
    expect(screen.getByText("بيانات توضيحية")).toBeInTheDocument();
    await openAdvanced(user);
    expect(screen.getByText("مرسل TX Alpha 2.4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByText("ExpressLRS device")).toBeInTheDocument();
    expect(screen.getByText("TX Alpha 2.4")).toBeInTheDocument();
    expect(screen.getByText("Demonstration data")).toBeInTheDocument();
  });

  it("falls back to English when a non-critical Arabic message is unavailable", () => {
    expect(translate("ar", "debug.englishOnly")).toBe(
      "English fallback verified",
    );
  });

  it("blocks sensitive operations when target evidence is ambiguous", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAdvanced(user);

    await user.click(screen.getByRole("button", { name: "Target غير محسوم" }));

    expect(
      screen.getByRole("heading", { name: "العمليات الحساسة متوقفة" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("لن يخمّن التطبيق أبدًا", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ربط المرسل والمستقبل/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /التحديث إلى أحدث إصدار/ }),
    ).toBeDisabled();
    expect(screen.queryByText(/SUCCESS/u)).not.toBeInTheDocument();
  });

  it("requires explicit confirmation before Binding can report verified success", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /ربط المرسل والمستقبل/ }),
    );

    expect(
      screen.getByRole("button", { name: "تشغيل المعاينة" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/SUCCESS/u)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "تشغيل المعاينة" }));

    expect(
      await screen.findByText("اكتملت المعاينة وتم التحقق من النتيجة."),
    ).toBeInTheDocument();
  });

  it("does not report Setup success before a Setup workflow exists", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /الإعدادات الضرورية/ }),
    );

    expect(
      screen.getByText("هذه العملية قيد التجهيز", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/SUCCESS/u)).not.toBeInTheDocument();
  });

  it("supports keyboard focus and activation for an Easy Mode task", async () => {
    const user = userEvent.setup();
    render(<App />);
    const update = screen.getByRole("button", {
      name: /التحديث إلى أحدث إصدار/,
    });

    update.focus();
    expect(document.activeElement).toBe(update);
    await user.keyboard("{Enter}");

    expect(screen.queryByText(/SUCCESS/u)).not.toBeInTheDocument();
    const confirm = screen.getByRole("button", {
      name: "تشغيل المعاينة",
    });
    confirm.focus();
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText("اكتملت المعاينة وتم التحقق من النتيجة."),
    ).toBeInTheDocument();
  });

  it("keeps Bind and Update disabled when no device is connected", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAdvanced(user);

    await user.click(screen.getByRole("button", { name: "لا يوجد جهاز" }));

    expect(
      screen.getByRole("button", { name: /ربط المرسل والمستقبل/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /التحديث إلى أحدث إصدار/ }),
    ).toBeDisabled();
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
      readonly redactedFieldCount: number;
      readonly excludedFieldCount: number;
      readonly redactionCategories: readonly string[];
    };

    expect(payload).toEqual({
      schemaVersion: "1",
      safeDetails: {
        confidence: "confirmed",
        providerId: "synthetic-foundation",
        targetId: "fixture.tx.alpha-2g4",
        validationLevel: "SYNTHETIC",
      },
      redactedFieldCount: 0,
      excludedFieldCount: 0,
      redactionCategories: [],
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

      expect(document.querySelectorAll("button.task-card")).toHaveLength(3);
      expect(document.querySelector(".app-shell")).toHaveAttribute(
        "dir",
        "rtl",
      );
    });
  }
});
