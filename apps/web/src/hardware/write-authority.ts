/**
 * Device-write authority.
 *
 * This replaces the previous project-phase lock. A device-changing operation is
 * never hidden or disabled because of where the project is; it is authorized
 * from the evidence that actually makes the write safe, and refused with a
 * specific reason when a piece of that evidence is missing.
 *
 * The grant is a capability, not a global boolean: it is bound to one device
 * session, one device fingerprint, and one operation, it expires, and it is
 * single-use so a repeated click cannot replay it.
 */

export type DeviceOperationKind =
  | "SETTINGS_WRITE"
  | "SETTINGS_RESTORE"
  | "BINDING"
  | "FIRMWARE_WRITE"
  | "RECOVERY";

/**
 * Reasons a write is refused. Every one names a condition the operator can act
 * on. "The feature is locked" is deliberately not among them.
 */
export type WriteDenialReason =
  | "NO_DEVICE_SESSION"
  | "IDENTITY_UNCONFIRMED"
  | "PORT_CLEANUP_UNCONFIRMED"
  | "OPERATION_IN_PROGRESS"
  | "RECOVERY_JOURNAL_UNREADABLE"
  | "PENDING_RECOVERY_CHECKPOINT"
  | "NO_PENDING_RECOVERY"
  | "TARGET_NOT_MATCHED"
  | "BAND_NOT_MATCHED"
  | "ARTIFACT_NOT_VERIFIED"
  | "RECOVERY_NOT_AVAILABLE"
  | "BENCH_NOT_ACKNOWLEDGED"
  | "USER_CONFIRMATION_MISSING";

export interface DeviceWriteEvidence {
  readonly operation: DeviceOperationKind;
  /** Identifier of the live device session, or null when nothing is connected. */
  readonly sessionId: string | null;
  /** Stable-per-session fingerprint of the identified device. */
  readonly deviceFingerprint: string | null;
  /** A CRSF Device Info answer confirmed this device's identity. */
  readonly identityConfirmed: boolean;
  /** No previous serial port was left in an unconfirmed-close state. */
  readonly portCleanupConfirmed: boolean;
  /** Another device operation is already running. */
  readonly operationInProgress: boolean;
  /** The recovery journal was read successfully. */
  readonly recoveryJournalReadable: boolean;
  /** A previous interrupted operation is still awaiting recovery. */
  readonly pendingRecoveryCheckpoint: boolean;
  /** The operator confirmed this specific operation. */
  readonly userConfirmed: boolean;

  /** Firmware-write evidence. Ignored by other operations. */
  readonly targetMatchesDevice?: boolean;
  readonly bandMatchesDevice?: boolean;
  readonly artifactVerified?: boolean;
  readonly recoveryAvailable?: boolean;
  readonly benchAcknowledged?: boolean;
}

export interface DeviceWriteCapability {
  readonly operation: DeviceOperationKind;
  readonly sessionId: string;
  readonly deviceFingerprint: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly token: string;
}

export type DeviceWriteDecision =
  | Readonly<{ granted: true; capability: DeviceWriteCapability }>
  | Readonly<{ granted: false; reason: WriteDenialReason }>;

/**
 * How long an authorization stays valid for *starting* an operation. It does
 * not bound the operation itself: a flash legitimately runs longer than this,
 * and cancelling it mid-write to satisfy a clock would be more dangerous than
 * letting it finish.
 */
export const WRITE_CAPABILITY_TTL_MS = 180_000 as const;

/**
 * A planned firmware write needs the full artifact and recovery evidence.
 * Recovery is deliberately not in this set: it is evaluated separately below,
 * because its preconditions are close to the opposite ones.
 */
const FIRMWARE_LEVEL_OPERATIONS: ReadonlySet<DeviceOperationKind> = new Set([
  "FIRMWARE_WRITE",
]);

function randomToken(): string {
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (crypto !== undefined && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  // A token only needs to be unguessable enough to stop accidental replay
  // inside one page; it is not a security boundary against the page's owner.
  return `t${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

/**
 * Evaluates the evidence in a fixed order so the operator is always told the
 * first thing that is actually missing, rather than a generic refusal.
 */
export function evaluateDeviceWriteEvidence(
  evidence: DeviceWriteEvidence,
): WriteDenialReason | null {
  if (!evidence.portCleanupConfirmed) return "PORT_CLEANUP_UNCONFIRMED";
  if (evidence.operationInProgress) return "OPERATION_IN_PROGRESS";
  if (!evidence.recoveryJournalReadable) return "RECOVERY_JOURNAL_UNREADABLE";

  if (evidence.operation === "RECOVERY") {
    // Recovery is the one operation that runs *because* a previous write was
    // interrupted, on a device that may no longer answer CRSF at all. It
    // therefore requires the pending checkpoint and an operator-confirmed
    // Target instead of a live identity, and it must not inherit the previous
    // session's identity.
    if (!evidence.pendingRecoveryCheckpoint) return "NO_PENDING_RECOVERY";
    if (evidence.targetMatchesDevice !== true) return "TARGET_NOT_MATCHED";
    if (evidence.bandMatchesDevice !== true) return "BAND_NOT_MATCHED";
    if (evidence.benchAcknowledged !== true) return "BENCH_NOT_ACKNOWLEDGED";
    if (!evidence.userConfirmed) return "USER_CONFIRMATION_MISSING";
    return null;
  }

  if (evidence.sessionId === null || evidence.deviceFingerprint === null) {
    return "NO_DEVICE_SESSION";
  }
  if (!evidence.identityConfirmed) return "IDENTITY_UNCONFIRMED";
  if (evidence.pendingRecoveryCheckpoint) return "PENDING_RECOVERY_CHECKPOINT";

  if (FIRMWARE_LEVEL_OPERATIONS.has(evidence.operation)) {
    if (evidence.targetMatchesDevice !== true) return "TARGET_NOT_MATCHED";
    if (evidence.bandMatchesDevice !== true) return "BAND_NOT_MATCHED";
    if (evidence.artifactVerified !== true) return "ARTIFACT_NOT_VERIFIED";
    if (evidence.recoveryAvailable !== true) return "RECOVERY_NOT_AVAILABLE";
    if (evidence.benchAcknowledged !== true) return "BENCH_NOT_ACKNOWLEDGED";
  }

  if (!evidence.userConfirmed) return "USER_CONFIRMATION_MISSING";
  return null;
}

/**
 * Tracks issued capabilities so each one authorizes exactly one attempt. A
 * double click therefore cannot start a second write from one authorization.
 */
export class DeviceWriteAuthority {
  readonly #outstanding = new Map<string, DeviceWriteCapability>();
  readonly #now: () => number;

  public constructor(now: () => number = () => Date.now()) {
    this.#now = now;
  }

  public request(evidence: DeviceWriteEvidence): DeviceWriteDecision {
    const denial = evaluateDeviceWriteEvidence(evidence);
    if (denial !== null) {
      return Object.freeze({ granted: false as const, reason: denial });
    }
    const issuedAtMs = this.#now();
    const capability: DeviceWriteCapability = Object.freeze({
      operation: evidence.operation,
      // Recovery legitimately runs without a live CRSF session, so its binding
      // is the recovery checkpoint rather than a session identity.
      sessionId: evidence.sessionId ?? "recovery",
      deviceFingerprint: evidence.deviceFingerprint ?? "recovery",
      issuedAtMs,
      expiresAtMs: issuedAtMs + WRITE_CAPABILITY_TTL_MS,
      token: randomToken(),
    });
    this.#outstanding.set(capability.token, capability);
    return Object.freeze({ granted: true as const, capability });
  }

  /**
   * Consumes a capability for one attempt. Returns null when the capability was
   * never issued here, has already been used, has expired, or no longer matches
   * the live session and device — which is what makes a device swap between
   * authorization and write unable to inherit the authorization.
   */
  public consume(
    capability: DeviceWriteCapability,
    live: Readonly<{
      sessionId: string | null;
      deviceFingerprint: string | null;
      operation: DeviceOperationKind;
    }>,
  ): DeviceWriteCapability | null {
    const stored = this.#outstanding.get(capability.token);
    if (stored === undefined) return null;
    this.#outstanding.delete(capability.token);
    if (stored.operation !== live.operation) return null;
    if (stored.sessionId !== live.sessionId) return null;
    if (stored.deviceFingerprint !== live.deviceFingerprint) return null;
    if (this.#now() > stored.expiresAtMs) return null;
    return stored;
  }

  /** Drops every outstanding capability, for example when a session closes. */
  public revokeAll(): void {
    this.#outstanding.clear();
  }

  public get outstandingCount(): number {
    return this.#outstanding.size;
  }
}

/**
 * Stable-per-session device fingerprint. It intentionally excludes USB serial
 * numbers and any stable hardware identifier, so it can be compared during one
 * session without becoming a tracking identifier in exported evidence.
 */
export function deviceFingerprint(
  identity: Readonly<{
    role: string;
    productName: string;
    firmwareVersion: string;
    hardwareVersion: number;
    parameterCount: number;
  }>,
): string {
  return [
    identity.role,
    identity.productName.trim(),
    identity.firmwareVersion.trim(),
    String(identity.hardwareVersion),
    String(identity.parameterCount),
  ].join("|");
}
