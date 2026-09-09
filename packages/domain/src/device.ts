import type { DeviceIdentityEvidence } from "./identity.js";

export const deviceRoles = ["TX", "RX", "UNKNOWN"] as const;
export type DeviceRole = (typeof deviceRoles)[number];

export const connectionStates = [
  "DISCONNECTED",
  "CONNECTING",
  "CONNECTED",
  "REBOOTING",
  "LOST",
] as const;
export type ConnectionState = (typeof connectionStates)[number];

export interface DeviceDescriptor {
  /** Opaque, session-local identifier. It must not contain a hardware serial. */
  readonly id: string;
  readonly transport: string;
  readonly connectionState: ConnectionState;
  readonly displayHint?: string;
}

export interface Capability {
  readonly id: string;
  readonly available: boolean;
  readonly sourceEvidenceIds: readonly string[];
  readonly limitations: readonly string[];
}

export interface DeviceSnapshot {
  readonly descriptor: DeviceDescriptor;
  readonly evidence: readonly DeviceIdentityEvidence[];
  readonly capabilities: readonly Capability[];
}

export interface SessionOwner {
  readonly id: string;
  readonly kind: "WORKFLOW" | "MODULE" | "DIAGNOSTIC" | "SYSTEM";
}

export interface DeviceSession {
  readonly id: string;
  readonly deviceId: string;
  readonly owner: SessionOwner;
  readonly acquiredAt: string;
}
