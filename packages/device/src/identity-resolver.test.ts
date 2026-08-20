import {
  createIdentityEvidence,
  type DeviceIdentityEvidence,
  type TargetCandidate,
} from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import { resolveDeviceIdentity } from "./identity-resolver.js";

function evidence(input: {
  readonly id: string;
  readonly value: string;
  readonly domain: string;
  readonly claim?: string;
  readonly strength?: DeviceIdentityEvidence["strength"];
}): DeviceIdentityEvidence {
  return createIdentityEvidence({
    id: input.id,
    claim: input.claim ?? "target",
    rawValue: input.value,
    source: {
      kind: "synthetic-reader",
      instanceId: input.id,
      trustDomain: input.domain,
    },
    strength: input.strength ?? "TARGET_SPECIFIC",
    observedAt: "2026-08-20T08:00:00.000Z",
  });
}

function candidate(
  matchedEvidenceIds: readonly string[],
  conflictingEvidenceIds: readonly string[] = [],
): TargetCandidate {
  return {
    targetId: "fixture.rx.alpha",
    displayName: "Synthetic Alpha",
    matchedEvidenceIds,
    conflictingEvidenceIds,
  };
}

describe("resolveDeviceIdentity", () => {
  it("does not turn generic MCU evidence into a target", () => {
    const generic = evidence({
      id: "mcu",
      claim: "mcu-family",
      value: "esp32",
      domain: "usb-chip",
      strength: "GENERIC",
    });
    const result = resolveDeviceIdentity({
      evidence: [generic],
      candidates: [candidate(["mcu"])],
    });

    expect(result.confidence).toBe("UNKNOWN");
    expect(result.selectedTargetId).toBeNull();
  });

  it("reports one strong runtime target source as high confidence only", () => {
    const runtime = evidence({
      id: "config-target",
      value: "fixture.rx.alpha",
      domain: "runtime-firmware",
    });
    const result = resolveDeviceIdentity({
      evidence: [runtime],
      candidates: [candidate(["config-target"])],
    });

    expect(result.confidence).toBe("HIGH_CONFIDENCE");
  });

  it("requires independent target-specific domains for confirmed identity", () => {
    const runtime = evidence({
      id: "config-target",
      value: "fixture.rx.alpha",
      domain: "runtime-firmware",
    });
    const bootloader = evidence({
      id: "boot-target",
      value: "fixture.rx.alpha",
      domain: "bootloader",
    });
    const result = resolveDeviceIdentity({
      evidence: [runtime, bootloader],
      candidates: [candidate(["config-target", "boot-target"])],
    });

    expect(result.confidence).toBe("CONFIRMED");
    expect(result.selectedTargetId).toBe("fixture.rx.alpha");
  });

  it("does not count two fields from one trust domain as independent", () => {
    const first = evidence({
      id: "config-target",
      value: "fixture.rx.alpha",
      domain: "runtime-firmware",
    });
    const second = evidence({
      id: "mdns-target",
      value: "fixture.rx.alpha",
      domain: "runtime-firmware",
    });
    const result = resolveDeviceIdentity({
      evidence: [first, second],
      candidates: [candidate(["config-target", "mdns-target"])],
    });

    expect(result.confidence).toBe("HIGH_CONFIDENCE");
  });

  it("fails ambiguous when a duplicate evidence id could be double-counted", () => {
    const runtime = evidence({
      id: "duplicate-target",
      value: "fixture.rx.alpha",
      domain: "runtime-firmware",
    });
    const bootloader = evidence({
      id: "duplicate-target",
      value: "fixture.rx.alpha",
      domain: "bootloader",
    });
    const result = resolveDeviceIdentity({
      evidence: [runtime, bootloader],
      candidates: [candidate(["duplicate-target"])],
    });

    expect(result.confidence).toBe("AMBIGUOUS");
    expect(result.selectedTargetId).toBeNull();
    expect(result.reasons).toContain("DUPLICATE_EVIDENCE_IDS");
  });

  it("fails ambiguous when evidence values or catalog matches conflict", () => {
    const runtime = evidence({
      id: "config-target",
      value: "fixture.rx.alpha",
      domain: "runtime-firmware",
    });
    const bootloader = evidence({
      id: "boot-target",
      value: "fixture.rx.beta",
      domain: "bootloader",
    });
    const result = resolveDeviceIdentity({
      evidence: [runtime, bootloader],
      candidates: [candidate(["config-target"], ["boot-target"])],
    });

    expect(result.confidence).toBe("AMBIGUOUS");
    expect(result.selectedTargetId).toBeNull();
    expect(result.conflicts[0]?.claim).toBe("target");
  });
});
