# Physical acceptance result schema

The browser recorder stores one versioned session under:

```text
elrs-easy:physical-acceptance:v1
```

## Trust boundary

The record is operator evidence, not an automatic hardware certification. The application may suggest a result only when it can observe the evidence directly, such as a secure browser context, a CRC-valid CRSF identity, an identity-bound settings backup, a prepared firmware package, or a completed reconnect. RF-link success and destructive recovery always require explicit operator observation.

## Root object

```ts
interface PhysicalAcceptanceSession {
  schemaVersion: 1;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  operatorAlias: string;
  benchLabel: string;
  candidateSha: string;
  appUrl: string;
  userAgent: string;
  language: string;
  overallNotes: string;
  lastContext: PhysicalAcceptanceContextSnapshot | null;
  results: Record<PhysicalAcceptanceStepId, PhysicalAcceptanceStepResult>;
  events: PhysicalAcceptanceEvent[];
}
```

All imported strings are normalized, control and bidi-override characters are removed, sizes are bounded, unknown schema versions are rejected, and the event history is capped.

## Step status

```text
NOT_RUN
PASS
FAIL
BLOCKED
SKIPPED
```

There is deliberately no prerequisite graph in the recorder. Any step may be updated at any time. The recommended order exists in the definitions and documentation only.

## Context snapshot

The snapshot may include:

- secure-context and Web Serial availability;
- selected and observed TX/RX role;
- product name and Firmware/Hardware versions;
- parameter count;
- USB VID/PID when valid;
- selected official Target and confidence;
- Release, revision, platform, and flash method;
- backup availability and writable-parameter count;
- Bind and Bootloader command availability;
- prepared file names, segment count, and SHA-256 values;
- Recovery download and checkpoint state;
- flash progress stage and the current safe status message.

The snapshot does not define fields for Wi-Fi password, SSID, Binding phrase, UID, token, or secret.

## Export protection

JSON and Markdown exports apply a second redaction pass to common sensitive labels. This is defense in depth and does not replace the operator rule not to enter secrets into free-text notes.

## Import limits

- maximum JSON file size: 1,000,000 bytes;
- exact schema version required;
- every known step must be present;
- unknown or invalid status values are rejected;
- package hashes must be 64 hexadecimal characters;
- USB identifiers must fit unsigned 16-bit values;
- event history is limited to the newest 200 entries.

## Evidence review

A reviewer should verify:

1. Candidate SHA matches the tested build.
2. Device and Target evidence are consistent.
3. Read-back evidence exists for settings writes.
4. RF success has independent TX/RX evidence.
5. Firmware success includes verification, reboot, reconnect, Target, and version/commit evidence.
6. Recovery evidence belongs to the same Target and package.
7. No sensitive identifiers or credentials are included.
