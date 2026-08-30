export const CRSF_MAX_FRAME_SIZE = 64 as const;
export const CRSF_CRC_POLY = 0xd5 as const;
const CRSF_STREAM_INPUT_SLICE_SIZE = 1_024 as const;

export const CrsfAddress = Object.freeze({
  broadcast: 0x00,
  usb: 0x10,
  wifi: 0x12,
  core: 0x80,
  flightController: 0xc8,
  radio: 0xea,
  receiver: 0xec,
  transmitter: 0xee,
  lua: 0xef,
} as const);

export const CrsfFrameType = Object.freeze({
  devicePing: 0x28,
  deviceInfo: 0x29,
  parameterEntry: 0x2b,
  parameterRead: 0x2c,
  parameterWrite: 0x2d,
  command: 0x32,
} as const);

export const CrsfParameterType = Object.freeze({
  uint8: 0,
  int8: 1,
  uint16: 2,
  int16: 3,
  uint32: 4,
  int32: 5,
  uint64: 6,
  int64: 7,
  float: 8,
  selection: 9,
  string: 10,
  folder: 11,
  info: 12,
  command: 13,
  vtx: 15,
  outOfRange: 127,
} as const);

export const CrsfCommandStep = Object.freeze({
  idle: 0,
  click: 1,
  executing: 2,
  askConfirm: 3,
  confirmed: 4,
  cancel: 5,
  query: 6,
} as const);

export type CrsfRole = "tx" | "rx";

export interface CrsfFrame {
  readonly address: number;
  readonly frameSize: number;
  readonly type: number;
  readonly payload: Uint8Array;
  readonly raw: Uint8Array;
}

export interface CrsfExtendedFrame extends CrsfFrame {
  readonly destination: number;
  readonly origin: number;
  readonly data: Uint8Array;
}

export interface CrsfDeviceInfo {
  readonly address: number;
  readonly destination: number;
  readonly origin: number;
  readonly role: CrsfRole | "unknown";
  readonly name: string;
  readonly serialNumber: number;
  readonly serialMarker: string;
  readonly hardwareVersion: number;
  readonly softwareVersion: number;
  readonly firmwareVersion: string;
  readonly fieldCount: number;
  readonly parameterVersion: number;
  readonly expressLrsMarkerValid: boolean;
}

interface CrsfParameterBase {
  readonly id: number;
  readonly parentId: number;
  readonly type: number;
  readonly hidden: boolean;
  readonly name: string;
  readonly rawValue: Uint8Array;
}

export interface CrsfNumericParameter extends CrsfParameterBase {
  readonly kind: "number";
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly units: string;
  readonly signed: boolean;
  readonly byteLength: 1 | 2 | 4;
}

export interface CrsfSelectionParameter extends CrsfParameterBase {
  readonly kind: "selection";
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly options: readonly string[];
  readonly units: string;
}

export interface CrsfStringParameter extends CrsfParameterBase {
  readonly kind: "string";
  readonly value: string;
}

export interface CrsfInfoParameter extends CrsfParameterBase {
  readonly kind: "info";
  readonly value: string;
}

export interface CrsfFolderParameter extends CrsfParameterBase {
  readonly kind: "folder";
  readonly childIds: readonly number[];
}

export interface CrsfCommandParameter extends CrsfParameterBase {
  readonly kind: "command";
  readonly step: number;
  readonly timeoutMs: number;
  readonly information: string;
}

export interface CrsfUnsupportedParameter extends CrsfParameterBase {
  readonly kind: "unsupported";
}

export type CrsfParameter =
  | CrsfNumericParameter
  | CrsfSelectionParameter
  | CrsfStringParameter
  | CrsfInfoParameter
  | CrsfFolderParameter
  | CrsfCommandParameter
  | CrsfUnsupportedParameter;

export interface CrsfParameterChunk {
  readonly parameterId: number;
  readonly chunksRemaining: number;
  readonly data: Uint8Array;
}

export function crc8DvbS2(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x80) !== 0
          ? ((crc << 1) ^ CRSF_CRC_POLY) & 0xff
          : (crc << 1) & 0xff;
    }
  }
  return crc;
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

export function encodeCrsfFrame(input: {
  readonly address?: number;
  readonly type: number;
  readonly payload?: Uint8Array;
}): Uint8Array {
  const payload = input.payload ?? new Uint8Array();
  const typeAndPayload = concatBytes(
    new Uint8Array([input.type & 0xff]),
    payload,
  );
  const frameSize = typeAndPayload.byteLength + 1;
  if (frameSize < 2 || frameSize > CRSF_MAX_FRAME_SIZE - 2) {
    throw new RangeError(
      `CRSF frame payload is outside the supported size: ${frameSize}`,
    );
  }
  return concatBytes(
    new Uint8Array([
      (input.address ?? CrsfAddress.flightController) & 0xff,
      frameSize,
    ]),
    typeAndPayload,
    new Uint8Array([crc8DvbS2(typeAndPayload)]),
  );
}

export function encodeCrsfExtendedFrame(input: {
  readonly address?: number;
  readonly type: number;
  readonly destination: number;
  readonly origin: number;
  readonly data?: Uint8Array;
}): Uint8Array {
  return encodeCrsfFrame({
    ...(input.address === undefined ? {} : { address: input.address }),
    type: input.type,
    payload: concatBytes(
      new Uint8Array([input.destination & 0xff, input.origin & 0xff]),
      input.data ?? new Uint8Array(),
    ),
  });
}

function isPlausibleAddress(value: number): boolean {
  return (
    value === 0xc8 ||
    value === 0xea ||
    value === 0xec ||
    value === 0xee ||
    value === 0xef ||
    value === 0x00 ||
    value === 0x10 ||
    value === 0x12 ||
    value === 0x80 ||
    value === 0x89
  );
}

function isCompleteValidFrameAt(bytes: Uint8Array, offset: number): boolean {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    return false;
  }
  const address = bytes[offset];
  const frameSize = bytes[offset + 1];
  if (
    address === undefined ||
    frameSize === undefined ||
    !isPlausibleAddress(address)
  ) {
    return false;
  }
  const totalSize = frameSize + 2;
  if (
    frameSize < 2 ||
    totalSize > CRSF_MAX_FRAME_SIZE ||
    offset + totalSize > bytes.byteLength
  ) {
    return false;
  }
  const typeAndPayload = bytes.slice(offset + 2, offset + totalSize - 1);
  const expectedCrc = bytes[offset + totalSize - 1];
  return expectedCrc !== undefined && crc8DvbS2(typeAndPayload) === expectedCrc;
}

function findNextCompleteValidFrameOffset(bytes: Uint8Array): number {
  for (let offset = 1; offset + 4 <= bytes.byteLength; offset += 1) {
    if (isCompleteValidFrameAt(bytes, offset)) {
      return offset;
    }
  }
  return -1;
}

export class CrsfStreamParser {
  #buffer: Uint8Array<ArrayBufferLike> = new Uint8Array();

  public push(chunk: Uint8Array): readonly CrsfFrame[] {
    if (chunk.byteLength === 0) {
      return Object.freeze([]);
    }
    const frames: CrsfFrame[] = [];

    for (
      let chunkOffset = 0;
      chunkOffset < chunk.byteLength;
      chunkOffset += CRSF_STREAM_INPUT_SLICE_SIZE
    ) {
      this.#buffer = concatBytes(
        this.#buffer,
        chunk.slice(chunkOffset, chunkOffset + CRSF_STREAM_INPUT_SLICE_SIZE),
      );
      this.#drain(frames);
    }

    return Object.freeze(frames);
  }

  #drain(frames: CrsfFrame[]): void {
    while (this.#buffer.byteLength >= 4) {
      if (!isPlausibleAddress(this.#buffer[0] ?? -1)) {
        this.#buffer = this.#buffer.slice(1);
        continue;
      }
      const frameSize = this.#buffer[1] ?? 0;
      const totalSize = frameSize + 2;
      if (frameSize < 2 || totalSize > CRSF_MAX_FRAME_SIZE) {
        this.#buffer = this.#buffer.slice(1);
        continue;
      }
      if (this.#buffer.byteLength < totalSize) {
        const nextValidOffset = findNextCompleteValidFrameOffset(this.#buffer);
        if (nextValidOffset >= 0) {
          this.#buffer = this.#buffer.slice(nextValidOffset);
          continue;
        }
        break;
      }

      const raw = this.#buffer.slice(0, totalSize);
      const typeAndPayload = raw.slice(2, totalSize - 1);
      const expectedCrc = raw[totalSize - 1];
      if (
        expectedCrc === undefined ||
        crc8DvbS2(typeAndPayload) !== expectedCrc
      ) {
        this.#buffer = this.#buffer.slice(1);
        continue;
      }

      const type = raw[2];
      const address = raw[0];
      if (type === undefined || address === undefined) {
        this.#buffer = this.#buffer.slice(1);
        continue;
      }
      frames.push(
        Object.freeze({
          address,
          frameSize,
          type,
          payload: raw.slice(3, totalSize - 1),
          raw,
        }),
      );
      this.#buffer = this.#buffer.slice(totalSize);
    }
  }

  public reset(): void {
    this.#buffer = new Uint8Array();
  }
}

export function asExtendedFrame(frame: CrsfFrame): CrsfExtendedFrame | null {
  if (frame.payload.byteLength < 2 || frame.type < 0x28) {
    return null;
  }
  const destination = frame.payload[0];
  const origin = frame.payload[1];
  if (destination === undefined || origin === undefined) {
    return null;
  }
  return Object.freeze({
    ...frame,
    destination,
    origin,
    data: frame.payload.slice(2),
  });
}

function readU32Be(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new RangeError("CRSF payload ended before a 32-bit value");
  }
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(offset, false);
}

function versionFromU32(value: number): string {
  const major = (value >>> 16) & 0xff;
  const minor = (value >>> 8) & 0xff;
  const patch = value & 0xff;
  return `${major}.${minor}.${patch}`;
}

function printableAsciiFromU32(value: number): string {
  const bytes = new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
  return Array.from(bytes, (byte) =>
    byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".",
  ).join("");
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function nullTerminated(
  bytes: Uint8Array,
  start: number,
): { readonly value: string; readonly next: number } {
  if (start < 0 || start > bytes.byteLength) {
    throw new RangeError("Invalid CRSF string offset");
  }
  const relativeEnd = bytes.slice(start).indexOf(0);
  if (relativeEnd < 0) {
    throw new TypeError("CRSF string is missing its null terminator");
  }
  const end = start + relativeEnd;
  return Object.freeze({
    value: decodeText(bytes.slice(start, end)),
    next: end + 1,
  });
}

export function parseCrsfDeviceInfo(frame: CrsfFrame): CrsfDeviceInfo | null {
  if (frame.type !== CrsfFrameType.deviceInfo) {
    return null;
  }
  const extended = asExtendedFrame(frame);
  if (extended === null) {
    return null;
  }
  const name = nullTerminated(extended.data, 0);
  if (name.next + 14 > extended.data.byteLength) {
    return null;
  }
  const serialNumber = readU32Be(extended.data, name.next);
  const hardwareVersion = readU32Be(extended.data, name.next + 4);
  const softwareVersion = readU32Be(extended.data, name.next + 8);
  const fieldCount = extended.data[name.next + 12];
  const parameterVersion = extended.data[name.next + 13];
  if (fieldCount === undefined || parameterVersion === undefined) {
    return null;
  }
  const role: CrsfRole | "unknown" =
    extended.origin === CrsfAddress.transmitter
      ? "tx"
      : extended.origin === CrsfAddress.receiver
        ? "rx"
        : "unknown";
  return Object.freeze({
    address: frame.address,
    destination: extended.destination,
    origin: extended.origin,
    role,
    name: name.value,
    serialNumber,
    serialMarker: printableAsciiFromU32(serialNumber),
    hardwareVersion,
    softwareVersion,
    firmwareVersion: versionFromU32(softwareVersion),
    fieldCount,
    parameterVersion,
    expressLrsMarkerValid: serialNumber === 0x454c5253,
  });
}

export function createDevicePing(origin: number = CrsfAddress.usb): Uint8Array {
  return encodeCrsfExtendedFrame({
    type: CrsfFrameType.devicePing,
    destination: CrsfAddress.broadcast,
    origin,
  });
}

export function createParameterRead(input: {
  readonly destination: number;
  readonly parameterId: number;
  readonly chunk: number;
  readonly origin?: number;
}): Uint8Array {
  return encodeCrsfExtendedFrame({
    type: CrsfFrameType.parameterRead,
    destination: input.destination,
    origin: input.origin ?? CrsfAddress.usb,
    data: new Uint8Array([input.parameterId & 0xff, input.chunk & 0xff]),
  });
}

export function createParameterWrite(input: {
  readonly destination: number;
  readonly parameterId: number;
  readonly value: Uint8Array;
  readonly origin?: number;
}): Uint8Array {
  return encodeCrsfExtendedFrame({
    type: CrsfFrameType.parameterWrite,
    destination: input.destination,
    origin: input.origin ?? CrsfAddress.usb,
    data: concatBytes(new Uint8Array([input.parameterId & 0xff]), input.value),
  });
}

export function createReceiverBindCommand(
  origin: number = CrsfAddress.flightController,
): Uint8Array {
  return encodeCrsfExtendedFrame({
    type: CrsfFrameType.command,
    destination: CrsfAddress.receiver,
    origin,
    data: new Uint8Array([0x10, 0x01]),
  });
}

export function createLegacyBootloaderCommand(targetKey = ""): Uint8Array {
  const encodedKey = new TextEncoder().encode(targetKey);
  const frameWithoutCrc = concatBytes(
    new Uint8Array([
      CrsfAddress.receiver,
      4 + encodedKey.byteLength,
      CrsfFrameType.command,
      "b".charCodeAt(0),
      "l".charCodeAt(0),
    ]),
    encodedKey,
  );
  return concatBytes(
    frameWithoutCrc,
    new Uint8Array([crc8DvbS2(frameWithoutCrc.slice(2))]),
  );
}

export function createLegacyBindCommand(targetKey = ""): Uint8Array {
  const encodedKey = new TextEncoder().encode(targetKey);
  const frameWithoutCrc = concatBytes(
    new Uint8Array([
      CrsfAddress.receiver,
      4 + encodedKey.byteLength,
      CrsfFrameType.command,
      "b".charCodeAt(0),
      "d".charCodeAt(0),
    ]),
    encodedKey,
  );
  return concatBytes(
    frameWithoutCrc,
    new Uint8Array([crc8DvbS2(frameWithoutCrc.slice(2))]),
  );
}

export function parseParameterChunk(
  frame: CrsfFrame,
): CrsfParameterChunk | null {
  if (frame.type !== CrsfFrameType.parameterEntry) {
    return null;
  }
  const extended = asExtendedFrame(frame);
  if (extended === null || extended.data.byteLength < 2) {
    return null;
  }
  const parameterId = extended.data[0];
  const chunksRemaining = extended.data[1];
  if (parameterId === undefined || chunksRemaining === undefined) {
    return null;
  }
  return Object.freeze({
    parameterId,
    chunksRemaining,
    data: extended.data.slice(2),
  });
}

function requireBytes(bytes: Uint8Array, offset: number, count: number): void {
  if (offset < 0 || count < 0 || offset + count > bytes.byteLength) {
    throw new TypeError("CRSF parameter payload is truncated");
  }
}

function readInteger(
  bytes: Uint8Array,
  offset: number,
  byteLength: 1 | 2 | 4,
  signed: boolean,
): number {
  requireBytes(bytes, offset, byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (byteLength === 1) {
    return signed ? view.getInt8(offset) : view.getUint8(offset);
  }
  if (byteLength === 2) {
    return signed
      ? view.getInt16(offset, false)
      : view.getUint16(offset, false);
  }
  return signed ? view.getInt32(offset, false) : view.getUint32(offset, false);
}

function parseNumericParameter(
  base: CrsfParameterBase,
  body: Uint8Array,
  byteLength: 1 | 2 | 4,
  signed: boolean,
): CrsfNumericParameter {
  const valuesSize = byteLength * 4;
  requireBytes(body, 0, valuesSize);
  const units = nullTerminated(body, valuesSize).value;
  return Object.freeze({
    ...base,
    kind: "number",
    value: readInteger(body, 0, byteLength, signed),
    min: readInteger(body, byteLength, byteLength, signed),
    max: readInteger(body, byteLength * 2, byteLength, signed),
    defaultValue: readInteger(body, byteLength * 3, byteLength, signed),
    units,
    signed,
    byteLength,
  });
}

export function parseCrsfParameter(
  parameterId: number,
  assembledData: Uint8Array,
): CrsfParameter {
  requireBytes(assembledData, 0, 2);
  const parentId = assembledData[0];
  const encodedType = assembledData[1];
  if (parentId === undefined || encodedType === undefined) {
    throw new TypeError("CRSF parameter header is truncated");
  }
  const hidden = (encodedType & 0x80) !== 0;
  const type = encodedType & 0x7f;
  const name = nullTerminated(assembledData, 2);
  const body = assembledData.slice(name.next);
  const base: CrsfParameterBase = Object.freeze({
    id: parameterId,
    parentId,
    type,
    hidden,
    name: name.value,
    rawValue: body,
  });

  switch (type) {
    case CrsfParameterType.uint8:
      return parseNumericParameter(base, body, 1, false);
    case CrsfParameterType.int8:
      return parseNumericParameter(base, body, 1, true);
    case CrsfParameterType.uint16:
      return parseNumericParameter(base, body, 2, false);
    case CrsfParameterType.int16:
      return parseNumericParameter(base, body, 2, true);
    case CrsfParameterType.uint32:
      return parseNumericParameter(base, body, 4, false);
    case CrsfParameterType.int32:
      return parseNumericParameter(base, body, 4, true);
    case CrsfParameterType.selection: {
      const options = nullTerminated(body, 0);
      requireBytes(body, options.next, 4);
      const value = body[options.next];
      const min = body[options.next + 1];
      const max = body[options.next + 2];
      const defaultValue = body[options.next + 3];
      if (
        value === undefined ||
        min === undefined ||
        max === undefined ||
        defaultValue === undefined
      ) {
        throw new TypeError("CRSF selection payload is truncated");
      }
      const units = nullTerminated(body, options.next + 4).value;
      return Object.freeze({
        ...base,
        kind: "selection",
        value,
        min,
        max,
        defaultValue,
        options: Object.freeze(options.value.split(";")),
        units,
      });
    }
    case CrsfParameterType.string:
      return Object.freeze({
        ...base,
        kind: "string",
        value: nullTerminated(body, 0).value,
      });
    case CrsfParameterType.info:
      return Object.freeze({
        ...base,
        kind: "info",
        value: nullTerminated(body, 0).value,
      });
    case CrsfParameterType.folder: {
      const dynamicName = nullTerminated(body, 0);
      const childIds: number[] = [];
      for (
        let offset = dynamicName.next;
        offset < body.byteLength;
        offset += 1
      ) {
        const value = body[offset];
        if (value === undefined || value === 0xff) {
          break;
        }
        childIds.push(value);
      }
      return Object.freeze({
        ...base,
        name: dynamicName.value || base.name,
        kind: "folder",
        childIds: Object.freeze(childIds),
      });
    }
    case CrsfParameterType.command: {
      requireBytes(body, 0, 2);
      const step = body[0];
      const timeoutUnits = body[1];
      if (step === undefined || timeoutUnits === undefined) {
        throw new TypeError("CRSF command payload is truncated");
      }
      return Object.freeze({
        ...base,
        kind: "command",
        step,
        timeoutMs: timeoutUnits * 10,
        information: nullTerminated(body, 2).value,
      });
    }
    default:
      return Object.freeze({ ...base, kind: "unsupported" });
  }
}

export function encodeParameterValue(
  parameter: CrsfParameter,
  value: number,
): Uint8Array {
  if (parameter.kind === "selection") {
    if (
      !Number.isSafeInteger(value) ||
      value < parameter.min ||
      value > parameter.max
    ) {
      throw new RangeError(
        `Selection value is outside ${parameter.min}-${parameter.max}`,
      );
    }
    return new Uint8Array([value]);
  }
  if (parameter.kind !== "number") {
    throw new TypeError(
      `Parameter ${parameter.id} is not a writable numeric value`,
    );
  }
  if (
    !Number.isSafeInteger(value) ||
    value < parameter.min ||
    value > parameter.max
  ) {
    throw new RangeError(
      `Numeric value is outside ${parameter.min}-${parameter.max}`,
    );
  }
  const bytes = new Uint8Array(parameter.byteLength);
  const view = new DataView(bytes.buffer);
  if (parameter.byteLength === 1) {
    if (parameter.signed) view.setInt8(0, value);
    else view.setUint8(0, value);
  } else if (parameter.byteLength === 2) {
    if (parameter.signed) view.setInt16(0, value, false);
    else view.setUint16(0, value, false);
  } else if (parameter.signed) {
    view.setInt32(0, value, false);
  } else {
    view.setUint32(0, value, false);
  }
  return bytes;
}

export function encodeCommandStep(step: number): Uint8Array {
  if (
    !Number.isSafeInteger(step) ||
    step < CrsfCommandStep.idle ||
    step > CrsfCommandStep.query
  ) {
    throw new RangeError("Invalid CRSF command step");
  }
  return new Uint8Array([step]);
}
