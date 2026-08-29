import { describe, expect, it } from "vitest";

import {
  CrsfAddress,
  CrsfFrameType,
  CrsfStreamParser,
  concatBytes,
  crc8DvbS2,
  createDevicePing,
  createLegacyBindCommand,
  createLegacyBootloaderCommand,
  encodeCrsfExtendedFrame,
  encodeParameterValue,
  parseCrsfDeviceInfo,
  parseCrsfParameter,
} from "./crsf";

describe("CRSF hardware protocol", () => {
  it("encodes the official DVB-S2 CRC device ping and parses chunked input", () => {
    const ping = createDevicePing(CrsfAddress.core);
    expect([...ping]).toEqual([0xc8, 0x04, 0x28, 0x00, 0x80, 0x3b]);
    expect(crc8DvbS2(ping.slice(2, -1))).toBe(ping.at(-1));

    const parser = new CrsfStreamParser();
    expect(parser.push(ping.slice(0, 2))).toHaveLength(0);
    expect(parser.push(ping.slice(2))).toEqual([
      expect.objectContaining({
        address: CrsfAddress.flightController,
        type: CrsfFrameType.devicePing,
        payload: new Uint8Array([
          CrsfAddress.broadcast,
          CrsfAddress.core,
        ]),
      }),
    ]);
  });

  it("rejects corrupt frames and resynchronizes on the next valid frame", () => {
    const valid = createDevicePing(CrsfAddress.usb);
    const corrupt = valid.slice();
    const crcIndex = corrupt.byteLength - 1;
    corrupt[crcIndex] = (corrupt[crcIndex] ?? 0) ^ 0xff;
    const parser = new CrsfStreamParser();

    const frames = parser.push(concatBytes(corrupt, valid));

    expect(frames).toHaveLength(1);
    expect(frames[0]?.raw).toEqual(valid);
  });

  it("decodes DEVICE_INFO and requires the ELRS marker", () => {
    const data = concatBytes(
      new TextEncoder().encode("Example TX\0"),
      new Uint8Array([
        0x45,
        0x4c,
        0x52,
        0x53,
        0,
        0,
        0,
        0,
        0,
        4,
        1,
        0,
        3,
        0,
      ]),
    );
    const raw = encodeCrsfExtendedFrame({
      address: CrsfAddress.radio,
      type: CrsfFrameType.deviceInfo,
      destination: CrsfAddress.usb,
      origin: CrsfAddress.transmitter,
      data,
    });
    const frame = new CrsfStreamParser().push(raw)[0];

    expect(frame).toBeDefined();
    expect(parseCrsfDeviceInfo(frame!)).toEqual(
      expect.objectContaining({
        role: "tx",
        name: "Example TX",
        serialMarker: "ELRS",
        expressLrsMarkerValid: true,
        firmwareVersion: "4.1.0",
        fieldCount: 3,
      }),
    );
  });

  it("decodes writable numeric and selection parameters", () => {
    const selection = parseCrsfParameter(
      7,
      concatBytes(
        new Uint8Array([0, 9]),
        new TextEncoder().encode("Packet Rate\0"),
        new TextEncoder().encode("50Hz;100Hz;250Hz\0"),
        new Uint8Array([1, 0, 2, 1]),
        new TextEncoder().encode("Hz\0"),
      ),
    );
    const number = parseCrsfParameter(
      8,
      concatBytes(
        new Uint8Array([0, 2]),
        new TextEncoder().encode("Power\0"),
        new Uint8Array([
          0x00,
          0x64,
          0x00,
          0x0a,
          0x03,
          0xe8,
          0x00,
          0x64,
        ]),
        new TextEncoder().encode("mW\0"),
      ),
    );

    expect(selection).toEqual(
      expect.objectContaining({
        kind: "selection",
        value: 1,
        options: ["50Hz", "100Hz", "250Hz"],
      }),
    );
    expect(number).toEqual(
      expect.objectContaining({
        kind: "number",
        value: 100,
        min: 10,
        max: 1000,
        byteLength: 2,
      }),
    );
    expect(encodeParameterValue(number, 250)).toEqual(
      new Uint8Array([0x00, 0xfa]),
    );
  });

  it("builds the real legacy bind and bootloader sequences with target keys", () => {
    const bind = createLegacyBindCommand();
    const bootloader = createLegacyBootloaderCommand("ESP82");

    expect([...bind.slice(0, 5)]).toEqual([
      0xec,
      0x04,
      0x32,
      0x62,
      0x64,
    ]);
    expect(bind.at(-1)).toBe(crc8DvbS2(bind.slice(2, -1)));
    expect([...bootloader.slice(0, 5)]).toEqual([
      0xec,
      0x09,
      0x32,
      0x62,
      0x6c,
    ]);
    expect(new TextDecoder().decode(bootloader.slice(5, -1))).toBe("ESP82");
    expect(bootloader.at(-1)).toBe(crc8DvbS2(bootloader.slice(2, -1)));
  });
});
