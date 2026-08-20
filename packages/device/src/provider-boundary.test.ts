import {
  CoreOperationError,
  type Capability,
  type DeviceDescriptor,
  type DeviceIdentityEvidence,
} from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import type { DiscoveryProvider } from "./contracts.js";
import {
  rebuildDiscoveryCapabilities,
  rebuildDiscoveryDescriptors,
  rebuildDiscoveryEvidence,
  type IdentityEvidenceTrustPolicy,
} from "./provider-boundary.js";

const provider: DiscoveryProvider = {
  id: "test-provider",
  async discover(): Promise<readonly DeviceDescriptor[]> {
    return [];
  },
  async readIdentity(): Promise<readonly DeviceIdentityEvidence[]> {
    return [];
  },
  async readCapabilities(): Promise<readonly Capability[]> {
    return [];
  },
};

function rawEvidence(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    id: "reported-target-id",
    claim: "target",
    rawValue: "  Fixture.RX.WiFi  ",
    normalizedValue: "attacker-controlled-normalization",
    source: {
      kind: "device-endpoint",
      instanceId: "SERIAL-LEAK",
      trustDomain: "attacker-controlled-domain",
    },
    strength: "TARGET_SPECIFIC",
    reliability: "VALIDATED",
    observedAt: "2026-08-20T08:00:00.000Z",
    ...overrides,
  };
}

describe("discovery provider boundary", () => {
  it("rebuilds and deep-freezes descriptors", () => {
    const descriptors = rebuildDiscoveryDescriptors([
      {
        id: "device-1",
        transport: "synthetic",
        connectionState: "CONNECTED",
        displayHint: "Safe WiFi product name",
      },
    ]);

    expect(descriptors).toEqual([
      {
        id: "device-1",
        transport: "synthetic",
        connectionState: "CONNECTED",
        displayHint: "Safe WiFi product name",
      },
    ]);
    expect(Object.isFrozen(descriptors)).toBe(true);
    expect(Object.isFrozen(descriptors[0])).toBe(true);
  });

  it("ignores provider normalization and trust metadata by default", () => {
    const rebuilt = rebuildDiscoveryEvidence({
      value: [rawEvidence()],
      provider,
      providerId: provider.id,
    });
    const evidence = rebuilt.evidence[0];

    expect(evidence?.id).toBe("evidence-1");
    expect(evidence?.rawValue).toBe("  Fixture.RX.WiFi  ");
    expect(evidence?.normalizedValue).toBe("fixture.rx.wifi");
    expect(evidence?.strength).toBe("GENERIC");
    expect(evidence?.reliability).toBe("UNVALIDATED");
    expect(evidence?.source).toEqual({
      kind: "untrusted-provider",
      instanceId: "untrusted-reader",
      trustDomain: "untrusted-provider",
    });
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence?.source)).toBe(true);
  });

  it("accepts trust only from a separate bound policy", () => {
    const otherProvider = { ...provider };
    const policy: IdentityEvidenceTrustPolicy = {
      classify(input) {
        if (input.provider !== provider) {
          return null;
        }
        return {
          sourceKind: "reviewed-runtime-reader",
          sourceInstanceId: "runtime-reader",
          trustDomain: "runtime-firmware",
          strength: "TARGET_SPECIFIC",
          reliability: "VALIDATED",
        };
      },
    };

    const trusted = rebuildDiscoveryEvidence({
      value: [rawEvidence()],
      provider,
      providerId: provider.id,
      policy,
    }).evidence[0];
    const untrusted = rebuildDiscoveryEvidence({
      value: [rawEvidence()],
      provider: otherProvider,
      providerId: otherProvider.id,
      policy,
    }).evidence[0];

    expect(trusted?.strength).toBe("TARGET_SPECIFIC");
    expect(trusted?.reliability).toBe("VALIDATED");
    expect(untrusted?.strength).toBe("GENERIC");
    expect(untrusted?.reliability).toBe("UNVALIDATED");
  });

  it.each(["serial", "uid", "binding-phrase", "wifi-password"])(
    "rejects the non-allowlisted privacy-sensitive claim %s",
    (claim) => {
      expect(() =>
        rebuildDiscoveryEvidence({
          value: [rawEvidence({ claim })],
          provider,
          providerId: provider.id,
        }),
      ).toThrowError("IDENTITY_CLAIM_NOT_ALLOWLISTED");
    },
  );

  it("allows reviewed regulatory facts but constrains custom-hardware presence", () => {
    const regulatory = rebuildDiscoveryEvidence({
      value: [
        rawEvidence({
          claim: "regulatory-domain-low",
          rawValue: "EU_CE_868",
        }),
      ],
      provider,
      providerId: provider.id,
    }).evidence[0];

    expect(regulatory?.claim).toBe("regulatory-domain-low");
    expect(regulatory?.strength).toBe("GENERIC");
    expect(() =>
      rebuildDiscoveryEvidence({
        value: [
          rawEvidence({
            claim: "custom-hardware-present",
            rawValue: "{ raw: true }",
          }),
        ],
        provider,
        providerId: provider.id,
      }),
    ).toThrowError("CUSTOM_HARDWARE_PRESENCE_VALUE_INVALID");
  });

  it("never permits non-target claims to become target-specific", () => {
    const unsafePolicy: IdentityEvidenceTrustPolicy = {
      classify: () => ({
        sourceKind: "reviewed-runtime-reader",
        sourceInstanceId: "runtime-reader",
        trustDomain: "runtime-firmware",
        strength: "TARGET_SPECIFIC",
        reliability: "VALIDATED",
      }),
    };

    expect(() =>
      rebuildDiscoveryEvidence({
        value: [
          rawEvidence({
            claim: "regulatory-domain-high",
            rawValue: "ISM_2400",
          }),
        ],
        provider,
        providerId: provider.id,
        policy: unsafePolicy,
      }),
    ).toThrowError("TARGET_SPECIFIC_POLICY_CLAIM_INVALID");
  });

  it("rejects control and bidi formatting characters in provider text", () => {
    for (const rawValue of ["target\nvalue", "target\u202Evalue"]) {
      expect(() =>
        rebuildDiscoveryEvidence({
          value: [rawEvidence({ rawValue })],
          provider,
          providerId: provider.id,
        }),
      ).toThrow(CoreOperationError);
    }
  });

  it("remaps capability provenance to Core-owned ids and deep-freezes it", () => {
    const rebuilt = rebuildDiscoveryEvidence({
      value: [rawEvidence()],
      provider,
      providerId: provider.id,
    });
    const capabilities = rebuildDiscoveryCapabilities({
      value: [
        {
          id: "read-config",
          available: true,
          sourceEvidenceIds: ["reported-target-id"],
          limitations: ["SYNTHETIC_ONLY"],
        },
      ],
      safeIdByReportedId: rebuilt.safeIdByReportedId,
    });

    expect(capabilities[0]?.sourceEvidenceIds).toEqual(["evidence-1"]);
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(Object.isFrozen(capabilities[0])).toBe(true);
    expect(Object.isFrozen(capabilities[0]?.sourceEvidenceIds)).toBe(true);
    expect(Object.isFrozen(capabilities[0]?.limitations)).toBe(true);
  });

  it("rejects missing provenance and free-form capability limitations", () => {
    const rebuilt = rebuildDiscoveryEvidence({
      value: [rawEvidence()],
      provider,
      providerId: provider.id,
    });
    const unsafeCapability = {
      id: "read-config",
      available: true,
      sourceEvidenceIds: ["missing-evidence"],
      limitations: [],
    };
    expect(() =>
      rebuildDiscoveryCapabilities({
        value: [unsafeCapability],
        safeIdByReportedId: rebuilt.safeIdByReportedId,
      }),
    ).toThrowError("DEVICE_CAPABILITY_EVIDENCE_REFERENCE_INVALID");

    expect(() =>
      rebuildDiscoveryCapabilities({
        value: [
          {
            ...unsafeCapability,
            sourceEvidenceIds: ["reported-target-id"],
            limitations: ["contains private free-form text"],
          },
        ],
        safeIdByReportedId: rebuilt.safeIdByReportedId,
      }),
    ).toThrowError("DEVICE_CAPABILITY_LIMITATIONS_INVALID");

    expect(() =>
      rebuildDiscoveryCapabilities({
        value: [
          {
            ...unsafeCapability,
            sourceEvidenceIds: ["reported-target-id"],
            limitations: Array.from({ length: 129 }, () => "LIMIT"),
          },
        ],
        safeIdByReportedId: rebuilt.safeIdByReportedId,
      }),
    ).toThrowError("DEVICE_CAPABILITY_LIMITATIONS_INVALID");
  });
});
