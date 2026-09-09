import { describe, expect, it } from "vitest";

import type { CrsfParameter } from "./crsf";
import {
  observedExpressLrsCommit,
  verifyObservedFirmwareBuild,
} from "./build-verification";

function info(name: string, value: string): CrsfParameter {
  return {
    id: 1,
    parentId: 0,
    type: 12,
    hidden: false,
    name,
    rawValue: new Uint8Array(),
    kind: "info",
    value,
  };
}

describe("post-reconnect build verification", () => {
  it("extracts the bounded hexadecimal commit from CRSF info fields", () => {
    expect(observedExpressLrsCommit([info("4.1.0 ISM2G4", "a9d4a9c")])).toBe(
      "a9d4a9c",
    );
  });

  it("requires the exact release version for stable releases", () => {
    expect(
      verifyObservedFirmwareBuild({
        release: {
          label: "4.1.0",
          revision: "a9d4a9c1234567890",
          channel: "release",
        },
        observedVersion: "4.1.0",
        parameters: [info("4.1.0", "a9d4a9c")],
      }),
    ).toEqual(
      expect.objectContaining({ verified: true, reason: "EXACT_RELEASE" }),
    );
  });

  it("requires a branch commit prefix instead of accepting any parseable version", () => {
    const release = {
      label: "master",
      revision: "a9d4a9c1234567890",
      channel: "branch" as const,
    };

    expect(
      verifyObservedFirmwareBuild({
        release,
        observedVersion: "4.2.0",
        parameters: [info("4.2.0 ISM2G4", "a9d4a9c")],
      }),
    ).toEqual(
      expect.objectContaining({
        verified: true,
        reason: "EXACT_BRANCH_COMMIT",
      }),
    );
    expect(
      verifyObservedFirmwareBuild({
        release,
        observedVersion: "4.2.0",
        parameters: [info("4.2.0 ISM2G4", "deadbee")],
      }),
    ).toEqual(
      expect.objectContaining({ verified: false, reason: "COMMIT_MISMATCH" }),
    );
  });

  it("fails closed when a branch build exposes no commit evidence", () => {
    expect(
      verifyObservedFirmwareBuild({
        release: {
          label: "master",
          revision: "a9d4a9c1234567890",
          channel: "branch",
        },
        observedVersion: "4.2.0",
        parameters: [],
      }),
    ).toEqual(
      expect.objectContaining({
        verified: false,
        reason: "COMMIT_UNAVAILABLE",
      }),
    );
  });
});
