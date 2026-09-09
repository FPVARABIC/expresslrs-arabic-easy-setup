import type { MessageKey } from "@elrs-easy/i18n";

import type { CrsfParameter } from "../hardware/crsf";
import type { ExpressLrsIdentity } from "../hardware/session";
import type { WriteDenialReason } from "../hardware/write-authority";

/**
 * The three operations Easy Mode offers. Each is a real device operation
 * carried out through the same services the Advanced workbench uses; Easy Mode
 * holds no separate implementation of its own.
 */
export type EasyOperationId = "binding" | "settings" | "firmware";

export const EASY_OPERATIONS: readonly EasyOperationId[] = Object.freeze([
  "binding",
  "settings",
  "firmware",
]);

/**
 * Every operation walks the same steps, so an operator sees one predictable
 * shape regardless of which one they picked, and no step is skipped silently.
 */
export type EasyStepId =
  "connect" | "identify" | "compatibility" | "execute" | "verify";

export const EASY_STEPS: readonly EasyStepId[] = Object.freeze([
  "connect",
  "identify",
  "compatibility",
  "execute",
  "verify",
]);

export type EasyStepStatus = "pending" | "active" | "done" | "failed";

export const OPERATION_TITLE_KEYS: Readonly<
  Record<EasyOperationId, MessageKey>
> = Object.freeze({
  binding: "easy.op.binding",
  settings: "easy.op.settings",
  firmware: "easy.op.firmware",
});

export const OPERATION_DESCRIPTION_KEYS: Readonly<
  Record<EasyOperationId, MessageKey>
> = Object.freeze({
  binding: "easy.op.bindingDescription",
  settings: "easy.op.settingsDescription",
  firmware: "easy.op.firmwareDescription",
});

export const STEP_TITLE_KEYS: Readonly<Record<EasyStepId, MessageKey>> =
  Object.freeze({
    connect: "easy.step.connect",
    identify: "easy.step.identify",
    compatibility: "easy.step.compatibility",
    execute: "easy.step.execute",
    verify: "easy.step.verify",
  });

/**
 * Denial reasons map to the same specific guidance Easy Mode shows for a
 * missing precondition. None of them says the feature is unavailable.
 */
export const DENIAL_MESSAGE_KEYS: Readonly<
  Record<WriteDenialReason, MessageKey>
> = Object.freeze({
  NO_DEVICE_SESSION: "easy.deny.NO_DEVICE_SESSION",
  IDENTITY_UNCONFIRMED: "easy.deny.IDENTITY_UNCONFIRMED",
  PORT_CLEANUP_UNCONFIRMED: "easy.deny.PORT_CLEANUP_UNCONFIRMED",
  OPERATION_IN_PROGRESS: "easy.deny.OPERATION_IN_PROGRESS",
  RECOVERY_JOURNAL_UNREADABLE: "easy.deny.RECOVERY_JOURNAL_UNREADABLE",
  PENDING_RECOVERY_CHECKPOINT: "easy.deny.PENDING_RECOVERY_CHECKPOINT",
  NO_PENDING_RECOVERY: "easy.deny.NO_PENDING_RECOVERY",
  TARGET_NOT_MATCHED: "easy.deny.TARGET_NOT_MATCHED",
  BAND_NOT_MATCHED: "easy.deny.BAND_NOT_MATCHED",
  ARTIFACT_NOT_VERIFIED: "easy.deny.ARTIFACT_NOT_VERIFIED",
  RECOVERY_NOT_AVAILABLE: "easy.deny.RECOVERY_NOT_AVAILABLE",
  BENCH_NOT_ACKNOWLEDGED: "easy.deny.BENCH_NOT_ACKNOWLEDGED",
  USER_CONFIRMATION_MISSING: "easy.deny.USER_CONFIRMATION_MISSING",
});

export function stepStatuses(
  currentStep: EasyStepId,
  failed: boolean,
): Readonly<Record<EasyStepId, EasyStepStatus>> {
  const currentIndex = EASY_STEPS.indexOf(currentStep);
  const statuses = {} as Record<EasyStepId, EasyStepStatus>;
  for (const [index, step] of EASY_STEPS.entries()) {
    statuses[step] =
      index < currentIndex
        ? "done"
        : index === currentIndex
          ? failed
            ? "failed"
            : "active"
          : "pending";
  }
  return Object.freeze(statuses);
}

/**
 * Whether the connected device can carry out the chosen operation, decided from
 * what the device itself reported rather than from a model list. An
 * unsupported device gets the specific technical reason and the real
 * alternative, never a blanket refusal.
 */
export type EasyCompatibility =
  | Readonly<{ supported: true }>
  | Readonly<{ supported: false; reasonKey: MessageKey }>;

export function bindingCompatibility(
  parameters: readonly CrsfParameter[],
): EasyCompatibility {
  const hasBind = parameters.some(
    (parameter) =>
      parameter.kind === "command" && /bind/iu.test(parameter.name),
  );
  return hasBind
    ? Object.freeze({ supported: true as const })
    : Object.freeze({
        supported: false as const,
        reasonKey: "easy.compat.noBindCommand" as MessageKey,
      });
}

/**
 * The essential settings Easy Mode offers, matched against the parameters the
 * device actually reported. Nothing is shown that the device did not declare,
 * and no default value is presented as a device value.
 */
export const ESSENTIAL_SETTING_PATTERNS: readonly {
  readonly key: string;
  readonly pattern: RegExp;
}[] = Object.freeze([
  { key: "packetRate", pattern: /packet\s*rate|pkt\s*rate/iu },
  { key: "telemetryRatio", pattern: /telem(etry)?\s*ratio/iu },
  { key: "power", pattern: /^(max\s*)?power$|tx\s*power/iu },
  { key: "dynamicPower", pattern: /dynamic\s*power|dyn\s*power/iu },
  { key: "modelMatch", pattern: /model\s*match/iu },
  { key: "regulatoryDomain", pattern: /domain|region/iu },
]);

export function essentialSettings(
  parameters: readonly CrsfParameter[],
): readonly CrsfParameter[] {
  const writable = parameters.filter(
    (parameter) =>
      parameter.kind === "selection" || parameter.kind === "number",
  );
  return Object.freeze(
    writable.filter((parameter) =>
      ESSENTIAL_SETTING_PATTERNS.some((entry) =>
        entry.pattern.test(parameter.name),
      ),
    ),
  );
}

export function settingsCompatibility(
  parameters: readonly CrsfParameter[],
): EasyCompatibility {
  return essentialSettings(parameters).length > 0
    ? Object.freeze({ supported: true as const })
    : Object.freeze({
        supported: false as const,
        reasonKey: "easy.compat.noEssentialSettings" as MessageKey,
      });
}

/**
 * A firmware update needs a Target that matches the connected device. Easy Mode
 * establishes identity and hands the verified context to the same firmware
 * workflow the Advanced workbench runs; it does not carry a second flasher.
 */
export function firmwareCompatibility(
  identity: ExpressLrsIdentity | null,
): EasyCompatibility {
  if (identity === null) {
    return Object.freeze({
      supported: false as const,
      reasonKey: "easy.compat.needIdentity" as MessageKey,
    });
  }
  return Object.freeze({ supported: true as const });
}

export function operationCompatibility(
  operation: EasyOperationId,
  input: Readonly<{
    identity: ExpressLrsIdentity | null;
    parameters: readonly CrsfParameter[];
  }>,
): EasyCompatibility {
  switch (operation) {
    case "binding":
      return bindingCompatibility(input.parameters);
    case "settings":
      return settingsCompatibility(input.parameters);
    case "firmware":
      return firmwareCompatibility(input.identity);
  }
}

/**
 * A settings write is only reported as applied when the value read back from
 * the device equals the value requested.
 */
export function readBackMatches(
  requested: number,
  observed: CrsfParameter | null,
): boolean {
  if (observed === null) return false;
  if (observed.kind !== "selection" && observed.kind !== "number") return false;
  return observed.value === requested;
}
