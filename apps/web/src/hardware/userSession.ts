import type { CrsfParameter, CrsfRole } from "./crsf";
import {
  ExpressLrsHardwareError,
  ExpressLrsHardwareSession,
  type BindingResult,
  type CommandExecutionResult,
  type ExpressLrsIdentity,
  type HardwareConnectOutcome,
  type ParameterWriteResult,
} from "./session";
import {
  HardwareSerialError,
  type HardwareSerialPort,
} from "./serial";

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

function safeUsbMatch(
  expected: number | null,
  actual: number | null,
): boolean {
  return expected === null || actual === null || expected === actual;
}

function compatibleBackupIdentity(
  expected: ExpressLrsIdentity,
  actual: ExpressLrsIdentity,
): boolean {
  return (
    expected.role === actual.role &&
    expected.address === actual.address &&
    normalizedName(expected.productName) === normalizedName(actual.productName) &&
    expected.hardwareVersion === actual.hardwareVersion &&
    safeUsbMatch(expected.usb.usbVendorId, actual.usb.usbVendorId) &&
    safeUsbMatch(expected.usb.usbProductId, actual.usb.usbProductId)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectFailure(
  status: UserHardwareConnectFailureStatus,
  message: string,
): UserHardwareConnectOutcome {
  return Object.freeze({ status, message });
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
  if (identity.productName.trim().length === 0 || identity.productName.length > 96) {
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

  const onExternalAbort = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Hardware connection timed out", "TimeoutError"));
  }, timeoutMs);

  const connectorPromise = connector({
    role: input.role,
    ...(input.navigatorObject === undefined
      ? {}
      : { navigatorObject: input.navigatorObject }),
    ...(input.secureContext === undefined
      ? {}
      : { secureContext: input.secureContext }),
    signal: controller.signal,
  });

  const abortedPromise = new Promise<"ABORTED">((resolve) => {
    controller.signal.addEventListener("abort", () => resolve("ABORTED"), {
      once: true,
    });
  });

  try {
    const raced = await Promise.race([connectorPromise, abortedPromise]);
    raceCompleted = true;
    if (raced === "ABORTED") {
      void connectorPromise.then(async (lateOutcome) => {
        if (lateOutcome.status === "CONNECTED") {
          await lateOutcome.driver.close();
        }
      });
      return createAbortOutcome(input.signal, timedOut);
    }

    if (raced.status !== "CONNECTED") {
      if (controller.signal.aborted) {
        return createAbortOutcome(input.signal, timedOut);
      }
      return raced;
    }

    if (
      raced.identity.parameterCount < 0 ||
      raced.identity.parameterCount > MAX_EXPRESSLRS_CRSF_PARAMETERS
    ) {
      await raced.driver.close();
      return connectFailure(
        "INVALID_PARAMETER_TABLE",
        `The device reported ${raced.identity.parameterCount} CRSF parameters; the supported maximum is ${MAX_EXPRESSLRS_CRSF_PARAMETERS}`,
      );
    }

    const parameterTableError = validateParameterTable(
      raced.identity,
      raced.parameters,
    );
    if (parameterTableError !== null) {
      await raced.driver.close();
      return connectFailure("PARAMETER_READ_FAILED", parameterTableError);
    }

    const session = createUserHardwareSessionFromDriver({
      driver: raced.driver,
      identity: raced.identity,
      parameters: raced.parameters,
    });
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
      error instanceof Error ? error.message : "Unexpected hardware connection failure";
    return connectFailure("CONNECT_FAILED", message);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onExternalAbort);
    if (!raceCompleted && controller.signal.aborted) {
      void connectorPromise.then(async (lateOutcome) => {
        if (lateOutcome.status === "CONNECTED") {
          await lateOutcome.driver.close();
        }
      });
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
      throw new RangeError("The CRSF parameter count is outside the safe bound");
    }
    this.#driver = driver;
    this.#identity = Object.freeze({ ...identity, usb: Object.freeze({ ...identity.usb }) });
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

    try {
      const result = await this.#driver.writeParameter(parameterId, value, signal);
      this.#replaceParameter(result.parameter);
      return result;
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
        try {
          const readback = await this.#driver.readParameter(parameterId, signal);
          this.#replaceParameter(readback);
          if (parameterValue(readback) === value) {
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
    if (
      backup.schemaVersion !== 2 ||
      !compatibleBackupIdentity(backup.identity, this.#identity)
    ) {
      throw new ExpressLrsHardwareError(
        "BACKUP_MISMATCH",
        "The backup product and hardware identity do not match the connected device",
      );
    }

    const results: ParameterWriteResult[] = [];
    for (const item of backup.values) {
      const current = this.writableParameters.find(
        (parameter) => parameter.id === item.parameterId,
      );
      if (
        current === undefined ||
        current.kind !== item.kind ||
        normalizedName(current.name) !== normalizedName(item.name)
      ) {
        throw new ExpressLrsHardwareError(
          "BACKUP_MISMATCH",
          `Backup setting ${item.parameterId} no longer matches the connected device`,
        );
      }
      if (current.value === item.value) {
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
    const result = await this.#driver.startBinding(input.signal);
    return Object.freeze({
      stage: result.stage,
      commandCompleted: true,
      linkVerified: false,
      information:
        result.information ||
        "The bind command completed, but a usable RF link has not been independently verified",
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
    const result = await this.#driver.executeCommand(command.name, input.signal);
    return Object.freeze({
      commandName: command.name,
      commandCompleted: result.acknowledged,
      information:
        result.information || `${command.name} completed on the connected device`,
    });
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
