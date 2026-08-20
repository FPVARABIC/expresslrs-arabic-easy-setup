import { ExclusiveDeviceSessionManager } from "@elrs-easy/device";
import type {
  FirmwareUpdateMethod,
  OperationErrorCode,
} from "@elrs-easy/domain";
import {
  createSyntheticFirmwareArtifact,
  fixtureById,
  MockDiscoveryProvider,
  ScriptedBindingProvider,
  ScriptedFirmwareUpdateProvider,
  syntheticTargetCatalog,
} from "@elrs-easy/platform-mock";
import { FoundationExpressLrsModule } from "@elrs-easy/workflows";
import { getMockScenario, type MockScenarioId } from "./mockScenarios";

export type FoundationDemoTask = "bind" | "update" | "setup" | "diagnose";

export interface FoundationDemoOutcome {
  readonly task: FoundationDemoTask;
  readonly state: string;
  readonly verificationPassed: boolean;
  readonly errorCode: OperationErrorCode | null;
  readonly auditEventCount: number;
  readonly targetId: string | null;
  readonly updateMethod: FirmwareUpdateMethod | null;
}

let operationSequence = 0;

const fixtureIdByScenario: Readonly<Record<MockScenarioId, string | null>> =
  Object.freeze({
    rx24: "known-tx-2g4",
    "tx-sub-ghz": "known-rx-subghz",
    "dual-band": "known-dual-band",
    ambiguous: "ambiguous-family",
    reconnecting: "known-rx-subghz",
    disconnected: null,
  });

export function isSensitiveFoundationTask(task: FoundationDemoTask): boolean {
  return task === "bind" || task === "update";
}

/** UI safety gate; Core identity and compatibility gates remain authoritative. */
export function canRunSensitiveFoundationTask(
  task: FoundationDemoTask,
  scenarioId: MockScenarioId,
): boolean {
  if (!isSensitiveFoundationTask(task)) {
    return true;
  }

  const scenario = getMockScenario(scenarioId);
  return (
    scenario.confidence === "confirmed" &&
    scenario.device?.connection === "connected" &&
    scenario.device.targetId !== null &&
    fixtureIdByScenario[scenarioId] !== null
  );
}

function blockedErrorCode(scenarioId: MockScenarioId): OperationErrorCode {
  const scenario = getMockScenario(scenarioId);
  if (scenario.confidence === "ambiguous") {
    return "IDENTITY_AMBIGUOUS";
  }
  if (scenario.device?.connection === "reconnecting") {
    return "CONNECTION_LOST";
  }
  return "IDENTITY_UNKNOWN";
}

function blockedOutcome(
  task: FoundationDemoTask,
  scenarioId: MockScenarioId,
): FoundationDemoOutcome {
  return Object.freeze({
    task,
    state: "FAILED",
    verificationPassed: false,
    errorCode: blockedErrorCode(scenarioId),
    auditEventCount: 0,
    targetId: null,
    updateMethod: null,
  });
}

function deferredOutcome(task: FoundationDemoTask): FoundationDemoOutcome {
  return Object.freeze({
    task,
    state: "NOT_IMPLEMENTED",
    verificationPassed: false,
    errorCode: "PROVIDER_UNSUPPORTED",
    auditEventCount: 0,
    targetId: null,
    updateMethod: null,
  });
}

function createModule(scenarioId: MockScenarioId) {
  const fixtureId = fixtureIdByScenario[scenarioId];
  const fixture = fixtureById(fixtureId ?? "unknown-mcu-only");
  const scenario = getMockScenario(scenarioId);
  const target =
    scenario.device?.targetId === null ||
    scenario.device?.targetId === undefined
      ? null
      : syntheticTargetCatalog.get(scenario.device.targetId);
  let sessionSequence = 0;
  return {
    descriptor: fixture.descriptor,
    artifact: createSyntheticFirmwareArtifact({
      targetId: target?.targetId ?? "unresolved",
    }),
    module: new FoundationExpressLrsModule({
      providers: {
        discovery: new MockDiscoveryProvider(
          fixtureId === null ? [] : [fixture],
        ),
        binding: new ScriptedBindingProvider({ initial: fixture }),
        firmwareUpdates: [
          new ScriptedFirmwareUpdateProvider({
            initial: fixture,
            providerId: "mock-wifi",
            updateMethod: "WIFI_OTA",
          }),
          new ScriptedFirmwareUpdateProvider({
            initial: fixture,
            providerId: "mock-serial",
            updateMethod: "UART",
          }),
        ],
      },
      sessions: new ExclusiveDeviceSessionManager({
        clock: { now: () => "2026-08-20T08:00:00.000Z" },
        ids: { next: () => `web-mock-session-${++sessionSequence}` },
      }),
      catalog: syntheticTargetCatalog,
      clock: { now: () => "2026-08-20T08:00:00.000Z" },
    }),
  };
}

/** Runs Foundation Core through synthetic providers; no hardware API exists. */
export async function runFoundationDemo(
  task: FoundationDemoTask,
  scenarioId: MockScenarioId,
  userConfirmed: boolean,
): Promise<FoundationDemoOutcome> {
  if (!isSensitiveFoundationTask(task)) {
    return deferredOutcome(task);
  }
  if (!canRunSensitiveFoundationTask(task, scenarioId)) {
    return blockedOutcome(task, scenarioId);
  }

  const harness = createModule(scenarioId);
  const operationId = `web-mock-${task}-${++operationSequence}`;
  const operation =
    task === "bind"
      ? await harness.module.bind({
          operationId,
          descriptor: harness.descriptor,
          userConfirmed,
        })
      : await harness.module.update({
          operationId,
          descriptor: harness.descriptor,
          artifact: harness.artifact,
          userConfirmed,
        });

  const targetId =
    operation.result !== null &&
    "targetId" in operation.result &&
    typeof operation.result.targetId === "string"
      ? operation.result.targetId
      : null;
  const updateMethod =
    operation.result !== null &&
    "updateMethod" in operation.result &&
    typeof operation.result.updateMethod === "string"
      ? (operation.result.updateMethod as FirmwareUpdateMethod)
      : null;

  return Object.freeze({
    task,
    state: operation.state,
    verificationPassed: operation.verificationPassed,
    errorCode: operation.error?.code ?? null,
    auditEventCount: operation.auditEvents.length,
    targetId,
    updateMethod,
  });
}
