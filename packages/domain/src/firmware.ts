export const recoveryDispositions = [
  "NONE",
  "SAFE_TO_RETRY",
  "RECONNECT_AND_VERIFY",
  "RECOVERY_REQUIRED",
  "UNKNOWN",
] as const;

/** A standalone decision; workflows attach it without changing OperationRecord. */
export type RecoveryDisposition = (typeof recoveryDispositions)[number];

export interface ArtifactProvenance {
  readonly applicationVersion: string;
  readonly coreVersion: string;
  readonly upstreamRepository: string;
  readonly upstreamVersion: string;
  readonly upstreamCommitSha: string;
  readonly patchSetVersion: string;
  readonly targetId: string;
  readonly buildConfigurationDigest: string;
  readonly toolchainIdentity: string;
  readonly builtAt: string;
  readonly artifactSha256: string;
}

export const verificationFacts = [
  "DEVICE_RECONNECTED",
  "DEVICE_IDENTITY_MATCHES",
  "TARGET_MATCHES",
  "FIRMWARE_VERSION_MATCHES",
  "CONFIGURATION_MATCHES",
  "LINK_ESTABLISHED",
] as const;

export type KnownVerificationFact = (typeof verificationFacts)[number];
export type VerificationFact = KnownVerificationFact | (string & {});
export type VerificationExpectedValue = string | number | boolean;

export interface VerificationRequirement {
  readonly id: string;
  readonly fact: VerificationFact;
  readonly expectedValue: VerificationExpectedValue;
  readonly required: boolean;
}

/**
 * Declarative postcondition plan. A provider finishing its command does not
 * satisfy this plan; required facts must be observed independently afterward.
 */
export interface VerificationPlan {
  readonly id: string;
  readonly operationType: string;
  /** Opaque session-local device id; never a hardware serial. */
  readonly expectedDeviceId: string;
  readonly requirements: readonly VerificationRequirement[];
}
