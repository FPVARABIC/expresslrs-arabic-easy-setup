import type { ExpressLrsIdentity } from "./session";
import type { OfficialTarget } from "./parity-types";
import type { TargetMatchResult } from "./target-match";

export interface ReconnectTargetVerification {
  readonly verified: boolean;
  readonly reason:
    | "EXACT_CATALOG_MATCH"
    | "SAME_DEVICE_AND_MANUAL_TARGET"
    | "ROLE_MISMATCH"
    | "PHYSICAL_IDENTITY_MISMATCH"
    | "TARGET_EVIDENCE_MISSING";
}

function samePhysicalIdentity(
  expected: ExpressLrsIdentity,
  actual: ExpressLrsIdentity,
): boolean {
  return (
    expected.role === actual.role &&
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
}): ReconnectTargetVerification {
  if (input.afterIdentity.role !== input.expectedTarget.role) {
    return Object.freeze({ verified: false, reason: "ROLE_MISMATCH" });
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
