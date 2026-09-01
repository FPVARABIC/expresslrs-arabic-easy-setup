import {
  CrsfAddress,
  CrsfCommandStep,
  asExtendedFrame,
  concatBytes,
  createDevicePing,
  createLegacyBindCommand,
  createLegacyBootloaderCommand,
  createParameterRead,
  createParameterWrite,
  createReceiverBindCommand,
  encodeCommandStep,
  encodeParameterValue,
  parseCrsfDeviceInfo,
  parseCrsfParameter,
  parseParameterChunk,
  type CrsfDeviceInfo,
  type CrsfFrame,
  type CrsfParameter,
  type CrsfRole,
} from "./crsf";
import {
  CrsfSerialLink,
  HardwareSerialError,
  EXPRESSLRS_CRSF_BAUD_RATE,
  requestAndOpenHardwareSerial,
  type HardwareSerialOpenFailure,
  type HardwareSerialPort,
  type HardwareSerialPortInfo,
} from "./serial";

export interface ExpressLrsIdentity {
  readonly validation: "CRSF_DEVICE_INFO";
  readonly role: CrsfRole;
  readonly address: number;
  readonly requestOrigin: number;
  readonly productName: string;
  readonly firmwareVersion: string;
  readonly serialMarker: "ELRS";
  readonly hardwareVersion: number;
  readonly softwareVersion: number;
  readonly parameterVersion: number;
  readonly parameterCount: number;
  readonly usb: HardwareSerialPortInfo;
}

export interface ExpressLrsSettingsBackup {
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly identity: ExpressLrsIdentity;
  readonly values: readonly Readonly<{
    parameterId: number;
    name: string;
    kind: "number" | "selection";
    value: number;
  }>[];
}

export type HardwareConnectOutcome =
  | Readonly<{
      status: "CONNECTED";
      session: ExpressLrsHardwareSession;
      identity: ExpressLrsIdentity;
      parameters: readonly CrsfParameter[];
    }>
  | Readonly<{
      status:
        | HardwareSerialOpenFailure
        | "NO_CRSF_RESPONSE"
        | "ROLE_MISMATCH"
        | "NOT_EXPRESSLRS"
        | "PARAMETER_READ_FAILED";
      message: string;
    }>;

export interface ParameterWriteResult {
  readonly parameter: CrsfParameter;
  readonly requestedValue: number;
  readonly verified: boolean;
}

export interface CommandExecutionResult {
  readonly parameter: CrsfParameter;
  readonly finalStep: number;
  readonly information: string;
  readonly acknowledged: boolean;
}

export interface BindingResult {
  readonly stage:
    | "TX_BIND_COMMAND_ACKNOWLEDGED"
    | "RX_BIND_COMMAND_TRANSMITTED"
    | "LEGACY_BIND_COMMAND_TRANSMITTED";
  readonly verified: boolean;
  readonly information: string;
}

export interface ReceiverBootloaderResult {
  readonly target: string;
  readonly responseObserved: boolean;
}

export class ExpressLrsHardwareError extends Error {
  public constructor(
    public readonly code:
      | "SESSION_CLOSED"
      | "PARAMETER_NOT_FOUND"
      | "PARAMETER_NOT_WRITABLE"
      | "WRITE_NOT_VERIFIED"
      | "COMMAND_NOT_FOUND"
      | "COMMAND_NOT_ACKNOWLEDGED"
      | "BACKUP_MISMATCH"
      | "BACKUP_INCOMPLETE"
      | "BOOTLOADER_NOT_ACKNOWLEDGED"
      | "BINDING_NOT_ACKNOWLEDGED"
      | "IDENTITY_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "ExpressLrsHardwareError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
}

function isParameterResponse(
  frame: CrsfFrame,
  deviceAddress: number,
  parameterId: number,
): boolean {
  const extended = asExtendedFrame(frame);
  const chunk = parseParameterChunk(frame);
  return (
    extended !== null &&
    chunk !== null &&
    extended.origin === deviceAddress &&
    chunk.parameterId === parameterId
  );
}

function sameIdentity(
  expected: ExpressLrsIdentity,
  actual: ExpressLrsIdentity,
): boolean {
  return (
    expected.role === actual.role &&
    expected.address === actual.address &&
    expected.productName === actual.productName &&
    expected.softwareVersion === actual.softwareVersion &&
    expected.parameterVersion === actual.parameterVersion
  );
}

function sameLiveIdentity(
  expected: ExpressLrsIdentity,
  actual: ExpressLrsIdentity,
): boolean {
  const sameUsb =
    (expected.usb.usbVendorId === null ||
      actual.usb.usbVendorId === null ||
      expected.usb.usbVendorId === actual.usb.usbVendorId) &&
    (expected.usb.usbProductId === null ||
      actual.usb.usbProductId === null ||
      expected.usb.usbProductId === actual.usb.usbProductId);
  return (
    expected.role === actual.role &&
    expected.address === actual.address &&
    expected.requestOrigin === actual.requestOrigin &&
    expected.productName === actual.productName &&
    expected.serialMarker === actual.serialMarker &&
    expected.hardwareVersion === actual.hardwareVersion &&
    sameUsb
  );
}

function parameterValue(parameter: CrsfParameter): number | null {
  return parameter.kind === "number" || parameter.kind === "selection"
    ? parameter.value
    : null;
}

function assertParameterValueEqual(
  parameter: CrsfParameter,
  expected: number,
): boolean {
  const actual = parameterValue(parameter);
  return actual !== null && actual === expected;
}

function identityFromDeviceInfo(
  info: CrsfDeviceInfo,
  role: CrsfRole,
  usb: HardwareSerialPortInfo,
): ExpressLrsIdentity {
  if (!info.expressLrsMarkerValid) {
    throw new ExpressLrsHardwareError(
      "BACKUP_MISMATCH",
      "The CRSF device did not return the ELRS serial marker",
    );
  }
  return Object.freeze({
    validation: "CRSF_DEVICE_INFO",
    role,
    address: info.origin,
    requestOrigin: info.destination,
    productName: info.name,
    firmwareVersion: info.firmwareVersion,
    serialMarker: "ELRS",
    hardwareVersion: info.hardwareVersion,
    softwareVersion: info.softwareVersion,
    parameterVersion: info.parameterVersion,
    parameterCount: info.fieldCount,
    usb,
  });
}

export class ExpressLrsHardwareSession {
  readonly #link: CrsfSerialLink;
  readonly #port: HardwareSerialPort;
  readonly #identity: ExpressLrsIdentity;
  #parameters = new Map<number, CrsfParameter>();
  #closed = false;

  private constructor(input: {
    readonly link: CrsfSerialLink;
    readonly port: HardwareSerialPort;
    readonly identity: ExpressLrsIdentity;
  }) {
    this.#link = input.link;
    this.#port = input.port;
    this.#identity = input.identity;
  }

  public static async connect(input: {
    readonly role: CrsfRole;
    readonly navigatorObject?: unknown;
    readonly secureContext?: boolean;
    readonly signal?: AbortSignal;
  }): Promise<HardwareConnectOutcome> {
    const opened = await requestAndOpenHardwareSerial({
      ...(input.navigatorObject === undefined
        ? {}
        : { navigatorObject: input.navigatorObject }),
      ...(input.secureContext === undefined
        ? {}
        : { secureContext: input.secureContext }),
      baudRate: EXPRESSLRS_CRSF_BAUD_RATE,
    });
    if (opened.status !== "OPEN") {
      return Object.freeze({
        status: opened.status,
        message: `Unable to open the selected serial port: ${opened.status}`,
      });
    }

    const link = new CrsfSerialLink(opened.port);
    link.start();
    let deviceInfo: CrsfDeviceInfo | null = null;
    for (const origin of [CrsfAddress.usb, CrsfAddress.core] as const) {
      try {
        const frame = await link.request(
          createDevicePing(origin),
          (candidate) => {
            const parsed = parseCrsfDeviceInfo(candidate);
            return parsed !== null && parsed.expressLrsMarkerValid;
          },
          { timeoutMs: 1_500, signal: input.signal },
        );
        deviceInfo = parseCrsfDeviceInfo(frame);
        if (deviceInfo !== null) {
          break;
        }
      } catch (error: unknown) {
        if (
          error instanceof HardwareSerialError &&
          (error.code === "TIMEOUT" || error.code === "ABORTED")
        ) {
          if (error.code === "ABORTED") {
            await link.close();
            return Object.freeze({
              status: "NO_CRSF_RESPONSE",
              message: "The USB identification request was cancelled",
            });
          }
          continue;
        }
        await link.close();
        return Object.freeze({
          status: "NO_CRSF_RESPONSE",
          message:
            "The selected port failed while waiting for a CRSF device response",
        });
      }
    }

    if (deviceInfo === null) {
      await link.close();
      return Object.freeze({
        status: "NO_CRSF_RESPONSE",
        message:
          "No valid ExpressLRS CRSF DEVICE_INFO response was received at 420000 baud",
      });
    }
    if (!deviceInfo.expressLrsMarkerValid) {
      await link.close();
      return Object.freeze({
        status: "NOT_EXPRESSLRS",
        message: "The responding CRSF device did not report the ELRS marker",
      });
    }
    if (deviceInfo.role !== "unknown" && deviceInfo.role !== input.role) {
      await link.close();
      return Object.freeze({
        status: "ROLE_MISMATCH",
        message: `The selected ${input.role.toUpperCase()} path received a ${deviceInfo.role.toUpperCase()} device`,
      });
    }

    const identity = identityFromDeviceInfo(
      deviceInfo,
      input.role,
      opened.info,
    );
    const session = new ExpressLrsHardwareSession({
      link,
      port: opened.port,
      identity,
    });
    try {
      const parameters = await session.refreshAllParameters(input.signal);
      return Object.freeze({
        status: "CONNECTED",
        session,
        identity,
        parameters,
      });
    } catch {
      await session.close();
      return Object.freeze({
        status: "PARAMETER_READ_FAILED",
        message:
          "The device identity was valid, but its complete CRSF parameter table could not be read",
      });
    }
  }

  public get identity(): ExpressLrsIdentity {
    return this.#identity;
  }

  public get port(): HardwareSerialPort {
    return this.#port;
  }

  public get parameters(): readonly CrsfParameter[] {
    return Object.freeze(
      [...this.#parameters.values()].sort((left, right) => left.id - right.id),
    );
  }

  public async verifyCurrentIdentity(
    signal?: AbortSignal,
  ): Promise<ExpressLrsIdentity> {
    this.#assertOpen();
    const frame = await this.#link.request(
      createDevicePing(this.#identity.requestOrigin),
      (candidate) => {
        const parsed = parseCrsfDeviceInfo(candidate);
        return (
          parsed !== null &&
          parsed.expressLrsMarkerValid &&
          parsed.origin === this.#identity.address
        );
      },
      { timeoutMs: 1_500, signal },
    );
    const info = parseCrsfDeviceInfo(frame);
    if (
      info === null ||
      !info.expressLrsMarkerValid ||
      (info.role !== "unknown" && info.role !== this.#identity.role)
    ) {
      throw new ExpressLrsHardwareError(
        "IDENTITY_MISMATCH",
        "The connected device no longer reports the expected ExpressLRS identity",
      );
    }
    const observed = identityFromDeviceInfo(
      info,
      this.#identity.role,
      this.#identity.usb,
    );
    if (!sameLiveIdentity(this.#identity, observed)) {
      throw new ExpressLrsHardwareError(
        "IDENTITY_MISMATCH",
        "The connected device identity changed before the write boundary",
      );
    }
    return observed;
  }

  public async refreshAllParameters(
    signal?: AbortSignal,
  ): Promise<readonly CrsfParameter[]> {
    this.#assertOpen();
    const next = new Map<number, CrsfParameter>();
    for (
      let parameterId = 1;
      parameterId <= this.#identity.parameterCount;
      parameterId += 1
    ) {
      let parameter: CrsfParameter | null = null;
      for (let attempt = 0; attempt < 2 && parameter === null; attempt += 1) {
        try {
          parameter = await this.readParameter(parameterId, signal);
        } catch (error: unknown) {
          if (
            !(error instanceof HardwareSerialError) ||
            error.code !== "TIMEOUT"
          ) {
            throw error;
          }
        }
      }
      if (parameter === null) {
        throw new HardwareSerialError(
          "TIMEOUT",
          `CRSF parameter ${parameterId} did not answer after two attempts`,
        );
      }
      next.set(parameterId, parameter);
    }
    this.#parameters = next;
    return this.parameters;
  }

  public async readParameter(
    parameterId: number,
    signal?: AbortSignal,
  ): Promise<CrsfParameter> {
    this.#assertOpen();
    if (
      !Number.isSafeInteger(parameterId) ||
      parameterId < 1 ||
      parameterId > this.#identity.parameterCount
    ) {
      throw new RangeError("CRSF parameter id is outside the device table");
    }

    const chunks: Uint8Array[] = [];
    let chunkIndex = 0;
    let chunksRemaining = 1;
    while (chunksRemaining > 0) {
      if (chunkIndex >= 32) {
        throw new TypeError(
          "CRSF parameter exceeded the bounded 32-chunk limit",
        );
      }
      const frame = await this.#link.request(
        createParameterRead({
          destination: this.#identity.address,
          parameterId,
          chunk: chunkIndex,
          origin: this.#identity.requestOrigin,
        }),
        (candidate) =>
          isParameterResponse(candidate, this.#identity.address, parameterId),
        { timeoutMs: 1_200, signal },
      );
      const chunk = parseParameterChunk(frame);
      if (chunk === null) {
        throw new TypeError("The CRSF parameter response could not be decoded");
      }
      chunks.push(chunk.data);
      chunksRemaining = chunk.chunksRemaining;
      chunkIndex += 1;
    }
    const assembled = concatBytes(...chunks);
    if (assembled.byteLength > 4_096) {
      throw new TypeError(
        "CRSF parameter exceeded the bounded 4096-byte limit",
      );
    }
    const parameter = parseCrsfParameter(parameterId, assembled);
    this.#parameters.set(parameterId, parameter);
    return parameter;
  }

  public createSettingsBackup(now = new Date()): ExpressLrsSettingsBackup {
    this.#assertOpen();
    if (this.#parameters.size !== this.#identity.parameterCount) {
      throw new ExpressLrsHardwareError(
        "BACKUP_INCOMPLETE",
        "All device parameters must be read before creating a settings backup",
      );
    }
    const values = this.parameters.flatMap((parameter) => {
      if (
        parameter.hidden ||
        (parameter.kind !== "number" && parameter.kind !== "selection")
      ) {
        return [];
      }
      return [
        Object.freeze({
          parameterId: parameter.id,
          name: parameter.name,
          kind: parameter.kind,
          value: parameter.value,
        }),
      ];
    });
    return Object.freeze({
      schemaVersion: 1,
      createdAt: now.toISOString(),
      identity: this.#identity,
      values: Object.freeze(values),
    });
  }

  public async writeParameter(
    parameterId: number,
    value: number,
    signal?: AbortSignal,
  ): Promise<ParameterWriteResult> {
    this.#assertOpen();
    const known = this.#parameters.get(parameterId);
    if (known === undefined) {
      throw new ExpressLrsHardwareError(
        "PARAMETER_NOT_FOUND",
        `Parameter ${parameterId} is not present in the current device table`,
      );
    }
    if (
      known.hidden ||
      (known.kind !== "number" && known.kind !== "selection")
    ) {
      throw new ExpressLrsHardwareError(
        "PARAMETER_NOT_WRITABLE",
        `Parameter ${known.name} is not an exposed numeric or selection setting`,
      );
    }
    const encoded = encodeParameterValue(known, value);
    await this.#link.write(
      createParameterWrite({
        destination: this.#identity.address,
        parameterId,
        value: encoded,
        origin: this.#identity.requestOrigin,
      }),
    );
    await sleep(80);
    const verifiedParameter = await this.readParameter(parameterId, signal);
    const verified = assertParameterValueEqual(verifiedParameter, value);
    if (!verified) {
      throw new ExpressLrsHardwareError(
        "WRITE_NOT_VERIFIED",
        `Parameter ${known.name} did not read back as ${value}`,
      );
    }
    return Object.freeze({
      parameter: verifiedParameter,
      requestedValue: value,
      verified,
    });
  }

  public async restoreSettingsBackup(
    backup: ExpressLrsSettingsBackup,
    signal?: AbortSignal,
  ): Promise<readonly ParameterWriteResult[]> {
    this.#assertOpen();
    if (
      backup.schemaVersion !== 1 ||
      !sameIdentity(backup.identity, this.#identity)
    ) {
      throw new ExpressLrsHardwareError(
        "BACKUP_MISMATCH",
        "The backup identity does not match the connected device",
      );
    }
    const results: ParameterWriteResult[] = [];
    for (const item of backup.values) {
      const current = this.#parameters.get(item.parameterId);
      if (
        current === undefined ||
        current.hidden ||
        current.name !== item.name ||
        (current.kind !== "number" && current.kind !== "selection")
      ) {
        throw new ExpressLrsHardwareError(
          "BACKUP_MISMATCH",
          `Backup parameter ${item.parameterId} no longer matches the connected device`,
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
          await this.writeParameter(item.parameterId, item.value, signal),
        );
      }
    }
    return Object.freeze(results);
  }

  async #requestCommandStatus(
    command: Extract<CrsfParameter, { readonly kind: "command" }>,
    step: number,
    signal?: AbortSignal,
  ): Promise<Extract<CrsfParameter, { readonly kind: "command" }>> {
    const chunks: Uint8Array[] = [];
    let chunksRemaining = 1;
    let chunkIndex = 0;
    while (chunksRemaining > 0) {
      if (chunkIndex >= 32) {
        throw new ExpressLrsHardwareError(
          "COMMAND_NOT_ACKNOWLEDGED",
          `The ${command.name} command response exceeded 32 chunks`,
        );
      }
      const frame = await this.#link.request(
        createParameterWrite({
          destination: this.#identity.address,
          parameterId: command.id,
          value: encodeCommandStep(
            chunkIndex === 0 ? step : CrsfCommandStep.query,
          ),
          origin: this.#identity.requestOrigin,
        }),
        (candidate) =>
          isParameterResponse(candidate, this.#identity.address, command.id),
        {
          timeoutMs:
            chunkIndex === 0 ? Math.max(command.timeoutMs, 2_000) : 1_500,
          signal,
        },
      );
      const chunk = parseParameterChunk(frame);
      if (chunk === null) {
        throw new ExpressLrsHardwareError(
          "COMMAND_NOT_ACKNOWLEDGED",
          `The ${command.name} command returned an invalid response`,
        );
      }
      chunks.push(chunk.data);
      chunksRemaining = chunk.chunksRemaining;
      chunkIndex += 1;
    }

    const parsed = parseCrsfParameter(command.id, concatBytes(...chunks));
    if (parsed.kind !== "command") {
      throw new ExpressLrsHardwareError(
        "COMMAND_NOT_ACKNOWLEDGED",
        `The ${command.name} command returned an unexpected parameter type`,
      );
    }
    return parsed;
  }

  public async executeCommand(
    commandName: string,
    signal?: AbortSignal,
  ): Promise<CommandExecutionResult> {
    this.#assertOpen();
    const command = this.parameters.find(
      (parameter) =>
        parameter.kind === "command" &&
        normalizedName(parameter.name) === normalizedName(commandName),
    );
    if (command === undefined || command.kind !== "command") {
      throw new ExpressLrsHardwareError(
        "COMMAND_NOT_FOUND",
        `The connected device does not expose the ${commandName} command`,
      );
    }

    let status = await this.#requestCommandStatus(
      command,
      CrsfCommandStep.click,
      signal,
    );
    if (status.step === CrsfCommandStep.askConfirm) {
      status = await this.#requestCommandStatus(
        command,
        CrsfCommandStep.confirmed,
        signal,
      );
    }

    const deadline = Date.now() + Math.max(command.timeoutMs + 4_000, 6_000);
    while (
      Date.now() < deadline &&
      (status.step === CrsfCommandStep.executing ||
        status.step === CrsfCommandStep.askConfirm ||
        status.step === CrsfCommandStep.confirmed)
    ) {
      await sleep(150);
      status = await this.#requestCommandStatus(
        command,
        CrsfCommandStep.query,
        signal,
      );
      if (status.step === CrsfCommandStep.askConfirm) {
        status = await this.#requestCommandStatus(
          command,
          CrsfCommandStep.confirmed,
          signal,
        );
      }
    }

    const acknowledged = status.step === CrsfCommandStep.idle;
    if (!acknowledged) {
      throw new ExpressLrsHardwareError(
        "COMMAND_NOT_ACKNOWLEDGED",
        `The ${commandName} command did not return to its verified idle state`,
      );
    }
    this.#parameters.set(command.id, status);
    return Object.freeze({
      parameter: status,
      finalStep: status.step,
      information: status.information,
      acknowledged,
    });
  }

  public async startBinding(signal?: AbortSignal): Promise<BindingResult> {
    this.#assertOpen();
    if (this.#identity.role === "tx") {
      const result = await this.executeCommand("Bind", signal);
      return Object.freeze({
        stage: "TX_BIND_COMMAND_ACKNOWLEDGED",
        verified: result.acknowledged,
        information:
          result.information || "The TX module acknowledged its Bind command",
      });
    }

    const response = this.#link.waitForFrame(
      (frame) => {
        const extended = asExtendedFrame(frame);
        return extended !== null && extended.origin === this.#identity.address;
      },
      { timeoutMs: 600, signal },
    );
    await this.#link.write(
      createReceiverBindCommand(CrsfAddress.flightController),
    );
    try {
      await response.promise;
      return Object.freeze({
        stage: "RX_BIND_COMMAND_TRANSMITTED",
        verified: false,
        information:
          "The RX emitted a CRSF response after the bind command, but this path cannot prove an RF bind without observing the paired transmitter link",
      });
    } catch (error: unknown) {
      if (error instanceof HardwareSerialError && error.code === "TIMEOUT") {
        await this.#link.write(createLegacyBindCommand());
        return Object.freeze({
          stage: "LEGACY_BIND_COMMAND_TRANSMITTED",
          verified: false,
          information:
            "Both current and legacy RX bind commands were transmitted; the RX protocol does not provide a definitive bind acknowledgement on this path",
        });
      }
      throw error;
    }
  }

  public async enterReceiverBootloader(
    input: {
      readonly targetKey?: string;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<ReceiverBootloaderResult> {
    this.#assertOpen();
    if (this.#identity.role !== "rx") {
      throw new ExpressLrsHardwareError(
        "BOOTLOADER_NOT_ACKNOWLEDGED",
        "The CRSF bootloader sequence is only valid for a receiver path",
      );
    }
    const textDecoder = new TextDecoder();
    let responseText = "";
    let resolveResponse: ((value: string) => void) | undefined;
    const response = new Promise<string>((resolve) => {
      resolveResponse = resolve;
    });
    const unsubscribe = this.#link.subscribeRaw((chunk) => {
      responseText += textDecoder.decode(chunk, { stream: true });
      const line = responseText
        .split(/\r?\n/u)
        .map((item) => item.trim())
        .find((item) => /^[A-Za-z0-9_.-]{3,80}$/u.test(item));
      if (line !== undefined) {
        resolveResponse?.(line);
      }
    });
    try {
      const train = new Uint8Array(32).fill(0x55);
      await this.#link.write(new Uint8Array([0x07, 0x07, 0x12, 0x20]));
      await this.#link.write(train);
      await sleep(200);
      await this.#link.write(
        createLegacyBootloaderCommand(input.targetKey ?? ""),
      );
      const target = await Promise.race([
        response,
        new Promise<string>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new ExpressLrsHardwareError(
                  "BOOTLOADER_NOT_ACKNOWLEDGED",
                  "The receiver did not return a bootloader target line",
                ),
              ),
            2_000,
          ),
        ),
      ]);
      if (input.signal?.aborted === true) {
        throw new HardwareSerialError(
          "ABORTED",
          "Bootloader entry was cancelled",
        );
      }
      if (
        input.targetKey !== undefined &&
        input.targetKey.length > 0 &&
        normalizedName(target) !== normalizedName(input.targetKey)
      ) {
        throw new ExpressLrsHardwareError(
          "BOOTLOADER_NOT_ACKNOWLEDGED",
          `Receiver bootloader reported ${target}, expected ${input.targetKey}`,
        );
      }
      return Object.freeze({ target, responseObserved: true });
    } finally {
      unsubscribe();
    }
  }

  public async close(): Promise<boolean> {
    if (this.#closed) {
      return true;
    }
    this.#closed = true;
    return this.#link.close();
  }

  public async detachPortForBootloader(): Promise<HardwareSerialPort> {
    this.#assertOpen();
    this.#closed = true;
    const closed = await this.#link.close();
    if (!closed) {
      throw new ExpressLrsHardwareError(
        "BOOTLOADER_NOT_ACKNOWLEDGED",
        "The CRSF serial port could not be released for bootloader access",
      );
    }
    return this.#port;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new ExpressLrsHardwareError(
        "SESSION_CLOSED",
        "The ExpressLRS hardware session is closed",
      );
    }
  }
}
