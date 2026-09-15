import { describe, expect, it } from "vitest";

import {
  CrsfAddress,
  CrsfFrameType,
  CrsfStreamParser,
  concatBytes,
  encodeCrsfExtendedFrame,
  parseCrsfDeviceInfo,
} from "./crsf";

/**
 * What proves a device's role, byte by byte.
 *
 * A receiver flashed with transmitter firmware keeps the *receiver's* product
 * name: upstream writes `config['product_name']` from the catalog entry the
 * operator chose, which is still the receiver's entry
 * (`UnifiedConfiguration.py:226`, pinned `73ce820b`). So the display name of a
 * converted device reads something like "BetaFPV SuperD RX" while the device is
 * a transmitter. Inferring the role from that string would be wrong in exactly
 * the case that matters most.
 *
 * The role comes from the extended frame's **origin address** instead, which is
 * the endpoint's compiled-in `device_id`:
 *
 * | Pinned source | Fact |
 * | --- | --- |
 * | `src/include/crsf_protocol.h` | `CRSF_ADDRESS_CRSF_RECEIVER = 0xEC`, `CRSF_ADDRESS_CRSF_TRANSMITTER = 0xEE` |
 * | `src/lib/CrsfProtocol/CRSFEndpoint.cpp:431` | `sendDeviceInformationPacket()` calls `SetExtendedHeaderAndCrc(frame, CRSF_FRAMETYPE_DEVICE_INFO, size, requestOrigin, device_id)` |
 * | `src/lib/CrsfProtocol/CRSFRouter.cpp:111-115` | that signature is `(frame, frameType, frameSize, destAddr, origAddr)`, so `dest_addr = requestOrigin` and `orig_addr = device_id` |
 * | `src/lib/rx-crsf/RXEndpoint.cpp:14` | receiver firmware constructs `RxTxEndpoint(CRSF_ADDRESS_CRSF_RECEIVER)` |
 * | `src/lib/tx-crsf/TXModuleEndpoint.h:22` | transmitter firmware constructs `RxTxEndpoint(CRSF_ADDRESS_CRSF_TRANSMITTER)` |
 *
 * `device_id` is therefore fixed by which endpoint class the firmware compiled
 * in — that is, by the firmware's actual role — and cannot be influenced by the
 * hardware layout, the product name, or anything the operator selected here.
 *
 * Frame layout of DEVICE_INFO (`0x29`), which these fixtures build literally:
 *
 * ```
 * [0] device_addr     sync/address byte
 * [1] frame_size      type + payload + CRC
 * [2] type            0x29
 * [3] dest_addr       who asked (0x10 for a USB/serial requester)
 * [4] orig_addr       THIS DEVICE: 0xEC receiver, 0xEE transmitter  <-- the evidence
 * [5..] name          null-terminated UTF-8 display name            <-- NOT evidence
 *   +0  serialNo      u32 BE, 0x454C5253 "ELRS"
 *   +4  hardwareVer   u32 BE
 *   +8  softwareVer   u32 BE
 *   +12 fieldCnt      u8
 *   +13 paramVersion  u8
 * [last] crc8         DVB-S2 over type + payload
 * ```
 */

const ELRS_TAIL = new Uint8Array([
  0x45,
  0x4c,
  0x52,
  0x53, // serialNo "ELRS"
  0,
  0,
  0,
  0, // hardwareVer
  0,
  4,
  1,
  0, // softwareVer -> 4.1.0
  3, // fieldCnt
  0, // parameterVersion
]);

function deviceInfoFrame(input: {
  readonly name: string;
  readonly origin: number;
  readonly destination?: number;
}): Uint8Array {
  return encodeCrsfExtendedFrame({
    address: CrsfAddress.radio,
    type: CrsfFrameType.deviceInfo,
    destination: input.destination ?? CrsfAddress.usb,
    origin: input.origin,
    data: concatBytes(new TextEncoder().encode(`${input.name}\0`), ELRS_TAIL),
  });
}

function parsedRole(raw: Uint8Array) {
  const frame = new CrsfStreamParser().push(raw)[0];
  expect(frame).toBeDefined();
  return parseCrsfDeviceInfo(frame!);
}

describe("device role comes from the origin address, never the display name", () => {
  it("reads 0xEE as a transmitter even when the name says RX", () => {
    // This is the RX-as-TX case: transmitter firmware, receiver product name.
    const info = parsedRole(
      deviceInfoFrame({ name: "BetaFPV SuperD RX", origin: 0xee }),
    );

    expect(info?.origin).toBe(0xee);
    expect(info?.role).toBe("tx");
    expect(info?.name).toBe("BetaFPV SuperD RX");
  });

  it("reads 0xEC as a receiver even when the name says TX", () => {
    // The mirror image: a receiver whose product name happens to carry "TX"
    // must not be promoted to a transmitter by its name.
    const info = parsedRole(
      deviceInfoFrame({ name: "Happymodel EP1 TX-style", origin: 0xec }),
    );

    expect(info?.origin).toBe(0xec);
    expect(info?.role).toBe("rx");
  });

  it.each([
    ["an empty name", ""],
    ["a name that is only the word TX", "TX"],
    ["a name that is only the word RX", "RX"],
    ["a name containing both", "TX/RX Combo"],
    ["a name with no ASCII at all", "جهاز الإرسال"],
  ])("ignores %s and answers from the origin byte", (_label, name) => {
    expect(
      parsedRole(deviceInfoFrame({ name, origin: 0xee })?.slice())?.role,
    ).toBe("tx");
    expect(
      parsedRole(deviceInfoFrame({ name, origin: 0xec })?.slice())?.role,
    ).toBe("rx");
  });

  it("refuses to guess for an origin that is neither endpoint address", () => {
    // A flight controller, a Lua script or a radio relaying the frame is not a
    // role answer, and must not be treated as one.
    for (const origin of [
      CrsfAddress.flightController,
      CrsfAddress.radio,
      CrsfAddress.lua,
      CrsfAddress.usb,
      CrsfAddress.broadcast,
    ]) {
      expect(
        parsedRole(deviceInfoFrame({ name: "Module", origin }))?.role,
      ).toBe("unknown");
    }
  });

  it("puts the origin in the frame at byte 4, after the destination", () => {
    const raw = deviceInfoFrame({
      name: "Module",
      origin: 0xee,
      destination: CrsfAddress.usb,
    });

    // Asserted against the literal bytes so a future refactor cannot quietly
    // swap destination and origin and still pass.
    expect(raw[2]).toBe(0x29);
    expect(raw[3]).toBe(0x10);
    expect(raw[4]).toBe(0xee);
  });

  it("does not accept a frame whose ELRS marker is absent", () => {
    const raw = encodeCrsfExtendedFrame({
      address: CrsfAddress.radio,
      type: CrsfFrameType.deviceInfo,
      destination: CrsfAddress.usb,
      origin: 0xee,
      data: concatBytes(
        new TextEncoder().encode("Impostor\0"),
        new Uint8Array([0x00, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 4, 1, 0, 3, 0]),
      ),
    });

    const info = parsedRole(raw);
    expect(info?.role).toBe("tx");
    // The role byte is readable, but the device is not an ExpressLRS device,
    // and the session refuses to build an identity from it.
    expect(info?.expressLrsMarkerValid).toBe(false);
  });
});
