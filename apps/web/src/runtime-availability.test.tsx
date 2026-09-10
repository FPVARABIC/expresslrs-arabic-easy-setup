import { strToU8, zipSync } from "fflate";
import { mkdirSync, writeFileSync } from "node:fs";
import { installDurableStorageStub } from "./test/durable-storage";
import path from "node:path";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { CrsfAddress, type CrsfParameter } from "./hardware/crsf";
import type {
  OfficialCatalog,
  OfficialTarget,
  PreparedFirmwarePackage,
} from "./hardware/parity-types";
import type { ExpressLrsIdentity } from "./hardware/session";
import type { HardwareSerialPort } from "./hardware/serial";
import type {
  HardwareDriverConnectOutcome,
  HardwareDriverConnector,
  HardwareSessionDriver,
} from "./hardware/userSession";

const mocks = vi.hoisted(() => ({
  downloadPreparedBytes: vi.fn(),
  flashEspFirmware: vi.fn(),
  loadCatalog: vi.fn(),
  loadCheckpoint: vi.fn(),
  saveCheckpoint: vi.fn(),
  clearCheckpoint: vi.fn(),
  preparePackage: vi.fn(),
  validateRecoveryPackage: vi.fn(),
}));

vi.mock("./hardware/esp-flasher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hardware/esp-flasher")>()),
  flashEspFirmware: mocks.flashEspFirmware,
}));

vi.mock("./hardware/firmware-package", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hardware/firmware-package")>()),
  downloadPreparedBytes: mocks.downloadPreparedBytes,
  prepareOfficialFirmwarePackage: mocks.preparePackage,
}));

vi.mock("./hardware/official-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hardware/official-catalog")>()),
  loadOfficialExpressLrsCatalog: mocks.loadCatalog,
}));

vi.mock("./hardware/recovery-package", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hardware/recovery-package")>()),
  loadRecoveryCheckpoint: mocks.loadCheckpoint,
  saveRecoveryCheckpoint: mocks.saveCheckpoint,
  clearRecoveryCheckpoint: mocks.clearCheckpoint,
  validateRecoveryPackage: mocks.validateRecoveryPackage,
}));

import { ProductShell } from "./components/ProductShell";

/**
 * The runtime availability matrix.
 *
 * A static search for `disabled={true}` proves nothing: an expression can be
 * present, dynamic, and still evaluate false forever. So each operation here is
 * driven through the **real production shell** — the same `ProductShell` that
 * `main.tsx` mounts — from a state where its control is genuinely disabled, to
 * the state where every prerequisite it names is satisfied, and the control is
 * asserted to become enabled.
 *
 * Every row records what the operator sees, what the readiness inputs were,
 * which handler and driver the enabled control reaches, how write authority is
 * decided, what the recovery checkpoint does, how the result is verified, and
 * what happens on failure. The rows are written to
 * `docs/runtime-availability.json`, and `scripts/check-runtime-availability.mjs`
 * refuses a build where any operation never became enabled.
 */

interface AvailabilityRow {
  readonly operation: string;
  readonly surface: "easy" | "advanced";
  readonly transport: "browser" | "android";
  readonly control: string;
  readonly readinessInputs: readonly string[];
  readonly disabledBefore: boolean;
  readonly enabledAfter: boolean;
  readonly handler: string;
  readonly driver: string;
  readonly writeAuthority: string;
  readonly recoveryCheckpoint: string;
  readonly verification: string;
  readonly onFailure: string;
}

const rows: AvailabilityRow[] = [];

function record(row: AvailabilityRow): void {
  // A row is only worth recording if it actually proved the transition.
  expect(row.disabledBefore, `${row.operation} was never disabled`).toBe(true);
  expect(row.enabledAfter, `${row.operation} never became enabled`).toBe(true);
  rows.push(row);
}

afterAll(() => {
  const target = path.resolve(import.meta.dirname, "../../../docs");
  mkdirSync(target, { recursive: true });
  writeFileSync(
    path.join(target, "runtime-availability.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        entryPoint: "apps/web/src/main.tsx → components/ProductShell",
        rows: [...rows].sort((left, right) =>
          `${left.operation}${left.surface}${left.transport}`.localeCompare(
            `${right.operation}${right.surface}${right.transport}`,
          ),
        ),
      },
      null,
      2,
    )}\n`,
  );
});

// ---- fixtures ---------------------------------------------------------

const espTransmitter: OfficialTarget = {
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
    uploadMethods: ["uart", "wifi", "download"],
    minVersion: null,
    customLayout: {},
    overlay: null,
    raw: {},
  },
};

const espReceiver: OfficialTarget = {
  id: "vendor/rx_2400/esp-receiver",
  role: "rx",
  vendorKey: "vendor",
  vendorName: "Vendor",
  radioKey: "rx_2400",
  targetKey: "esp-receiver",
  config: {
    productName: "Vendor ESP RX",
    platform: "esp32",
    firmware: "VENDOR_ESP_RX",
    luaName: null,
    layoutFile: null,
    logoFile: null,
    uploadMethods: ["uart", "download"],
    minVersion: null,
    customLayout: {},
    overlay: null,
    raw: {},
  },
};

/**
 * A Target whose hardware layout the frozen pack does not carry — the shape of
 * a device the mirror published after the pack was validated.
 */
const unpackedReceiver: OfficialTarget = {
  ...espReceiver,
  id: "vendor/rx_2400/brand-new",
  targetKey: "brand-new",
  config: {
    ...espReceiver.config,
    productName: "Vendor Brand New RX",
    layoutFile: "Vendor Brand New RX.json",
  },
};

const catalog: OfficialCatalog = {
  source: "EXPRESSLRS_WEB_FLASHER_MIRROR",
  loadedAt: "2026-09-09T00:00:00.000Z",
  releases: [{ label: "4.1.0", revision: "release410", channel: "release" }],
  targets: [espTransmitter, espReceiver, unpackedReceiver],
};

const preparedPackage: PreparedFirmwarePackage = {
  schemaVersion: 1,
  release: catalog.releases[0]!,
  target: espTransmitter,
  optionsSummary: {
    region: "FCC",
    domain: 0,
    bindingConfigured: false,
    wifiConfigured: false,
    rxAsTxMode: "off",
    airportEnabled: false,
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
  createdAt: "2026-09-09T00:00:00.000Z",
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

function bindCommand(
  id: number,
): Extract<CrsfParameter, { readonly kind: "command" }> {
  return {
    id,
    parentId: 0,
    type: 13,
    hidden: false,
    name: "Bind",
    rawValue: new Uint8Array(),
    kind: "command",
    step: 0,
    timeoutMs: 2_000,
    information: "",
  };
}

/** A transmitter that answers CRSF, as the real driver would. */
function connector(): HardwareDriverConnector {
  const parameters: CrsfParameter[] = [
    selection(1, "Packet Rate"),
    bindCommand(2),
  ];
  const identity: ExpressLrsIdentity = {
    validation: "CRSF_DEVICE_INFO",
    role: "tx",
    address: CrsfAddress.transmitter,
    requestOrigin: CrsfAddress.usb,
    productName: "Vendor TX Module",
    firmwareVersion: "4.1.0",
    serialMarker: "ELRS",
    hardwareVersion: 1,
    softwareVersion: 0x00040100,
    parameterVersion: 1,
    parameterCount: parameters.length,
    usb: { usbVendorId: 0x303a, usbProductId: 0x1001 },
  };
  const port: HardwareSerialPort = {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ondisconnect: null,
  };
  const driver: HardwareSessionDriver = {
    identity,
    parameters,
    port,
    readParameter: async (parameterId) => {
      const parameter = parameters.find((item) => item.id === parameterId);
      if (parameter === undefined) throw new Error("missing parameter");
      return parameter;
    },
    writeParameter: async (parameterId, requestedValue) => {
      const parameter = parameters.find((item) => item.id === parameterId);
      if (parameter === undefined || parameter.kind !== "selection") {
        throw new Error("parameter is not writable");
      }
      return {
        parameter: { ...parameter, value: requestedValue },
        requestedValue,
        verified: true,
      };
    },
    startBinding: vi.fn().mockResolvedValue({
      stage: "TX_BIND_COMMAND_ACKNOWLEDGED",
      verified: true,
      information: "Bind mode active",
    }),
    executeCommand: async () => ({
      parameter: bindCommand(2),
      finalStep: 0,
      information: "Bind mode active",
      acknowledged: true,
    }),
    verifyCurrentIdentity: vi.fn().mockResolvedValue(identity),
    detachPortForBootloader: vi.fn().mockResolvedValue(port),
    close: vi.fn().mockResolvedValue(true),
  };
  return vi.fn().mockResolvedValue({
    status: "CONNECTED",
    driver,
    identity,
    parameters,
  } as const satisfies HardwareDriverConnectOutcome);
}

async function settle(turns = 6): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
  });
}

/**
 * Waits for text that only appears once an event-loop-bound promise settles.
 *
 * `settle` drains microtasks, which is enough for everything else here. The
 * durable-recovery export ends in a SHA-256 over the reopened file, and Web
 * Crypto resolves off the event loop rather than on the microtask queue, so it
 * needs real turns.
 */
async function settleUntil(pattern: RegExp): Promise<void> {
  for (let turn = 0; turn < 60; turn += 1) {
    if (screen.queryByText(pattern) !== null) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  // Asserted rather than returned, so a failure names the text that is missing.
  expect(screen.getByText(pattern)).toBeInTheDocument();
}

function mountAdvanced(): void {
  render(
    <ProductShell
      initialLocale="en"
      initialMode="advanced"
      hardwareConnector={connector()}
    />,
  );
}

function mountEasy(): void {
  render(
    <ProductShell
      initialLocale="en"
      initialMode="easy"
      hardwareConnector={connector()}
    />,
  );
}

/** The Target select, found by its own label rather than by position. */
function targetSelect(): HTMLSelectElement {
  const select = screen.getAllByRole("combobox").find((candidate) =>
    // "Target" in the Advanced view, "Target for this device" in Easy Mode.
    candidate.closest("label")?.textContent?.trimStart().startsWith("Target"),
  );
  if (select === undefined)
    throw new Error("the Target select is not rendered");
  return select as HTMLSelectElement;
}

async function loadCatalogAndChooseTarget(role: "tx" | "rx"): Promise<void> {
  fireEvent.click(
    screen.getByRole("button", { name: "Load the official catalog" }),
  );
  await settle();
  fireEvent.click(
    screen.getByRole("button", {
      name: role === "tx" ? "TX transmitter" : "RX receiver",
    }),
  );
  await settle(4);
  const target = role === "tx" ? espTransmitter : espReceiver;
  fireEvent.change(targetSelect(), { target: { value: target.id } });
  await settle(4);
}

async function identify(): Promise<void> {
  fireEvent.click(
    screen.getByRole("button", { name: "Identify the device over CRSF" }),
  );
  await settle();
}

describe("runtime availability, from the production entry point", () => {
  let durableStorage: ReturnType<typeof installDurableStorageStub>;

  beforeEach(() => {
    durableStorage = installDurableStorageStub();
    vi.clearAllMocks();
    mocks.loadCatalog.mockResolvedValue(catalog);
    mocks.loadCheckpoint.mockResolvedValue(null);
    mocks.saveCheckpoint.mockResolvedValue(undefined);
    mocks.clearCheckpoint.mockResolvedValue(undefined);
    mocks.validateRecoveryPackage.mockResolvedValue({ valid: true });
    mocks.preparePackage.mockResolvedValue(preparedPackage);
    mocks.downloadPreparedBytes.mockReturnValue(undefined);
    mocks.flashEspFirmware.mockResolvedValue({ status: "WRITE_VERIFIED" });
  });

  afterEach(() => {
    durableStorage.restore();
  });

  it("connect: becomes available with no device present at all", async () => {
    mountAdvanced();
    const control = screen.getByRole("button", {
      name: "Identify the device over CRSF",
    });
    // Connect is the one operation whose prerequisites are satisfied from a
    // cold start: there is nothing to be missing yet.
    const enabledFromCold = !control.hasAttribute("disabled");
    expect(enabledFromCold).toBe(true);

    await identify();
    expect(await screen.findByText("Vendor TX Module")).toBeInTheDocument();

    // It disables while an operation is running and after a session opens,
    // which is the live condition it names.
    rows.push({
      operation: "connect",
      surface: "advanced",
      transport: "browser",
      control: "Identify the device over CRSF",
      readinessInputs: ["not busy", "previous port confirmed closed"],
      disabledBefore: false,
      enabledAfter: true,
      handler: "useDeviceController.connectHardware",
      driver: "userSession.connectHardwareDriver → navigator.serial @ 420000",
      writeAuthority: "not required; reading identity is not a device change",
      recoveryCheckpoint:
        "read on mount; a pending one blocks writes, not this",
      verification: "CRSF Device Info 0x29; role from the origin address",
      onFailure: "named transport reason; the control returns to enabled",
    });
  });

  it("settingsWrite: enabled only once a device, a clean port and a writable setting exist", async () => {
    mountAdvanced();
    const missingBefore = screen.queryByRole("button", {
      name: "Save, with read-back",
    });
    // With no device there is no settings section at all, which is a stronger
    // statement than a disabled button.
    const disabledBefore = missingBefore === null;

    await identify();
    await screen.findByText("Vendor TX Module");
    const control = screen.getByRole("button", {
      name: "Save, with read-back",
    });

    record({
      operation: "settingsWrite",
      surface: "advanced",
      transport: "browser",
      control: "Save, with read-back",
      readinessInputs: [
        "not busy",
        "confirmed CRSF identity",
        "previous port confirmed closed",
        "recovery journal read",
        "no pending checkpoint",
        "a writable setting selected",
      ],
      disabledBefore,
      enabledAfter: !control.hasAttribute("disabled"),
      handler: "useDeviceController.writeSelectedSetting",
      driver: "session.writeParameter → CRSF parameter write, then read-back",
      writeAuthority:
        "single-use capability for SETTINGS_WRITE, bound to session, device fingerprint and operation",
      recoveryCheckpoint:
        "a settings snapshot is taken before the write; Restore returns to it",
      verification: "the parameter is read back and compared; VERIFIED or not",
      onFailure: "the snapshot stands and Restore the snapshot stays available",
    });
  });

  it("binding: enabled only after its own acknowledgement, and never before", async () => {
    mountAdvanced();
    await identify();
    await screen.findByText("Vendor TX Module");

    const control = screen.getByRole("button", {
      name: "Run the real binding",
    });
    const disabledBefore = control.hasAttribute("disabled");

    const acknowledgement = screen.getByRole("checkbox", {
      name: /The other end is ready to bind/u,
    });
    // The acknowledgement is itself gated on the binding prerequisites, so it
    // being enabled here is the proof that those are separately satisfied.
    expect(acknowledgement).toBeEnabled();
    fireEvent.click(acknowledgement);
    await settle(2);

    record({
      operation: "binding",
      surface: "advanced",
      transport: "browser",
      control: "Run the real binding",
      readinessInputs: [
        "not busy",
        "confirmed CRSF identity",
        "previous port confirmed closed",
        "recovery journal read",
        "no pending checkpoint",
        "the operator's binding acknowledgement",
      ],
      disabledBefore,
      enabledAfter: !control.hasAttribute("disabled"),
      handler: "useDeviceController.runBinding",
      driver: "session.startBinding → CRSF command 0x32 to the Bind parameter",
      writeAuthority: "single-use capability for BINDING",
      recoveryCheckpoint:
        "none taken; binding changes no stored image, so there is nothing to restore",
      verification:
        "TX_BIND_COMMAND_ACKNOWLEDGED from the device; a matching UID is proven by a live link, not by this write",
      onFailure: "the acknowledgement is cleared and the reason is named",
    });
  });

  it("bindingPrerequisites: the acknowledgement itself is gated on live conditions", async () => {
    mountAdvanced();
    const beforeDevice = screen.queryByRole("checkbox", {
      name: /The other end is ready to bind/u,
    });
    const disabledBefore = beforeDevice === null;

    await identify();
    await screen.findByText("Vendor TX Module");
    const control = screen.getByRole("checkbox", {
      name: /The other end is ready to bind/u,
    });

    record({
      operation: "bindingPrerequisites",
      surface: "advanced",
      transport: "browser",
      control: "The other end is ready to bind… (checkbox)",
      readinessInputs: [
        "not busy",
        "confirmed CRSF identity",
        "previous port confirmed closed",
        "recovery journal read",
        "no pending checkpoint",
      ],
      disabledBefore,
      enabledAfter: !control.hasAttribute("disabled"),
      handler: "useDeviceController.setBindingAcknowledged",
      driver: "none; this is the operator's own confirmation",
      writeAuthority:
        "none; it exists so binding can be gated on a confirmation without being gated on itself",
      recoveryCheckpoint: "not applicable",
      verification: "not applicable",
      onFailure: "not applicable",
    });
  });

  it("settingsRestore: enabled only once there is a snapshot to restore to", async () => {
    mountAdvanced();
    // With no device there is no snapshot and no control to press.
    const disabledBefore =
      screen.queryByRole("button", { name: "Restore the snapshot" }) === null;

    await identify();
    await screen.findByText("Vendor TX Module");
    const control = screen.getByRole("button", {
      name: "Restore the snapshot",
    });

    record({
      operation: "settingsRestore",
      surface: "advanced",
      transport: "browser",
      control: "Restore the snapshot",
      readinessInputs: [
        "not busy",
        "confirmed CRSF identity",
        "previous port confirmed closed",
        "recovery journal read",
        "no pending checkpoint",
        "a settings snapshot — taken on connect, before anything is written",
      ],
      disabledBefore,
      enabledAfter: !control.hasAttribute("disabled"),
      handler: "useDeviceController.restoreSettingsBackup",
      driver: "session.writeParameter, replaying the snapshot's values",
      writeAuthority:
        "its own single-use capability for SETTINGS_RESTORE; a capability granted for the write cannot be reused here",
      recoveryCheckpoint:
        "the snapshot itself is the checkpoint for settings; it is not cleared by a failed restore",
      verification: "each replayed parameter is read back and compared",
      onFailure: "the snapshot is kept and the restore can be retried",
    });
  });

  it("recovery: a pending checkpoint blocks the writes and enables recovery, which is the point", async () => {
    // The journal comes back with an interrupted write, exactly as it would
    // after a device was unplugged mid-flash.
    mocks.loadCheckpoint.mockResolvedValue({
      schemaVersion: 1,
      targetId: espTransmitter.id,
      productName: "Vendor TX Module",
      packageSha256: "b".repeat(64),
      stage: "RECOVERY_REQUIRED",
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:01:00.000Z",
      safeError: "The write was interrupted",
    });

    mountAdvanced();
    await loadCatalogAndChooseTarget("tx");

    const control = screen.getByLabelText(/Choose the recovery package/u);
    // The Target is chosen and a checkpoint is pending, and it is still
    // refused: nothing has been acknowledged yet.
    const disabledBefore = control.hasAttribute("disabled");

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Power stays stable throughout the recovery",
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "The transmitter's antenna is fitted throughout the recovery",
      }),
    );
    // Typed against the Target key, which is what the controller compares. A
    // checkpoint names a device this session may never have identified, so the
    // operator has to say which Target they are putting back.
    fireEvent.change(
      screen.getByLabelText(/Confirm the Target for recovery/u),
      { target: { value: espTransmitter.targetKey } },
    );
    await settle(6);

    record({
      operation: "recovery",
      surface: "advanced",
      transport: "browser",
      control: "Choose the recovery package (file input)",
      readinessInputs: [
        "not busy",
        "a Target chosen",
        "previous port confirmed closed",
        "recovery journal read",
        "a pending checkpoint or a downloaded recovery archive",
        "the power acknowledgement",
        "the antenna acknowledgement (transmitters)",
        "the Target typed back, because a checkpoint names a device this session may not have identified",
      ],
      disabledBefore,
      enabledAfter: !control.hasAttribute("disabled"),
      handler: "useDeviceController.recoverFromFile",
      driver:
        "validateRecoveryPackage, then the same flashing driver the original write used",
      writeAuthority: "its own single-use capability for RECOVERY",
      recoveryCheckpoint:
        "the checkpoint is what makes this available, and it is cleared only once the device is verified back",
      verification:
        "the restored image is read back and the device must reconnect as the identity the checkpoint recorded",
      onFailure:
        "the checkpoint stands so recovery can be retried; it is never cleared by a failed attempt",
    });

    // And the writes it blocks are genuinely blocked, by this condition, and
    // the operator is told which condition it is.
    expect(
      screen.getAllByText(/Finish or clear that recovery first/u).length,
    ).toBeGreaterThan(0);
  });

  it("firmwareWrite: every prerequisite is required, and satisfying them all enables it", async () => {
    mountAdvanced();
    await loadCatalogAndChooseTarget("tx");
    await identify();
    // The name appears twice once a Target is matched — in the identity panel
    // and in the Target match — so this asks for all of them.
    expect(
      (await screen.findAllByText("Vendor TX Module")).length,
    ).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Regulatory region"), {
      target: { value: "FCC_2400" },
    });
    await settle(4);

    const build = screen.getByRole("button", {
      name: "Build the official firmware",
    });
    expect(build).toBeEnabled();
    fireEvent.click(build);
    await settle();

    const control = screen.getByRole("button", {
      name: "Start the real flash",
    });
    // Package built, device live — and still refused, because the recovery
    // archive has not been saved and nothing has been acknowledged.
    const disabledBefore = control.hasAttribute("disabled");
    const blockersShown = screen.getByText("Flashing is waiting on:");
    expect(blockersShown).toBeInTheDocument();

    // A copy written outside the application, reopened and hashed. A started
    // download and a ticked box no longer satisfy this, and that is the point:
    // neither was evidence that a file exists.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save the recovery package to durable storage",
      }),
    );
    await settleUntil(/Verified copy/u);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Power stays stable throughout the flash",
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "The transmitter's antenna is fitted",
      }),
    );
    await settle(2);

    record({
      operation: "firmwareWrite",
      surface: "advanced",
      transport: "browser",
      control: "Start the real flash",
      readinessInputs: [
        "not busy",
        "a Target chosen",
        "previous port confirmed closed",
        "recovery journal read",
        "no pending checkpoint",
        "a prepared package",
        "the recovery archive downloaded",
        "the power acknowledgement",
        "the antenna acknowledgement (transmitters)",
        "the manual Target confirmation, where the Target was not auto-matched",
        "a confirmed CRSF identity, for the UART method",
      ],
      disabledBefore,
      enabledAfter: !control.hasAttribute("disabled"),
      handler: "useDeviceController.flashPreparedFirmware",
      driver:
        "esp-flasher.flashEspFirmware (esptool-js) / xmodem / stm32-dfu, chosen by the Target's platform and the upload method",
      writeAuthority: "single-use capability for FIRMWARE_WRITE, TTL 180s",
      recoveryCheckpoint:
        "written before the first byte; kept until the device is verified back",
      verification:
        "segment read-back and reconnect; success requires the expected role, so an rx-as-tx write that comes back a receiver fails",
      onFailure:
        "the checkpoint stands, recovery becomes available, and the state is WRITE_COMPLETED_RECONNECT_UNVERIFIED rather than SUCCESS",
    });
  });

  it("rxAsTx: the modes a platform supports become selectable, and the rest stay visible with the reason", async () => {
    mountAdvanced();
    const before = screen.queryByTestId("rx-as-tx-mode");
    // Before a Target is chosen the control is not rendered; the options
    // section belongs to a chosen Target.
    const disabledBefore = before === null;

    await loadCatalogAndChooseTarget("rx");
    const control = screen.getByTestId("rx-as-tx-mode");
    const internal = within(control).getByRole("option", {
      name: "Internal (full-duplex)",
    });
    const external = within(control).getByRole("option", {
      name: "External (half-duplex)",
    });

    // An ESP32 receiver takes both modes, which is what upstream's
    // binary_configurator does.
    expect(internal).toBeEnabled();
    expect(external).toBeEnabled();
    fireEvent.change(control, { target: { value: "internal" } });
    await settle(2);
    expect((control as HTMLSelectElement).value).toBe("internal");

    record({
      operation: "rxAsTx",
      surface: "advanced",
      transport: "browser",
      control: "Flash this receiver with transmitter firmware (select)",
      readinessInputs: [
        "a Target chosen",
        "the Target's platform supports the mode, read from the pinned upstream rules",
      ],
      disabledBefore,
      enabledAfter: !(control as HTMLSelectElement).disabled,
      handler: "useDeviceController.updateOption('rxAsTxMode')",
      driver:
        "firmware-package: the _TX artifact is selected and the receiver's layout rewritten per mode",
      writeAuthority:
        "inherited from firmwareWrite; this only shapes the package",
      recoveryCheckpoint:
        "the checkpoint records the receiver the operator started from, so restoring puts the receiver role back",
      verification:
        "the device must come back reporting the transmitter address; otherwise RX_AS_TX_ROLE_NOT_APPLIED",
      onFailure:
        "the checkpoint is kept and the original receiver image stays recoverable",
    });
  });

  it("airport: a separate control with a separate prerequisite, sharing nothing with rx-as-tx", async () => {
    mountAdvanced();
    const disabledBefore = screen.queryByTestId("airport-enabled") === null;

    await loadCatalogAndChooseTarget("rx");
    const control = screen.getByTestId("airport-enabled") as HTMLInputElement;
    fireEvent.click(control);
    await settle(2);
    expect(control.checked).toBe(true);

    // Turning AirPort on must not have moved the rx-as-tx selector, and vice
    // versa. They are different features with no shared state.
    expect(
      (screen.getByTestId("rx-as-tx-mode") as HTMLSelectElement).value,
    ).toBe("off");

    record({
      operation: "airport",
      surface: "advanced",
      transport: "browser",
      control: "AirPort transparent serial (checkbox)",
      readinessInputs: ["a Target chosen"],
      disabledBefore,
      enabledAfter: !control.disabled,
      handler: "useDeviceController.updateOption('airportEnabled')",
      driver:
        "firmware-package: writes the is-airport option key, which no rx-as-tx value ever sets",
      writeAuthority:
        "inherited from firmwareWrite; this only shapes the package",
      recoveryCheckpoint: "as for any firmware write",
      verification:
        "the package's option block is asserted, not the device role",
      onFailure: "as for any firmware write",
    });
  });

  it("diagnostics: available with nothing connected, because that is when it is needed", async () => {
    mountAdvanced();
    const control = screen.getByRole("button", { name: "Show the report" });
    expect(control).toBeEnabled();
    fireEvent.click(control);
    await settle(2);
    const report = await screen.findByTestId("diagnostics-report");
    expect(report.textContent).toContain("Native bridge");

    rows.push({
      operation: "diagnostics",
      surface: "advanced",
      transport: "browser",
      control: "Show the report",
      readinessInputs: ["none — it has no prerequisites by design"],
      disabledBefore: false,
      enabledAfter: true,
      handler: "DiagnosticsPanel.show → useDeviceController.captureDiagnostics",
      driver: "reads the live session and the browser's own capability answers",
      writeAuthority: "none; it writes nothing to a device",
      recoveryCheckpoint: "reported, not changed",
      verification: "not applicable; it reports observations, it does not act",
      onFailure:
        "a browser that refuses to answer yields null rather than a failed export",
    });
  });

  it("easy mode: the same firmware write, reached through the operator's path", async () => {
    mountEasy();
    // Easy Mode opens on the three things an operator came to do. The card is
    // found by what it says, not by where it sits.
    const card = screen
      .getAllByRole("button", { name: "Start" })
      .map((start) => start.closest("li"))
      .find((node) => node?.textContent?.includes("Firmware update"));
    expect(card, "the firmware operation card is not rendered").toBeTruthy();
    fireEvent.click(
      within(card as HTMLElement).getByRole("button", { name: "Start" }),
    );
    await settle(6);

    // The write control does not exist yet: Easy Mode asks for the device
    // first, which is a genuine prerequisite rather than a stage gate.
    const disabledBefore =
      screen.queryByRole("button", {
        name: "Write the firmware to the device",
      }) === null;

    fireEvent.click(screen.getByRole("button", { name: "Identify my device" }));
    await settle(10);
    expect(
      (await screen.findAllByText(/Vendor TX Module/u)).length,
    ).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Prepare the official update source",
      }),
    );
    await settle(12);

    const control = screen.getByRole("button", {
      name: "Write the firmware to the device",
    });
    // A device is connected and the catalog is loaded, and it is still refused:
    // there is no package, no saved recovery archive and no acknowledgement.
    expect(control).toBeDisabled();

    fireEvent.change(targetSelect(), { target: { value: espTransmitter.id } });
    await settle(4);
    fireEvent.change(screen.getByLabelText(/Regulatory region/u), {
      target: { value: "FCC_2400" },
    });
    await settle(4);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Prepare and verify the official package",
      }),
    );
    await settle(12);
    // Downloading is not the same as having kept it, and the operator's word
    // for it was never evidence either. The package is written where it will
    // survive this application being removed, then reopened and hashed.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save the recovery package where it will survive",
      }),
    );
    await settleUntil(/Saved and verified/u);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Power is stable and will not be interrupted/u,
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /The transmitter antenna is fitted/u,
      }),
    );
    await settle(6);

    record({
      operation: "firmwareWrite",
      surface: "easy",
      transport: "browser",
      control: "Write the firmware to the device",
      readinessInputs: [
        "not busy",
        "a confirmed CRSF identity",
        "a Target and a regulatory region chosen",
        "a prepared, verified package",
        "the recovery archive downloaded",
        "the operator's confirmation that the recovery file is kept",
        "the power acknowledgement",
        "the antenna acknowledgement (transmitters)",
      ],
      disabledBefore,
      enabledAfter: !control.hasAttribute("disabled"),
      handler: "EasySetup → useDeviceController.flashPreparedFirmware",
      driver:
        "the same esp-flasher / xmodem / stm32-dfu path the Advanced view uses; Easy Mode is a view, not a second implementation",
      writeAuthority:
        "single-use capability for FIRMWARE_WRITE, as in Advanced",
      recoveryCheckpoint: "the same checkpoint, written by the same controller",
      verification: "the same read-back and reconnect verification",
      onFailure: "the same recovery path, surfaced in the operator's language",
    });
  });

  it("a Target newer than the validated pack stays selectable and says exactly why", async () => {
    mountAdvanced();
    fireEvent.click(
      screen.getByRole("button", { name: "Load the official catalog" }),
    );
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "RX receiver" }));
    await settle(4);

    // It is a real device. Hiding it would leave an operator looking for an
    // entry that is not there, which is worse than a refusal with a reason.
    const select = targetSelect();
    expect(Array.from(select.options).map((option) => option.value)).toContain(
      unpackedReceiver.id,
    );

    fireEvent.change(select, { target: { value: unpackedReceiver.id } });
    await settle(4);

    // And it is refused for packaging, naming the pack and the missing layout
    // rather than the build.
    // Listed beside every operation it blocks — packaging, recovery and
    // rx-as-tx all read layout bytes from the pack — so the operator sees it
    // wherever they try.
    const reasons = screen.getAllByText(
      /is newer than validated Target pack .* Its hardware layout .* is not in the pack/u,
    );
    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) {
      expect(reason.textContent).toContain("Vendor Brand New RX");
      expect(reason.textContent).toContain("Vendor Brand New RX.json");
      // The reason is a fact about this Target and this pack. It must never
      // read as a project stage.
      expect(reason.textContent).not.toMatch(
        /this build|preview|coming soon|not yet supported/iu,
      );
    }

    const build = screen.getByRole("button", {
      name: "Build the official firmware",
    });
    expect(build).toBeDisabled();
  });

  it("android: the native bridge supplies the transport the browser does not have", async () => {
    const { readPlatformCapabilities } =
      await import("./hardware/platform-capabilities");

    // A phone browser with no Web Serial: every device path is blocked.
    const phone = readPlatformCapabilities({
      isSecureContext: true,
      navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14)" },
    });
    expect(phone.webSerial).toBe(false);
    expect(phone.nativeBridge).toBe(false);

    // The same phone inside the packaged host, which injects the bridge.
    const hosted = readPlatformCapabilities({
      isSecureContext: true,
      navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14)" },
      elrsNativeBridge: {
        version: 1,
        serial: { requestPort: vi.fn() },
        host: {
          webBuildSha256: "c".repeat(64),
          nativeSourceSha256: "d".repeat(64),
          bridge: "AVAILABLE",
        },
      },
    });
    expect(hosted.nativeBridge).toBe(true);
    expect(hosted.nativeHost?.bridge).toBe("AVAILABLE");

    const { devicePathBlocker } =
      await import("./hardware/platform-capabilities");
    expect(devicePathBlocker(phone)).not.toBeNull();
    expect(devicePathBlocker(hosted)).toBeNull();

    record({
      operation: "connect",
      surface: "advanced",
      transport: "android",
      control: "Identify the device over CRSF",
      readinessInputs: [
        "not busy",
        "previous port confirmed closed",
        "a native bridge injected by the packaged host",
      ],
      disabledBefore: devicePathBlocker(phone) !== null,
      enabledAfter: devicePathBlocker(hosted) === null,
      handler: "the same useDeviceController.connectHardware",
      driver:
        "nativeBridgeNavigator(bridge) is handed to the same session layer, so CRSF, flashing and recovery are the browser's code paths",
      writeAuthority:
        "the same capability model, plus the host's own session ownership",
      recoveryCheckpoint: "the same checkpoint",
      verification: "the same CRSF Device Info verification",
      onFailure:
        "a host that could not install its bridge reports the exact reason rather than an empty device list",
    });
  });

  // ---------------------------------------------------------------------
  // The durable-recovery gate: what it blocks, what it must not block, and
  // that it survives the application being reinstalled.
  //
  // These record no matrix rows. They are about the *reasons* a row can be
  // refused, which the matrix lists as inputs but cannot demonstrate.
  // ---------------------------------------------------------------------

  it("a dismissed save blocks the firmware write only, and says why", async () => {
    durableStorage.restore();
    durableStorage = installDurableStorageStub({ dismissSave: true });
    mountAdvanced();
    await loadCatalogAndChooseTarget("tx");
    await identify();
    fireEvent.change(screen.getByLabelText("Regulatory region"), {
      target: { value: "FCC_2400" },
    });
    await settle(4);
    fireEvent.click(
      screen.getByRole("button", { name: "Build the official firmware" }),
    );
    await settle();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save the recovery package to durable storage",
      }),
    );
    await settleUntil(/Saving the recovery package was cancelled/u);

    // The one destructive operation is refused, and the refusal names this
    // condition rather than a generic lock.
    expect(
      screen.getByRole("button", { name: "Start the real flash" }),
    ).toBeDisabled();
    // Stated beside every operation it blocks, which is more than one.
    expect(
      screen.getAllByText(
        /Save the recovery package to durable storage and let/u,
      ).length,
    ).toBeGreaterThan(0);

    // Nothing else is refused: this is not a global lock. Diagnostics is the
    // operation an operator reaches for precisely when storage has just failed,
    // so it staying available is the property that matters here.
    expect(
      screen.getByRole("button", { name: "Show the report" }),
    ).toBeEnabled();
    // And the reason is attached to the flashing gate rather than announced as
    // a state of the application: the panel that names it is the flashing one.
    expect(screen.getByText("Flashing is waiting on:")).toBeInTheDocument();
  });

  it("refuses the write when storage hands back different bytes than it was given", async () => {
    durableStorage.restore();
    durableStorage = installDurableStorageStub({ corruptOnRead: true });
    mountAdvanced();
    await loadCatalogAndChooseTarget("tx");
    await identify();
    fireEvent.change(screen.getByLabelText("Regulatory region"), {
      target: { value: "FCC_2400" },
    });
    await settle(4);
    fireEvent.click(
      screen.getByRole("button", { name: "Build the official firmware" }),
    );
    await settle();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save the recovery package to durable storage",
      }),
    );
    // The write reported success. The read-back is what caught it, which is the
    // entire reason the read-back exists.
    await settleUntil(/does not match the bytes that were written/u);
    expect(
      screen.getByRole("button", { name: "Start the real flash" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/No verified durable copy yet/u),
    ).toBeInTheDocument();
  });
});
