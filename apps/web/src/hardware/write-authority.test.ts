import { describe, expect, it } from "vitest";

import {
  DeviceWriteAuthority,
  WRITE_CAPABILITY_TTL_MS,
  deviceFingerprint,
  evaluateDeviceWriteEvidence,
  type DeviceWriteEvidence,
} from "./write-authority";

function evidence(
  overrides: Partial<DeviceWriteEvidence> = {},
): DeviceWriteEvidence {
  return {
    operation: "SETTINGS_WRITE",
    sessionId: "session-1",
    deviceFingerprint: "tx|Bench TX|4.1.0|1|3",
    identityConfirmed: true,
    portCleanupConfirmed: true,
    operationInProgress: false,
    recoveryJournalReadable: true,
    pendingRecoveryCheckpoint: false,
    userConfirmed: true,
    ...overrides,
  };
}

function firmwareEvidence(
  overrides: Partial<DeviceWriteEvidence> = {},
): DeviceWriteEvidence {
  return evidence({
    operation: "FIRMWARE_WRITE",
    targetMatchesDevice: true,
    bandMatchesDevice: true,
    artifactVerified: true,
    recoveryAvailable: true,
    benchAcknowledged: true,
    ...overrides,
  });
}

describe("device write authority", () => {
  it("authorizes a settings write when every dynamic condition holds", () => {
    expect(evaluateDeviceWriteEvidence(evidence())).toBeNull();
  });

  it("refuses with the specific missing condition, never a generic lock", () => {
    const cases: readonly [Partial<DeviceWriteEvidence>, string][] = [
      [{ sessionId: null }, "NO_DEVICE_SESSION"],
      [{ deviceFingerprint: null }, "NO_DEVICE_SESSION"],
      [{ identityConfirmed: false }, "IDENTITY_UNCONFIRMED"],
      [{ portCleanupConfirmed: false }, "PORT_CLEANUP_UNCONFIRMED"],
      [{ operationInProgress: true }, "OPERATION_IN_PROGRESS"],
      [{ recoveryJournalReadable: false }, "RECOVERY_JOURNAL_UNREADABLE"],
      [{ pendingRecoveryCheckpoint: true }, "PENDING_RECOVERY_CHECKPOINT"],
      [{ userConfirmed: false }, "USER_CONFIRMATION_MISSING"],
    ];
    for (const [override, reason] of cases) {
      expect(evaluateDeviceWriteEvidence(evidence(override))).toBe(reason);
    }
  });

  it("requires full firmware evidence only for firmware-level operations", () => {
    // A settings write does not need a target or artifact.
    expect(
      evaluateDeviceWriteEvidence(
        evidence({ targetMatchesDevice: false, artifactVerified: false }),
      ),
    ).toBeNull();

    for (const [override, reason] of [
      [{ targetMatchesDevice: false }, "TARGET_NOT_MATCHED"],
      [{ bandMatchesDevice: false }, "BAND_NOT_MATCHED"],
      [{ artifactVerified: false }, "ARTIFACT_NOT_VERIFIED"],
      [{ recoveryAvailable: false }, "RECOVERY_NOT_AVAILABLE"],
      [{ benchAcknowledged: false }, "BENCH_NOT_ACKNOWLEDGED"],
    ] as const) {
      expect(evaluateDeviceWriteEvidence(firmwareEvidence(override))).toBe(
        reason,
      );
    }
  });

  it("treats a missing firmware evidence field as unproven rather than allowed", () => {
    const withoutTarget: DeviceWriteEvidence = {
      ...firmwareEvidence(),
      targetMatchesDevice: undefined,
    };
    expect(evaluateDeviceWriteEvidence(withoutTarget)).toBe(
      "TARGET_NOT_MATCHED",
    );
  });

  it("authorizes recovery from its pending checkpoint, not from a live identity", () => {
    // Recovery runs on a device that may no longer answer CRSF, so it must not
    // require a session, and it must require the pending checkpoint that a
    // normal write forbids.
    const recovery = firmwareEvidence({
      operation: "RECOVERY",
      sessionId: null,
      deviceFingerprint: null,
      identityConfirmed: false,
      pendingRecoveryCheckpoint: true,
    });

    expect(evaluateDeviceWriteEvidence(recovery)).toBeNull();
    expect(
      evaluateDeviceWriteEvidence({
        ...recovery,
        pendingRecoveryCheckpoint: false,
      }),
    ).toBe("NO_PENDING_RECOVERY");
    expect(
      evaluateDeviceWriteEvidence({ ...recovery, benchAcknowledged: false }),
    ).toBe("BENCH_NOT_ACKNOWLEDGED");
    expect(
      evaluateDeviceWriteEvidence({ ...recovery, targetMatchesDevice: false }),
    ).toBe("TARGET_NOT_MATCHED");
  });

  it("still refuses a normal write while a recovery checkpoint is pending", () => {
    expect(
      evaluateDeviceWriteEvidence(
        evidence({ pendingRecoveryCheckpoint: true }),
      ),
    ).toBe("PENDING_RECOVERY_CHECKPOINT");
    expect(
      evaluateDeviceWriteEvidence(
        firmwareEvidence({ pendingRecoveryCheckpoint: true }),
      ),
    ).toBe("PENDING_RECOVERY_CHECKPOINT");
  });

  it("issues a capability bound to the session, device, and operation", () => {
    const authority = new DeviceWriteAuthority(() => 1_000);
    const decision = authority.request(evidence());

    expect(decision.granted).toBe(true);
    if (!decision.granted) return;
    expect(decision.capability).toMatchObject({
      operation: "SETTINGS_WRITE",
      sessionId: "session-1",
      deviceFingerprint: "tx|Bench TX|4.1.0|1|3",
      issuedAtMs: 1_000,
      expiresAtMs: 1_000 + WRITE_CAPABILITY_TTL_MS,
    });
    expect(decision.capability.token).toMatch(/^[0-9a-f]{32}$|^t[0-9a-f]/u);
  });

  it("authorizes exactly one attempt, so a repeated click cannot replay it", () => {
    const authority = new DeviceWriteAuthority(() => 1_000);
    const decision = authority.request(evidence());
    if (!decision.granted) throw new Error("expected a grant");
    const live = {
      sessionId: "session-1",
      deviceFingerprint: "tx|Bench TX|4.1.0|1|3",
      operation: "SETTINGS_WRITE" as const,
    };

    expect(authority.consume(decision.capability, live)).not.toBeNull();
    expect(authority.consume(decision.capability, live)).toBeNull();
    expect(authority.outstandingCount).toBe(0);
  });

  it("refuses a capability whose device changed after authorization", () => {
    const authority = new DeviceWriteAuthority(() => 1_000);
    const decision = authority.request(evidence());
    if (!decision.granted) throw new Error("expected a grant");

    expect(
      authority.consume(decision.capability, {
        sessionId: "session-1",
        deviceFingerprint: "tx|Different RX|4.1.0|1|3",
        operation: "SETTINGS_WRITE",
      }),
    ).toBeNull();
  });

  it("refuses a capability whose session was replaced after authorization", () => {
    const authority = new DeviceWriteAuthority(() => 1_000);
    const decision = authority.request(evidence());
    if (!decision.granted) throw new Error("expected a grant");

    expect(
      authority.consume(decision.capability, {
        sessionId: "session-2",
        deviceFingerprint: "tx|Bench TX|4.1.0|1|3",
        operation: "SETTINGS_WRITE",
      }),
    ).toBeNull();
  });

  it("refuses a capability used for a different operation than it authorized", () => {
    const authority = new DeviceWriteAuthority(() => 1_000);
    const decision = authority.request(evidence());
    if (!decision.granted) throw new Error("expected a grant");

    expect(
      authority.consume(decision.capability, {
        sessionId: "session-1",
        deviceFingerprint: "tx|Bench TX|4.1.0|1|3",
        operation: "FIRMWARE_WRITE",
      }),
    ).toBeNull();
  });

  it("expires an authorization that was not used in time", () => {
    let now = 1_000;
    const authority = new DeviceWriteAuthority(() => now);
    const decision = authority.request(evidence());
    if (!decision.granted) throw new Error("expected a grant");

    now = 1_000 + WRITE_CAPABILITY_TTL_MS + 1;
    expect(
      authority.consume(decision.capability, {
        sessionId: "session-1",
        deviceFingerprint: "tx|Bench TX|4.1.0|1|3",
        operation: "SETTINGS_WRITE",
      }),
    ).toBeNull();
  });

  it("refuses a forged capability that this authority never issued", () => {
    const authority = new DeviceWriteAuthority(() => 1_000);
    expect(
      authority.consume(
        {
          operation: "FIRMWARE_WRITE",
          sessionId: "session-1",
          deviceFingerprint: "tx|Bench TX|4.1.0|1|3",
          issuedAtMs: 1_000,
          expiresAtMs: 1_000 + WRITE_CAPABILITY_TTL_MS,
          token: "forged-token",
        },
        {
          sessionId: "session-1",
          deviceFingerprint: "tx|Bench TX|4.1.0|1|3",
          operation: "FIRMWARE_WRITE",
        },
      ),
    ).toBeNull();
  });

  it("revokes outstanding authorizations when a session ends", () => {
    const authority = new DeviceWriteAuthority(() => 1_000);
    const decision = authority.request(evidence());
    if (!decision.granted) throw new Error("expected a grant");

    authority.revokeAll();

    expect(
      authority.consume(decision.capability, {
        sessionId: "session-1",
        deviceFingerprint: "tx|Bench TX|4.1.0|1|3",
        operation: "SETTINGS_WRITE",
      }),
    ).toBeNull();
  });

  it("fingerprints a device without USB serial identifiers", () => {
    const fingerprint = deviceFingerprint({
      role: "tx",
      productName: "  Bench TX  ",
      firmwareVersion: " 4.1.0 ",
      hardwareVersion: 1,
      parameterCount: 3,
    });

    expect(fingerprint).toBe("tx|Bench TX|4.1.0|1|3");
    expect(fingerprint).not.toMatch(/serial/iu);
  });
});
