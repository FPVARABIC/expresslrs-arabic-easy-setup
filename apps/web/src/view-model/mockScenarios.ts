import type { MessageKey } from "@elrs-easy/i18n";

export type DetectionConfidence =
  "confirmed" | "high" | "ambiguous" | "unknown";
export type ConnectionState = "connected" | "reconnecting" | "disconnected";
export type DeviceKind = "receiver" | "transmitter";
export type DiscoveryStepState = "complete" | "active" | "pending" | "blocked";
export type EvidenceSource = "runtime" | "mdns" | "catalog" | "usb";
export type EvidenceStrength = "strong" | "supporting" | "weak";

export interface DeviceEvidenceViewModel {
  readonly id: string;
  readonly source: EvidenceSource;
  readonly valueKey: MessageKey;
  readonly strength: EvidenceStrength;
}

export interface DiscoveryStepViewModel {
  readonly id: "discover" | "identify" | "crossCheck" | "ready";
  readonly state: DiscoveryStepState;
}

export interface DeviceViewModel {
  readonly kind: DeviceKind;
  readonly manufacturerKey: MessageKey;
  readonly modelKey: MessageKey;
  /** Machine-readable synthetic Target; null means no safe resolution. */
  readonly targetId: string | null;
  readonly targetKey: MessageKey;
  readonly firmwareKey: MessageKey;
  readonly bandKey: MessageKey;
  readonly connection: ConnectionState;
}

export interface MockScenarioViewModel {
  readonly id: MockScenarioId;
  readonly labelKey: MessageKey;
  readonly confidence: DetectionConfidence;
  readonly device?: DeviceViewModel;
  readonly steps: readonly DiscoveryStepViewModel[];
  readonly evidence: readonly DeviceEvidenceViewModel[];
  readonly sessionDisplayKey: MessageKey;
}

export type MockScenarioId =
  | "disconnected"
  | "rx24"
  | "tx-sub-ghz"
  | "dual-band"
  | "ambiguous"
  | "reconnecting";

const completeSteps: readonly DiscoveryStepViewModel[] = [
  { id: "discover", state: "complete" },
  { id: "identify", state: "complete" },
  { id: "crossCheck", state: "complete" },
  { id: "ready", state: "complete" },
];

export const mockScenarios: readonly MockScenarioViewModel[] = [
  {
    id: "rx24",
    labelKey: "scenario.rx24",
    confidence: "confirmed",
    device: {
      kind: "transmitter",
      manufacturerKey: "scenarioValue.manufacturer.synthetic",
      modelKey: "scenarioValue.model.txAlpha2g4",
      targetId: "fixture.tx.alpha-2g4",
      targetKey: "scenarioValue.target.txAlpha2g4",
      firmwareKey: "scenarioValue.firmware.v410",
      bandKey: "scenarioValue.band.2g4",
      connection: "connected",
    },
    steps: completeSteps,
    evidence: [
      {
        id: "runtime-target",
        source: "runtime",
        valueKey: "scenarioValue.target.txAlpha2g4",
        strength: "strong",
      },
      {
        id: "mdns-type",
        source: "mdns",
        valueKey: "scenarioValue.evidence.txVersion410",
        strength: "supporting",
      },
    ],
    sessionDisplayKey: "scenarioValue.session.rx24",
  },
  {
    id: "tx-sub-ghz",
    labelKey: "scenario.txSubGhz",
    confidence: "confirmed",
    device: {
      kind: "receiver",
      manufacturerKey: "scenarioValue.manufacturer.synthetic",
      modelKey: "scenarioValue.model.rxBetaSubGhz",
      targetId: "fixture.rx.beta-subghz",
      targetKey: "scenarioValue.target.rxBetaSubGhz",
      firmwareKey: "scenarioValue.firmware.v410",
      bandKey: "scenarioValue.band.subGhz",
      connection: "connected",
    },
    steps: completeSteps,
    evidence: [
      {
        id: "runtime-target",
        source: "runtime",
        valueKey: "scenarioValue.target.rxBetaSubGhz",
        strength: "strong",
      },
      {
        id: "catalog-radio",
        source: "catalog",
        valueKey: "scenarioValue.evidence.subGhzRx",
        strength: "supporting",
      },
    ],
    sessionDisplayKey: "scenarioValue.session.txSubGhz",
  },
  {
    id: "dual-band",
    labelKey: "scenario.dualBand",
    confidence: "confirmed",
    device: {
      kind: "transmitter",
      manufacturerKey: "scenarioValue.manufacturer.synthetic",
      modelKey: "scenarioValue.model.txGammaDual",
      targetId: "fixture.tx.gamma-dual",
      targetKey: "scenarioValue.target.txGammaDual",
      firmwareKey: "scenarioValue.firmware.v410",
      bandKey: "scenarioValue.band.dual",
      connection: "connected",
    },
    steps: completeSteps,
    evidence: [
      {
        id: "runtime-radio",
        source: "runtime",
        valueKey: "scenarioValue.evidence.lr1121Dual",
        strength: "strong",
      },
      {
        id: "catalog-target",
        source: "catalog",
        valueKey: "scenarioValue.target.txGammaDual",
        strength: "strong",
      },
    ],
    sessionDisplayKey: "scenarioValue.session.dualBand",
  },
  {
    id: "ambiguous",
    labelKey: "scenario.ambiguous",
    confidence: "ambiguous",
    device: {
      kind: "receiver",
      manufacturerKey: "scenarioValue.manufacturer.unconfirmed",
      modelKey: "scenarioValue.model.esp8285Receiver",
      targetId: null,
      targetKey: "scenarioValue.target.ambiguous",
      firmwareKey: "scenarioValue.firmware.v353",
      bandKey: "scenarioValue.band.2g4",
      connection: "connected",
    },
    steps: [
      { id: "discover", state: "complete" },
      { id: "identify", state: "complete" },
      { id: "crossCheck", state: "blocked" },
      { id: "ready", state: "blocked" },
    ],
    evidence: [
      {
        id: "usb-mcu",
        source: "usb",
        valueKey: "scenarioValue.evidence.esp8285",
        strength: "weak",
      },
      {
        id: "catalog-candidates",
        source: "catalog",
        valueKey: "scenarioValue.evidence.ambiguousCandidates",
        strength: "supporting",
      },
    ],
    sessionDisplayKey: "scenarioValue.session.ambiguous",
  },
  {
    id: "reconnecting",
    labelKey: "scenario.reconnecting",
    confidence: "confirmed",
    device: {
      kind: "receiver",
      manufacturerKey: "scenarioValue.manufacturer.synthetic",
      modelKey: "scenarioValue.model.rxReconnect",
      targetId: "fixture.rx.beta-subghz",
      targetKey: "scenarioValue.target.rxBetaSubGhz",
      firmwareKey: "scenarioValue.firmware.v410",
      bandKey: "scenarioValue.band.subGhz",
      connection: "reconnecting",
    },
    steps: [
      { id: "discover", state: "complete" },
      { id: "identify", state: "complete" },
      { id: "crossCheck", state: "complete" },
      { id: "ready", state: "active" },
    ],
    evidence: [
      {
        id: "runtime-target",
        source: "runtime",
        valueKey: "scenarioValue.target.rxBetaSubGhz",
        strength: "strong",
      },
      {
        id: "reconnect-wait",
        source: "mdns",
        valueKey: "scenarioValue.evidence.awaitSameSession",
        strength: "supporting",
      },
    ],
    sessionDisplayKey: "scenarioValue.session.reconnecting",
  },
  {
    id: "disconnected",
    labelKey: "scenario.disconnected",
    confidence: "unknown",
    steps: [
      { id: "discover", state: "active" },
      { id: "identify", state: "pending" },
      { id: "crossCheck", state: "pending" },
      { id: "ready", state: "pending" },
    ],
    evidence: [],
    sessionDisplayKey: "scenarioValue.session.none",
  },
];

export function getMockScenario(id: MockScenarioId): MockScenarioViewModel {
  return (
    mockScenarios.find((scenario) => scenario.id === id) ?? mockScenarios[0]!
  );
}
