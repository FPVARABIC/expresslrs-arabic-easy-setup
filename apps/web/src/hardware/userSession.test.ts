import { describe, expect, it, vi } from "vitest";

import {
  CrsfAddress,
  type CrsfParameter,
} from "./crsf";
import {
  ExpressLrsHardwareError,
  type ExpressLrsIdentity,
  type ParameterWriteResult,
} from "./session";
import { HardwareSerialError, type HardwareSerialPort } from "./serial";
import {
  connectUserHardwareSession,
  createUserHardwareSessionFromDriver,
  type HardwareDriverConnectOutcome,
  type HardwareSessionDriver,
  type SafeSettingsBackup,
} from "./userSession";

function identity(
  overrides: Partial<ExpressLrsIdentity> = {},
): ExpressLrsIdentity {
  return {
    validation: "CRSF_DEVICE_INFO",
    role: "tx",
    address: CrsfAddress.transmitter,
    requestOrigin: CrsfAddress.usb,
    productName: "Example TX 2.4GHz",
    firmwareVersion: "4.1.0",
    serialMarker: "ELRS",
    hardwareVersion: 0x00000001,
    softwareVersion: 0x00040100,
    parameterVersion: 1,
    parameterCount: 5,
    usb: {
      usbVendorId: 0x303a,
      usbProductId: 0x1001,
    },
    ...overrides,
  };
}

function selection(
  id: number,
  name: string,
  value: number,
  input: { readonly hidden?: boolean } = {},
): Extract<CrsfParameter, { readonly kind: "selection" }> {
  return {
    id,
    parentId: 0,
    type: 9,
    hidden: input.hidden ?? false,
    name,
    rawValue: new Uint8Array(),
    kind: "selection",
    value,
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

function info(id: number): Extract<CrsfParameter, { readonly kind: "info" }> {
  return {
    id,
    parentId: 0,
    type: 12,
    hidden: false,
    name: "Version",
    rawValue: new Uint8Array(),
    kind: "info",
    value: "4.1.0",
  };
}

function fakeDriver(input: {
  readonly deviceIdentity?: ExpressLrsIdentity;
  readonly initialParameters?: readonly CrsfParameter[];
  readonly writeFailure?: Error;
} = {}): {
  readonly driver: HardwareSessionDriver;
  readonly close: ReturnType<typeof vi.fn>;
  readonly writeParameter: ReturnType<typeof vi.fn>;
  readonly startBinding: ReturnType<typeof vi.fn>;
  readonly executeCommand: ReturnType<typeof vi.fn>;
  readonly port: HardwareSerialPort;
} {
  let parameters = [
    selection(1, "Packet Rate", 1),
    selection(2, "WiFi Password", 1),
    selection(3, "Hidden calibration", 1, { hidden: true }),
    command(4, "Bind"),
    info(5),
  ] as CrsfParameter[];
  if (input.initialParameters !== undefined) {
    parameters = [...input.initialParameters];
  }
  const deviceIdentity =
    input.deviceIdentity ?? identity({ parameterCount: parameters.length });
  const close = vi.fn().mockResolvedValue(true);
  const port: HardwareSerialPort = {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ondisconnect: null,
  };
  const writeParameter = vi.fn(
    async (parameterId: number, value: number): Promise<ParameterWriteResult> => {
      if (input.writeFailure !== undefined) throw input.writeFailure;
      const current = parameters.find((item) => item.id === parameterId);
      if (current === undefined || current.kind !== "selection") {
        throw new Error("unexpected parameter");
      }
      const next = { ...current, value };
      parameters = parameters.map((item) =>
        item.id === parameterId ? next : item,
      );
      return {
        parameter: next,
        requestedValue: value,
        verified: true,
      };
    },
  );
  const startBinding = vi.fn().mockResolvedValue({
    stage: "TX_BIND_COMMAND_ACKNOWLEDGED" as const,
    verified: true,
    information: "Bind mode active",
  });
  const executeCommand = vi.fn().mockResolvedValue({
    parameter: command(6, "Reboot"),
    finalStep: 0,
    information: "Restarting",
    acknowledged: true,
  });
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
      if (parameter === undefined) throw new Error("missing parameter");
      return parameter;
    },
    writeParameter,
    startBinding,
    executeCommand,
    close,
  };
  return {
    driver,
    close,
    writeParameter,
    startBinding,
    executeCommand,
    port,
  };
}

function connectedOutcome(
  driver: HardwareSessionDriver,
): HardwareDriverConnectOutcome {
  return {
    status: "CONNECTED",
    driver,
    identity: driver.identity,
    parameters: driver.parameters,
  };
}

describe("user-facing hardware safety facade", () => {
  it("creates a session-start backup without hidden or sensitive settings", () => {
    const hardware = fakeDriver();
    const session = createUserHardwareSessionFromDriver({
      driver: hardware.driver,
    });

    expect(session.writableParameters.map((item) => item.name)).toEqual([
      "Packet Rate",
    ]);
    expect(session.backup.values).toEqual([
      expect.objectContaining({ parameterId: 1, name: "Packet Rate", value: 1 }),
    ]);
  });

  it("rejects an impossible CRSF parameter table before exposing a session", async () => {
    const hardware = fakeDriver({
      deviceIdentity: identity({ parameterCount: 65 }),
    });

    const outcome = await connectUserHardwareSession({
      role: "tx",
      timeoutMs: 2_000,
      connector: async () => connectedOutcome(hardware.driver),
    });

    expect(outcome.status).toBe("INVALID_PARAMETER_TABLE");
    expect(hardware.close).toHaveBeenCalledTimes(1);
  });

  it("uses a bounded connection deadline and closes a late successful port", async () => {
    vi.useFakeTimers();
    const hardware = fakeDriver();
    let resolveConnector:
      | ((value: HardwareDriverConnectOutcome) => void)
      | undefined;
    const connector = vi.fn(
      () =>
        new Promise<HardwareDriverConnectOutcome>((resolve) => {
          resolveConnector = resolve;
        }),
    );

    const pending = connectUserHardwareSession({
      role: "tx",
      timeoutMs: 1_000,
      connector,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toMatchObject({ status: "TIMED_OUT" });

    resolveConnector?.(connectedOutcome(hardware.driver));
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(hardware.close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("requires explicit binding intent and never converts command acknowledgement into RF verification", async () => {
    const hardware = fakeDriver();
    const session = createUserHardwareSessionFromDriver({
      driver: hardware.driver,
    });

    await expect(
      session.startBinding({ confirmedByUser: false }),
    ).rejects.toBeInstanceOf(ExpressLrsHardwareError);

    await expect(
      session.startBinding({ confirmedByUser: true }),
    ).resolves.toEqual({
      stage: "TX_BIND_COMMAND_ACKNOWLEDGED",
      commandCompleted: true,
      linkVerified: false,
      information: "Bind mode active",
    });
  });

  it("restores a session backup after a firmware-version change when product and hardware still match", async () => {
    const hardware = fakeDriver();
    const session = createUserHardwareSessionFromDriver({
      driver: hardware.driver,
    });
    const backup: SafeSettingsBackup = {
      ...session.backup,
      identity: {
        ...session.backup.identity,
        firmwareVersion: "4.0.1",
        softwareVersion: 0x00040001,
        parameterVersion: 0,
      },
    };

    await session.writeParameter(1, 2);
    await expect(
      session.restoreBackup(backup, { confirmedByUser: true }),
    ).resolves.toEqual([
      expect.objectContaining({ requestedValue: 1, verified: true }),
    ]);
    expect(hardware.writeParameter).toHaveBeenLastCalledWith(
      1,
      1,
      undefined,
    );
  });

  it("retries read-back without repeating the write after a verification timeout", async () => {
    const hardware = fakeDriver({
      writeFailure: new HardwareSerialError("TIMEOUT", "late read-back"),
    });
    const readParameter = vi
      .spyOn(hardware.driver, "readParameter")
      .mockResolvedValue(selection(1, "Packet Rate", 2));
    const session = createUserHardwareSessionFromDriver({
      driver: hardware.driver,
    });

    await expect(session.writeParameter(1, 2)).resolves.toMatchObject({
      requestedValue: 2,
      verified: true,
    });
    expect(hardware.writeParameter).toHaveBeenCalledTimes(1);
    expect(readParameter).toHaveBeenCalledTimes(1);
  });

  it("notifies the UI immediately when the browser reports a port disconnect", () => {
    const hardware = fakeDriver();
    const session = createUserHardwareSessionFromDriver({
      driver: hardware.driver,
    });
    const listener = vi.fn();
    session.onDisconnected(listener);

    hardware.port.ondisconnect?.(new Event("disconnect"));

    expect(session.closed).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
