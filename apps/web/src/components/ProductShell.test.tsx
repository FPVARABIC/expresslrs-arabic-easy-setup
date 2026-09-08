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
  overrides: Partial<ExpressLrsIdentity> = {},
): HardwareDriverConnector {
  const parameters: CrsfParameter[] = [selection(1, "Packet Rate")];
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
    readParameter: async () => parameters[0] as CrsfParameter,
    writeParameter: async () => {
      throw new Error("not writable in this test");
    },
    startBinding: async () => {
      throw new Error("binding is locked");
    },
    executeCommand: async () => {
      throw new Error("commands are locked");
    },
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

  it("states that binding, settings, and firmware update are locked", () => {
    render(<ProductShell />);

    expect(screen.getByText("غير متاح بعد")).toBeInTheDocument();
    expect(screen.getByText("الربط")).toBeInTheDocument();
    expect(screen.getByText("تغيير الإعدادات")).toBeInTheDocument();
    expect(screen.getByText("تحديث Firmware")).toBeInTheDocument();
  });

  it("keeps device-changing controls locked in the advanced workbench", async () => {
    const user = userEvent.setup();
    render(<ProductShell />);

    await user.click(screen.getByRole("button", { name: "الوضع المتقدم" }));

    await screen.findByRole("heading", { name: /إعداد وتحديث ExpressLRS/u });

    // The public build mounts the workbench without device-write authority, so
    // no flashing, binding, settings-write, or recovery control is offered at
    // all — not merely disabled.
    const destructive = /تفليش|الربط|كتابة|استعادة|Wi-Fi|Bootloader/u;
    const offered = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((label) => destructive.test(label));

    expect(offered).toEqual([]);
  });

  it("shows a confirmed device from a live answer and claims nothing more", async () => {
    const user = userEvent.setup();

    render(<ProductShell hardwareConnector={connectedConnector()} />);
    await user.click(screen.getByRole("button", { name: "تعرّف على جهازي" }));

    expect(await screen.findByText("Reference TX")).toBeInTheDocument();
    expect(screen.getByText("4.1.0")).toBeInTheDocument();
    expect(screen.getByText("مؤكدة من الجهاز نفسه")).toBeInTheDocument();
    expect(
      screen.getByText(
        "لا شيء هنا دليل على أن جهازًا جرى ربطه أو إعداده أو تحديثه.",
      ),
    ).toBeInTheDocument();
  });

  it("reports a refused device without naming a model", async () => {
    const user = userEvent.setup();
    const connector = connectorReturning({
      status: "CONNECT_FAILED",
      message: "port did not answer",
    } as unknown as HardwareDriverConnectOutcome);

    render(<ProductShell hardwareConnector={connector} />);
    await user.click(screen.getByRole("button", { name: "تعرّف على جهازي" }));

    expect(
      await screen.findByText("تعذر التعرف على الجهاز"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Reference TX")).not.toBeInTheDocument();
  });

  it("exposes a skip link and a focusable main region for keyboard users", () => {
    render(<ProductShell />);

    const skip = screen.getByRole("link", { name: "انتقل إلى المحتوى" });
    expect(skip).toHaveAttribute("href", "#product-main");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });
});
