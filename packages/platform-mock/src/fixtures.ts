import {
  InMemoryTargetCatalog,
  type TargetDefinition,
} from "@elrs-easy/compatibility";
import {
  createIdentityEvidence,
  type Capability,
  type DeviceDescriptor,
  type DeviceIdentityEvidence,
} from "@elrs-easy/domain";

export interface SyntheticDeviceFixture {
  readonly fixtureId: string;
  readonly family:
    | "TX_2G4"
    | "RX_SUB_GHZ"
    | "DUAL_BAND"
    | "UNKNOWN_MCU_ONLY"
    | "AMBIGUOUS_FAMILY"
    | "CONFLICTING_IDENTITY";
  readonly descriptor: DeviceDescriptor;
  readonly evidence: readonly DeviceIdentityEvidence[];
  readonly capabilities: readonly Capability[];
}

const observedAt = "2026-08-20T08:00:00.000Z";

function targetEvidence(
  id: string,
  targetId: string,
  sourceKind: string,
  trustDomain: string,
): DeviceIdentityEvidence {
  return createIdentityEvidence({
    id,
    claim: "target",
    rawValue: targetId,
    source: { kind: sourceKind, instanceId: id, trustDomain },
    strength: "TARGET_SPECIFIC",
    reliability: "VALIDATED",
    observedAt,
  });
}

function supportingEvidence(
  id: string,
  claim: string,
  value: string,
): DeviceIdentityEvidence {
  return createIdentityEvidence({
    id,
    claim,
    rawValue: value,
    source: {
      kind: "synthetic-runtime-config",
      instanceId: id,
      trustDomain: "runtime-firmware",
    },
    strength: claim === "mcu-family" ? "GENERIC" : "SUPPORTING",
    reliability: "VALIDATED",
    observedAt,
  });
}

function descriptor(id: string, displayHint: string): DeviceDescriptor {
  return {
    id,
    transport: "synthetic",
    connectionState: "CONNECTED",
    displayHint,
  };
}

function capability(id: string, evidenceIds: readonly string[]): Capability {
  return {
    id,
    available: true,
    sourceEvidenceIds: evidenceIds,
    limitations: [],
  };
}

export const syntheticTargetDefinitions: readonly TargetDefinition[] = [
  {
    targetId: "fixture.tx.alpha-2g4",
    displayName: "Synthetic TX Alpha 2.4",
    identity: {
      "device-role": ["tx"],
      "frequency-band": ["2.4-ghz"],
      "mcu-family": ["mcu-a"],
      "radio-family": ["radio-2g4-a"],
    },
    capabilities: ["read-config", "guided-bind", "mock-wifi-update"],
    updateProviders: ["mock-wifi"],
    supportedFirmwareMajors: [4],
  },
  {
    targetId: "fixture.rx.beta-subghz",
    displayName: "Synthetic RX Beta Sub-GHz",
    identity: {
      "device-role": ["rx"],
      "frequency-band": ["sub-ghz"],
      "mcu-family": ["mcu-b"],
      "radio-family": ["radio-subghz-b"],
    },
    capabilities: ["read-config", "guided-bind", "mock-serial-update"],
    updateProviders: ["mock-serial"],
    supportedFirmwareMajors: [4],
  },
  {
    targetId: "fixture.tx.gamma-dual",
    displayName: "Synthetic TX Gamma Dual Band",
    identity: {
      "device-role": ["tx"],
      "frequency-band": ["dual-band"],
      "mcu-family": ["mcu-c"],
      "radio-family": ["lr1121"],
    },
    capabilities: [
      "read-config",
      "guided-bind",
      "band-aware-operation",
      "mock-wifi-update",
    ],
    updateProviders: ["mock-wifi"],
    supportedFirmwareMajors: [4],
  },
  {
    targetId: "fixture.rx.delta-shared",
    displayName: "Synthetic RX Delta Shared Family",
    identity: {
      "device-role": ["rx"],
      "mcu-family": ["mcu-shared"],
      "radio-family": ["radio-shared"],
    },
    capabilities: ["read-config"],
    updateProviders: ["mock-serial"],
    supportedFirmwareMajors: [4],
  },
  {
    targetId: "fixture.rx.epsilon-shared",
    displayName: "Synthetic RX Epsilon Shared Family",
    identity: {
      "device-role": ["rx"],
      "mcu-family": ["mcu-shared"],
      "radio-family": ["radio-shared"],
    },
    capabilities: ["read-config"],
    updateProviders: ["mock-serial"],
    supportedFirmwareMajors: [4],
  },
];

export const syntheticTargetCatalog = new InMemoryTargetCatalog(
  {
    source: "generated-synthetic-fixtures",
    revision: "fixture-v1",
    schemaVersion: "1",
    contentDigest: "sha256:synthetic-fixture-v1",
    redistributionApproved: true,
  },
  syntheticTargetDefinitions,
);

const tx2g4Evidence = [
  targetEvidence(
    "tx2g4-config-target",
    "fixture.tx.alpha-2g4",
    "synthetic-runtime-config",
    "runtime-firmware",
  ),
  targetEvidence(
    "tx2g4-boot-target",
    "fixture.tx.alpha-2g4",
    "synthetic-bootloader",
    "bootloader",
  ),
  supportingEvidence("tx2g4-role", "device-role", "TX"),
  supportingEvidence("tx2g4-band", "frequency-band", "2.4-GHz"),
  supportingEvidence("tx2g4-mcu", "mcu-family", "MCU-A"),
  supportingEvidence("tx2g4-radio", "radio-family", "radio-2g4-a"),
] as const;

const rxSubGhzEvidence = [
  targetEvidence(
    "rxsub-config-target",
    "fixture.rx.beta-subghz",
    "synthetic-runtime-config",
    "runtime-firmware",
  ),
  targetEvidence(
    "rxsub-boot-target",
    "fixture.rx.beta-subghz",
    "synthetic-bootloader",
    "bootloader",
  ),
  supportingEvidence("rxsub-role", "device-role", "RX"),
  supportingEvidence("rxsub-band", "frequency-band", "sub-ghz"),
  supportingEvidence("rxsub-mcu", "mcu-family", "mcu-b"),
  supportingEvidence("rxsub-radio", "radio-family", "radio-subghz-b"),
] as const;

const dualBandEvidence = [
  targetEvidence(
    "dual-config-target",
    "fixture.tx.gamma-dual",
    "synthetic-runtime-config",
    "runtime-firmware",
  ),
  targetEvidence(
    "dual-boot-target",
    "fixture.tx.gamma-dual",
    "synthetic-bootloader",
    "bootloader",
  ),
  supportingEvidence("dual-role", "device-role", "TX"),
  supportingEvidence("dual-band", "frequency-band", "dual-band"),
  supportingEvidence("dual-mcu", "mcu-family", "mcu-c"),
  supportingEvidence("dual-radio", "radio-family", "LR1121"),
] as const;

export const syntheticDeviceFixtures: readonly SyntheticDeviceFixture[] = [
  {
    fixtureId: "known-tx-2g4",
    family: "TX_2G4",
    descriptor: descriptor("mock-device-tx-2g4", "Synthetic TX 2.4"),
    evidence: tx2g4Evidence,
    capabilities: [
      capability("read-config", tx2g4Evidence.map((item) => item.id)),
      capability("guided-bind", ["tx2g4-config-target"]),
    ],
  },
  {
    fixtureId: "known-rx-subghz",
    family: "RX_SUB_GHZ",
    descriptor: descriptor("mock-device-rx-subghz", "Synthetic RX Sub-GHz"),
    evidence: rxSubGhzEvidence,
    capabilities: [
      capability("read-config", rxSubGhzEvidence.map((item) => item.id)),
      capability("guided-bind", ["rxsub-config-target"]),
    ],
  },
  {
    fixtureId: "known-dual-band",
    family: "DUAL_BAND",
    descriptor: descriptor("mock-device-dual", "Synthetic Dual-Band TX"),
    evidence: dualBandEvidence,
    capabilities: [
      capability("read-config", dualBandEvidence.map((item) => item.id)),
      capability("band-aware-operation", ["dual-radio", "dual-band"]),
    ],
  },
  {
    fixtureId: "unknown-mcu-only",
    family: "UNKNOWN_MCU_ONLY",
    descriptor: descriptor("mock-device-unknown", "Unknown MCU-only device"),
    evidence: [
      supportingEvidence("unknown-mcu", "mcu-family", "mcu-unknown"),
    ],
    capabilities: [capability("read-chip-info", ["unknown-mcu"])],
  },
  {
    fixtureId: "ambiguous-family",
    family: "AMBIGUOUS_FAMILY",
    descriptor: descriptor("mock-device-ambiguous", "Ambiguous device family"),
    evidence: [
      supportingEvidence("amb-role", "device-role", "RX"),
      supportingEvidence("amb-mcu", "mcu-family", "mcu-shared"),
      supportingEvidence("amb-radio", "radio-family", "radio-shared"),
    ],
    capabilities: [capability("read-config", ["amb-mcu", "amb-radio"])],
  },
  {
    fixtureId: "conflicting-targets",
    family: "CONFLICTING_IDENTITY",
    descriptor: descriptor("mock-device-conflict", "Conflicting target evidence"),
    evidence: [
      targetEvidence(
        "conflict-runtime",
        "fixture.tx.alpha-2g4",
        "synthetic-runtime-config",
        "runtime-firmware",
      ),
      targetEvidence(
        "conflict-boot",
        "fixture.rx.beta-subghz",
        "synthetic-bootloader",
        "bootloader",
      ),
    ],
    capabilities: [capability("read-config", ["conflict-runtime"])],
  },
];

export function fixtureById(fixtureId: string): SyntheticDeviceFixture {
  const fixture = syntheticDeviceFixtures.find(
    (candidate) => candidate.fixtureId === fixtureId,
  );
  if (fixture === undefined) {
    throw new TypeError(`Unknown synthetic fixture: ${fixtureId}`);
  }
  return fixture;
}
