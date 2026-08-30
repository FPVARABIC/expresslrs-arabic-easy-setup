import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  CrsfAddress,
  type CrsfParameter,
} from "../hardware/crsf";
import type {
  ExpressLrsIdentity,
  ParameterWriteResult,
} from "../hardware/session";
import type { HardwareSerialPort } from "../hardware/serial";
import type {
  HardwareDriverConnectOutcome,
  HardwareDriverConnector,
  HardwareSessionDriver,
} from "../hardware/userSession";
import { DeviceConnectionHubPanel } from "./DeviceConnectionHub";

function identity(role: "tx" | "rx" = "tx"): ExpressLrsIdentity {
  return {
    validation: "CRSF_DEVICE_INFO",
    role,
    address: role === "tx" ? CrsfAddress.transmitter : CrsfAddress.receiver,
    requestOrigin: CrsfAddress.usb,
    productName: role === "tx" ? "Example TX 2.4GHz" : "Example RX 2.4GHz",
    firmwareVersion: "4.1.0",
    serialMarker: "ELRS",
    hardwareVersion: 1,
    softwareVersion: 0x00040100,
    parameterVersion: 1,
    parameterCount: 4,
    usb: { usbVendorId: 0x303a, usbProductId: 0x1001 },
  };
}

function selection(value: number): Extract<
  CrsfParameter,
  { readonly kind: "selection" }
> {
  return {
    id: 1,
    parentId: 0,
    type: 9,
    hidden: false,
    name: "Packet Rate",
    rawValue: new Uint8Array(),
    kind: "selection",
    value,
    min: 0,
    max: 2,
    defaultValue: 0,
    options: ["50Hz", "100Hz", "250Hz"],
    units: "",
  };
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

function info(): Extract<CrsfParameter, { readonly kind: "info" }> {
  return {
    id: 4,
    parentId: 0,
    type: 12,
    hidden: false,
    name: "Version",
    rawValue: new Uint8Array(),
    kind: "info",
    value: "4.1.0",
  };
}

function fakeHardware(role: "tx" | "rx" = "tx"): {
  readonly connector: HardwareDriverConnector;
  readonly driver: HardwareSessionDriver;
  readonly writeParameter: ReturnType<typeof vi.fn>;
  readonly startBinding: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
} {
  let parameters: CrsfParameter[] = [
    selection(1),
    command(2, "Bind"),
    command(3, "Reboot"),
    info(),
  ];
  const deviceIdentity = identity(role);
  const port: HardwareSerialPort = {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ondisconnect: null,
  };
  const writeParameter = vi.fn(
    async (parameterId: number, value: number): Promise<ParameterWriteResult> => {
      const current = parameters.find((item) => item.id === parameterId);
      if (current === undefined || current.kind !== "selection") {
        throw new Error("unexpected setting");
      }
      const next = { ...current, value };
      parameters = parameters.map((item) =>
        item.id === parameterId ? next : item,
      );
      return { parameter: next, requestedValue: value, verified: true };
    },
  );
  const startBinding = vi.fn().mockResolvedValue({
    stage: "TX_BIND_COMMAND_ACKNOWLEDGED" as const,
    verified: true,
    information: "Bind mode active",
  });
  const close = vi.fn().mockResolvedValue(true);
  const driver: HardwareSessionDriver = {
    get identity() {
      return deviceIdentity;
    },
    get parameters() {
      return parameters;
    },
    port,
    readParameter: async (parameterId) => {
      const parameter = parameters.find((item) => item.id === parameterId);
      if (parameter === undefined) throw new Error("missing setting");
      return parameter;
    },
    writeParameter,
    startBinding,
    executeCommand: vi.fn().mockResolvedValue({
      parameter: command(3, "Reboot"),
      finalStep: 0,
      information: "Restarting",
      acknowledged: true,
    }),
    close,
  };
  const connector = vi.fn(
    async (): Promise<HardwareDriverConnectOutcome> => ({
      status: "CONNECTED",
      driver,
      identity: deviceIdentity,
      parameters,
    }),
  );
  return { connector, driver, writeParameter, startBinding, close };
}

async function connectThroughUi(
  user: ReturnType<typeof userEvent.setup>,
  connector: HardwareDriverConnector,
) {
  render(
    <DeviceConnectionHubPanel
      locale="ar"
      connectHardware={connector}
      connectTimeoutMs={2_000}
    />,
  );
  await user.click(
    screen.getByRole("tab", { name: "USB مباشر / CRSF" }),
  );
  await user.click(
    screen.getByRole("button", {
      name: "اختيار المنفذ والتعرف على الجهاز",
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("هوية CRSF مؤكدة"),
  );
}

describe("device connection acceptance journey", () => {
  it("keeps direct Wi-Fi navigation explicit and does not pretend it is an in-page connection", () => {
    render(<DeviceConnectionHubPanel locale="ar" />);

    expect(
      screen.getByRole("heading", { name: "اتصال الجهاز" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "فتح صفحة الجهاز 10.0.0.1" }),
    ).toHaveAttribute("href", "http://10.0.0.1/");
    expect(
      screen.getByRole("link", {
        name: "فتح عنوان المرسل elrs_tx.local",
      }),
    ).toHaveAttribute("href", "http://elrs_tx.local/");
  });

  it("identifies a real CRSF product, shows the automatic backup, and refuses an exact-target claim", async () => {
    const user = userEvent.setup();
    const hardware = fakeHardware();

    await connectThroughUi(user, hardware.connector);

    expect(screen.getByText("Example TX 2.4GHz")).toBeInTheDocument();
    expect(screen.getByText("4.1.0")).toBeInTheDocument();
    expect(screen.getByText(/CRSF · 420000 baud/u)).toBeInTheDocument();
    expect(screen.getByText("نسخة إعدادات آمنة جاهزة")).toBeInTheDocument();
    expect(screen.getByText(/Target الكامل/u)).toBeInTheDocument();
    expect(
      screen.getByText(/غير مثبت من CRSF Device Info وحده/u),
    ).toBeInTheDocument();
    expect(screen.queryByText("منفذ USB مفتوح")).not.toBeInTheDocument();
  });

  it("writes one declared setting and reports success only after exact read-back", async () => {
    const user = userEvent.setup();
    const hardware = fakeHardware();
    await connectThroughUi(user, hardware.connector);

    await user.selectOptions(screen.getByLabelText("القيمة الجديدة"), "2");
    await user.click(
      screen.getByRole("button", { name: "حفظ والتحقق" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "تمت الكتابة وتطابقت القراءة الرجعية",
      ),
    );
    expect(hardware.writeParameter).toHaveBeenCalledTimes(1);
    expect(hardware.writeParameter).toHaveBeenCalledWith(
      1,
      2,
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole("heading", {
        name: "استعادة إعدادات بداية الجلسة",
      }),
    ).toBeInTheDocument();
  });

  it("requires explicit bind readiness and labels command completion as unverified RF link", async () => {
    const user = userEvent.setup();
    const hardware = fakeHardware();
    await connectThroughUi(user, hardware.connector);

    const bindButton = screen.getByRole("button", {
      name: "إرسال أمر الربط",
    });
    expect(bindButton).toBeDisabled();
    await user.click(
      screen.getByLabelText(
        "الطرف الآخر في وضع الربط، والهوائيات والطاقة في حالة آمنة.",
      ),
    );
    await user.click(bindButton);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "نجاح رابط RF لم يُثبت بعد",
      ),
    );
    expect(hardware.startBinding).toHaveBeenCalledTimes(1);
  });

  it("locks in-app flashing instead of presenting an unimplemented destructive control", async () => {
    const user = userEvent.setup();
    const hardware = fakeHardware();
    await connectThroughUi(user, hardware.connector);

    expect(
      screen.getByRole("button", { name: "التفليش الداخلي مقفل" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/لا يحتوي بعد مسارًا مكتملًا/u),
    ).toBeInTheDocument();
  });

  it("lets the user cancel identification without leaving a false connected state", async () => {
    const user = userEvent.setup();
    const connector: HardwareDriverConnector = vi.fn(
      () => new Promise<HardwareDriverConnectOutcome>(() => undefined),
    );
    render(
      <DeviceConnectionHubPanel
        locale="ar"
        connectHardware={connector}
        connectTimeoutMs={60_000}
      />,
    );

    await user.click(
      screen.getByRole("tab", { name: "USB مباشر / CRSF" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "اختيار المنفذ والتعرف على الجهاز",
      }),
    );
    await user.click(screen.getByRole("button", { name: "إلغاء المحاولة" }));

    expect(screen.getByRole("status")).toHaveTextContent("أُلغيت المحاولة");
    expect(screen.queryByText("هوية CRSF مؤكدة")).not.toBeInTheDocument();
  });

  it("surfaces a role mismatch instead of silently accepting the wrong device", async () => {
    const user = userEvent.setup();
    const connector: HardwareDriverConnector = vi.fn().mockResolvedValue({
      status: "ROLE_MISMATCH",
      message: "RX observed on TX path",
    });
    render(
      <DeviceConnectionHubPanel locale="ar" connectHardware={connector} />,
    );

    await user.click(
      screen.getByRole("tab", { name: "USB مباشر / CRSF" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "اختيار المنفذ والتعرف على الجهاز",
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "نوع الجهاز لا يطابق الاختيار",
      ),
    );
  });

  it("keeps passthrough methods explicitly delegated to the official flasher", async () => {
    const user = userEvent.setup();
    render(<DeviceConnectionHubPanel locale="ar" />);

    await user.click(screen.getByRole("button", { name: "جهاز استقبال RX" }));
    await user.click(
      screen.getByRole("tab", { name: "Betaflight Passthrough" }),
    );

    expect(
      screen.getByRole("link", { name: "فتح Web Flasher الرسمي" }),
    ).toHaveAttribute(
      "href",
      "https://expresslrs.github.io/web-flasher/?type=rx&method=betaflight",
    );
  });
});
