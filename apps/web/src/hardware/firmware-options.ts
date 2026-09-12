import { evaluateRxAsTxSupport, RX_AS_TX_ACTIVE_MODES } from "./rx-as-tx";
import type { RxAsTxActiveMode, RxAsTxMode } from "./rx-as-tx";
import type {
  ExpressLrsFirmwareOptions,
  OfficialRelease,
  OfficialTarget,
} from "./parity-types";

export class FirmwareOptionsError extends Error {
  public constructor(
    public readonly field: keyof ExpressLrsFirmwareOptions,
    message: string,
  ) {
    super(message);
    this.name = "FirmwareOptionsError";
  }
}

function validatedRxAsTxMode(value: unknown): RxAsTxMode {
  if (value === undefined || value === "off") return "off";
  if (RX_AS_TX_ACTIVE_MODES.includes(value as RxAsTxActiveMode)) {
    return value as RxAsTxActiveMode;
  }
  throw new FirmwareOptionsError(
    "rxAsTxMode",
    `rxAsTxMode must be one of off, ${RX_AS_TX_ACTIVE_MODES.join(", ")}`,
  );
}

function boundedInteger(
  field: keyof ExpressLrsFirmwareOptions,
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new FirmwareOptionsError(
      field,
      `${String(field)} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function boundedText(
  field: keyof ExpressLrsFirmwareOptions,
  value: string,
  maximumUtf8Bytes: number,
  allowEmpty: boolean,
): string {
  const normalized = value.normalize("NFC");
  if (!allowEmpty && normalized.length === 0) {
    throw new FirmwareOptionsError(field, `${String(field)} is required`);
  }
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) {
    throw new FirmwareOptionsError(
      field,
      `${String(field)} contains control characters`,
    );
  }
  if (new TextEncoder().encode(normalized).byteLength > maximumUtf8Bytes) {
    throw new FirmwareOptionsError(
      field,
      `${String(field)} exceeds ${maximumUtf8Bytes} UTF-8 bytes`,
    );
  }
  return normalized;
}

export function validateFirmwareOptions(input: {
  readonly target: OfficialTarget;
  readonly options: ExpressLrsFirmwareOptions;
  /** Optional: lets the AirPort check reject a release that predates it. */
  readonly release?: OfficialRelease;
}): ExpressLrsFirmwareOptions {
  const options = input.options;
  const region = boundedText("region", options.region, 64, false);
  const domain = boundedInteger("domain", options.domain, 0, 255);
  // 128 characters is the bound the UID derivation itself enforces. Accepting
  // more here would pass validation and then throw inside packaging, which
  // reads as a build failure rather than as an input the operator can fix.
  const bindPhrase = boundedText("bindPhrase", options.bindPhrase, 128, true);
  const wifiSsid = boundedText("wifiSsid", options.wifiSsid, 32, true);
  const wifiPassword = boundedText(
    "wifiPassword",
    options.wifiPassword,
    64,
    true,
  );
  if (
    wifiPassword.length > 0 &&
    (new TextEncoder().encode(wifiPassword).byteLength < 8 ||
      new TextEncoder().encode(wifiPassword).byteLength > 63)
  ) {
    throw new FirmwareOptionsError(
      "wifiPassword",
      "Wi-Fi password must contain 8-63 UTF-8 bytes when configured",
    );
  }

  const validated: ExpressLrsFirmwareOptions = Object.freeze({
    region,
    domain,
    bindPhrase,
    wifiSsid,
    wifiPassword,
    wifiAutoOnInterval: boundedInteger(
      "wifiAutoOnInterval",
      options.wifiAutoOnInterval,
      0,
      86_400,
    ),
    fanRuntime: boundedInteger("fanRuntime", options.fanRuntime, 0, 86_400),
    telemetryInterval: boundedInteger(
      "telemetryInterval",
      options.telemetryInterval,
      0,
      65_535,
    ),
    uartInverted: options.uartInverted === true,
    unlockHigherPower: options.unlockHigherPower === true,
    receiverUartBaud: boundedInteger(
      "receiverUartBaud",
      options.receiverUartBaud,
      9_600,
      2_000_000,
    ),
    receiverInvertTx: options.receiverInvertTx === true,
    lockOnFirstConnection: options.lockOnFirstConnection === true,
    r9mmMiniSbus: options.r9mmMiniSbus === true,
    rxAsTxMode: validatedRxAsTxMode(options.rxAsTxMode),
    // Deliberately read from its own field. AirPort and RX-as-TX are separate
    // upstream features; deriving one from the other is the defect this
    // replaced.
    airportEnabled: options.airportEnabled === true,
  });

  if (validated.rxAsTxMode !== "off") {
    // Whether a receiver can be flashed with transmitter firmware follows from
    // upstream's platform gate and from whether a `_TX` artifact exists for it
    // — never from the project's build stage.
    const support = evaluateRxAsTxSupport({
      target: input.target,
      mode: validated.rxAsTxMode,
    });
    if (!support.supported) {
      throw new FirmwareOptionsError(
        "rxAsTxMode",
        `UNSUPPORTED_BY_TARGET (${support.reason}): ${support.targetName === "" ? "no target" : support.targetName} on platform ${support.platform === "" ? "unknown" : support.platform} cannot be flashed as a transmitter in ${validated.rxAsTxMode} mode${support.availableModes.length === 0 ? "" : ` (it accepts: ${support.availableModes.join(", ")})`}`,
      );
    }
  }
  return validated;
}
