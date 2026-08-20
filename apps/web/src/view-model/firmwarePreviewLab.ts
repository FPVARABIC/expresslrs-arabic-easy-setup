import type { FirmwareArtifactDescriptor } from "@elrs-easy/compatibility";
import { ExclusiveDeviceSessionManager } from "@elrs-easy/device";
import type { ArtifactProvenance, OperationErrorCode } from "@elrs-easy/domain";
import {
  compatibleFirmwareArtifact,
  compatibleFirmwareProvenance,
  fixtureById,
  majorVersionMismatchArtifact,
  majorVersionMismatchProvenance,
  MockDiscoveryProvider,
  ScriptedBindingProvider,
  ScriptedFirmwareUpdateProvider,
  syntheticTargetCatalog,
} from "@elrs-easy/platform-mock";
import {
  createFirmwareUpdateApproval,
  FoundationExpressLrsModule,
  type FirmwareUpdatePreview,
} from "@elrs-easy/workflows";

const provenanceMismatch: ArtifactProvenance = Object.freeze({
  ...compatibleFirmwareProvenance,
  artifactSha256: "a".repeat(64),
});

export const firmwarePreviewLabScenarios = Object.freeze([
  Object.freeze({
    id: "compatible",
    label: "4.2.0 · COMPATIBLE",
    artifact: compatibleFirmwareArtifact,
    provenance: compatibleFirmwareProvenance,
    artifactValid: true,
  }),
  Object.freeze({
    id: "major-mismatch",
    label: "5.0.0 · MAJOR_MISMATCH",
    artifact: majorVersionMismatchArtifact,
    provenance: majorVersionMismatchProvenance,
    artifactValid: true,
  }),
  Object.freeze({
    id: "provenance-mismatch",
    label: "4.2.0 · PROVENANCE_MISMATCH",
    artifact: compatibleFirmwareArtifact,
    provenance: provenanceMismatch,
    artifactValid: true,
  }),
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly artifact: FirmwareArtifactDescriptor;
  readonly provenance: ArtifactProvenance;
  readonly artifactValid: boolean;
}[]);

export type FirmwarePreviewLabScenarioId =
  (typeof firmwarePreviewLabScenarios)[number]["id"];

export interface FirmwarePreviewLabPreparation {
  readonly scenarioId: FirmwarePreviewLabScenarioId;
  readonly fixtureId: "known-tx-2g4";
  readonly operationId: string;
  readonly preview: FirmwareUpdatePreview;
}

export interface FirmwarePreviewLabOutcome {
  readonly state: string;
  readonly verificationPassed: boolean;
  readonly errorCode: OperationErrorCode | null;
  readonly auditEventCount: number;
  readonly targetId: string | null;
  readonly firmwareVersion: string | null;
  readonly previewId: string | null;
  readonly verificationPlanId: string | null;
  readonly provenanceArtifactSha256: string | null;
}

const now = "2026-08-20T08:00:00.000Z";
let operationSequence = 0;

function scenarioDefinition(id: FirmwarePreviewLabScenarioId) {
  const definition = firmwarePreviewLabScenarios.find(
    (candidate) => candidate.id === id,
  );
  if (definition === undefined) {
    throw new TypeError(`Unknown Firmware preview lab scenario: ${id}`);
  }
  return definition;
}

function createHarness(definition: (typeof firmwarePreviewLabScenarios)[number]) {
  const fixture = fixtureById("known-tx-2g4");
  let sessionSequence = 0;

  return Object.freeze({
    descriptor: fixture.descriptor,
    module: new FoundationExpressLrsModule({
      providers: {
        discovery: new MockDiscoveryProvider([fixture]),
        binding: new ScriptedBindingProvider({ initial: fixture }),
        firmwareUpdate: new ScriptedFirmwareUpdateProvider({
          initial: fixture,
          artifactValid: definition.artifactValid,
        }),
      },
      sessions: new ExclusiveDeviceSessionManager({
        clock: { now: () => now },
        ids: { next: () => `firmware-lab-session-${++sessionSequence}` },
      }),
      catalog: syntheticTargetCatalog,
      clock: { now: () => now },
    }),
  });
}

/**
 * Reads only Synthetic artifact integrity, identity, and capability facts.
 * No prepare/write/reboot/reconnect/verify method is reachable here.
 */
export async function prepareFirmwarePreviewLab(
  scenarioId: FirmwarePreviewLabScenarioId,
): Promise<FirmwarePreviewLabPreparation> {
  const definition = scenarioDefinition(scenarioId);
  const harness = createHarness(definition);
  const operationId = `web-firmware-preview-${++operationSequence}`;
  const preview = await harness.module.previewUpdate({
    operationId,
    descriptor: harness.descriptor,
    artifact: definition.artifact,
    provenance: definition.provenance,
  });

  return Object.freeze({
    scenarioId,
    fixtureId: "known-tx-2g4",
    operationId,
    preview,
  });
}

/**
 * Converts the exact displayed preview into a bound approval. Core rebuilds a
 * fresh preview from the canonical scenario artifact/provenance and live Mock
 * facts before any deterministic in-memory write is allowed.
 */
export async function runPreparedFirmwarePreviewLab(
  preparation: FirmwarePreviewLabPreparation,
): Promise<FirmwarePreviewLabOutcome> {
  const definition = scenarioDefinition(preparation.scenarioId);
  if (preparation.fixtureId !== "known-tx-2g4") {
    throw new TypeError("Firmware preview fixture does not match the scenario");
  }
  if (preparation.preview.operationId !== preparation.operationId) {
    throw new TypeError("Firmware preview operation id does not match");
  }

  const harness = createHarness(definition);
  const approval = createFirmwareUpdateApproval(preparation.preview, now);
  const operation = await harness.module.update({
    operationId: preparation.operationId,
    descriptor: harness.descriptor,
    artifact: definition.artifact,
    provenance: definition.provenance,
    approval,
  });

  return Object.freeze({
    state: operation.state,
    verificationPassed: operation.verificationPassed,
    errorCode: operation.error?.code ?? null,
    auditEventCount: operation.auditEvents.length,
    targetId: operation.result?.targetId ?? null,
    firmwareVersion: operation.result?.firmwareVersion ?? null,
    previewId: operation.result?.previewId ?? null,
    verificationPlanId: operation.result?.verificationPlanId ?? null,
    provenanceArtifactSha256:
      operation.result?.provenanceArtifactSha256 ?? null,
  });
}
