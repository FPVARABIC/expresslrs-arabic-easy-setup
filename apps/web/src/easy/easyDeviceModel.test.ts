import { describe, expect, it } from "vitest";

import {
  easyStateFromOutcome,
  easyTechnicalDetail,
  failureMessageKey,
  identityConfidence,
} from "./easyDeviceModel";
import type { ExpressLrsIdentity } from "../hardware/session";
import type { UserHardwareConnectOutcome } from "../hardware/userSession";

function identity(
  overrides: Partial<ExpressLrsIdentity> = {},
): ExpressLrsIdentity {
  return {
    validation: "CRSF_DEVICE_INFO",
    role: "tx",
    address: 0xea,
    requestOrigin: 0xef,
    productName: "Reference TX",
    firmwareVersion: "4.1.0",
    serialMarker: "ELRS",
    hardwareVersion: 3,
    softwareVersion: 7,
    parameterVersion: 1,
    parameterCount: 12,
    usb: { usbVendorId: 0x1209, usbProductId: 0x4f54 },
    ...overrides,
  } as ExpressLrsIdentity;
}

describe("Easy Mode device model", () => {
  it("treats a CRSF answer carrying the ExpressLRS marker as confirmed", () => {
    expect(identityConfidence(identity())).toBe("CONFIRMED");
  });

  it("refuses to confirm an identity without ExpressLRS evidence", () => {
    expect(
      identityConfidence(identity({ serialMarker: "XXXX" as never })),
    ).toBe("UNCONFIRMED");
    expect(identityConfidence(identity({ productName: "   " }))).toBe(
      "UNCONFIRMED",
    );
  });

  it("presents a confirmed device without inventing anything", () => {
    const outcome = {
      status: "CONNECTED",
      identity: identity(),
      parameters: [],
      session: {} as never,
      backup: {} as never,
    } as unknown as UserHardwareConnectOutcome;

    const state = easyStateFromOutcome(outcome);

    expect(state).toMatchObject({
      kind: "IDENTIFIED",
      identity: {
        productName: "Reference TX",
        firmwareVersion: "4.1.0",
        hardwareVersion: "3",
        role: "tx",
        confidence: "CONFIRMED",
      },
    });
  });

  it("refuses a connected device whose identity is not confirmed", () => {
    const outcome = {
      status: "CONNECTED",
      identity: identity({ serialMarker: "XXXX" as never }),
      parameters: [],
      session: {} as never,
      backup: {} as never,
    } as unknown as UserHardwareConnectOutcome;

    expect(easyStateFromOutcome(outcome)).toMatchObject({
      kind: "FAILED",
      messageKey: "easy.fail.UNKNOWN",
    });
  });

  it("maps each known failure to its own message and unknown ones to one honest message", () => {
    expect(failureMessageKey("TIMED_OUT")).toBe("easy.fail.TIMED_OUT");
    expect(failureMessageKey("CLEANUP_UNCONFIRMED")).toBe(
      "easy.fail.CLEANUP_UNCONFIRMED",
    );
    expect(failureMessageKey("SOMETHING_NEW")).toBe("easy.fail.UNKNOWN");
    expect(failureMessageKey("constructor")).toBe("easy.fail.UNKNOWN");
  });

  it("exports technical detail without USB serial identifiers", () => {
    const detail = easyTechnicalDetail({
      identity: {
        productName: "Reference TX",
        firmwareVersion: "4.1.0",
        hardwareVersion: "3",
        role: "tx",
        confidence: "CONFIRMED",
      },
      buildSha: "a".repeat(40),
      at: "2026-09-08T00:00:00.000Z",
    });

    expect(detail).toContain("hardware-validation: NONE");
    expect(detail).toContain("device-writes: LOCKED");
    expect(detail).not.toContain("usbVendorId");
    expect(detail).not.toContain("4f54");
  });
});
