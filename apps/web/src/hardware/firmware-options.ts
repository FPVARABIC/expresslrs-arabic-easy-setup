import type { ExpressLrsFirmwareOptions, OfficialTarget } from "./parity-types";

export class FirmwareOptionsError extends Error {
  public constructor(
    public readonly field: keyof ExpressLrsFirmwareOptions,
    message: string,
  ) {
    super(message);
    this.name = "FirmwareOptionsError";
  }
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
}): ExpressLrsFirmwareOptions {
  const options = input.options;
  const region = boundedText("region", options.region, 64, false);
  const domain = boundedInteger("domain", options.domain, 0, 255);
  const bindPhrase = boundedText("bindPhrase", options.bindPhrase, 192, true);
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
    receiverAsTransmitter: options.receiverAsTransmitter === true,
  });

  if (input.target.role === "tx" && validated.receiverAsTransmitter) {
    throw new FirmwareOptionsError(
      "receiverAsTransmitter",
      "Receiver-as-transmitter mode is invalid for a TX Target",
    );
  }
  return validated;
}
