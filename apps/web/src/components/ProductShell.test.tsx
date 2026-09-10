import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDurableStorageStub } from "../test/durable-storage";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const firmwareMocks = vi.hoisted(() => ({
  loadCatalog: vi.fn(),
  preparePackage: vi.fn(),
  downloadPreparedBytes: vi.fn(),
  flashEspFirmware: vi.fn(),
}));

vi.mock("../hardware/official-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hardware/official-catalog")>()),
  loadOfficialExpressLrsCatalog: firmwareMocks.loadCatalog,
}));

vi.mock("../hardware/firmware-package", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hardware/firmware-package")>()),
  prepareOfficialFirmwarePackage: firmwareMocks.preparePackage,
  downloadPreparedBytes: firmwareMocks.downloadPreparedBytes,
}));

vi.mock("../hardware/esp-flasher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hardware/esp-flasher")>()),
  flashEspFirmware: firmwareMocks.flashEspFirmware,
}));

// A fresh browser has an empty recovery journal. Reading it is a precondition
// for every device-changing operation, so the tests state that precondition
// explicitly rather than depending on jsdom's storage.
vi.mock("../hardware/recovery-package", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hardware/recovery-package")>()),
  loadRecoveryCheckpoint: vi.fn().mockResolvedValue(null),
  saveRecoveryCheckpoint: vi.fn().mockResolvedValue(undefined),
  clearRecoveryCheckpoint: vi.fn().mockResolvedValue(undefined),
}));

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
    withBootloaderCommand?: boolean;
  }> = {},
): HardwareDriverConnector {
  const overrides = options.identity ?? {};
  const parameters: CrsfParameter[] = [selection(1, "Packet Rate")];
  // Models a real device: what the parameter reads back is whatever the write
  // actually left on it, which is what the session verifies independently.
  let currentValue = 1;
  if (options.withBindCommand !== false) parameters.push(command(2, "Bind"));
  if (options.withBootloaderCommand === true) {
    parameters.push(command(3, "Serial Update"));
  }
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
    detachPortForBootloader: vi.fn().mockResolvedValue({
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      ondisconnect: null,
    }),
    close: vi.fn().mockResolvedValue(true),
  } as unknown as HardwareSessionDriver;
  return connectorReturning({
    status: "CONNECTED",
    driver,
    identity,
    parameters,
  } as HardwareDriverConnectOutcome);
}

/**
 * The official catalog Easy Mode loads. The TX Target's product name is the
 * one the reference device reports, so the identity match is EXACT and no
 * manual Target confirmation is needed — exactly as in the Advanced view.
 */
const easyCatalog = {
  source: "EXPRESSLRS_WEB_FLASHER_MIRROR",
  loadedAt: "2026-09-04T00:00:00.000Z",
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
        productName: "Reference TX",
        platform: "esp32",
        firmware: "VENDOR_TX",
        luaName: "vendor.lua",
        layoutFile: null,
        logoFile: null,
        uploadMethods: ["uart", "edgetx", "passthru", "wifi", "download"],
        minVersion: null,
        customLayout: {},
        overlay: null,
        raw: {},
      },
    },
  ],
} as unknown as Parameters<typeof firmwareMocks.loadCatalog>[0];

const easyPackage = {
  schemaVersion: 1,
  release: { label: "4.1.0", revision: "release410", channel: "release" },
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
  recoveryArchive: zipSync({
    "manifest.json": strToU8('{"schemaVersion":1}'),
    "segments/firmware.bin": new Uint8Array([4, 5, 6]),
  }),
  createdAt: "2026-09-04T00:00:00.000Z",
};

describe("public product shell", () => {
  let durableStorage: ReturnType<typeof installDurableStorageStub>;

  beforeEach(() => {
    durableStorage = installDurableStorageStub();
  });

  afterEach(() => {
    durableStorage.restore();
  });

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
      screen.getByRole("checkbox", { name: /الطرف الآخر جاهز للربط/u }),
    );
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
      screen.getByRole("checkbox", { name: /الطرف الآخر جاهز للربط/u }),
    );
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

  it("completes a firmware update inside Easy Mode without handing off", async () => {
    const user = userEvent.setup();
    firmwareMocks.loadCatalog.mockResolvedValue(easyCatalog);
    firmwareMocks.preparePackage.mockResolvedValue({
      ...easyPackage,
      target: (easyCatalog as unknown as { targets: unknown[] }).targets[0],
    });
    firmwareMocks.flashEspFirmware.mockResolvedValue({
      chipName: "ESP32",
      bytesWritten: 3,
      cleanupVerified: true,
    });
    render(
      <ProductShell
        hardwareConnector={connectedConnector({ withBootloaderCommand: true })}
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: "ابدأ" })[2] as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: "تعرّف على جهازي" }));
    await screen.findByText("Reference TX");

    // Easy Mode does the whole update itself: source, package, recovery,
    // bench confirmation, write, and post-reboot verification.
    await user.click(
      screen.getByRole("button", { name: "جهّز مصدر التحديث الرسمي" }),
    );
    await screen.findByRole("option", { name: "Reference TX" });
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.click(
      screen.getByRole("button", { name: "جهّز الحزمة الرسمية وتحقق منها" }),
    );

    const write = await screen.findByRole("button", {
      name: "اكتب Firmware إلى الجهاز",
    });
    // Nothing may be written before the recovery package exists and the bench
    // has been confirmed.
    expect(write).toBeDisabled();

    // The write is gated on a copy that was written outside the app, reopened
    // and hashed. A started download and a ticked box are no longer accepted.
    await user.click(
      screen.getByRole("button", { name: "احفظ حزمة الاستعادة في مكان يبقى" }),
    );
    await screen.findByText(/محفوظة ومتحقَّق منها/u);
    await user.click(screen.getByRole("checkbox", { name: /الطاقة ثابتة/u }));
    await user.click(screen.getByRole("checkbox", { name: /هوائي جهاز/u }));

    expect(write).toBeEnabled();
    await user.click(write);

    await waitFor(() =>
      expect(firmwareMocks.flashEspFirmware).toHaveBeenCalledTimes(1),
    );
    // The update is reported as done only because the device came back and its
    // Target and version were read and matched.
    expect(
      await screen.findByText(
        /عاد الجهاز وأعلن Target والإصدار المتوقعين بعد الإقلاع/u,
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="verified"]')).not.toBeNull();
  });

  it("compiles a binding phrase into the package and then forgets it", async () => {
    const user = userEvent.setup();
    const phrase = "shared-bench-phrase";
    firmwareMocks.loadCatalog.mockResolvedValue(easyCatalog);
    firmwareMocks.preparePackage.mockImplementation(
      async (input: { options: { bindPhrase: string } }) => ({
        ...easyPackage,
        target: (easyCatalog as unknown as { targets: unknown[] }).targets[0],
        optionsSummary: {
          ...easyPackage.optionsSummary,
          bindingConfigured: input.options.bindPhrase.length > 0,
        },
      }),
    );
    render(<ProductShell hardwareConnector={connectedConnector()} />);

    await user.click(
      screen.getAllByRole("button", { name: "ابدأ" })[2] as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: "تعرّف على جهازي" }));
    await screen.findByText("Reference TX");
    await user.click(
      screen.getByRole("button", { name: "جهّز مصدر التحديث الرسمي" }),
    );
    await screen.findByRole("option", { name: "Reference TX" });

    const field = screen.getByLabelText(/عبارة الربط/u);
    await user.type(field, phrase);
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.click(
      screen.getByRole("button", { name: "جهّز الحزمة الرسمية وتحقق منها" }),
    );

    // The phrase reached the packager exactly once, as typed.
    await waitFor(() =>
      expect(firmwareMocks.preparePackage).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ bindPhrase: phrase }),
        }),
      ),
    );

    // Once compiled, the plaintext is dropped: the field is empty and the
    // phrase appears nowhere in the rendered document.
    await waitFor(() => expect(field).toHaveValue(""));
    expect(document.body.textContent ?? "").not.toContain(phrase);
    expect(
      await screen.findByText(/ستُضمَّن عبارة ربط داخل هذه الحزمة/u),
    ).toBeInTheDocument();
  });

  it("offers the same diagnostics report in both modes", async () => {
    const user = userEvent.setup();
    render(<ProductShell hardwareConnector={connectedConnector()} />);

    // Easy Mode, before any device is connected.
    await user.click(
      screen.getAllByRole("button", { name: "اعرض التقرير" })[0] as HTMLElement,
    );
    const easyReport = screen.getByTestId("diagnostics-report");
    expect(easyReport).toHaveTextContent("Hardware validation: NONE");
    expect(easyReport).toHaveTextContent("Device writes: EVIDENCE_GATED");
    expect(easyReport).toHaveTextContent("Connected: false");

    // The Advanced view exports the same report from the same controller.
    await user.click(screen.getByRole("button", { name: "الوضع المتقدم" }));
    await user.click(screen.getByRole("button", { name: "اعرض التقرير" }));
    expect(screen.getByTestId("diagnostics-report")).toHaveTextContent(
      "Hardware validation: NONE",
    );
  });

  it("refuses to report a firmware update that the device never came back from", async () => {
    const user = userEvent.setup();
    firmwareMocks.loadCatalog.mockResolvedValue(easyCatalog);
    firmwareMocks.preparePackage.mockResolvedValue({
      ...easyPackage,
      target: (easyCatalog as unknown as { targets: unknown[] }).targets[0],
    });
    // The write succeeds; the device then never answers again.
    firmwareMocks.flashEspFirmware.mockResolvedValue({
      chipName: "ESP32",
      bytesWritten: 3,
      cleanupVerified: true,
    });
    const connector = connectedConnector({ withBootloaderCommand: true });
    (connector as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (
        connector as unknown as ReturnType<typeof vi.fn>
      ).getMockImplementation() as never,
    );
    let attempts = 0;
    const failingAfterFirst: typeof connector = (async (input: never) => {
      attempts += 1;
      if (attempts === 1) {
        return (connector as unknown as (value: never) => unknown)(input);
      }
      return { status: "TIMED_OUT", message: "no answer after the write" };
    }) as unknown as typeof connector;

    render(<ProductShell hardwareConnector={failingAfterFirst} />);

    await user.click(
      screen.getAllByRole("button", { name: "ابدأ" })[2] as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: "تعرّف على جهازي" }));
    await screen.findByText("Reference TX");
    await user.click(
      screen.getByRole("button", { name: "جهّز مصدر التحديث الرسمي" }),
    );
    await screen.findByRole("option", { name: "Reference TX" });
    await user.selectOptions(
      screen.getByLabelText("المنطقة التنظيمية"),
      "FCC_2400",
    );
    await user.click(
      screen.getByRole("button", { name: "جهّز الحزمة الرسمية وتحقق منها" }),
    );
    // The write is gated on a copy that was written outside the app, reopened
    // and hashed. A started download and a ticked box are no longer accepted.
    await user.click(
      screen.getByRole("button", { name: "احفظ حزمة الاستعادة في مكان يبقى" }),
    );
    await screen.findByText(/محفوظة ومتحقَّق منها/u);
    await user.click(screen.getByRole("checkbox", { name: /الطاقة ثابتة/u }));
    await user.click(screen.getByRole("checkbox", { name: /هوائي جهاز/u }));
    await user.click(
      screen.getByRole("button", { name: "اكتب Firmware إلى الجهاز" }),
    );

    await waitFor(() =>
      expect(firmwareMocks.flashEspFirmware).toHaveBeenCalledTimes(1),
    );
    // The bytes went out. Without a device that came back and proved its
    // Target and version, that is not a completed update.
    await waitFor(() =>
      expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-outcome="verified"]')).toBeNull();
    expect(
      screen.queryByText(/عاد الجهاز وأعلن Target والإصدار المتوقعين/u),
    ).not.toBeInTheDocument();
  });

  it("names the build stage without locking a single operation", async () => {
    const user = userEvent.setup();
    render(<ProductShell hardwareConnector={connectedConnector()} />);

    // The stage is stated plainly.
    expect(
      screen.getByText("نسخة تجريبية للتحقق على العتاد"),
    ).toBeInTheDocument();
    // The banner shows the commit this bundle was actually built from. A build
    // with no pinned commit says so rather than showing a plausible fake, and
    // a pinned one shows its short form — the expectation is read from the
    // same environment value the component reads, so the test does not assume
    // which kind of build it is running against.
    const declared = document
      .querySelector(".build-banner")
      ?.getAttribute("data-build");
    const pinned = import.meta.env.VITE_BUILD_SHA;
    const expected =
      typeof pinned === "string" && /^[0-9a-f]{40}$/u.test(pinned)
        ? pinned
        : "unpinned-development-build";
    expect(declared).toBe(expected);
    expect(
      screen.getByText(
        expected === "unpinned-development-build"
          ? expected
          : expected.slice(0, 7),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "انسخ رقم الإصدار الكامل" }),
    ).toBeEnabled();

    // And every operation is still offered and pressable.
    const starts = screen.getAllByRole("button", { name: "ابدأ" });
    expect(starts).toHaveLength(3);
    for (const start of starts) expect(start).toBeEnabled();

    await user.click(starts[0] as HTMLElement);
    expect(
      screen.getByRole("button", { name: "تعرّف على جهازي" }),
    ).toBeEnabled();
  });

  it("reports the browser and Android state the diagnostics can observe", async () => {
    const user = userEvent.setup();
    render(<ProductShell hardwareConnector={connectedConnector()} />);

    await user.click(
      screen.getAllByRole("button", { name: "اعرض التقرير" })[0] as HTMLElement,
    );

    const report = await screen.findByTestId("diagnostics-report");
    for (const line of [
      "Browser:",
      "Android:",
      "Web Serial:",
      "WebUSB:",
      "Serial permitted by policy:",
      "USB permitted by policy:",
      "Serial ports already granted:",
      "USB devices already granted:",
      "Secure context:",
    ]) {
      expect(report).toHaveTextContent(line);
    }
  });

  it("exposes a skip link and a focusable main region for keyboard users", () => {
    render(<ProductShell />);

    const skip = screen.getByRole("link", { name: "انتقل إلى المحتوى" });
    expect(skip).toHaveAttribute("href", "#product-main");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });
});
