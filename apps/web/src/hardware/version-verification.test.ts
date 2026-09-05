import { describe, expect, it } from "vitest";

import { verifyObservedFirmwareVersion } from "./version-verification";

describe("post-flash firmware version verification", () => {
  it("accepts the exact official release triplet", () => {
    expect(
      verifyObservedFirmwareVersion({
        release: {
          label: "4.1.0",
          revision: "release410",
          channel: "release",
        },
        observedVersion: "4.1.0 ISM2G4",
      }),
    ).toEqual(
      expect.objectContaining({ verified: true, reason: "EXACT_RELEASE" }),
    );
  });

  it("rejects the same Target when it returns on the old version", () => {
    expect(
      verifyObservedFirmwareVersion({
        release: {
          label: "4.1.0",
          revision: "release410",
          channel: "release",
        },
        observedVersion: "4.0.1",
      }),
    ).toEqual(
      expect.objectContaining({ verified: false, reason: "VERSION_MISMATCH" }),
    );
  });

  it("requires a parseable version even for a branch build", () => {
    expect(
      verifyObservedFirmwareVersion({
        release: {
          label: "master",
          revision: "abcdef",
          channel: "branch",
        },
        observedVersion: "unknown",
      }),
    ).toEqual(
      expect.objectContaining({
        verified: false,
        reason: "VERSION_UNAVAILABLE",
      }),
    );
  });
});
