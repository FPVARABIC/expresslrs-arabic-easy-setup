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

/**
 * Summarizes only the software work that can be closed before physical
 * validation. BLOCKED is reserved for an external/hardware gate and does not
 * masquerade as completed software. Every report keeps Hardware, real writes,
 * and performance claims disabled.
 */
export function createSoftwareReadinessReport(
  input: SoftwareReadinessInput,
): SoftwareReadinessReport {
  const states = defaultStates();
  const seen = new Set<SoftwareReadinessGateId>();

  for (const gate of input.gates) {
    if (
      typeof gate !== "object" ||
      gate === null ||
      !softwareReadinessGateIds.includes(gate.id) ||
      !(["PASS", "BLOCKED", "INCOMPLETE"] as const).includes(gate.state) ||
      seen.has(gate.id)
    ) {
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
    seen.add(gate.id);
    states[gate.id] = gate.state;
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
