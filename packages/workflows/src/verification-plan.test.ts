import type { VerificationPlan } from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import {
  createFirmwareUpdateVerificationPlan,
  evaluateVerificationPlan,
  type VerificationObservation,
} from "./verification-plan.js";

const plan = createFirmwareUpdateVerificationPlan({
  expectedDeviceId: "session-local-device",
  expectedTargetId: "fixture.tx.alpha-2g4",
  expectedFirmwareVersion: "4.2.0",
});

const completeObservations: readonly VerificationObservation[] = [
  { fact: "DEVICE_RECONNECTED", observedValue: true },
  { fact: "DEVICE_IDENTITY_MATCHES", observedValue: "session-local-device" },
  { fact: "TARGET_MATCHES", observedValue: "fixture.tx.alpha-2g4" },
  { fact: "FIRMWARE_VERSION_MATCHES", observedValue: "4.2.0" },
];

describe("declarative Verification Plan", () => {
  it("creates immutable Core-owned Firmware postconditions", () => {
    expect(plan).toMatchObject({
      id: "firmware-update-post-write-v1",
      operationType: "FIRMWARE_UPDATE",
      expectedDeviceId: "session-local-device",
    });
    expect(plan.requirements).toHaveLength(4);
    expect(plan.requirements.every((requirement) => requirement.required)).toBe(
      true,
    );
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.requirements)).toBe(true);
    expect(plan.requirements.every(Object.isFrozen)).toBe(true);
  });

  it("passes only when every required observation equals its expected value", () => {
    expect(
      evaluateVerificationPlan({ plan, observations: completeObservations }),
    ).toEqual({
      status: "PASSED",
      satisfiedRequirementIds: [
        "device-reconnected",
        "device-identity-matches",
        "target-matches",
        "firmware-version-matches",
      ],
    });
  });

  it("reports missing required facts without inferring them", () => {
    expect(
      evaluateVerificationPlan({
        plan,
        observations: completeObservations.slice(0, 2),
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "REQUIRED_VERIFICATION_MISSING",
      missingRequirementIds: ["target-matches", "firmware-version-matches"],
      mismatchedRequirementIds: [],
    });
  });

  it("blocks a required mismatch", () => {
    expect(
      evaluateVerificationPlan({
        plan,
        observations: completeObservations.map((observation) =>
          observation.fact === "FIRMWARE_VERSION_MATCHES"
            ? { ...observation, observedValue: "4.1.0" }
            : observation,
        ),
      }),
    ).toMatchObject({
      status: "BLOCKED",
      reason: "REQUIRED_VERIFICATION_MISMATCH",
      mismatchedRequirementIds: ["firmware-version-matches"],
    });
  });

  it("rejects duplicate or malformed observations and requirements", () => {
    expect(
      evaluateVerificationPlan({
        plan,
        observations: [completeObservations[0]!, completeObservations[0]!],
      }),
    ).toMatchObject({
      status: "BLOCKED",
      reason: "DUPLICATE_VERIFICATION_OBSERVATION",
    });
    expect(
      evaluateVerificationPlan({
        plan,
        observations: [{ fact: "unsafe fact", observedValue: "unexpected" }],
      }),
    ).toMatchObject({
      status: "BLOCKED",
      reason: "INVALID_VERIFICATION_OBSERVATION",
    });

    const duplicatePlan: VerificationPlan = {
      ...plan,
      requirements: [plan.requirements[0]!, plan.requirements[0]!],
    };
    expect(
      evaluateVerificationPlan({
        plan: duplicatePlan,
        observations: completeObservations,
      }),
    ).toMatchObject({
      status: "BLOCKED",
      reason: "INVALID_VERIFICATION_PLAN",
    });
    expect(
      evaluateVerificationPlan({
        plan: { ...plan, requirements: [] },
        observations: completeObservations,
      }),
    ).toMatchObject({
      status: "BLOCKED",
      reason: "INVALID_VERIFICATION_PLAN",
    });
  });
});
