import { readOwnDataProperty } from "./sensitive-operation-helpers.js";

export const softwareReadinessGateIds = [
  "FOUNDATION",
  "EASY_MODE",
  "READ_ONLY_DEVICE",
  "BINDING_SIMULATION",
  "FIRMWARE_UPDATE_SIMULATION",
  "DIAGNOSTICS",
  "PWA_OFFLINE",
  "PLATFORM_PLANNING",
  "PERFORMANCE_HARNESS",
  "WEB_PREVIEW",
  "CI_QUALITY_GATES",
] as const;

export type SoftwareReadinessGateId = (typeof softwareReadinessGateIds)[number];

export type SoftwareReadinessGateState = "PASS" | "BLOCKED" | "INCOMPLETE";

export interface SoftwareReadinessGate {
  readonly id: SoftwareReadinessGateId;
  readonly state: SoftwareReadinessGateState;
}

export interface SoftwareReadinessInput {
  readonly gates: readonly SoftwareReadinessGate[];
}

export interface SoftwareReadinessReport {
  readonly schemaVersion: 1;
  readonly type: "SOFTWARE_ONLY_READINESS_REPORT";
  readonly status:
    "READY_FOR_HARDWARE_VALIDATION" | "SOFTWARE_GAPS_REMAIN" | "INVALID_INPUT";
  readonly gateStates: Readonly<
    Record<SoftwareReadinessGateId, SoftwareReadinessGateState>
  >;
  readonly missingSoftwareGates: readonly SoftwareReadinessGateId[];
  readonly externallyBlockedGates: readonly SoftwareReadinessGateId[];
  readonly hardwareValidation: "NONE";
  readonly realWritesEnabled: false;
  readonly performanceClaimsAllowed: false;
}

function defaultStates(): Record<
  SoftwareReadinessGateId,
  SoftwareReadinessGateState
> {
  return {
    FOUNDATION: "INCOMPLETE",
    EASY_MODE: "INCOMPLETE",
    READ_ONLY_DEVICE: "INCOMPLETE",
    BINDING_SIMULATION: "INCOMPLETE",
    FIRMWARE_UPDATE_SIMULATION: "INCOMPLETE",
    DIAGNOSTICS: "INCOMPLETE",
    PWA_OFFLINE: "INCOMPLETE",
    PLATFORM_PLANNING: "INCOMPLETE",
    PERFORMANCE_HARNESS: "INCOMPLETE",
    WEB_PREVIEW: "INCOMPLETE",
    CI_QUALITY_GATES: "INCOMPLETE",
  };
}

function invalidReport(): SoftwareReadinessReport {
  return Object.freeze({
    schemaVersion: 1,
    type: "SOFTWARE_ONLY_READINESS_REPORT",
    status: "INVALID_INPUT",
    gateStates: Object.freeze(defaultStates()),
    missingSoftwareGates: Object.freeze([...softwareReadinessGateIds]),
    externallyBlockedGates: Object.freeze([]),
    hardwareValidation: "NONE",
    realWritesEnabled: false,
    performanceClaimsAllowed: false,
  });
}

/**
 * Summarizes only the software work that can be closed before physical
 * validation. BLOCKED is reserved for an external/hardware gate and does not
 * masquerade as completed software. Every report keeps Hardware, real writes,
 * and performance claims disabled.
 */
export function createSoftwareReadinessReport(
  input: SoftwareReadinessInput | unknown,
): SoftwareReadinessReport {
  const states = defaultStates();
  const seen = new Set<SoftwareReadinessGateId>();
  const gates = readOwnDataProperty(input, "gates");
  if (!Array.isArray(gates)) {
    return invalidReport();
  }
  const length = readOwnDataProperty(gates, "length");
  if (
    !Number.isInteger(length) ||
    (length as number) < 0 ||
    (length as number) > softwareReadinessGateIds.length
  ) {
    return invalidReport();
  }

  for (let index = 0; index < (length as number); index += 1) {
    const gate = readOwnDataProperty(gates, index);
    const id = readOwnDataProperty(gate, "id");
    const state = readOwnDataProperty(gate, "state");
    if (
      typeof id !== "string" ||
      !softwareReadinessGateIds.includes(id as SoftwareReadinessGateId) ||
      typeof state !== "string" ||
      !(["PASS", "BLOCKED", "INCOMPLETE"] as const).includes(
        state as SoftwareReadinessGateState,
      ) ||
      seen.has(id as SoftwareReadinessGateId)
    ) {
      return invalidReport();
    }
    seen.add(id as SoftwareReadinessGateId);
    states[id as SoftwareReadinessGateId] = state as SoftwareReadinessGateState;
  }

  const missingSoftwareGates = Object.freeze(
    softwareReadinessGateIds.filter((id) => states[id] === "INCOMPLETE"),
  );
  const externallyBlockedGates = Object.freeze(
    softwareReadinessGateIds.filter((id) => states[id] === "BLOCKED"),
  );
  const allSoftwareAccountedFor = softwareReadinessGateIds.every(
    (id) => states[id] !== "INCOMPLETE",
  );

  return Object.freeze({
    schemaVersion: 1,
    type: "SOFTWARE_ONLY_READINESS_REPORT",
    status: allSoftwareAccountedFor
      ? "READY_FOR_HARDWARE_VALIDATION"
      : "SOFTWARE_GAPS_REMAIN",
    gateStates: Object.freeze({ ...states }),
    missingSoftwareGates,
    externallyBlockedGates,
    hardwareValidation: "NONE",
    realWritesEnabled: false,
    performanceClaimsAllowed: false,
  });
}
