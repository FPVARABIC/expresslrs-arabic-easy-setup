import type {
  VerificationExpectedValue,
  VerificationFact,
  VerificationPlan,
} from "@elrs-easy/domain";

export interface VerificationObservation {
  readonly fact: VerificationFact;
  readonly observedValue: VerificationExpectedValue;
}

export type VerificationPlanEvaluation =
  | {
      readonly status: "PASSED";
      readonly satisfiedRequirementIds: readonly string[];
    }
  | {
      readonly status: "BLOCKED";
      readonly reason:
        | "INVALID_VERIFICATION_PLAN"
        | "INVALID_VERIFICATION_OBSERVATION"
        | "DUPLICATE_VERIFICATION_OBSERVATION"
        | "REQUIRED_VERIFICATION_MISSING"
        | "REQUIRED_VERIFICATION_MISMATCH";
      readonly missingRequirementIds: readonly string[];
      readonly mismatchedRequirementIds: readonly string[];
    };

const requirementIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const factPattern = /^[A-Z0-9][A-Z0-9_:-]{0,127}$/u;

function isVerificationValue(
  value: unknown,
): value is VerificationExpectedValue {
  return (
    typeof value === "boolean" ||
    (typeof value === "string" && value.length > 0 && value.length <= 512) ||
    (typeof value === "number" && Number.isSafeInteger(value))
  );
}

/** Core-owned postconditions for one Firmware update attempt. */
export function createFirmwareUpdateVerificationPlan(input: {
  readonly expectedDeviceId: string;
  readonly expectedTargetId: string;
  readonly expectedFirmwareVersion: string;
}): VerificationPlan {
  return Object.freeze({
    id: "firmware-update-post-write-v1",
    operationType: "FIRMWARE_UPDATE",
    expectedDeviceId: input.expectedDeviceId,
    requirements: Object.freeze([
      Object.freeze({
        id: "device-reconnected",
        fact: "DEVICE_RECONNECTED",
        expectedValue: true,
        required: true,
      }),
      Object.freeze({
        id: "device-identity-matches",
        fact: "DEVICE_IDENTITY_MATCHES",
        expectedValue: input.expectedDeviceId,
        required: true,
      }),
      Object.freeze({
        id: "target-matches",
        fact: "TARGET_MATCHES",
        expectedValue: input.expectedTargetId,
        required: true,
      }),
      Object.freeze({
        id: "firmware-version-matches",
        fact: "FIRMWARE_VERSION_MATCHES",
        expectedValue: input.expectedFirmwareVersion,
        required: true,
      }),
    ]),
  });
}

/**
 * Evaluates required declarative postconditions with strict primitive equality.
 * Provider completion is intentionally not an observation in this plan.
 */
export function evaluateVerificationPlan(input: {
  readonly plan: VerificationPlan;
  readonly observations: readonly VerificationObservation[];
}): VerificationPlanEvaluation {
  const requirementIds = input.plan.requirements.map(
    (requirement) => requirement.id,
  );
  const requirementFacts = input.plan.requirements.map(
    (requirement) => requirement.fact,
  );
  if (
    input.plan.id !== "firmware-update-post-write-v1" ||
    input.plan.operationType !== "FIRMWARE_UPDATE" ||
    typeof input.plan.expectedDeviceId !== "string" ||
    input.plan.expectedDeviceId.length === 0 ||
    input.plan.expectedDeviceId.length > 256 ||
    input.plan.requirements.length === 0 ||
    !input.plan.requirements.some((requirement) => requirement.required) ||
    input.plan.requirements.some(
      (requirement) =>
        typeof requirement.id !== "string" ||
        !requirementIdPattern.test(requirement.id) ||
        typeof requirement.fact !== "string" ||
        !factPattern.test(requirement.fact) ||
        !isVerificationValue(requirement.expectedValue) ||
        typeof requirement.required !== "boolean",
    ) ||
    new Set(requirementIds).size !== requirementIds.length ||
    new Set(requirementFacts).size !== requirementFacts.length
  ) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "INVALID_VERIFICATION_PLAN",
      missingRequirementIds: Object.freeze([]),
      mismatchedRequirementIds: Object.freeze([]),
    });
  }

  const observations = new Map<VerificationFact, VerificationExpectedValue>();
  for (const observation of input.observations) {
    if (
      typeof observation.fact !== "string" ||
      !factPattern.test(observation.fact) ||
      !isVerificationValue(observation.observedValue)
    ) {
      return Object.freeze({
        status: "BLOCKED",
        reason: "INVALID_VERIFICATION_OBSERVATION",
        missingRequirementIds: Object.freeze([]),
        mismatchedRequirementIds: Object.freeze([]),
      });
    }
    if (observations.has(observation.fact)) {
      return Object.freeze({
        status: "BLOCKED",
        reason: "DUPLICATE_VERIFICATION_OBSERVATION",
        missingRequirementIds: Object.freeze([]),
        mismatchedRequirementIds: Object.freeze([]),
      });
    }
    observations.set(observation.fact, observation.observedValue);
  }

  const satisfiedRequirementIds: string[] = [];
  const missingRequirementIds: string[] = [];
  const mismatchedRequirementIds: string[] = [];
  for (const requirement of input.plan.requirements) {
    if (!observations.has(requirement.fact)) {
      if (requirement.required) {
        missingRequirementIds.push(requirement.id);
      }
      continue;
    }
    if (
      Object.is(observations.get(requirement.fact), requirement.expectedValue)
    ) {
      satisfiedRequirementIds.push(requirement.id);
    } else if (requirement.required) {
      mismatchedRequirementIds.push(requirement.id);
    }
  }

  if (missingRequirementIds.length > 0) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "REQUIRED_VERIFICATION_MISSING",
      missingRequirementIds: Object.freeze(missingRequirementIds),
      mismatchedRequirementIds: Object.freeze(mismatchedRequirementIds),
    });
  }
  if (mismatchedRequirementIds.length > 0) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "REQUIRED_VERIFICATION_MISMATCH",
      missingRequirementIds: Object.freeze(missingRequirementIds),
      mismatchedRequirementIds: Object.freeze(mismatchedRequirementIds),
    });
  }

  return Object.freeze({
    status: "PASSED",
    satisfiedRequirementIds: Object.freeze(satisfiedRequirementIds),
  });
}
