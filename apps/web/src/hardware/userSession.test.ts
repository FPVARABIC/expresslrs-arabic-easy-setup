import { describe, expect, it, vi } from "vitest";

import { CrsfAddress, type CrsfParameter } from "./crsf";
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

function deferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fakeDriver(
  input: {
    readonly deviceIdentity?: ExpressLrsIdentity;
    readonly initialParameters?: readonly CrsfParameter[];
    readonly writeFailure?: Error;
    readonly closeResult?: boolean;
    readonly closeFailure?: Error;
  } = {},
): {
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
  const close =
    input.closeFailure === undefined
      ? vi.fn().mockResolvedValue(input.closeResult ?? true)
      : vi.fn().mockRejectedValue(input.closeFailure);
  const port: HardwareSerialPort = {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ondisconnect: null,
  };
  const writeParameter = vi.fn(
    async (
      parameterId: number,
      value: number,
    ): Promise<ParameterWriteResult> => {
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
    verifyCurrentIdentity: vi.fn().mockResolvedValue(deviceIdentity),
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
      expect.objectContaining({
        parameterId: 1,
        name: "Packet Rate",
        value: 1,
      }),
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

  it("reports unconfirmed cleanup when an invalid parameter count cannot close the driver", async () => {
    const hardware = fakeDriver({
      deviceIdentity: identity({ parameterCount: 65 }),
      closeResult: false,
    });

    const outcome = await connectUserHardwareSession({
      role: "tx",
      timeoutMs: 2_000,
      connector: async () => connectedOutcome(hardware.driver),
    });

    expect(outcome).toMatchObject({ status: "CLEANUP_UNCONFIRMED" });
    expect(hardware.close).toHaveBeenCalledTimes(1);
  });

  it("reports unconfirmed cleanup when rejecting an invalid table cannot close the driver", async () => {
    const hardware = fakeDriver({
      deviceIdentity: identity({ parameterCount: 2 }),
      initialParameters: [selection(1, "Packet Rate", 1)],
      closeFailure: new Error("native close rejected"),
    });

    const outcome = await connectUserHardwareSession({
      role: "tx",
      timeoutMs: 2_000,
      connector: async () => connectedOutcome(hardware.driver),
    });

    expect(outcome).toMatchObject({ status: "CLEANUP_UNCONFIRMED" });
    expect(hardware.close).toHaveBeenCalledTimes(1);
  });

  it("closes the driver if constructing the user session fails", async () => {
    const deviceIdentity = identity({ parameterCount: 0 });
    Object.defineProperty(deviceIdentity, "usb", {
      configurable: true,
      get() {
        throw new Error("invalid USB identity");
      },
    });
    const hardware = fakeDriver({
      deviceIdentity,
      initialParameters: [],
    });

    const outcome = await connectUserHardwareSession({
      role: "tx",
      timeoutMs: 2_000,
      connector: async () => connectedOutcome(hardware.driver),
    });

    expect(outcome).toMatchObject({
      status: "CONNECT_FAILED",
      message: "invalid USB identity",
    });
    expect(hardware.close).toHaveBeenCalledTimes(1);
  });

  it("cleans its deadline and abort listener when a connector throws synchronously", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const removeEventListener = vi.spyOn(
        controller.signal,
        "removeEventListener",
      );
      const connector = vi.fn((): Promise<HardwareDriverConnectOutcome> => {
        throw new Error("synchronous connector failure");
      });

      await expect(
        connectUserHardwareSession({
          role: "tx",
          signal: controller.signal,
          timeoutMs: 2_000,
          connector,
        }),
      ).resolves.toMatchObject({
        status: "CONNECT_FAILED",
        message: "synchronous connector failure",
      });

      expect(vi.getTimerCount()).toBe(0);
      expect(removeEventListener).toHaveBeenCalledWith(
        "abort",
        expect.any(Function),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a bounded connection deadline and closes a late successful port", async () => {
    vi.useFakeTimers();
    const hardware = fakeDriver();
    let resolveConnector:
      ((value: HardwareDriverConnectOutcome) => void) | undefined;
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

  it("reports a late timed-out connection whose close returns false", async () => {
    vi.useFakeTimers();
    try {
      const hardware = fakeDriver({ closeResult: false });
      let resolveConnector:
        ((value: HardwareDriverConnectOutcome) => void) | undefined;
      const connector = vi.fn(
        () =>
          new Promise<HardwareDriverConnectOutcome>((resolve) => {
            resolveConnector = resolve;
          }),
      );
      const onCleanupUnconfirmed = vi.fn();

      const pending = connectUserHardwareSession({
        role: "tx",
        timeoutMs: 1_000,
        connector,
        onCleanupUnconfirmed,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toMatchObject({ status: "TIMED_OUT" });
      expect(onCleanupUnconfirmed).not.toHaveBeenCalled();

      resolveConnector?.(connectedOutcome(hardware.driver));
      await vi.runAllTimersAsync();
      await Promise.resolve();
      expect(hardware.close).toHaveBeenCalledTimes(1);
      expect(onCleanupUnconfirmed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a late timed-out connection whose close rejects", async () => {
    vi.useFakeTimers();
    try {
      const hardware = fakeDriver({
        closeFailure: new Error("late native close rejection"),
      });
      let resolveConnector:
        ((value: HardwareDriverConnectOutcome) => void) | undefined;
      const connector = vi.fn(
        () =>
          new Promise<HardwareDriverConnectOutcome>((resolve) => {
            resolveConnector = resolve;
          }),
      );
      const onCleanupUnconfirmed = vi.fn();

      const pending = connectUserHardwareSession({
        role: "tx",
        timeoutMs: 1_000,
        connector,
        onCleanupUnconfirmed,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toMatchObject({ status: "TIMED_OUT" });
      expect(onCleanupUnconfirmed).not.toHaveBeenCalled();

      resolveConnector?.(connectedOutcome(hardware.driver));
      await vi.runAllTimersAsync();
      await Promise.resolve();
      expect(hardware.close).toHaveBeenCalledTimes(1);
      expect(onCleanupUnconfirmed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a late low-level unconfirmed-cleanup outcome after timeout", async () => {
    vi.useFakeTimers();
    try {
      let resolveConnector:
        ((value: HardwareDriverConnectOutcome) => void) | undefined;
      const connector = vi.fn(
        () =>
          new Promise<HardwareDriverConnectOutcome>((resolve) => {
            resolveConnector = resolve;
          }),
      );
      const onCleanupUnconfirmed = vi.fn();

      const pending = connectUserHardwareSession({
        role: "tx",
        timeoutMs: 1_000,
        connector,
        onCleanupUnconfirmed,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toMatchObject({ status: "TIMED_OUT" });

      resolveConnector?.({
        status: "CLEANUP_UNCONFIRMED",
        message: "The low-level serial port could not be confirmed closed",
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(onCleanupUnconfirmed).toHaveBeenCalledWith(
        "The low-level serial port could not be confirmed closed",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let cancellation mask a raced unconfirmed-cleanup outcome", async () => {
    const controller = new AbortController();
    const connector = vi.fn(() => {
      controller.abort();
      return Promise.resolve<HardwareDriverConnectOutcome>({
        status: "CLEANUP_UNCONFIRMED",
        message: "The opened low-level port could not be confirmed closed",
      });
    });

    await expect(
      connectUserHardwareSession({
        role: "tx",
        signal: controller.signal,
        connector,
      }),
    ).resolves.toEqual({
      status: "CLEANUP_UNCONFIRMED",
      message: "The opened low-level port could not be confirmed closed",
    });
  });

  it("absorbs a connector rejection that arrives after the deadline", async () => {
    vi.useFakeTimers();
    try {
      let rejectConnector: ((reason: Error) => void) | undefined;
      const connector = vi.fn(
        () =>
          new Promise<HardwareDriverConnectOutcome>((_resolve, reject) => {
            rejectConnector = reject;
          }),
      );

      const pending = connectUserHardwareSession({
        role: "tx",
        timeoutMs: 1_000,
        connector,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toMatchObject({ status: "TIMED_OUT" });

      rejectConnector?.(new Error("late connector rejection"));
      await vi.runAllTimersAsync();
      await Promise.resolve();
      expect(connector).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
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
      information:
        "The TX acknowledged its Bind command; this does not verify an RF link",
    });
  });

  it("rejects an unverified TX acknowledgement instead of claiming command completion", async () => {
    const hardware = fakeDriver();
    const startBinding = vi.fn().mockResolvedValue({
      stage: "TX_BIND_COMMAND_ACKNOWLEDGED" as const,
      verified: false,
      information: "RF link established",
    });
    const session = createUserHardwareSessionFromDriver({
      driver: { ...hardware.driver, startBinding },
    });

    await expect(
      session.startBinding({ confirmedByUser: true }),
    ).rejects.toMatchObject({ code: "COMMAND_NOT_ACKNOWLEDGED" });
  });

  it("does not delegate sensitive writes when cancellation is already requested", async () => {
    const hardware = fakeDriver();
    const session = createUserHardwareSessionFromDriver({
      driver: hardware.driver,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      session.writeParameter(1, 2, controller.signal),
    ).rejects.toMatchObject({ code: "ABORTED" });
    await expect(
      session.restoreBackup(session.backup, {
        confirmedByUser: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    await expect(
      session.startBinding({
        confirmedByUser: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(hardware.writeParameter).not.toHaveBeenCalled();
    expect(hardware.startBinding).not.toHaveBeenCalled();
  });

  it("uses the official firmware target when entering an RX bootloader", async () => {
    const hardware = fakeDriver({
      deviceIdentity: identity({
        role: "rx",
        address: CrsfAddress.receiver,
      }),
    });
    const enterReceiverBootloader = vi.fn().mockResolvedValue({
      target: "VENDOR_RX",
      responseObserved: true,
    });
    const session = createUserHardwareSessionFromDriver({
      driver: { ...hardware.driver, enterReceiverBootloader },
    });

    await expect(
      session.enterReceiverBootloader({
        expectedFirmwareTarget: "VENDOR_RX",
        confirmedByUser: true,
      }),
    ).resolves.toMatchObject({ target: "VENDOR_RX" });
    expect(enterReceiverBootloader).toHaveBeenCalledWith({
      targetKey: "VENDOR_RX",
    });
  });

  it("does not invoke the RX bootloader driver when already cancelled", async () => {
    const hardware = fakeDriver({
      deviceIdentity: identity({
        role: "rx",
        address: CrsfAddress.receiver,
      }),
    });
    const enterReceiverBootloader = vi.fn().mockResolvedValue({
      target: "VENDOR_RX",
      responseObserved: true,
    });
    const session = createUserHardwareSessionFromDriver({
      driver: { ...hardware.driver, enterReceiverBootloader },
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      session.enterReceiverBootloader({
        expectedFirmwareTarget: "VENDOR_RX",
        confirmedByUser: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(enterReceiverBootloader).not.toHaveBeenCalled();
  });

  it("does not invoke the TX bootloader command when already cancelled", async () => {
    const hardware = fakeDriver({
      initialParameters: [command(1, "Serial Update")],
    });
    const session = createUserHardwareSessionFromDriver({
      driver: hardware.driver,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      session.enterTransmitterBootloader({
        commandName: "Serial Update",
        confirmedByUser: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(hardware.executeCommand).not.toHaveBeenCalled();
  });

  it("closes the facade when releasing the bootloader port fails", async () => {
    const hardware = fakeDriver();
    const previousDisconnect = vi.fn();
    hardware.port.ondisconnect = previousDisconnect;
    const detachPortForBootloader = vi
      .fn()
      .mockRejectedValue(new Error("port release failed"));
    const session = createUserHardwareSessionFromDriver({
      driver: { ...hardware.driver, detachPortForBootloader },
    });
    const disconnectListener = vi.fn();
    session.onDisconnected(disconnectListener);

    await expect(
      session.detachPortForBootloader({ confirmedByUser: true }),
    ).rejects.toThrow("port release failed");
    expect(session.closed).toBe(true);
    expect(hardware.port.ondisconnect).toBe(previousDisconnect);
    hardware.port.ondisconnect?.(new Event("disconnect"));
    expect(disconnectListener).not.toHaveBeenCalled();
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
    expect(hardware.writeParameter).toHaveBeenLastCalledWith(1, 1, undefined);
  });

  it("reads every backup value live before claiming an unchanged restore", async () => {
    const hardware = fakeDriver();
    const readParameter = vi.spyOn(hardware.driver, "readParameter");
    const session = createUserHardwareSessionFromDriver({
      driver: hardware.driver,
    });

    await expect(
      session.restoreBackup(session.backup, { confirmedByUser: true }),
    ).resolves.toEqual([
      expect.objectContaining({ requestedValue: 1, verified: true }),
    ]);
    expect(readParameter).toHaveBeenCalledTimes(1);
    expect(readParameter).toHaveBeenCalledWith(1, undefined);
    expect(hardware.writeParameter).not.toHaveBeenCalled();
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

  it("does not trust a driver's verified flag when the returned value is not exact", async () => {
    const hardware = fakeDriver();
    const misleadingWrite = vi.fn().mockResolvedValue({
      parameter: selection(1, "Packet Rate", 2),
      requestedValue: 2,
      verified: true,
    });
    const readParameter = vi
      .fn()
      .mockResolvedValueOnce(selection(2, "Different setting", 2))
      .mockRejectedValue(new Error("independent read-back failed"));
    const session = createUserHardwareSessionFromDriver({
      driver: {
        ...hardware.driver,
        writeParameter: misleadingWrite,
        readParameter,
      },
    });

    await expect(session.writeParameter(1, 2)).rejects.toThrow(
      "independent read-back failed",
    );
    expect(misleadingWrite).toHaveBeenCalledTimes(1);
    expect(readParameter).toHaveBeenCalledTimes(2);
    expect(session.parameters.find((parameter) => parameter.id === 1)).toEqual(
      expect.objectContaining({ name: "Packet Rate", value: 1 }),
    );
  });

  it("rejects a matching read-back that arrives after cancellation", async () => {
    const hardware = fakeDriver();
    const delayedReadback = deferred<CrsfParameter>();
    const readParameter = vi.fn(() => delayedReadback.promise);
    const session = createUserHardwareSessionFromDriver({
      driver: { ...hardware.driver, readParameter },
    });
    const controller = new AbortController();

    const pending = session.writeParameter(1, 2, controller.signal);
    await vi.waitFor(() => expect(readParameter).toHaveBeenCalledTimes(1));
    controller.abort();
    delayedReadback.resolve(selection(1, "Packet Rate", 2));

    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
    expect(session.parameters.find((parameter) => parameter.id === 1)).toEqual(
      expect.objectContaining({ value: 1 }),
    );
  });

  it("rejects a matching read-back that arrives after the session closes", async () => {
    const hardware = fakeDriver();
    const delayedReadback = deferred<CrsfParameter>();
    const readParameter = vi.fn(() => delayedReadback.promise);
    const session = createUserHardwareSessionFromDriver({
      driver: { ...hardware.driver, readParameter },
    });

    const pending = session.writeParameter(1, 2);
    await vi.waitFor(() => expect(readParameter).toHaveBeenCalledTimes(1));
    await session.close();
    delayedReadback.resolve(selection(1, "Packet Rate", 2));

    await expect(pending).rejects.toMatchObject({ code: "SESSION_CLOSED" });
    expect(session.parameters.find((parameter) => parameter.id === 1)).toEqual(
      expect.objectContaining({ value: 1 }),
    );
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
