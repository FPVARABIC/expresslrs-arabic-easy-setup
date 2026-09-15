import type { ExpressLrsIdentity } from "./session";
import type { OfficialTarget } from "./parity-types";
import type { TargetMatchResult } from "./target-match";
import type { RxAsTxMode } from "./rx-as-tx";

export interface ReconnectTargetVerification {
  readonly verified: boolean;
  readonly reason:
    | "EXACT_CATALOG_MATCH"
    | "SAME_DEVICE_AND_MANUAL_TARGET"
    | "RX_AS_TX_ROLE_CONFIRMED"
    | "RX_AS_TX_ROLE_NOT_APPLIED"
    | "ROLE_MISMATCH"
    | "PHYSICAL_IDENTITY_MISMATCH"
    | "TARGET_EVIDENCE_MISSING";
}

function samePhysicalIdentity(
  expected: ExpressLrsIdentity,
  actual: ExpressLrsIdentity,
  /**
   * An rx-as-tx write deliberately changes the role, so that one field is
   * compared by the caller against the role it *should* now report instead.
   */
  options: { readonly ignoreRole?: boolean } = {},
): boolean {
  return (
    (options.ignoreRole === true || expected.role === actual.role) &&
    expected.productName === actual.productName &&
    expected.hardwareVersion === actual.hardwareVersion &&
    expected.serialMarker === actual.serialMarker &&
    expected.usb.usbVendorId === actual.usb.usbVendorId &&
    expected.usb.usbProductId === actual.usb.usbProductId
  );
}

export function verifyReconnectTarget(input: {
  readonly expectedTarget: OfficialTarget;
  readonly beforeIdentity: ExpressLrsIdentity | null;
  readonly afterIdentity: ExpressLrsIdentity;
  readonly match: TargetMatchResult;
  readonly manualTargetConfirmed: boolean;
  /** `"off"` unless this write was an rx-as-tx role change. */
  readonly rxAsTxMode?: RxAsTxMode;
}): ReconnectTargetVerification {
  const rxAsTx = (input.rxAsTxMode ?? "off") !== "off";
  // An rx-as-tx write is only successful if the device comes back as a
  // transmitter. Writing the bytes, seeing the hash change or merely
  // reconnecting proves nothing about the role.
  const expectedRole = rxAsTx ? "tx" : input.expectedTarget.role;
  if (input.afterIdentity.role !== expectedRole) {
    return Object.freeze({
      verified: false,
      reason: rxAsTx ? "RX_AS_TX_ROLE_NOT_APPLIED" : "ROLE_MISMATCH",
    });
  }
  if (rxAsTx) {
    // The chosen catalog entry is still the receiver's, so an exact match
    // against it would now be the wrong answer. What must hold instead is that
    // this is the same physical unit as before, now reporting a transmitter
    // role.
    if (input.beforeIdentity === null) {
      return Object.freeze({
        verified: false,
        reason: "TARGET_EVIDENCE_MISSING",
      });
    }
    if (
      !samePhysicalIdentity(input.beforeIdentity, input.afterIdentity, {
        ignoreRole: true,
      })
    ) {
      return Object.freeze({
        verified: false,
        reason: "PHYSICAL_IDENTITY_MISMATCH",
      });
    }
    if (!input.manualTargetConfirmed) {
      return Object.freeze({
        verified: false,
        reason: "TARGET_EVIDENCE_MISSING",
      });
    }
    return Object.freeze({
      verified: true,
      reason: "RX_AS_TX_ROLE_CONFIRMED",
    });
  }
  if (
    input.match.confidence === "EXACT" &&
    input.match.selected?.id === input.expectedTarget.id
  ) {
    return Object.freeze({
      verified: true,
      reason: "EXACT_CATALOG_MATCH",
    });
  }
  if (input.beforeIdentity === null) {
    return Object.freeze({
      verified: false,
      reason: "TARGET_EVIDENCE_MISSING",
    });
  }
  if (!samePhysicalIdentity(input.beforeIdentity, input.afterIdentity)) {
    return Object.freeze({
      verified: false,
      reason: "PHYSICAL_IDENTITY_MISMATCH",
    });
  }
  if (!input.manualTargetConfirmed) {
    return Object.freeze({
      verified: false,
      reason: "TARGET_EVIDENCE_MISSING",
    });
  }
  return Object.freeze({
    verified: true,
    reason: "SAME_DEVICE_AND_MANUAL_TARGET",
  });
}
