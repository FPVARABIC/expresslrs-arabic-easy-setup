import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CrsfAddress, type CrsfParameter } from "../hardware/crsf";
import type {
  OfficialCatalog,
  PreparedFirmwarePackage,
} from "../hardware/parity-types";
import type { RecoveryCheckpoint } from "../hardware/recovery-package";
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

const mocks = vi.hoisted(() => ({
  downloadPreparedBytes: vi.fn(),
  flashEspFirmware: vi.fn(),
  initializeSerialPassthrough: vi.fn(),
  loadCatalog: vi.fn(),
  loadCheckpoint: vi.fn(),
  preparePackage: vi.fn(),
  requestHardwarePort: vi.fn(),
  validateRecoveryPackage: vi.fn(),
}));

vi.mock("../hardware/esp-flasher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hardware/esp-flasher")>()),
  flashEspFirmware: mocks.flashEspFirmware,
}));

vi.mock("../hardware/firmware-package", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hardware/firmware-package")>()),
  downloadPreparedBytes: mocks.downloadPreparedBytes,
  prepareOfficialFirmwarePackage: mocks.preparePackage,
}));

vi.mock("../hardware/official-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hardware/official-catalog")>()),
  loadOfficialExpressLrsCatalog: mocks.loadCatalog,
}));

vi.mock("../hardware/passthrough", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hardware/passthrough")>()),
  initializeSerialPassthrough: mocks.initializeSerialPassthrough,
  requestHardwarePort: mocks.requestHardwarePort,
}));

vi.mock("../hardware/recovery-package", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hardware/recovery-package")>()),
  loadRecoveryCheckpoint: mocks.loadCheckpoint,
  saveRecoveryCheckpoint: vi.fn().mockResolvedValue(undefined),
  clearRecoveryCheckpoint: vi.fn().mockResolvedValue(undefined),
  validateRecoveryPackage: mocks.validateRecoveryPackage,
}));

import { ExpressLrsParityWorkbench } from "./ExpressLrsParityWorkbench";

const catalog: OfficialCatalog = {
  source: "EXPRESSLRS_WEB_FLASHER_MIRROR",
  loadedAt: "2026-08-30T00:00:00.000Z",
  releases: [{ label: "4.1.0", revision: "release410", channel: "release" }],
  targets: [
    {
      id: "vendor/tx_2400/module",
      role: "tx",
      vendorKey: "vendor",
      vendorName: "Vendor",
      radioKey: "tx_2400",
      targetKey: "module",
      config: {
        productName: "Vendor TX Module",
        platform: "esp32",
        firmware: "VENDOR_TX",
        luaName: "vendor.lua",
        layoutFile: null,
        logoFile: null,
        uploadMethods: ["uart", "edgetx", "wifi", "download"],
        minVersion: null,
        customLayout: {},
        overlay: null,
        raw: {},
      },
    },
    {
      id: "vendor/rx_900/receiver",
      role: "rx",
      vendorKey: "vendor",
      vendorName: "Vendor",
      radioKey: "rx_900",
      targetKey: "receiver",
      config: {
        productName: "Vendor RX",
        platform: "stm32",
        firmware: "VENDOR_RX",
        luaName: null,
        layoutFile: null,
        logoFile: null,
        uploadMethods: ["betaflight", "stlink", "download"],
        minVersion: null,
        customLayout: {},
        overlay: null,
        raw: {},
      },
    },
  ],
};

const transportCatalog: OfficialCatalog = {
  ...catalog,
  targets: [
    {
      ...catalog.targets[0]!,
      config: {
        ...catalog.targets[0]!.config,
        uploadMethods: [
          "uart",
          "edgetx",
          "betaflight",
          "passthru",
          "stlink",
          "wifi",
          "download",
        ],
      },
    },
    catalog.targets[1]!,
  ],
};

const preparedPackage: PreparedFirmwarePackage = {
  schemaVersion: 1,
  release: catalog.releases[0]!,
  target: transportCatalog.targets[0]!,
  optionsSummary: {
    region: "FCC",
    domain: 0,
    bindingConfigured: false,
    wifiConfigured: false,
  },
  segments: [
    {
      name: "firmware.bin",
      address: 0x10000,
      bytes: new Uint8Array([1, 2, 3]),
      sha256: "a".repeat(64),
    },
  ],
  primaryFileName: "module-4.1.0.bin",
  primaryDownload: new Uint8Array([1, 2, 3]),
  primaryMimeType: "application/octet-stream",
  recoveryFileName: "module-4.1.0-recovery.zip",
  recoveryArchive: new Uint8Array([4, 5, 6]),
  createdAt: "2026-09-04T00:00:00.000Z",
};

const recoveryCheckpoint: RecoveryCheckpoint = {
  schemaVersion: 1,
  targetId: "vendor/tx_2400/module",
  productName: "Vendor TX Module",
  packageSha256: "b".repeat(64),
  stage: "RECOVERY_REQUIRED",
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:01:00.000Z",
  safeError: "Interrupted test write",
};

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

function deferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function connectedHardware(
  input: {
    readonly productName?: string;
    readonly verifiedProductName?: string;
    readonly reportedParameterCount?: number;
    readonly closeResult?: boolean;
    readonly closeFailure?: Error;
    readonly closeImplementation?: () => Promise<boolean>;
    readonly detachFailure?: Error;
    readonly includeBootloaderCommand?: boolean;
    readonly startBindingImplementation?: (signal?: AbortSignal) => Promise<{
      stage: "TX_BIND_COMMAND_ACKNOWLEDGED";
      verified: true;
      information: string;
    }>;
  } = {},
): {
  readonly connector: HardwareDriverConnector;
  readonly startBinding: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  readonly detachPortForBootloader: ReturnType<typeof vi.fn>;
  readonly outcome: HardwareDriverConnectOutcome;
} {
  const parameters: CrsfParameter[] = [
    selection(1, "Packet Rate"),
    selection(2, "WiFi Password"),
    command(3, "Bind"),
  ];
  if (input.includeBootloaderCommand === true) {
    parameters.push(command(4, "Serial Update"));
  }
  const identity: ExpressLrsIdentity = {
    validation: "CRSF_DEVICE_INFO",
    role: "tx",
    address: CrsfAddress.transmitter,
    requestOrigin: CrsfAddress.usb,
    productName: input.productName ?? "Bench TX 2.4GHz",
    firmwareVersion: "4.1.0",
    serialMarker: "ELRS",
    hardwareVersion: 1,
    softwareVersion: 0x00040100,
    parameterVersion: 1,
    parameterCount: input.reportedParameterCount ?? parameters.length,
    usb: {
      usbVendorId: 0x303a,
      usbProductId: 0x1001,
    },
  };
  const port: HardwareSerialPort = {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ondisconnect: null,
  };
  const startBinding = vi.fn(
    input.startBindingImplementation ??
      (async () => ({
        stage: "TX_BIND_COMMAND_ACKNOWLEDGED" as const,
        verified: true as const,
        information: "Bind mode active",
      })),
  );
  const close =
    input.closeFailure === undefined
      ? vi.fn(
          input.closeImplementation ?? (async () => input.closeResult ?? true),
        )
      : vi.fn().mockRejectedValue(input.closeFailure);
  const detachPortForBootloader =
    input.detachFailure === undefined
      ? vi.fn().mockResolvedValue(port)
      : vi.fn().mockRejectedValue(input.detachFailure);
  const driver: HardwareSessionDriver = {
    identity,
    parameters,
    port,
    readParameter: async (parameterId) => {
      const parameter = parameters.find((item) => item.id === parameterId);
      if (parameter === undefined) throw new Error("missing parameter");
      return parameter;
    },
    writeParameter: async (
      parameterId,
      requestedValue,
    ): Promise<ParameterWriteResult> => {
      const parameter = parameters.find((item) => item.id === parameterId);
      if (
        parameter === undefined ||
        (parameter.kind !== "number" && parameter.kind !== "selection")
      ) {
        throw new Error("parameter is not writable");
      }
      return {
        parameter: { ...parameter, value: requestedValue },
        requestedValue,
        verified: true,
      };
    },
    startBinding,
    executeCommand: async () => ({
      parameter: command(3, "Bind"),
      finalStep: 0,
      information: "Bind mode active",
      acknowledged: true,
    }),
    verifyCurrentIdentity: vi.fn().mockResolvedValue({
      ...identity,
      productName: input.verifiedProductName ?? identity.productName,
    }),
    detachPortForBootloader,
    close,
  };
  const outcome = {
    status: "CONNECTED",
    driver,
    identity,
    parameters,
  } as const satisfies HardwareDriverConnectOutcome;
  const connector: HardwareDriverConnector = vi.fn().mockResolvedValue(outcome);

  return {
    connector,
    startBinding,
    close,
    detachPortForBootloader,
    outcome,
  };
}

function acknowledgeSavedRecoveryPackage(): void {
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: /أؤكد أن ملف حزمة الاستعادة حُفظ/u,
    }),
  );
}

describe("rebuilt ExpressLRS hardware journey", () => {
  beforeEach(() => {
    mocks.downloadPreparedBytes.mockReset();
    mocks.flashEspFirmware.mockReset().mockResolvedValue({
      chipName: "ESP32",
      bytesWritten: 3,
      cleanupVerified: true,
    });
    mocks.initializeSerialPassthrough.mockReset().mockResolvedValue(undefined);
    mocks.loadCatalog.mockReset().mockResolvedValue(catalog);
    mocks.loadCheckpoint.mockReset().mockResolvedValue(null);
    mocks.preparePackage.mockReset().mockResolvedValue(preparedPackage);
    mocks.requestHardwarePort.mockReset().mockResolvedValue({
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      ondisconnect: null,
    });
    mocks.validateRecoveryPackage
      .mockReset()
      .mockRejectedValue(new Error("stop after confirmation gate"));
  });

  it("starts with real operations locked and no mock-success surface", () => {
    render(<ExpressLrsParityWorkbench />);

    expect(
      screen.getByRole("heading", { name: "إعداد وتحديث ExpressLRS" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    ).toBeDisabled();
    expect(screen.queryByText(/معاينة آمنة/u)).not.toBeInTheDocument();
  });

  it("defaults to the newest reviewed stable release and hides a future prerelease", async () => {
    const stableRevision = "a".repeat(40);
    mocks.loadCatalog.mockResolvedValueOnce({
      ...catalog,
      releases: [
        {
          label: "4.2.0-RC1",
          revision: "b".repeat(40),
          channel: "release",
        },
        {
          label: "5.0.0",
          revision: "c".repeat(40),
          channel: "release",
        },
        { label: "4.1.0", revision: stableRevision, channel: "release" },
      ],
    });
    const user = userEvent.setup();
    render(<ExpressLrsParityWorkbench />);

    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );

    expect(await screen.findByLabelText("الإصدار")).toHaveValue(
      JSON.stringify(["release", "4.1.0", stableRevision]),
    );
    expect(
      screen.queryByRole("option", { name: "4.2.0-RC1 · تجريبي" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "5.0.0" }),
    ).not.toBeInTheDocument();
  });

  it("does not expose a non-SemVer branch that package validation must reject", async () => {
    const sharedRevision = "b61c9e24305b2f80046a5e0b3c4edf56c4f059a3";
    const branch = {
      label: "3.x.x-maintenance",
      revision: sharedRevision,
      channel: "branch" as const,
    };
    mocks.loadCatalog.mockResolvedValueOnce({
      ...catalog,
      releases: [
        { label: "3.6.4", revision: sharedRevision, channel: "release" },
        branch,
      ],
    });
    const user = userEvent.setup();
    render(<ExpressLrsParityWorkbench />);

    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await screen.findByLabelText("الإصدار");
    expect(
      screen.queryByRole("option", {
        name: "3.x.x-maintenance · تجريبي",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "3.6.4" })).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.click(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    );

    await waitFor(() => expect(mocks.preparePackage).toHaveBeenCalledTimes(1));
    expect(mocks.preparePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        release: expect.objectContaining({
          label: "3.6.4",
          channel: "release",
        }),
      }),
    );
    expect(mocks.preparePackage).not.toHaveBeenCalledWith(
      expect.objectContaining({ release: branch }),
    );
  });

  it("requires an explicit regulatory domain before package generation", async () => {
    const user = userEvent.setup();
    render(<ExpressLrsParityWorkbench />);

    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Vendor TX Module" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("option", { name: "STM32 DFU" }),
    ).not.toBeInTheDocument();

    const build = screen.getByRole("button", {
      name: "بناء Firmware الرسمي",
    });
    expect(build).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "EU_CE_2400",
    );
    expect(build).toBeEnabled();
  });

  it("exposes internal STM32 DFU only when the official Target supports it", async () => {
    const user = userEvent.setup();
    render(<ExpressLrsParityWorkbench />);
    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await user.click(screen.getByRole("button", { name: "جهاز استقبال RX" }));

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Vendor RX" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("option", { name: "STM32 DFU" }),
    ).toBeInTheDocument();
  });

  it("resets the regulatory choice when the role changes", async () => {
    const user = userEvent.setup();
    render(<ExpressLrsParityWorkbench />);
    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    expect(screen.getByLabelText("المنطقة التنظيمية")).toHaveValue("FCC_2400");

    await user.click(screen.getByRole("button", { name: "جهاز استقبال RX" }));
    expect(screen.getByLabelText("المنطقة التنظيمية")).toHaveValue("");
  });

  it("connects and shows a CRSF identity without loading the remote catalog", async () => {
    const user = userEvent.setup();
    const hardware = connectedHardware();
    render(
      <ExpressLrsParityWorkbench hardwareConnector={hardware.connector} />,
    );

    const connect = screen.getByRole("button", {
      name: "تعريف الجهاز عبر CRSF",
    });
    expect(connect).toBeEnabled();

    await user.click(connect);

    expect(await screen.findByText("Bench TX 2.4GHz")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "حفظ مع قراءة رجعية" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "تشغيل الربط الحقيقي" }),
    ).toBeDisabled();
    expect(hardware.connector).toHaveBeenCalledWith(
      expect.objectContaining({ role: "tx" }),
    );
    expect(mocks.loadCatalog).not.toHaveBeenCalled();
  });

  it("clears stale hardware identity even when closing the session fails", async () => {
    const user = userEvent.setup();
    const hardware = connectedHardware({
      closeFailure: new Error("native close failed"),
    });
    render(
      <ExpressLrsParityWorkbench hardwareConnector={hardware.connector} />,
    );

    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("Bench TX 2.4GHz");
    await user.click(screen.getByRole("button", { name: "إغلاق الجلسة" }));

    expect(
      await screen.findByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Bench TX 2.4GHz")).not.toBeInTheDocument();
    expect(
      screen.getByText(/تعذر تأكيد إغلاق جلسة الجهاز/u),
    ).toBeInTheDocument();
    const reconnect = screen.getByRole("button", {
      name: "تعريف الجهاز عبر CRSF",
    });
    expect(reconnect).toBeDisabled();
    await user.click(reconnect);
    expect(hardware.connector).toHaveBeenCalledTimes(1);
  });

  it("does not reconnect while a previous session close is still pending", async () => {
    const closeGate = deferred<boolean>();
    const hardware = connectedHardware({
      closeImplementation: () => closeGate.promise,
    });
    const user = userEvent.setup();
    render(
      <ExpressLrsParityWorkbench hardwareConnector={hardware.connector} />,
    );

    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("Bench TX 2.4GHz");
    fireEvent.click(screen.getByRole("button", { name: "إغلاق الجلسة" }));

    const reconnect = await screen.findByRole("button", {
      name: "تعريف الجهاز عبر CRSF",
    });
    expect(reconnect).toBeDisabled();
    fireEvent.click(reconnect);
    expect(hardware.connector).toHaveBeenCalledTimes(1);

    await act(async () => {
      closeGate.resolve(false);
      await Promise.resolve();
    });
    expect(
      screen.getByText(/تعذر تأكيد إغلاق جلسة الجهاز/u),
    ).toBeInTheDocument();
    expect(reconnect).toBeDisabled();
    expect(hardware.connector).toHaveBeenCalledTimes(1);
  });

  it("latches reconnect closed when invalid-session cleanup returns false", async () => {
    const user = userEvent.setup();
    const hardware = connectedHardware({
      reportedParameterCount: 65,
      closeResult: false,
    });
    render(
      <ExpressLrsParityWorkbench hardwareConnector={hardware.connector} />,
    );

    const connect = screen.getByRole("button", {
      name: "تعريف الجهاز عبر CRSF",
    });
    await user.click(connect);

    expect(
      await screen.findByText(/تعذر تأكيد إغلاق جلسة الجهاز/u),
    ).toBeInTheDocument();
    expect(connect).toBeDisabled();
    await user.click(connect);
    expect(hardware.connector).toHaveBeenCalledTimes(1);
    expect(hardware.close).toHaveBeenCalledTimes(1);
  });

  it("latches reconnect closed when invalid-session cleanup rejects", async () => {
    const user = userEvent.setup();
    const hardware = connectedHardware({
      reportedParameterCount: 65,
      closeFailure: new Error("native close rejected"),
    });
    render(
      <ExpressLrsParityWorkbench hardwareConnector={hardware.connector} />,
    );

    const connect = screen.getByRole("button", {
      name: "تعريف الجهاز عبر CRSF",
    });
    await user.click(connect);

    expect(
      await screen.findByText(/تعذر تأكيد إغلاق جلسة الجهاز/u),
    ).toBeInTheDocument();
    expect(connect).toBeDisabled();
    await user.click(connect);
    expect(hardware.connector).toHaveBeenCalledTimes(1);
    expect(hardware.close).toHaveBeenCalledTimes(1);
  });

  it("asynchronously latches a timed-out late connection whose close returns false", async () => {
    vi.useFakeTimers();
    try {
      const hardware = connectedHardware({ closeResult: false });
      const lateConnection = deferred<HardwareDriverConnectOutcome>();
      const connector: HardwareDriverConnector = vi.fn(
        () => lateConnection.promise,
      );
      render(<ExpressLrsParityWorkbench hardwareConnector={connector} />);
      const connect = screen.getByRole("button", {
        name: "تعريف الجهاز عبر CRSF",
      });

      fireEvent.click(connect);
      await act(async () => Promise.resolve());
      expect(connector).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(connect).toBeEnabled();

      await act(async () => {
        lateConnection.resolve(hardware.outcome);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(
        screen.getByText(/تعذر تأكيد إغلاق جلسة الجهاز/u),
      ).toBeInTheDocument();
      expect(connect).toBeDisabled();
      fireEvent.click(connect);
      expect(connector).toHaveBeenCalledTimes(1);
      expect(hardware.close).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asynchronously latches a timed-out late connection whose close rejects", async () => {
    vi.useFakeTimers();
    try {
      const hardware = connectedHardware({
        closeFailure: new Error("late close rejected"),
      });
      const lateConnection = deferred<HardwareDriverConnectOutcome>();
      const connector: HardwareDriverConnector = vi.fn(
        () => lateConnection.promise,
      );
      render(<ExpressLrsParityWorkbench hardwareConnector={connector} />);
      const connect = screen.getByRole("button", {
        name: "تعريف الجهاز عبر CRSF",
      });

      fireEvent.click(connect);
      await act(async () => Promise.resolve());
      expect(connector).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(connect).toBeEnabled();

      await act(async () => {
        lateConnection.resolve(hardware.outcome);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(
        screen.getByText(/تعذر تأكيد إغلاق جلسة الجهاز/u),
      ).toBeInTheDocument();
      expect(connect).toBeDisabled();
      fireEvent.click(connect);
      expect(connector).toHaveBeenCalledTimes(1);
      expect(hardware.close).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("quarantines a newer session and locks writes when an older timed-out port cannot close", async () => {
    vi.useFakeTimers();
    try {
      const lateHardware = connectedHardware({
        productName: "Vendor TX Module",
        closeResult: false,
      });
      const newerHardware = connectedHardware({
        productName: "Vendor TX Module",
      });
      const lateConnection = deferred<HardwareDriverConnectOutcome>();
      let connectionAttempt = 0;
      const connector: HardwareDriverConnector = vi.fn(async () => {
        connectionAttempt += 1;
        return connectionAttempt === 1
          ? lateConnection.promise
          : newerHardware.outcome;
      });
      mocks.loadCatalog.mockResolvedValueOnce(transportCatalog);
      render(
        <ExpressLrsParityWorkbench
          allowDestructiveWrites
          hardwareConnector={connector}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
      );
      await act(async () => {
        for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
      });
      const connect = screen.getByRole("button", {
        name: "تعريف الجهاز عبر CRSF",
      });
      fireEvent.click(connect);
      await act(async () => Promise.resolve());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(connect).toBeEnabled();
      fireEvent.click(connect);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText("CRSF متصل")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("المنطقة التنظيمية"), {
        target: { value: "FCC_2400" },
      });
      const build = screen.getByRole("button", {
        name: "بناء Firmware الرسمي",
      });
      expect(build).toBeEnabled();
      fireEvent.click(build);
      await act(async () => {
        for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
      });
      fireEvent.click(
        screen.getByRole("button", { name: "تنزيل حزمة الاستعادة" }),
      );
      acknowledgeSavedRecoveryPackage();
      fireEvent.click(
        screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
      );
      fireEvent.click(
        screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
      );
      const flash = screen.getByRole("button", {
        name: "بدء التفليش الحقيقي",
      });
      expect(flash).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "حفظ مع قراءة رجعية" }),
      ).toBeEnabled();

      await act(async () => {
        lateConnection.resolve(lateHardware.outcome);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(lateHardware.close).toHaveBeenCalledTimes(1);
      expect(newerHardware.close).toHaveBeenCalledTimes(1);
      expect(connect).toBeDisabled();
      expect(flash).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "حفظ مع قراءة رجعية" }),
      ).not.toBeInTheDocument();
      fireEvent.click(flash);
      fireEvent.click(connect);
      expect(mocks.flashEspFirmware).not.toHaveBeenCalled();
      expect(connector).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters sensitive settings and requires confirmation before binding", async () => {
    const user = userEvent.setup();
    const hardware = connectedHardware();
    render(
      <ExpressLrsParityWorkbench
        allowDestructiveWrites
        hardwareConnector={hardware.connector}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("Bench TX 2.4GHz");

    expect(
      screen.getByRole("option", { name: "Packet Rate" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "WiFi Password" }),
    ).not.toBeInTheDocument();

    const bind = screen.getByRole("button", {
      name: "تشغيل الربط الحقيقي",
    });
    const confirmation = screen.getByRole("checkbox", {
      name: /الطرف الآخر جاهز للربط/u,
    });
    expect(bind).toBeDisabled();
    expect(hardware.startBinding).not.toHaveBeenCalled();

    await user.click(confirmation);
    expect(bind).toBeEnabled();
    await user.click(bind);

    await waitFor(() => expect(hardware.startBinding).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/نجاح رابط RF يتطلب مشاهدة الطرفين/u),
    ).toBeInTheDocument();
  });

  it("makes an in-flight binding command cancellable", async () => {
    let observedSignal: AbortSignal | undefined;
    const bindingResult = deferred<{
      stage: "TX_BIND_COMMAND_ACKNOWLEDGED";
      verified: true;
      information: string;
    }>();
    const hardware = connectedHardware({
      startBindingImplementation: (signal) => {
        observedSignal = signal;
        return bindingResult.promise;
      },
    });
    const user = userEvent.setup();
    render(
      <ExpressLrsParityWorkbench
        allowDestructiveWrites
        hardwareConnector={hardware.connector}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("Bench TX 2.4GHz");
    await user.click(
      screen.getByRole("checkbox", {
        name: /الطرف الآخر جاهز للربط/u,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "تشغيل الربط الحقيقي" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "إلغاء العملية" }),
    );

    await waitFor(() => expect(observedSignal?.aborted).toBe(true));
    await act(async () => {
      bindingResult.resolve({
        stage: "TX_BIND_COMMAND_ACKNOWLEDGED",
        verified: true,
        information: "late success must be ignored",
      });
      await bindingResult.promise;
    });
    expect(
      screen.getByRole("checkbox", {
        name: /الطرف الآخر جاهز للربط/u,
      }),
    ).not.toBeChecked();
    expect(screen.queryByText(/اكتمل أمر الربط/u)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "إلغاء العملية" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("waives manual Target confirmation only for the exact direct UART identity", async () => {
    const user = userEvent.setup();
    const hardware = connectedHardware({ productName: "Vendor TX Module" });
    mocks.loadCatalog.mockResolvedValueOnce(transportCatalog);
    render(
      <ExpressLrsParityWorkbench
        allowDestructiveWrites
        hardwareConnector={hardware.connector}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await screen.findByRole("option", { name: "Vendor TX Module" });
    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("CRSF متصل");
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.click(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    );
    await screen.findByRole("button", { name: "تنزيل حزمة الاستعادة" });
    expect(
      screen.queryByRole("button", { name: "إلغاء العملية" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "تنزيل حزمة الاستعادة" }),
    );
    expect(
      screen.getByRole("button", { name: "بدء التفليش الحقيقي" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/التطبيق لا يستطيع إثبات حفظها/u),
    ).toBeInTheDocument();
    acknowledgeSavedRecoveryPackage();
    await user.click(
      screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
    );

    expect(screen.queryByLabelText(/تأكيد Target/u)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "بدء التفليش الحقيقي" }),
    ).toBeEnabled();

    for (const transport of [
      "edgetx",
      "betaflight",
      "passthru",
      "stlink",
    ] as const) {
      await user.selectOptions(
        screen.getByLabelText("طريقة التحديث"),
        transport,
      );
      const confirmation = screen.getByLabelText(/تأكيد Target/u);
      await user.click(
        screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
      );
      await user.click(
        screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
      );

      expect(confirmation).toHaveValue("");
      await user.type(confirmation, "wrong-target");
      expect(
        screen.getByRole("button", {
          name: /بدء التفليش الحقيقي|بدء STM32 DFU/u,
        }),
      ).toBeDisabled();

      await user.clear(confirmation);
      await user.type(confirmation, "module");
      expect(
        screen.getByRole("button", {
          name: /بدء التفليش الحقيقي|بدء STM32 DFU/u,
        }),
      ).toBeEnabled();
    }
  });

  it("rechecks the live direct-UART identity before using the manual-confirmation waiver", async () => {
    const user = userEvent.setup();
    const hardware = connectedHardware({
      productName: "Vendor TX Module",
      verifiedProductName: "Different TX Module",
    });
    mocks.loadCatalog.mockResolvedValueOnce(transportCatalog);
    render(
      <ExpressLrsParityWorkbench
        allowDestructiveWrites
        hardwareConnector={hardware.connector}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("CRSF متصل");
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.click(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "تنزيل حزمة الاستعادة" }),
    );
    acknowledgeSavedRecoveryPackage();
    await user.click(
      screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
    );
    await user.click(
      screen.getByRole("button", { name: "بدء التفليش الحقيقي" }),
    );

    expect(
      await screen.findAllByText(
        /device identity changed before the firmware write boundary/u,
      ),
    ).not.toHaveLength(0);
    expect(hardware.detachPortForBootloader).not.toHaveBeenCalled();
  });

  it("latches reconnect closed when releasing the CRSF port for flashing fails", async () => {
    const user = userEvent.setup();
    const hardware = connectedHardware({
      productName: "Vendor TX Module",
      detachFailure: new Error("port release rejected"),
      includeBootloaderCommand: true,
    });
    mocks.loadCatalog.mockResolvedValueOnce(transportCatalog);
    render(
      <ExpressLrsParityWorkbench
        allowDestructiveWrites
        hardwareConnector={hardware.connector}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("CRSF متصل");
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.click(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "تنزيل حزمة الاستعادة" }),
    );
    acknowledgeSavedRecoveryPackage();
    await user.click(
      screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
    );
    await user.click(
      screen.getByRole("button", { name: "بدء التفليش الحقيقي" }),
    );

    await waitFor(() =>
      expect(hardware.detachPortForBootloader).toHaveBeenCalledTimes(1),
    );
    const reconnect = await screen.findByRole("button", {
      name: "تعريف الجهاز عبر CRSF",
    });
    expect(reconnect).toBeDisabled();
    await user.click(reconnect);
    expect(hardware.connector).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["returns false", { closeResult: false }],
    ["rejects", { closeFailure: new Error("mismatch close rejected") }],
  ] as const)(
    "latches when closing a mismatched reconnect session %s",
    async (_description, closeBehavior) => {
      const user = userEvent.setup();
      const initialHardware = connectedHardware({
        productName: "Vendor TX Module",
        includeBootloaderCommand: true,
      });
      const mismatchedHardware = connectedHardware({
        productName: "Different TX Module",
        ...closeBehavior,
      });
      let connectionAttempt = 0;
      const connector: HardwareDriverConnector = vi.fn(async () => {
        connectionAttempt += 1;
        return connectionAttempt === 1
          ? initialHardware.outcome
          : mismatchedHardware.outcome;
      });
      mocks.loadCatalog.mockResolvedValueOnce(transportCatalog);
      render(
        <ExpressLrsParityWorkbench
          allowDestructiveWrites
          hardwareConnector={connector}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
      );
      await user.click(
        screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
      );
      await screen.findByText("CRSF متصل");
      await user.selectOptions(
        screen.getByLabelText("المنطقة التنظيمية"),
        "FCC_2400",
      );
      await user.click(
        screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "تنزيل حزمة الاستعادة" }),
      );
      acknowledgeSavedRecoveryPackage();
      await user.click(
        screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
      );
      await user.click(
        screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
      );
      await user.click(
        screen.getByRole("button", { name: "بدء التفليش الحقيقي" }),
      );

      await waitFor(() => expect(connector).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(mismatchedHardware.close).toHaveBeenCalledTimes(1),
      );
      const reconnect = await screen.findByRole("button", {
        name: "تعريف الجهاز عبر CRSF",
      });
      expect(reconnect).toBeDisabled();
      await user.click(reconnect);
      expect(connector).toHaveBeenCalledTimes(2);
    },
  );

  it("latches and quarantines the new session when the prior session close returns false", async () => {
    const user = userEvent.setup();
    const initialHardware = connectedHardware({
      productName: "Vendor TX Module",
      closeResult: false,
    });
    const reconnectedHardware = connectedHardware({
      productName: "Vendor TX Module",
    });
    let connectionAttempt = 0;
    const connector: HardwareDriverConnector = vi.fn(async () => {
      connectionAttempt += 1;
      return connectionAttempt === 1
        ? initialHardware.outcome
        : reconnectedHardware.outcome;
    });
    mocks.loadCatalog.mockResolvedValueOnce(transportCatalog);
    render(
      <ExpressLrsParityWorkbench
        allowDestructiveWrites
        hardwareConnector={connector}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("CRSF متصل");
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.selectOptions(screen.getByLabelText("طريقة التحديث"), "edgetx");
    await user.click(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "تنزيل حزمة الاستعادة" }),
    );
    acknowledgeSavedRecoveryPackage();
    await user.type(screen.getByLabelText(/تأكيد Target/u), "module");
    await user.click(
      screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
    );
    await user.click(
      screen.getByRole("button", { name: "بدء التفليش الحقيقي" }),
    );

    await waitFor(() => expect(connector).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(initialHardware.close).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(reconnectedHardware.close).toHaveBeenCalledTimes(1),
    );
    const reconnect = await screen.findByRole("button", {
      name: "تعريف الجهاز عبر CRSF",
    });
    expect(reconnect).toBeDisabled();
    await user.click(reconnect);
    expect(connector).toHaveBeenCalledTimes(2);
  });

  it("quarantines a reconnect result when a cleanup latch opens while the prior session is closing", async () => {
    const user = userEvent.setup();
    const lateConnection = deferred<HardwareDriverConnectOutcome>();
    const priorClose = deferred<boolean>();
    const lateHardware = connectedHardware({ closeResult: false });
    const initialHardware = connectedHardware({
      productName: "Vendor TX Module",
      closeImplementation: () => priorClose.promise,
    });
    const reconnectedHardware = connectedHardware({
      productName: "Vendor TX Module",
    });
    let connectionAttempt = 0;
    const connector: HardwareDriverConnector = vi.fn(async () => {
      connectionAttempt += 1;
      if (connectionAttempt === 1) return lateConnection.promise;
      return connectionAttempt === 2
        ? initialHardware.outcome
        : reconnectedHardware.outcome;
    });
    mocks.loadCatalog.mockResolvedValueOnce(transportCatalog);
    render(
      <ExpressLrsParityWorkbench
        allowDestructiveWrites
        hardwareConnector={connector}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "إلغاء العملية" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("CRSF متصل");
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.selectOptions(screen.getByLabelText("طريقة التحديث"), "edgetx");
    await user.click(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "تنزيل حزمة الاستعادة" }),
    );
    acknowledgeSavedRecoveryPackage();
    await user.type(screen.getByLabelText(/^تأكيد Target/u), "module");
    await user.click(
      screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
    );
    await user.click(
      screen.getByRole("button", { name: "بدء التفليش الحقيقي" }),
    );

    await waitFor(() => expect(initialHardware.close).toHaveBeenCalledTimes(1));
    await act(async () => {
      lateConnection.resolve(lateHardware.outcome);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(lateHardware.close).toHaveBeenCalledTimes(1));
    await act(async () => {
      priorClose.resolve(true);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(reconnectedHardware.close).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.queryByText(/اكتمل التفليش وعاد الجهاز/u),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    ).toBeDisabled();
  });

  it.each([
    [
      "returns cleanupVerified=false",
      () =>
        mocks.flashEspFirmware.mockResolvedValueOnce({
          chipName: "ESP32",
          bytesWritten: 3,
          cleanupVerified: false,
        }),
    ],
    [
      "throws an error marked cleanupVerified=false",
      () => {
        const error = new Error("simulated ESP cleanup failure");
        Object.assign(error, { cleanupVerified: false });
        mocks.flashEspFirmware.mockRejectedValueOnce(error);
      },
    ],
  ] as const)(
    "locks reconnect when ESP flashing %s",
    async (_description, configureFlash) => {
      configureFlash();
      const user = userEvent.setup();
      const hardware = connectedHardware({
        productName: "Vendor TX Module",
      });
      mocks.loadCatalog.mockResolvedValueOnce(transportCatalog);
      render(
        <ExpressLrsParityWorkbench
          allowDestructiveWrites
          hardwareConnector={hardware.connector}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
      );
      await user.click(
        screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
      );
      await screen.findByText("CRSF متصل");
      await user.selectOptions(
        screen.getByLabelText("المنطقة التنظيمية"),
        "FCC_2400",
      );
      await user.selectOptions(
        screen.getByLabelText("طريقة التحديث"),
        "edgetx",
      );
      await user.click(
        screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "تنزيل حزمة الاستعادة" }),
      );
      acknowledgeSavedRecoveryPackage();
      await user.type(screen.getByLabelText(/^تأكيد Target/u), "module");
      await user.click(
        screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
      );
      await user.click(
        screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
      );
      await user.click(
        screen.getByRole("button", { name: "بدء التفليش الحقيقي" }),
      );

      await waitFor(() =>
        expect(mocks.flashEspFirmware).toHaveBeenCalledTimes(1),
      );
      expect(
        await screen.findByText(/توقف التفليش وتحتاج العملية إلى الاستعادة/u),
      ).toBeInTheDocument();
      const reconnect = screen.getByRole("button", {
        name: "تعريف الجهاز عبر CRSF",
      });
      expect(reconnect).toBeDisabled();
      await user.click(reconnect);
      expect(hardware.connector).toHaveBeenCalledTimes(1);
    },
  );

  it("requires fresh Target and bench acknowledgements after a flash falls into recovery", async () => {
    const user = userEvent.setup();
    const hardware = connectedHardware();
    mocks.loadCatalog.mockResolvedValueOnce(transportCatalog);
    mocks.flashEspFirmware.mockRejectedValueOnce(
      new Error("simulated write failure"),
    );
    render(
      <ExpressLrsParityWorkbench
        allowDestructiveWrites
        hardwareConnector={hardware.connector}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("CRSF متصل");
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.click(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "تنزيل حزمة الاستعادة" }),
    );
    acknowledgeSavedRecoveryPackage();
    await user.selectOptions(screen.getByLabelText("طريقة التحديث"), "edgetx");
    await user.type(screen.getByLabelText(/^تأكيد Target/u), "module");
    await user.click(
      screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
    );
    await user.click(
      screen.getByRole("button", { name: "بدء التفليش الحقيقي" }),
    );

    await screen.findByText(/توقف التفليش وتحتاج العملية إلى الاستعادة/u);
    expect(screen.getByLabelText(/تأكيد Target للاستعادة/u)).toHaveValue("");
    expect(
      screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء الاستعادة" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "هوائي جهاز الإرسال مثبت أثناء الاستعادة",
      }),
    ).not.toBeChecked();
    expect(screen.getByLabelText("اختيار حزمة الاستعادة")).toBeDisabled();
  });

  it("requires the exact Target key for checkpoint recovery despite an exact prior CRSF match", async () => {
    const user = userEvent.setup();
    const hardware = connectedHardware({ productName: "Vendor TX Module" });
    mocks.loadCatalog.mockResolvedValueOnce(transportCatalog);
    mocks.loadCheckpoint.mockResolvedValueOnce(recoveryCheckpoint);
    render(
      <ExpressLrsParityWorkbench
        allowDestructiveWrites
        hardwareConnector={hardware.connector}
      />,
    );

    await screen.findByText(/استعادة معلّقة/u);
    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await screen.findByRole("option", { name: "Vendor TX Module" });
    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("CRSF متصل");
    expect(
      screen.getByRole("button", { name: "حفظ مع قراءة رجعية" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "تشغيل الربط الحقيقي" }),
    ).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.click(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    );

    const confirmation = await screen.findByLabelText(
      /تأكيد Target للاستعادة/u,
    );
    const recoveryInput = screen.getByLabelText("اختيار حزمة الاستعادة");
    const recoveryBytes = new TextEncoder().encode("recovery");
    const recoveryFile = new File([recoveryBytes], "recovery.zip", {
      type: "application/zip",
    });
    Object.defineProperty(recoveryFile, "arrayBuffer", {
      configurable: true,
      value: vi.fn().mockResolvedValue(recoveryBytes.buffer),
    });

    await user.click(
      screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء الاستعادة" }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "هوائي جهاز الإرسال مثبت أثناء الاستعادة",
      }),
    );
    await user.type(confirmation, "wrong-target");
    expect(recoveryInput).toBeDisabled();
    expect(mocks.validateRecoveryPackage).not.toHaveBeenCalled();

    await user.clear(confirmation);
    await user.type(confirmation, "module");
    expect(recoveryInput).toBeEnabled();
    await user.upload(recoveryInput, recoveryFile);
    await waitFor(() =>
      expect(mocks.validateRecoveryPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedTarget: expect.objectContaining({ targetKey: "module" }),
        }),
      ),
    );
    await waitFor(() => expect(confirmation).toHaveValue(""));
    expect(
      screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء الاستعادة" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "هوائي جهاز الإرسال مثبت أثناء الاستعادة",
      }),
    ).not.toBeChecked();
    expect(recoveryInput).toBeDisabled();
  });

  it("keeps destructive flashing locked until the recovery journal finishes loading", async () => {
    const checkpointLoad = deferred<RecoveryCheckpoint | null>();
    mocks.loadCheckpoint.mockReturnValueOnce(checkpointLoad.promise);
    const hardware = connectedHardware();
    const user = userEvent.setup();
    render(
      <ExpressLrsParityWorkbench
        allowDestructiveWrites
        hardwareConnector={hardware.connector}
      />,
    );

    expect(
      screen.getByText(/جارٍ فحص سجل الاستعادة؛ عمليات الكتابة مقفلة/u),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("Bench TX 2.4GHz");
    expect(
      screen.getByRole("button", { name: "حفظ مع قراءة رجعية" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: /الطرف الآخر جاهز للربط/u }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.selectOptions(screen.getByLabelText("طريقة التحديث"), "wifi");
    await user.click(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "تنزيل حزمة الاستعادة" }),
    );
    acknowledgeSavedRecoveryPackage();
    await user.click(
      screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
    );

    const flash = screen.getByRole("button", {
      name: "تنزيل وفتح صفحة Wi-Fi",
    });
    expect(flash).toBeDisabled();

    checkpointLoad.resolve(null);
    await waitFor(() => expect(flash).toBeEnabled());
    expect(
      screen.getByRole("button", { name: "حفظ مع قراءة رجعية" }),
    ).toBeEnabled();
  });

  it("fails closed when the recovery journal cannot be read", async () => {
    mocks.loadCheckpoint.mockRejectedValueOnce(new Error("IndexedDB blocked"));
    const hardware = connectedHardware();
    const user = userEvent.setup();
    render(
      <ExpressLrsParityWorkbench
        allowDestructiveWrites
        hardwareConnector={hardware.connector}
      />,
    );

    const journalAlert = await screen.findByRole("alert");
    expect(journalAlert).toHaveTextContent(/تعذر التحقق من سجل الاستعادة/u);
    await user.click(
      screen.getByRole("button", { name: "تعريف الجهاز عبر CRSF" }),
    );
    await screen.findByText("Bench TX 2.4GHz");
    expect(
      screen.getByRole("button", { name: "حفظ مع قراءة رجعية" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: /الطرف الآخر جاهز للربط/u }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "تحميل الكتالوج الرسمي" }),
    );
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.selectOptions(screen.getByLabelText("طريقة التحديث"), "wifi");
    await user.click(
      screen.getByRole("button", { name: "بناء Firmware الرسمي" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "تنزيل حزمة الاستعادة" }),
    );
    acknowledgeSavedRecoveryPackage();
    await user.click(
      screen.getByRole("checkbox", { name: "ثبات الطاقة أثناء التفليش" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "هوائي جهاز الإرسال مثبت" }),
    );

    expect(
      screen.getByRole("button", { name: "تنزيل وفتح صفحة Wi-Fi" }),
    ).toBeDisabled();
    expect(
      screen.queryByLabelText("اختيار حزمة الاستعادة"),
    ).not.toBeInTheDocument();
  });
});
