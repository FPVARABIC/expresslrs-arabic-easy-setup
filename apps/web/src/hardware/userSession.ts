import type { CrsfParameter, CrsfRole } from "./crsf";
import {
  ExpressLrsHardwareError,
  ExpressLrsHardwareSession,
  type BindingResult,
  type CommandExecutionResult,
  type ExpressLrsIdentity,
  type HardwareConnectOutcome,
  type ParameterWriteResult,
  type ReceiverBootloaderResult,
} from "./session";
import { HardwareSerialError, type HardwareSerialPort } from "./serial";

export const MAX_EXPRESSLRS_CRSF_PARAMETERS = 64 as const;
export const DEFAULT_HARDWARE_CONNECT_TIMEOUT_MS = 15_000 as const;

const sensitiveParameterName =
  /(?:binding\s*phrase|bind\s*phrase|password|passphrase|credential|secret|ssid|\buid\b|private\s*key|api\s*key)/iu;

export type WritableCrsfParameter = Extract<
  CrsfParameter,
  { readonly kind: "number" | "selection" }
>;

export interface SafeSettingsBackup {
  readonly schemaVersion: 2;
  readonly createdAt: string;
  readonly assurance: "PRODUCT_AND_HARDWARE_MATCH";
  readonly identity: ExpressLrsIdentity;
  readonly values: readonly Readonly<{
    parameterId: number;
    name: string;
    kind: "number" | "selection";
    value: number;
  }>[];
}

export interface UserBindingResult {
  readonly stage: BindingResult["stage"];
  readonly commandCompleted: boolean;
  readonly linkVerified: false;
  readonly information: string;
}

export interface UserCommandResult {
  readonly commandName: string;
  readonly commandCompleted: boolean;
  readonly information: string;
}

export interface HardwareSessionDriver {
  readonly identity: ExpressLrsIdentity;
  readonly parameters: readonly CrsfParameter[];
  readonly port: HardwareSerialPort;
  readParameter(
    parameterId: number,
    signal?: AbortSignal,
  ): Promise<CrsfParameter>;
  writeParameter(
    parameterId: number,
    value: number,
    signal?: AbortSignal,
  ): Promise<ParameterWriteResult>;
  startBinding(signal?: AbortSignal): Promise<BindingResult>;
  executeCommand(
    commandName: string,
    signal?: AbortSignal,
  ): Promise<CommandExecutionResult>;
  verifyCurrentIdentity?(signal?: AbortSignal): Promise<ExpressLrsIdentity>;
  enterReceiverBootloader?(input?: {
    readonly targetKey?: string;
    readonly signal?: AbortSignal;
  }): Promise<ReceiverBootloaderResult>;
  detachPortForBootloader?(): Promise<HardwareSerialPort>;
  close(): Promise<boolean>;
}

export type HardwareDriverConnectFailureStatus = Exclude<
  HardwareConnectOutcome,
  { readonly status: "CONNECTED" }
>["status"];

export type HardwareDriverConnectOutcome =
  | Readonly<{
      status: "CONNECTED";
      driver: HardwareSessionDriver;
      identity: ExpressLrsIdentity;
      parameters: readonly CrsfParameter[];
    }>
  | Readonly<{
      status: HardwareDriverConnectFailureStatus;
      message: string;
    }>;

export type HardwareDriverConnector = (input: {
  readonly role: CrsfRole;
  readonly navigatorObject?: unknown;
  readonly secureContext?: boolean;
  readonly signal?: AbortSignal;
}) => Promise<HardwareDriverConnectOutcome>;

export type UserHardwareConnectFailureStatus =
  | HardwareDriverConnectFailureStatus
  | "CANCELLED"
  | "TIMED_OUT"
  | "INVALID_PARAMETER_TABLE"
  | "CLEANUP_UNCONFIRMED"
  | "CONNECT_FAILED";

export type UserHardwareConnectOutcome =
  | Readonly<{
      status: "CONNECTED";
      session: UserHardwareSession;
      identity: ExpressLrsIdentity;
      parameters: readonly CrsfParameter[];
      backup: SafeSettingsBackup;
    }>
  | Readonly<{
      status: UserHardwareConnectFailureStatus;
      message: string;
    }>;

export interface UserHardwareConnectInput {
  readonly role: CrsfRole;
  readonly navigatorObject?: unknown;
  readonly secureContext?: boolean;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly connector?: HardwareDriverConnector;
  readonly onCleanupUnconfirmed?: (message: string) => void;
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
}

function isWritableParameter(
  parameter: CrsfParameter,
): parameter is WritableCrsfParameter {
  return parameter.kind === "number" || parameter.kind === "selection";
}

function isSafeWritableParameter(
  parameter: CrsfParameter,
): parameter is WritableCrsfParameter {
  return (
    isWritableParameter(parameter) &&
    !parameter.hidden &&
    !sensitiveParameterName.test(parameter.name)
  );
}

function parameterValue(parameter: CrsfParameter): number | null {
  return isWritableParameter(parameter) ? parameter.value : null;
}

function isExactWritableReadback(
  expected: WritableCrsfParameter,
  actual: CrsfParameter,
  expectedValue: number,
): actual is WritableCrsfParameter {
  return (
    actual.id === expected.id &&
    !actual.hidden &&
    actual.kind === expected.kind &&
    normalizedName(actual.name) === normalizedName(expected.name) &&
    parameterValue(actual) === expectedValue
  );
}

function safeUsbMatch(expected: number | null, actual: number | null): boolean {
  return expected === null || actual === null || expected === actual;
}

function compatibleBackupIdentity(
  expected: ExpressLrsIdentity,
  actual: ExpressLrsIdentity,
): boolean {
  return (
    expected.role === actual.role &&
    expected.address === actual.address &&
    normalizedName(expected.productName) ===
      normalizedName(actual.productName) &&
    expected.hardwareVersion === actual.hardwareVersion &&
    safeUsbMatch(expected.usb.usbVendorId, actual.usb.usbVendorId) &&
    safeUsbMatch(expected.usb.usbProductId, actual.usb.usbProductId)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertHardwareOperationActive(
  signal: AbortSignal | undefined,
  message: string,
): void {
  if (signal?.aborted === true) {
    throw new HardwareSerialError("ABORTED", message);
  }
}

function connectFailure(
  status: UserHardwareConnectFailureStatus,
  message: string,
): UserHardwareConnectOutcome {
  return Object.freeze({ status, message });
}

async function rejectOpenedHardwareConnection(input: {
  readonly driver: HardwareSessionDriver;
  readonly status: UserHardwareConnectFailureStatus;
  readonly message: string;
}): Promise<UserHardwareConnectOutcome> {
  let closed = false;
  try {
    closed = await input.driver.close();
  } catch {
    // The caller must latch an uncertain close regardless of the native error.
  }
  if (!closed) {
    return connectFailure(
      "CLEANUP_UNCONFIRMED",
      `${input.message}. The opened hardware connection could not be confirmed closed; safely disconnect the device and reload this page before trying again`,
    );
  }
  return connectFailure(input.status, input.message);
}

function closeLateHardwareConnection(
  connectorPromise: Promise<HardwareDriverConnectOutcome>,
  onCleanupUnconfirmed: ((message: string) => void) | undefined,
): void {
  void connectorPromise
    .then(async (lateOutcome) => {
      if (lateOutcome.status === "CLEANUP_UNCONFIRMED") {
        try {
          onCleanupUnconfirmed?.(lateOutcome.message);
        } catch {
          // A UI observer cannot interrupt the detached cleanup report.
        }
        return;
      }
      if (lateOutcome.status === "CONNECTED") {
        let closed = false;
        try {
          closed = await lateOutcome.driver.close();
        } catch {
          // Report the same fail-closed state as an explicit false result.
        }
        if (!closed) {
          try {
            onCleanupUnconfirmed?.(
              "A hardware connection completed after cancellation or timeout, but its port could not be confirmed closed",
            );
          } catch {
            // A UI observer cannot interrupt the detached cleanup task.
          }
        }
      }
    })
    .catch(() => undefined);
}

async function defaultHardwareConnector(input: {
  readonly role: CrsfRole;
  readonly navigatorObject?: unknown;
  readonly secureContext?: boolean;
  readonly signal?: AbortSignal;
}): Promise<HardwareDriverConnectOutcome> {
  const outcome = await ExpressLrsHardwareSession.connect(input);
  if (outcome.status !== "CONNECTED") {
    return outcome;
  }
  return Object.freeze({
    status: "CONNECTED",
    driver: outcome.session,
    identity: outcome.identity,
    parameters: outcome.parameters,
  });
}

function clampTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_HARDWARE_CONNECT_TIMEOUT_MS;
  }
  return Math.min(Math.max(Math.trunc(value ?? 0), 1_000), 60_000);
}

function validateParameterTable(
  identity: ExpressLrsIdentity,
  parameters: readonly CrsfParameter[],
): string | null {
  if (
    identity.productName.trim().length === 0 ||
    identity.productName.length > 96
  ) {
    return "The CRSF device identity contains an invalid product name";
  }
  if (parameters.length !== identity.parameterCount) {
    return `The device reported ${identity.parameterCount} parameters but ${parameters.length} were decoded`;
  }
  const ids = new Set<number>();
  for (const parameter of parameters) {
    if (
      !Number.isSafeInteger(parameter.id) ||
      parameter.id < 1 ||
      parameter.id > identity.parameterCount ||
      ids.has(parameter.id)
    ) {
      return "The CRSF parameter table contains a missing, duplicate, or out-of-range id";
    }
    ids.add(parameter.id);
  }
  return null;
}

function createAbortOutcome(
  externalSignal: AbortSignal | undefined,
  timedOut: boolean,
): UserHardwareConnectOutcome {
  if (externalSignal?.aborted === true) {
    return connectFailure("CANCELLED", "The hardware connection was cancelled");
  }
  if (timedOut) {
    return connectFailure(
      "TIMED_OUT",
      "The hardware connection exceeded its bounded deadline",
    );
  }
  return connectFailure("CANCELLED", "The hardware connection was cancelled");
}

export async function connectUserHardwareSession(
  input: UserHardwareConnectInput,
): Promise<UserHardwareConnectOutcome> {
  if (input.signal?.aborted === true) {
    return connectFailure("CANCELLED", "The hardware connection was cancelled");
  }

  const connector = input.connector ?? defaultHardwareConnector;
  const controller = new AbortController();
  const timeoutMs = clampTimeout(input.timeoutMs);
  let timedOut = false;
  let raceCompleted = false;
  let connectorPromise: Promise<HardwareDriverConnectOutcome> | null = null;

  const onExternalAbort = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(
      new DOMException("Hardware connection timed out", "TimeoutError"),
    );
  }, timeoutMs);

  let resolveAborted!: (value: "ABORTED") => void;
  const abortedPromise = new Promise<"ABORTED">((resolve) => {
    resolveAborted = resolve;
  });
  const onConnectionAbort = () => resolveAborted("ABORTED");
  controller.signal.addEventListener("abort", onConnectionAbort, {
    once: true,
  });

  try {
    connectorPromise = connector({
      role: input.role,
      ...(input.navigatorObject === undefined
        ? {}
        : { navigatorObject: input.navigatorObject }),
      ...(input.secureContext === undefined
        ? {}
        : { secureContext: input.secureContext }),
      signal: controller.signal,
    });
    const raced = await Promise.race([connectorPromise, abortedPromise]);
    raceCompleted = true;
    if (raced === "ABORTED") {
      closeLateHardwareConnection(connectorPromise, input.onCleanupUnconfirmed);
      return createAbortOutcome(input.signal, timedOut);
    }

    if (raced.status !== "CONNECTED") {
      if (raced.status === "CLEANUP_UNCONFIRMED") {
        return raced;
      }
      if (controller.signal.aborted) {
        return createAbortOutcome(input.signal, timedOut);
      }
      return raced;
    }

    if (
      raced.identity.parameterCount < 0 ||
      raced.identity.parameterCount > MAX_EXPRESSLRS_CRSF_PARAMETERS
    ) {
      return rejectOpenedHardwareConnection({
        driver: raced.driver,
        status: "INVALID_PARAMETER_TABLE",
        message: `The device reported ${raced.identity.parameterCount} CRSF parameters; the supported maximum is ${MAX_EXPRESSLRS_CRSF_PARAMETERS}`,
      });
    }

    const parameterTableError = validateParameterTable(
      raced.identity,
      raced.parameters,
    );
    if (parameterTableError !== null) {
      return rejectOpenedHardwareConnection({
        driver: raced.driver,
        status: "PARAMETER_READ_FAILED",
        message: parameterTableError,
      });
    }

    let session: UserHardwareSession;
    try {
      session = createUserHardwareSessionFromDriver({
        driver: raced.driver,
        identity: raced.identity,
        parameters: raced.parameters,
      });
    } catch (error: unknown) {
      return rejectOpenedHardwareConnection({
        driver: raced.driver,
        status: "CONNECT_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "The hardware session could not be initialized",
      });
    }
    return Object.freeze({
      status: "CONNECTED",
      session,
      identity: raced.identity,
      parameters: session.parameters,
      backup: session.backup,
    });
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      return createAbortOutcome(input.signal, timedOut);
    }
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected hardware connection failure";
    return connectFailure("CONNECT_FAILED", message);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onExternalAbort);
    controller.signal.removeEventListener("abort", onConnectionAbort);
    if (
      connectorPromise !== null &&
      !raceCompleted &&
      controller.signal.aborted
    ) {
      closeLateHardwareConnection(connectorPromise, input.onCleanupUnconfirmed);
    }
  }
}

export function createUserHardwareSessionFromDriver(input: {
  readonly driver: HardwareSessionDriver;
  readonly identity?: ExpressLrsIdentity;
  readonly parameters?: readonly CrsfParameter[];
}): UserHardwareSession {
  return new UserHardwareSession(
    input.driver,
    input.identity ?? input.driver.identity,
    input.parameters ?? input.driver.parameters,
  );
}

export class UserHardwareSession {
  readonly #driver: HardwareSessionDriver;
  readonly #identity: ExpressLrsIdentity;
  readonly #backup: SafeSettingsBackup;
  readonly #disconnectListeners = new Set<() => void>();
  #parameters: readonly CrsfParameter[];
  #closed = false;
  #previousDisconnectHandler: ((event: Event) => void) | null | undefined;

  public constructor(
    driver: HardwareSessionDriver,
    identity: ExpressLrsIdentity,
    parameters: readonly CrsfParameter[],
  ) {
    if (
      identity.parameterCount < 0 ||
      identity.parameterCount > MAX_EXPRESSLRS_CRSF_PARAMETERS
    ) {
      throw new RangeError(
        "The CRSF parameter count is outside the safe bound",
      );
    }
    this.#driver = driver;
    this.#identity = Object.freeze({
      ...identity,
      usb: Object.freeze({ ...identity.usb }),
    });
    this.#parameters = Object.freeze([...parameters]);
    this.#backup = this.#createBackup(new Date());

    try {
      this.#previousDisconnectHandler = driver.port.ondisconnect;
      driver.port.ondisconnect = (event) => {
        this.#closed = true;
        this.#previousDisconnectHandler?.(event);
        for (const listener of this.#disconnectListeners) {
          try {
            listener();
          } catch {
            // UI observers cannot interrupt transport cleanup.
          }
        }
      };
    } catch {
      this.#previousDisconnectHandler = undefined;
    }
  }

  public get identity(): ExpressLrsIdentity {
    return this.#identity;
  }

  public get parameters(): readonly CrsfParameter[] {
    return this.#parameters;
  }

  public get writableParameters(): readonly WritableCrsfParameter[] {
    return Object.freeze(this.#parameters.filter(isSafeWritableParameter));
  }

  public get commands(): readonly Extract<
    CrsfParameter,
    { readonly kind: "command" }
  >[] {
    return Object.freeze(
      this.#parameters.filter(
        (
          parameter,
        ): parameter is Extract<CrsfParameter, { readonly kind: "command" }> =>
          parameter.kind === "command" && !parameter.hidden,
      ),
    );
  }

  public get backup(): SafeSettingsBackup {
    return this.#backup;
  }

  public get closed(): boolean {
    return this.#closed;
  }

  public get hasBindCommand(): boolean {
    return this.#identity.role === "rx" || this.#findCommand(["bind"]) !== null;
  }

  public get hasRebootCommand(): boolean {
    return this.#findCommand(["reboot", "restart"]) !== null;
  }

  public onDisconnected(listener: () => void): () => void {
    this.#disconnectListeners.add(listener);
    return () => this.#disconnectListeners.delete(listener);
  }

  public async writeParameter(
    parameterId: number,
    value: number,
    signal?: AbortSignal,
  ): Promise<ParameterWriteResult> {
    this.#assertOpen();
    const parameter = this.writableParameters.find(
      (candidate) => candidate.id === parameterId,
    );
    if (parameter === undefined) {
      throw new ExpressLrsHardwareError(
        "PARAMETER_NOT_WRITABLE",
        "The selected setting is hidden, sensitive, unsupported, or unavailable",
      );
    }
    assertHardwareOperationActive(
      signal,
      "The settings write was cancelled before any device command was sent",
    );

    try {
      const result = await this.#driver.writeParameter(
        parameterId,
        value,
        signal,
      );
      this.#assertOpen();
      assertHardwareOperationActive(
        signal,
        "The settings write was cancelled before its result could be verified",
      );
      if (
        !result.verified ||
        result.requestedValue !== value ||
        !isExactWritableReadback(parameter, result.parameter, value)
      ) {
        throw new ExpressLrsHardwareError(
          "WRITE_NOT_VERIFIED",
          "The hardware driver did not return an exact read-back for the requested setting",
        );
      }
      assertHardwareOperationActive(
        signal,
        "The independent settings read-back was cancelled",
      );
      const readback = await this.#driver.readParameter(parameterId, signal);
      this.#assertOpen();
      assertHardwareOperationActive(
        signal,
        "The independent settings read-back was cancelled before it could be accepted",
      );
      if (!isExactWritableReadback(parameter, readback, value)) {
        throw new ExpressLrsHardwareError(
          "WRITE_NOT_VERIFIED",
          "The independent settings read-back did not match the requested setting",
        );
      }
      this.#replaceParameter(readback);
      return Object.freeze({
        parameter: readback,
        requestedValue: value,
        verified: true,
      });
    } catch (error: unknown) {
      const retryReadback =
        (error instanceof HardwareSerialError && error.code === "TIMEOUT") ||
        (error instanceof ExpressLrsHardwareError &&
          error.code === "WRITE_NOT_VERIFIED");
      if (!retryReadback) {
        throw error;
      }

      for (const delay of [120, 250, 500] as const) {
        if (signal?.aborted === true) {
          throw new HardwareSerialError(
            "ABORTED",
            "The settings write verification was cancelled",
          );
        }
        await sleep(delay);
        this.#assertOpen();
        assertHardwareOperationActive(
          signal,
          "The settings write verification was cancelled before the next read-back",
        );
        try {
          const readback = await this.#driver.readParameter(
            parameterId,
            signal,
          );
          this.#assertOpen();
          assertHardwareOperationActive(
            signal,
            "The settings write verification was cancelled before its read-back could be accepted",
          );
          if (isExactWritableReadback(parameter, readback, value)) {
            this.#replaceParameter(readback);
            return Object.freeze({
              parameter: readback,
              requestedValue: value,
              verified: true,
            });
          }
        } catch (readError: unknown) {
          if (
            !(readError instanceof HardwareSerialError) ||
            readError.code !== "TIMEOUT"
          ) {
            throw readError;
          }
        }
      }
      throw error;
    }
  }

  public async restoreBackup(
    backup: SafeSettingsBackup,
    input: {
      readonly confirmedByUser: boolean;
      readonly signal?: AbortSignal;
    },
  ): Promise<readonly ParameterWriteResult[]> {
    this.#assertOpen();
    if (!input.confirmedByUser) {
      throw new ExpressLrsHardwareError(
        "BACKUP_MISMATCH",
        "Restoring settings requires explicit user confirmation",
      );
    }
    assertHardwareOperationActive(
      input.signal,
      "Settings restoration was cancelled before any device command was sent",
    );
    if (
      backup.schemaVersion !== 2 ||
      !compatibleBackupIdentity(backup.identity, this.#identity)
    ) {
      throw new ExpressLrsHardwareError(
        "BACKUP_MISMATCH",
        "The backup product and hardware identity do not match the connected device",
      );
    }
    await this.verifyCurrentIdentity(input.signal);

    const results: ParameterWriteResult[] = [];
    for (const item of backup.values) {
      assertHardwareOperationActive(
        input.signal,
        "Settings restoration was cancelled before the next live read-back",
      );
      const declared = this.writableParameters.find(
        (parameter) => parameter.id === item.parameterId,
      );
      if (
        declared === undefined ||
        declared.kind !== item.kind ||
        normalizedName(declared.name) !== normalizedName(item.name)
      ) {
        throw new ExpressLrsHardwareError(
          "BACKUP_MISMATCH",
          `Backup setting ${item.parameterId} no longer matches the connected device`,
        );
      }
      const current = await this.#driver.readParameter(
        item.parameterId,
        input.signal,
      );
      this.#assertOpen();
      assertHardwareOperationActive(
        input.signal,
        "Settings restoration was cancelled before its live read-back could be accepted",
      );
      if (
        current.id !== declared.id ||
        current.hidden ||
        current.kind !== declared.kind ||
        normalizedName(current.name) !== normalizedName(declared.name)
      ) {
        throw new ExpressLrsHardwareError(
          "BACKUP_MISMATCH",
          `Live setting ${item.parameterId} no longer matches the captured backup`,
        );
      }
      this.#replaceParameter(current);
      if (parameterValue(current) === item.value) {
        results.push(
          Object.freeze({
            parameter: current,
            requestedValue: item.value,
            verified: true,
          }),
        );
      } else {
        results.push(
          await this.writeParameter(item.parameterId, item.value, input.signal),
        );
      }
    }
    return Object.freeze(results);
  }

  public async startBinding(input: {
    readonly confirmedByUser: boolean;
    readonly signal?: AbortSignal;
  }): Promise<UserBindingResult> {
    this.#assertOpen();
    if (!input.confirmedByUser) {
      throw new ExpressLrsHardwareError(
        "BINDING_NOT_ACKNOWLEDGED",
        "Binding requires explicit confirmation that the other device is ready",
      );
    }
    assertHardwareOperationActive(
      input.signal,
      "Binding was cancelled before any device command was sent",
    );
    const result = await this.#driver.startBinding(input.signal);
    this.#assertOpen();
    assertHardwareOperationActive(
      input.signal,
      "Binding was cancelled before the device response could be accepted",
    );
    if (result.stage === "TX_BIND_COMMAND_ACKNOWLEDGED" && !result.verified) {
      throw new ExpressLrsHardwareError(
        "COMMAND_NOT_ACKNOWLEDGED",
        "The TX Bind command did not return a verified acknowledgement",
      );
    }
    const information =
      result.stage === "TX_BIND_COMMAND_ACKNOWLEDGED"
        ? "The TX acknowledged its Bind command; this does not verify an RF link"
        : result.stage === "RX_BIND_COMMAND_TRANSMITTED"
          ? "The RX transport responded after the Bind command; this does not verify an RF link"
          : "The RX Bind commands were transmitted without independent RF-link verification";
    return Object.freeze({
      stage: result.stage,
      commandCompleted: true,
      linkVerified: false,
      information,
    });
  }

  public async reboot(input: {
    readonly confirmedByUser: boolean;
    readonly signal?: AbortSignal;
  }): Promise<UserCommandResult> {
    this.#assertOpen();
    if (!input.confirmedByUser) {
      throw new ExpressLrsHardwareError(
        "COMMAND_NOT_ACKNOWLEDGED",
        "Reboot requires explicit user confirmation",
      );
    }
    const command = this.#findCommand(["reboot", "restart"]);
    if (command === null) {
      throw new ExpressLrsHardwareError(
        "COMMAND_NOT_FOUND",
        "The connected device does not expose a Reboot or Restart command",
      );
    }
    const result = await this.#driver.executeCommand(
      command.name,
      input.signal,
    );
    return Object.freeze({
      commandName: command.name,
      commandCompleted: result.acknowledged,
      information:
        result.information ||
        `${command.name} completed on the connected device`,
    });
  }

  public async verifyCurrentIdentity(
    signal?: AbortSignal,
  ): Promise<ExpressLrsIdentity> {
    this.#assertOpen();
    assertHardwareOperationActive(
      signal,
      "Device identity verification was cancelled before the live read",
    );
    const verify = this.#driver.verifyCurrentIdentity;
    if (verify === undefined) {
      throw new ExpressLrsHardwareError(
        "IDENTITY_MISMATCH",
        "The connected device cannot be re-identified at the firmware write boundary",
      );
    }
    const observed = await Reflect.apply(verify, this.#driver, [signal]);
    this.#assertOpen();
    assertHardwareOperationActive(
      signal,
      "Device identity verification was cancelled before the live identity could be accepted",
    );
    if (!compatibleBackupIdentity(this.#identity, observed)) {
      throw new ExpressLrsHardwareError(
        "IDENTITY_MISMATCH",
        "The connected device identity changed before the firmware write boundary",
      );
    }
    return Object.freeze({
      ...observed,
      usb: Object.freeze({ ...observed.usb }),
    });
  }

  public async enterReceiverBootloader(input: {
    readonly expectedFirmwareTarget: string;
    readonly confirmedByUser: boolean;
    readonly signal?: AbortSignal;
  }): Promise<ReceiverBootloaderResult> {
    this.#assertOpen();
    if (!input.confirmedByUser || this.#identity.role !== "rx") {
      throw new ExpressLrsHardwareError(
        "BOOTLOADER_NOT_ACKNOWLEDGED",
        "Receiver bootloader entry requires an identified RX and explicit user confirmation",
      );
    }
    const enterBootloader = this.#driver.enterReceiverBootloader;
    if (enterBootloader === undefined) {
      throw new ExpressLrsHardwareError(
        "BOOTLOADER_NOT_ACKNOWLEDGED",
        "The connected RX does not expose a verified direct bootloader transition",
      );
    }
    assertHardwareOperationActive(
      input.signal,
      "Receiver bootloader entry was cancelled before any device command was sent",
    );
    const result = await Reflect.apply(enterBootloader, this.#driver, [
      {
        targetKey: input.expectedFirmwareTarget,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    ]);
    if (
      !result.responseObserved ||
      normalizedName(result.target) !==
        normalizedName(input.expectedFirmwareTarget)
    ) {
      throw new ExpressLrsHardwareError(
        "BOOTLOADER_NOT_ACKNOWLEDGED",
        "The receiver bootloader did not confirm the exact selected target",
      );
    }
    return Object.freeze({ ...result });
  }

  public async enterTransmitterBootloader(input: {
    readonly commandName: string;
    readonly confirmedByUser: boolean;
    readonly signal?: AbortSignal;
  }): Promise<UserCommandResult> {
    this.#assertOpen();
    if (!input.confirmedByUser || this.#identity.role !== "tx") {
      throw new ExpressLrsHardwareError(
        "BOOTLOADER_NOT_ACKNOWLEDGED",
        "Transmitter bootloader entry requires an identified TX and explicit user confirmation",
      );
    }
    const command = this.commands.find(
      (candidate) =>
        normalizedName(candidate.name) === normalizedName(input.commandName) &&
        /(?:serial\s*update|bootloader|update\s*mode)/iu.test(candidate.name),
    );
    if (command === undefined) {
      throw new ExpressLrsHardwareError(
        "COMMAND_NOT_FOUND",
        "The connected TX does not expose the selected bootloader command",
      );
    }
    assertHardwareOperationActive(
      input.signal,
      "Transmitter bootloader entry was cancelled before any device command was sent",
    );
    const result = await this.#driver.executeCommand(
      command.name,
      input.signal,
    );
    if (!result.acknowledged) {
      throw new ExpressLrsHardwareError(
        "BOOTLOADER_NOT_ACKNOWLEDGED",
        "The connected TX did not acknowledge its bootloader command",
      );
    }
    return Object.freeze({
      commandName: command.name,
      commandCompleted: true,
      information:
        result.information ||
        `${command.name} completed on the connected device`,
    });
  }

  public async detachPortForBootloader(input: {
    readonly confirmedByUser: boolean;
  }): Promise<HardwareSerialPort> {
    this.#assertOpen();
    if (!input.confirmedByUser) {
      throw new ExpressLrsHardwareError(
        "BOOTLOADER_NOT_ACKNOWLEDGED",
        "Releasing the identified device for firmware writing requires explicit user confirmation",
      );
    }
    const detach = this.#driver.detachPortForBootloader;
    if (detach === undefined) {
      throw new ExpressLrsHardwareError(
        "BOOTLOADER_NOT_ACKNOWLEDGED",
        "The connected device cannot safely release its direct serial port for firmware writing",
      );
    }
    try {
      return await Reflect.apply(detach, this.#driver, []);
    } finally {
      this.#closed = true;
      try {
        this.#driver.port.ondisconnect =
          this.#previousDisconnectHandler ?? null;
      } catch {
        // A transitioning browser port may reject handler changes.
      }
      this.#disconnectListeners.clear();
    }
  }

  public async close(): Promise<boolean> {
    if (this.#closed) {
      return true;
    }
    this.#closed = true;
    try {
      this.#driver.port.ondisconnect = this.#previousDisconnectHandler ?? null;
    } catch {
      // A disconnected browser port may reject handler changes.
    }
    this.#disconnectListeners.clear();
    return this.#driver.close();
  }

  #createBackup(now: Date): SafeSettingsBackup {
    const values = this.#parameters
      .filter(isSafeWritableParameter)
      .map((parameter) =>
        Object.freeze({
          parameterId: parameter.id,
          name: parameter.name,
          kind: parameter.kind,
          value: parameter.value,
        }),
      );
    return Object.freeze({
      schemaVersion: 2,
      createdAt: now.toISOString(),
      assurance: "PRODUCT_AND_HARDWARE_MATCH",
      identity: this.#identity,
      values: Object.freeze(values),
    });
  }

  #replaceParameter(next: CrsfParameter): void {
    const replaced = this.#parameters.map((parameter) =>
      parameter.id === next.id ? next : parameter,
    );
    this.#parameters = Object.freeze(replaced);
  }

  #findCommand(
    acceptedNames: readonly string[],
  ): Extract<CrsfParameter, { readonly kind: "command" }> | null {
    const normalizedAccepted = new Set(acceptedNames.map(normalizedName));
    return (
      this.commands.find((command) =>
        normalizedAccepted.has(normalizedName(command.name)),
      ) ?? null
    );
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new ExpressLrsHardwareError(
        "SESSION_CLOSED",
        "The user hardware session is closed",
      );
    }
  }
}
