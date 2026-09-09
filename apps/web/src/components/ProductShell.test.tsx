import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProductShell } from "./ProductShell";
import type { CrsfParameter } from "../hardware/crsf";
import type { ExpressLrsIdentity } from "../hardware/session";
import type {
  HardwareDriverConnectOutcome,
  HardwareDriverConnector,
  HardwareSessionDriver,
} from "../hardware/userSession";

function connectorReturning(
  outcome: HardwareDriverConnectOutcome,
): HardwareDriverConnector {
  return vi.fn(async () => outcome) as unknown as HardwareDriverConnector;
}

function command(
  id: number,
  name: string,
): Extract<CrsfParameter, { readonly kind: "command" }> {
  return {
    id,
    parentId: 0,
    type: 13,
    hidden: false,
    name,
    rawValue: new Uint8Array(),
    kind: "command",
    step: 0,
    timeoutMs: 2_000,
    information: "",
  };
}

function selection(
  id: number,
  name: string,
): Extract<CrsfParameter, { readonly kind: "selection" }> {
  return {
    id,
    parentId: 0,
    type: 9,
    hidden: false,
    name,
    rawValue: new Uint8Array(),
    kind: "selection",
    value: 1,
    min: 0,
    max: 2,
    defaultValue: 0,
    options: ["A", "B", "C"],
    units: "",
  };
}

/** Mirrors the driver contract the Advanced workbench tests already use. */
function connectedConnector(
  options: Readonly<{
    identity?: Partial<ExpressLrsIdentity>;
    withBindCommand?: boolean;
    writeResult?: (requested: number) => { value: number; verified: boolean };
    bindFails?: boolean;
  }> = {},
): HardwareDriverConnector {
  const overrides = options.identity ?? {};
  const parameters: CrsfParameter[] = [selection(1, "Packet Rate")];
  // Models a real device: what the parameter reads back is whatever the write
  // actually left on it, which is what the session verifies independently.
  let currentValue = 1;
  if (options.withBindCommand !== false) parameters.push(command(2, "Bind"));
  const identity: ExpressLrsIdentity = {
    validation: "CRSF_DEVICE_INFO",
    role: "tx",
    address: 0xea,
    requestOrigin: 0xef,
    productName: "Reference TX",
    firmwareVersion: "4.1.0",
    serialMarker: "ELRS",
    hardwareVersion: 3,
    softwareVersion: 0x0004_0100,
    parameterVersion: 1,
    parameterCount: parameters.length,
    usb: { usbVendorId: 0x303a, usbProductId: 0x1001 },
    ...overrides,
  } as ExpressLrsIdentity;
  const driver: HardwareSessionDriver = {
    identity,
    parameters,
    port: {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      ondisconnect: null,
    },
    readParameter: async (parameterId: number) => {
      const base = parameters.find((item) => item.id === parameterId);
      if (base === undefined || base.kind !== "selection") {
        throw new Error("unknown parameter");
      }
      return { ...base, value: currentValue };
    },
    writeParameter: async (parameterId: number, requested: number) => {
      const outcome = options.writeResult?.(requested) ?? {
        value: requested,
        verified: true,
      };
      const base = parameters.find((item) => item.id === parameterId);
      if (base === undefined || base.kind !== "selection") {
        throw new Error("parameter is not writable");
      }
      currentValue = outcome.value;
      return {
        parameter: { ...base, value: outcome.value },
        requestedValue: requested,
        verified: outcome.verified,
      };
    },
    startBinding: async () => {
      if (options.bindFails === true) throw new Error("bind rejected");
      return {
        stage: "TX_BIND_COMMAND_ACKNOWLEDGED" as const,
        verified: true as const,
        information: "Bind mode active",
      };
    },
    executeCommand: async () => ({
      parameter: command(2, "Bind"),
      finalStep: 0,
      information: "Bind mode active",
      acknowledged: true,
    }),
    verifyCurrentIdentity: vi.fn().mockResolvedValue(identity),
    close: vi.fn().mockResolvedValue(true),
  } as unknown as HardwareSessionDriver;
  return connectorReturning({
    status: "CONNECTED",
    driver,
    identity,
    parameters,
  } as HardwareDriverConnectOutcome);
}

describe("public product shell", () => {
  it("opens in Arabic Easy Mode, not the technical workbench", () => {
    render(<ProductShell />);

    expect(
      screen.getByRole("heading", { level: 1, name: "إعداد ExpressLRS" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /إعداد وتحديث ExpressLRS/u }),
    ).not.toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });

  it("reaches the technical workbench only through an explicit choice", async () => {
    const user = userEvent.setup();
    render(<ProductShell />);

    await user.click(screen.getByRole("button", { name: "الوضع المتقدم" }));

    expect(
      await screen.findByRole("heading", { name: /إعداد وتحديث ExpressLRS/u }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "الوضع السهل" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "إعداد ExpressLRS" }),
    ).toBeInTheDocument();
  });

  it("switches the shipped interface to English and back", async () => {
    const user = userEvent.setup();
    render(<ProductShell />);

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Set up ExpressLRS",
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));

    await user.click(screen.getByRole("button", { name: "العربية" }));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "إعداد ExpressLRS",
      }),
    ).toBeInTheDocument();
  });

  it("offers all three operations, every one reachable with no device attached", async () => {
    const user = userEvent.setup();
    render(<ProductShell />);

    for (const name of [
      "ربط المرسل والمستقبل",
      "الإعدادات الأساسية",
      "تحديث Firmware",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    // No operation is hidden or disabled because of the project phase.
    const starts = screen.getAllByRole("button", { name: "ابدأ" });
    expect(starts).toHaveLength(3);
    for (const start of starts) expect(start).toBeEnabled();

    // Choosing one with nothing connected begins the flow at the connect step.
    await user.click(starts[0] as HTMLElement);
    expect(
      screen.getByRole("heading", { level: 1, name: "ربط المرسل والمستقبل" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/وصّل الجهاز عبر USB/u)).toBeInTheDocument();
  });

  it("never shows placeholder or locked-feature copy", () => {
    render(<ProductShell />);
    const text = document.body.textContent ?? "";
    for (const banned of [
      "غير متاح بعد",
      "مقفلة",
      "قيد التجهيز",
      "Coming soon",
      "تقرأ فقط",
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it("binds through the real session and refuses to call a command a success", async () => {
    const user = userEvent.setup();
    render(<ProductShell hardwareConnector={connectedConnector()} />);

    await user.click(
      screen.getAllByRole("button", { name: "ابدأ" })[0] as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: "تعرّف على جهازي" }));
    await screen.findByText("Reference TX");

    await user.click(
      screen.getByRole("button", { name: "أدخل الجهاز في وضع الربط" }),
    );

    // The command was acknowledged, but that alone is not a bind.
    expect(
      await screen.findByText(/قبل الجهاز أمر الربط/u),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="verified"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "قام الرابط" }));

    // The operator's answer is recorded as their claim. It is graded
    // USER_CONFIRMED_LINK and must never be shown as a verified success.
    expect(
      await screen.findByText(/هذه مشاهدتك وليست دليلًا آليًا/u),
    ).toBeInTheDocument();
    expect(screen.getByText("USER_CONFIRMED_LINK")).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="verified"]')).toBeNull();
  });

  it("reports an unobserved link as not successful", async () => {
    const user = userEvent.setup();
    render(<ProductShell hardwareConnector={connectedConnector()} />);

    await user.click(
      screen.getAllByRole("button", { name: "ابدأ" })[0] as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: "تعرّف على جهازي" }));
    await screen.findByText("Reference TX");
    await user.click(
      screen.getByRole("button", { name: "أدخل الجهاز في وضع الربط" }),
    );
    await screen.findByText(/قبل الجهاز أمر الربط/u);

    await user.click(screen.getByRole("button", { name: "لم يقم الرابط بعد" }));

    expect(
      await screen.findByText(/لا يُسجَّل الربط ناجحًا/u),
    ).toBeInTheDocument();
    expect(screen.getByText("COMMAND_ACKNOWLEDGED_ONLY")).toBeInTheDocument();
  });

  it("explains the specific technical reason when a device cannot bind over USB", async () => {
    const user = userEvent.setup();
    render(
      <ProductShell
        hardwareConnector={connectedConnector({ withBindCommand: false })}
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: "ابدأ" })[0] as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: "تعرّف على جهازي" }));
    await screen.findByText("Reference TX");

    // A specific reason plus the real alternative, not a blanket refusal.
    expect(
      screen.getByText(/لا يعلن هذا الجهاز أمر ربط عبر USB/u),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "أدخل الجهاز في وضع الربط" }),
    ).not.toBeInTheDocument();
  });

  it("writes a setting and confirms it only when the device reads it back", async () => {
    const user = userEvent.setup();
    render(<ProductShell hardwareConnector={connectedConnector()} />);

    await user.click(
      screen.getAllByRole("button", { name: "ابدأ" })[1] as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: "تعرّف على جهازي" }));
    await screen.findByText("Reference TX");

    await user.selectOptions(screen.getByLabelText("الإعداد"), "1");
    // The current value shown comes from the device, not a default.
    expect(screen.getByText("B")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("القيمة الجديدة"));
    await user.type(screen.getByLabelText("القيمة الجديدة"), "2");
    await user.click(screen.getByRole("button", { name: "طبّق التغيير" }));

    expect(
      await screen.findByText(/وأُعيدت قراءته من الجهاز بالقيمة نفسها/u),
    ).toBeInTheDocument();
  });

  it("refuses to report a settings change that does not read back", async () => {
    const user = userEvent.setup();
    render(
      <ProductShell
        hardwareConnector={connectedConnector({
          // The device accepts the write but reports a different value.
          writeResult: () => ({ value: 0, verified: true }),
        })}
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: "ابدأ" })[1] as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: "تعرّف على جهازي" }));
    await screen.findByText("Reference TX");
    await user.selectOptions(screen.getByLabelText("الإعداد"), "1");
    await user.clear(screen.getByLabelText("القيمة الجديدة"));
    await user.type(screen.getByLabelText("القيمة الجديدة"), "2");
    await user.click(screen.getByRole("button", { name: "طبّق التغيير" }));

    // The session's own independent read-back rejects the write, so Easy Mode
    // surfaces the failure and never reports the change as applied.
    await waitFor(
      () => {
        expect(
          screen.queryByText(/وأُعيدت قراءته من الجهاز بالقيمة نفسها/u),
        ).not.toBeInTheDocument();
        expect(
          screen.getByText(/read-back|لا تطابق|مطبَّقًا/u),
        ).toBeInTheDocument();
      },
      { timeout: 10_000 },
    );
  });

  it("exposes a skip link and a focusable main region for keyboard users", () => {
    render(<ProductShell />);

    const skip = screen.getByRole("link", { name: "انتقل إلى المحتوى" });
    expect(skip).toHaveAttribute("href", "#product-main");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });
});
