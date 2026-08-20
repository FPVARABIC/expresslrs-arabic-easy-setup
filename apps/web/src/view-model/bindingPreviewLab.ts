import { ExclusiveDeviceSessionManager } from "@elrs-easy/device";
import type { OperationErrorCode } from "@elrs-easy/domain";
import type { MessageKey } from "@elrs-easy/i18n";
import {
  fixtureById,
  MockDiscoveryProvider,
  ScriptedBindingProvider,
  ScriptedFirmwareUpdateProvider,
  syntheticTargetCatalog,
} from "@elrs-easy/platform-mock";
import {
  createEasyBindingApproval,
  FoundationExpressLrsModule,
  type EasyBindingPreview,
} from "@elrs-easy/workflows";

export const bindingPreviewLabScenarios = [
  {
    id: "tx-2g4",
    fixtureId: "known-tx-2g4",
    labelKey: "scenario.rx24",
  },
  {
    id: "rx-sub-ghz",
    fixtureId: "known-rx-subghz",
    labelKey: "scenario.txSubGhz",
  },
  {
    id: "tx-dual-band",
    fixtureId: "known-dual-band",
    labelKey: "scenario.dualBand",
  },
] as const satisfies readonly {
  readonly id: string;
  readonly fixtureId: string;
  readonly labelKey: MessageKey;
}[];

export type BindingPreviewLabScenarioId =
  (typeof bindingPreviewLabScenarios)[number]["id"];

export interface BindingPreviewLabPreparation {
  readonly scenarioId: BindingPreviewLabScenarioId;
  readonly fixtureId: string;
  readonly operationId: string;
  readonly preview: EasyBindingPreview;
}

export interface BindingPreviewLabOutcome {
  readonly state: string;
  readonly verificationPassed: boolean;
  readonly errorCode: OperationErrorCode | null;
  readonly auditEventCount: number;
  readonly targetId: string | null;
  readonly previewId: string | null;
}

const now = "2026-08-20T08:00:00.000Z";
let operationSequence = 0;

function scenarioDefinition(id: BindingPreviewLabScenarioId) {
  const definition = bindingPreviewLabScenarios.find(
    (candidate) => candidate.id === id,
  );
  if (definition === undefined) {
    throw new TypeError(`Unknown Binding preview lab scenario: ${id}`);
  }
  return definition;
}

function createHarness(fixtureId: string) {
  const fixture = fixtureById(fixtureId);
  let sessionSequence = 0;
  return Object.freeze({
    descriptor: fixture.descriptor,
    module: new FoundationExpressLrsModule({
      providers: {
        discovery: new MockDiscoveryProvider([fixture]),
        binding: new ScriptedBindingProvider({ initial: fixture }),
        firmwareUpdate: new ScriptedFirmwareUpdateProvider({ initial: fixture }),
      },
      sessions: new ExclusiveDeviceSessionManager({
        clock: { now: () => now },
        ids: { next: () => `binding-lab-session-${++sessionSequence}` },
      }),
      catalog: syntheticTargetCatalog,
      clock: { now: () => now },
    }),
  });
}

/**
 * Reads only Synthetic identity/capability facts and returns an immutable
 * preview. No Binding command is reachable from this preparation function.
 */
export async function prepareBindingPreviewLab(
  scenarioId: BindingPreviewLabScenarioId,
): Promise<BindingPreviewLabPreparation> {
  const definition = scenarioDefinition(scenarioId);
  const harness = createHarness(definition.fixtureId);
  const operationId = `web-binding-preview-${++operationSequence}`;
  const preview = await harness.module.previewBinding({
    operationId,
    descriptor: harness.descriptor,
  });

  return Object.freeze({
    scenarioId,
    fixtureId: definition.fixtureId,
    operationId,
    preview,
  });
}

/**
 * Converts the exact displayed preview into a field-bound approval. The Core
 * reconstructs a fresh live preview before Synthetic execution, so a stale or
 * altered preparation fails before prepareBinding/executeBinding.
 */
export async function runPreparedBindingPreviewLab(
  preparation: BindingPreviewLabPreparation,
): Promise<BindingPreviewLabOutcome> {
  const definition = scenarioDefinition(preparation.scenarioId);
  if (definition.fixtureId !== preparation.fixtureId) {
    throw new TypeError("Binding preview fixture does not match the scenario");
  }
  if (preparation.preview.operationId !== preparation.operationId) {
    throw new TypeError("Binding preview operation id does not match");
  }

  const harness = createHarness(definition.fixtureId);
  const approval = createEasyBindingApproval(preparation.preview, now);
  const operation = await harness.module.bind({
    operationId: preparation.operationId,
    descriptor: harness.descriptor,
    approval,
  });

  return Object.freeze({
    state: operation.state,
    verificationPassed: operation.verificationPassed,
    errorCode: operation.error?.code ?? null,
    auditEventCount: operation.auditEvents.length,
    targetId: operation.result?.targetId ?? null,
    previewId: operation.result?.previewId ?? null,
  });
}
