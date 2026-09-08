import type { MessageKey } from "@elrs-easy/i18n";

import type { ExpressLrsIdentity } from "../hardware/session";
import type { UserHardwareConnectOutcome } from "../hardware/userSession";

/**
 * Easy Mode never invents a device state. Every value here is derived from a
 * live CRSF answer produced by the same session service the Advanced workbench
 * uses, so the two modes cannot disagree about what is connected.
 */
export type EasyIdentityConfidence = "CONFIRMED" | "UNCONFIRMED";

export interface EasyIdentityView {
  readonly productName: string;
  readonly firmwareVersion: string;
  readonly hardwareVersion: string;
  readonly role: "tx" | "rx";
  readonly confidence: EasyIdentityConfidence;
}

export type EasyDeviceState =
  | Readonly<{ kind: "IDLE" }>
  | Readonly<{ kind: "CONNECTING" }>
  | Readonly<{ kind: "IDENTIFIED"; identity: EasyIdentityView }>
  | Readonly<{ kind: "FAILED"; messageKey: MessageKey; detail: string }>;

/**
 * A CRSF Device Info answer carrying the ExpressLRS serial marker is the only
 * evidence this preview treats as a confirmed identity. Anything else stays
 * UNCONFIRMED rather than being guessed into a model name.
 */
export function identityConfidence(
  identity: ExpressLrsIdentity,
): EasyIdentityConfidence {
  return identity.validation === "CRSF_DEVICE_INFO" &&
    identity.serialMarker === "ELRS" &&
    identity.productName.trim().length > 0
    ? "CONFIRMED"
    : "UNCONFIRMED";
}

export function easyIdentityView(
  identity: ExpressLrsIdentity,
): EasyIdentityView {
  return Object.freeze({
    productName: identity.productName.trim(),
    firmwareVersion: identity.firmwareVersion.trim(),
    hardwareVersion: String(identity.hardwareVersion),
    role: identity.role,
    confidence: identityConfidence(identity),
  });
}

const FAILURE_MESSAGE_KEYS: Readonly<Record<string, MessageKey>> =
  Object.freeze({
    CANCELLED: "easy.fail.CANCELLED",
    TIMED_OUT: "easy.fail.TIMED_OUT",
    INVALID_PARAMETER_TABLE: "easy.fail.INVALID_PARAMETER_TABLE",
    CLEANUP_UNCONFIRMED: "easy.fail.CLEANUP_UNCONFIRMED",
    CONNECT_FAILED: "easy.fail.CONNECT_FAILED",
  });

/**
 * Unknown driver statuses collapse to a single honest message instead of being
 * reported as a specific diagnosis Easy Mode cannot support.
 */
export function failureMessageKey(status: string): MessageKey {
  // Own-property only: a status such as "constructor" or "toString" must not
  // resolve through the prototype chain into a non-message value.
  if (!Object.hasOwn(FAILURE_MESSAGE_KEYS, status)) return "easy.fail.UNKNOWN";
  return FAILURE_MESSAGE_KEYS[status] ?? "easy.fail.UNKNOWN";
}

/**
 * Maps a shared session outcome onto Easy Mode state. An identity that is not
 * CONFIRMED is refused rather than displayed, so an ambiguous or conflicting
 * answer can never look like a recognised device.
 */
export function easyStateFromOutcome(
  outcome: UserHardwareConnectOutcome,
): EasyDeviceState {
  if (outcome.status !== "CONNECTED") {
    return Object.freeze({
      kind: "FAILED" as const,
      messageKey: failureMessageKey(outcome.status),
      detail: outcome.message,
    });
  }
  const identity = easyIdentityView(outcome.identity);
  if (identity.confidence !== "CONFIRMED") {
    return Object.freeze({
      kind: "FAILED" as const,
      messageKey: "easy.fail.UNKNOWN" as MessageKey,
      detail: "identity evidence was not confirmed",
    });
  }
  return Object.freeze({ kind: "IDENTIFIED" as const, identity });
}

/**
 * The technical detail an expert can export. It deliberately excludes USB
 * serial identifiers and raw device payloads.
 */
export function easyTechnicalDetail(input: {
  readonly identity: EasyIdentityView;
  readonly buildSha: string;
  readonly at: string;
}): string {
  return [
    `model: ${input.identity.productName}`,
    `type: ${input.identity.role.toUpperCase()}`,
    `firmware: ${input.identity.firmwareVersion}`,
    `hardware: ${input.identity.hardwareVersion}`,
    `confidence: ${input.identity.confidence}`,
    `build: ${input.buildSha}`,
    `observed: ${input.at}`,
    "hardware-validation: NONE",
    "device-writes: LOCKED",
  ].join("\n");
}
