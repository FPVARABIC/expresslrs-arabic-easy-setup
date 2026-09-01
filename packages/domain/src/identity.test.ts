import { describe, expect, it } from "vitest";

import { createIdentityEvidence } from "./identity.js";

describe("createIdentityEvidence", () => {
  it("preserves the raw source value while creating a comparable value", () => {
    const evidence = createIdentityEvidence({
      id: "ev-1",
      claim: "target",
      rawValue: "  SYNTH-RX-24  ",
      source: {
        kind: "mock-config",
        instanceId: "reader-1",
        trustDomain: "runtime-firmware",
      },
      strength: "TARGET_SPECIFIC",
      observedAt: "2026-08-20T08:00:00.000Z",
    });

    expect(evidence.rawValue).toBe("  SYNTH-RX-24  ");
    expect(evidence.normalizedValue).toBe("synth-rx-24");
  });

  it("rejects empty evidence instead of manufacturing identity", () => {
    expect(() =>
      createIdentityEvidence({
        id: "ev-1",
        claim: "target",
        rawValue: "   ",
        source: {
          kind: "mock-config",
          instanceId: "reader-1",
          trustDomain: "runtime-firmware",
        },
        strength: "TARGET_SPECIFIC",
        observedAt: "2026-08-20T08:00:00.000Z",
      }),
    ).toThrow("must not be empty");
  });
});
