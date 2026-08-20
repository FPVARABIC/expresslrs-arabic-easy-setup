export type DetectionConfidence = "confirmed" | "high" | "ambiguous" | "unknown";
export type ConnectionState = "connected" | "reconnecting" | "disconnected";
export type DeviceKind = "receiver" | "transmitter";
export type DiscoveryStepState = "complete" | "active" | "pending" | "blocked";
export type EvidenceSource = "runtime" | "mdns" | "catalog" | "usb";
export type EvidenceStrength = "strong" | "supporting" | "weak";

export interface DeviceEvidenceViewModel {
  readonly id: string;
  readonly source: EvidenceSource;
  readonly value: string;
  readonly strength: EvidenceStrength;
}

export interface DiscoveryStepViewModel {
  readonly id: "discover" | "identify" | "crossCheck" | "ready";
  readonly state: DiscoveryStepState;
}

export interface DeviceViewModel {
  readonly kind: DeviceKind;
  readonly manufacturer: string;
  readonly model: string;
  readonly target: string;
  readonly firmware: string;
  readonly band: string;
  readonly connection: ConnectionState;
}

export interface MockScenarioViewModel {
  readonly id: MockScenarioId;
  readonly labelKey:
    | "scenario.disconnected"
    | "scenario.rx24"
    | "scenario.txSubGhz"
    | "scenario.dualBand"
    | "scenario.ambiguous"
    | "scenario.reconnecting";
  readonly confidence: DetectionConfidence;
  readonly device?: DeviceViewModel;
  readonly steps: readonly DiscoveryStepViewModel[];
  readonly evidence: readonly DeviceEvidenceViewModel[];
  readonly sessionId: string;
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
  { id: "ready", state: "complete" }
];

export const mockScenarios: readonly MockScenarioViewModel[] = [
  {
    id: "rx24",
    labelKey: "scenario.rx24",
    confidence: "confirmed",
    device: {
      kind: "receiver",
      manufacturer: "Synthetic fixture",
      model: "RX Alpha",
      target: "fixture.rx.alpha-2g4",
      firmware: "ExpressLRS 4.1.0",
      band: "2.4 GHz",
      connection: "connected"
    },
    steps: completeSteps,
    evidence: [
      { id: "runtime-target", source: "runtime", value: "fixture.rx.alpha-2g4", strength: "strong" },
      { id: "mdns-type", source: "mdns", value: "type=RX · version=4.1.0", strength: "supporting" }
    ],
    sessionId: "MOCK-RX24-7F3A"
  },
  {
    id: "tx-sub-ghz",
    labelKey: "scenario.txSubGhz",
    confidence: "confirmed",
    device: {
      kind: "transmitter",
      manufacturer: "Synthetic fixture",
      model: "TX Beta",
      target: "fixture.tx.beta-subghz",
      firmware: "ExpressLRS 4.1.0",
      band: "Sub-GHz · 868/915 MHz",
      connection: "connected"
    },
    steps: completeSteps,
    evidence: [
      { id: "runtime-target", source: "runtime", value: "fixture.tx.beta-subghz", strength: "strong" },
      { id: "catalog-radio", source: "catalog", value: "SX127x · TX", strength: "supporting" }
    ],
    sessionId: "MOCK-TXSG-04C1"
  },
  {
    id: "dual-band",
    labelKey: "scenario.dualBand",
    confidence: "high",
    device: {
      kind: "receiver",
      manufacturer: "Generic fixture",
      model: "LR1121 Dual RX",
      target: "LR1121 Dual-Band RX",
      firmware: "ExpressLRS 4.1.0",
      band: "2.4 GHz + Sub-GHz",
      connection: "connected"
    },
    steps: [
      { id: "discover", state: "complete" },
      { id: "identify", state: "complete" },
      { id: "crossCheck", state: "active" },
      { id: "ready", state: "pending" }
    ],
    evidence: [
      { id: "runtime-radio", source: "runtime", value: "LR1121 · dual-band", strength: "strong" },
      { id: "usb-mcu", source: "usb", value: "ESP32-S3", strength: "weak" }
    ],
    sessionId: "MOCK-DUAL-E221"
  },
  {
    id: "ambiguous",
    labelKey: "scenario.ambiguous",
    confidence: "ambiguous",
    device: {
      kind: "receiver",
      manufacturer: "Not confirmed",
      model: "ESP8285 receiver",
      target: "2 possible targets",
      firmware: "ExpressLRS 3.5.3",
      band: "2.4 GHz",
      connection: "connected"
    },
    steps: [
      { id: "discover", state: "complete" },
      { id: "identify", state: "complete" },
      { id: "crossCheck", state: "blocked" },
      { id: "ready", state: "blocked" }
    ],
    evidence: [
      { id: "usb-mcu", source: "usb", value: "ESP8285", strength: "weak" },
      { id: "catalog-candidates", source: "catalog", value: "Candidate A · Candidate B", strength: "supporting" }
    ],
    sessionId: "MOCK-AMB-912D"
  },
  {
    id: "reconnecting",
    labelKey: "scenario.reconnecting",
    confidence: "confirmed",
    device: {
      kind: "receiver",
      manufacturer: "Synthetic fixture",
      model: "RX Reconnect",
      target: "fixture.rx.reconnect-2g4",
      firmware: "ExpressLRS 4.1.0",
      band: "2.4 GHz",
      connection: "reconnecting"
    },
    steps: [
      { id: "discover", state: "complete" },
      { id: "identify", state: "complete" },
      { id: "crossCheck", state: "complete" },
      { id: "ready", state: "active" }
    ],
    evidence: [
      { id: "runtime-target", source: "runtime", value: "fixture.rx.reconnect-2g4", strength: "strong" },
      { id: "reconnect-wait", source: "mdns", value: "Awaiting the same device session", strength: "supporting" }
    ],
    sessionId: "MOCK-RECON-33E8"
  },
  {
    id: "disconnected",
    labelKey: "scenario.disconnected",
    confidence: "unknown",
    steps: [
      { id: "discover", state: "active" },
      { id: "identify", state: "pending" },
      { id: "crossCheck", state: "pending" },
      { id: "ready", state: "pending" }
    ],
    evidence: [],
    sessionId: "NO-SESSION"
  }
];

export function getMockScenario(id: MockScenarioId): MockScenarioViewModel {
  return mockScenarios.find((scenario) => scenario.id === id) ?? mockScenarios[0]!;
}
