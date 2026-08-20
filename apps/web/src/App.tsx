import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  ReadOnlyReconnectState,
  ReadOnlyStageCategory,
} from "@elrs-easy/diagnostics";
import { scrubAuditDetails } from "@elrs-easy/domain";
import {
  createTranslator,
  defaultLocale,
  getDirection,
  translateOperationError,
  type Locale,
  type MessageKey,
} from "@elrs-easy/i18n";
import {
  getMockScenario,
  mockScenarios,
  type ConnectionState,
  type DetectionConfidence,
  type DiscoveryStepState,
  type EvidenceSource,
  type EvidenceStrength,
  type MockScenarioId,
  type MockScenarioViewModel,
} from "./view-model/mockScenarios";
import {
  canRunSensitiveFoundationTask,
  isSensitiveFoundationTask,
  runFoundationDemo,
  type FoundationDemoOutcome,
} from "./view-model/foundationDemo";
import {
  compareLocalHttpIdentitySnapshots,
  createLocalHttpSupportReport,
  expressLrsLocalHttpOrigins,
  runLocalHttpDiscovery,
  type ExpressLrsLocalHttpOrigin,
  type LocalHttpDeviceFact,
  type LocalHttpDiscoveryOutcome,
  type LocalHttpFactKey,
} from "./view-model/localHttpDiscovery";

type TaskId = "bind" | "update" | "setup" | "diagnose";
type CopyState = "idle" | "copied" | "failed";

interface TaskDefinition {
  readonly id: TaskId;
  readonly titleKey: MessageKey;
  readonly descriptionKey: MessageKey;
  readonly actionKey: MessageKey;
  readonly icon: ReactNode;
  readonly tone: "cyan" | "violet" | "amber" | "mint";
}

const taskDefinitions: readonly TaskDefinition[] = [
  {
    id: "bind",
    titleKey: "task.bind.title",
    descriptionKey: "task.bind.description",
    actionKey: "task.bind.action",
    icon: <LinkIcon />,
    tone: "cyan",
  },
  {
    id: "update",
    titleKey: "task.update.title",
    descriptionKey: "task.update.description",
    actionKey: "task.update.action",
    icon: <UpdateIcon />,
    tone: "violet",
  },
  {
    id: "setup",
    titleKey: "task.setup.title",
    descriptionKey: "task.setup.description",
    actionKey: "task.setup.action",
    icon: <SlidersIcon />,
    tone: "amber",
  },
  {
    id: "diagnose",
    titleKey: "task.diagnose.title",
    descriptionKey: "task.diagnose.description",
    actionKey: "task.diagnose.action",
    icon: <PulseIcon />,
    tone: "mint",
  },
];

const realOriginDefinitions: readonly {
  readonly origin: ExpressLrsLocalHttpOrigin;
  readonly labelKey: MessageKey;
}[] = [
  { origin: expressLrsLocalHttpOrigins[0], labelKey: "real.origin.ap" },
  { origin: expressLrsLocalHttpOrigins[1], labelKey: "real.origin.rx" },
  { origin: expressLrsLocalHttpOrigins[2], labelKey: "real.origin.tx" },
];

function cancelledLocalHttpOutcome(
  observedStages: readonly ReadOnlyStageCategory[],
): LocalHttpDiscoveryOutcome {
  const stageCategories = Object.freeze([
    ...observedStages.filter(
      (stage) =>
        stage !== "SUCCESS" && stage !== "FAILED" && stage !== "CANCELLED",
    ),
    "CANCELLED" as const,
  ]);
  return Object.freeze({
    state: "CANCELLED",
    factsCollected: false,
    verificationPassed: false,
    confidence: "UNKNOWN",
    errorCode: null,
    retryable: false,
    facts: Object.freeze([]),
    stageCategories,
  });
}

export function App() {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [advanced, setAdvanced] = useState(false);
  const [scenarioId, setScenarioId] = useState<MockScenarioId>("rx24");
  const [selectedTask, setSelectedTask] = useState<TaskId | null>(null);
  const [demoOutcome, setDemoOutcome] = useState<FoundationDemoOutcome | null>(
    null,
  );
  const [demoRunning, setDemoRunning] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [realOrigin, setRealOrigin] =
    useState<ExpressLrsLocalHttpOrigin>("http://10.0.0.1");
  const [realOutcome, setRealOutcome] =
    useState<LocalHttpDiscoveryOutcome | null>(null);
  const [realRunning, setRealRunning] = useState(false);
  const [realProgress, setRealProgress] = useState<
    readonly ReadOnlyStageCategory[]
  >([]);
  const [realReconnectState, setRealReconnectState] =
    useState<ReadOnlyReconnectState>("NOT_ATTEMPTED");
  const [realAttempts, setRealAttempts] = useState(0);
  const [realCopyState, setRealCopyState] = useState<CopyState>("idle");
  const [realCopyRunning, setRealCopyRunning] = useState(false);
  const demoRequestSequence = useRef(0);
  const realRequestSequence = useRef(0);
  const realAttemptSequence = useRef(0);
  const realCopyRequestSequence = useRef(0);
  const realAbortController = useRef<AbortController | null>(null);
  const realBaselineFacts = useRef<readonly LocalHttpDeviceFact[] | null>(null);
  const realProgressStages = useRef<readonly ReadOnlyStageCategory[]>([]);
  const realReconnectPending = useRef(false);
  const realFocusResultAfterRun = useRef(false);
  const realCancelButton = useRef<HTMLButtonElement | null>(null);
  const realResultSummary = useRef<HTMLDivElement | null>(null);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const scenario = getMockScenario(scenarioId);
  const selectedTaskDefinition = taskDefinitions.find(
    (task) => task.id === selectedTask,
  );
  const selectedTaskIsSensitive =
    selectedTask !== null && isSensitiveFoundationTask(selectedTask);
  const selectedTaskCanRun =
    selectedTask === null ||
    canRunSensitiveFoundationTask(selectedTask, scenarioId);
  const sensitiveActionsAvailable = canRunSensitiveFoundationTask(
    "bind",
    scenarioId,
  );
  const direction = getDirection(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.title = t("app.name");
  }, [direction, locale, t]);

  useEffect(
    () => () => {
      realRequestSequence.current += 1;
      realAbortController.current?.abort();
      realAbortController.current = null;
    },
    [],
  );

  useEffect(() => {
    if (realRunning) {
      realCancelButton.current?.focus();
    } else if (realFocusResultAfterRun.current) {
      realResultSummary.current?.focus();
      realFocusResultAfterRun.current = false;
    }
  }, [realRunning]);

  function selectRealOrigin(origin: ExpressLrsLocalHttpOrigin) {
    realRequestSequence.current += 1;
    realCopyRequestSequence.current += 1;
    realAbortController.current?.abort();
    realAbortController.current = null;
    setRealOrigin(origin);
    setRealOutcome(null);
    setRealRunning(false);
    setRealProgress([]);
    setRealReconnectState("NOT_ATTEMPTED");
    setRealAttempts(0);
    setRealCopyState("idle");
    setRealCopyRunning(false);
    realAttemptSequence.current = 0;
    realBaselineFacts.current = null;
    realProgressStages.current = [];
    realReconnectPending.current = false;
    realFocusResultAfterRun.current = false;
  }

  async function readRealDevice() {
    realAbortController.current?.abort();
    const controller = new AbortController();
    realAbortController.current = controller;
    const requestId = ++realRequestSequence.current;
    const attemptNumber = ++realAttemptSequence.current;
    const baseline = realBaselineFacts.current;
    realCopyRequestSequence.current += 1;
    realProgressStages.current = [];
    realFocusResultAfterRun.current = false;
    setRealOutcome(null);
    setRealRunning(true);
    setRealProgress([]);
    setRealReconnectState(
      realReconnectPending.current ? "REQUIRED" : "NOT_ATTEMPTED",
    );
    setRealAttempts(attemptNumber);
    setRealCopyState("idle");
    setRealCopyRunning(false);
    try {
      const outcome = await runLocalHttpDiscovery({
        origin: realOrigin,
        signal: controller.signal,
        onProgress(stage) {
          if (realRequestSequence.current !== requestId) {
            return;
          }
          realProgressStages.current = realProgressStages.current.includes(
            stage,
          )
            ? realProgressStages.current
            : [...realProgressStages.current, stage];
          setRealProgress((current) =>
            current.includes(stage) ? current : [...current, stage],
          );
        },
      });
      if (realRequestSequence.current === requestId) {
        realFocusResultAfterRun.current =
          document.activeElement === realCancelButton.current;
        setRealOutcome(outcome);
        setRealProgress(outcome.stageCategories);
        realProgressStages.current = outcome.stageCategories;
        if (outcome.state === "SUCCESS") {
          if (baseline === null) {
            realBaselineFacts.current = outcome.facts;
            setRealReconnectState("NOT_ATTEMPTED");
            realReconnectPending.current = false;
          } else if (realReconnectPending.current) {
            setRealReconnectState(
              compareLocalHttpIdentitySnapshots(baseline, outcome.facts),
            );
            realReconnectPending.current = false;
          } else {
            setRealReconnectState("NOT_ATTEMPTED");
          }
        } else if (
          outcome.state === "FAILED" &&
          outcome.errorCode === "CONNECTION_LOST" &&
          baseline !== null
        ) {
          realReconnectPending.current = true;
          setRealReconnectState("REQUIRED");
        } else if (realReconnectPending.current) {
          // Once a baseline read has been followed by a confirmed connection
          // loss, keep the comparison pending through cancellation, DEVICE_BUSY
          // quarantine, or another intermediate failure. Only a successful
          // comparison or an explicit origin change resolves this state.
          setRealReconnectState("REQUIRED");
        } else {
          setRealReconnectState("NOT_ATTEMPTED");
        }
      }
    } finally {
      if (realRequestSequence.current === requestId) {
        realAbortController.current = null;
        setRealRunning(false);
      }
    }
  }

  function cancelRealDeviceRead() {
    realRequestSequence.current += 1;
    realCopyRequestSequence.current += 1;
    realAbortController.current?.abort();
    realAbortController.current = null;
    const outcome = cancelledLocalHttpOutcome(realProgressStages.current);
    realFocusResultAfterRun.current =
      document.activeElement === realCancelButton.current;
    setRealRunning(false);
    setRealOutcome(outcome);
    setRealProgress(outcome.stageCategories);
    realProgressStages.current = outcome.stageCategories;
    setRealReconnectState(
      realReconnectPending.current ? "REQUIRED" : "NOT_ATTEMPTED",
    );
    setRealCopyState("idle");
    setRealCopyRunning(false);
  }

  async function copyRealSupportDetails() {
    if (realOutcome === null) {
      return;
    }
    const requestId = ++realCopyRequestSequence.current;
    const outcome = realOutcome;
    const attempts = realAttempts;
    const baselineAvailable = realBaselineFacts.current !== null;
    const reconnectState = realReconnectState;
    setRealCopyState("idle");
    setRealCopyRunning(true);
    try {
      const report = createLocalHttpSupportReport({
        outcome,
        attempts,
        baselineAvailable,
        reconnectState,
      });
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      if (realCopyRequestSequence.current === requestId) {
        setRealCopyState("copied");
      }
    } catch {
      if (realCopyRequestSequence.current === requestId) {
        setRealCopyState("failed");
      }
    } finally {
      if (realCopyRequestSequence.current === requestId) {
        setRealCopyRunning(false);
      }
    }
  }

  function selectScenario(nextScenario: MockScenarioId) {
    demoRequestSequence.current += 1;
    setScenarioId(nextScenario);
    setSelectedTask(null);
    setDemoOutcome(null);
    setDemoRunning(false);
    setCopyState("idle");
  }

  function selectTask(task: TaskId) {
    demoRequestSequence.current += 1;
    setSelectedTask(task);
    setDemoOutcome(null);
    setDemoRunning(false);
  }

  async function confirmSelectedTask() {
    if (selectedTask === null || !isSensitiveFoundationTask(selectedTask)) {
      return;
    }

    const requestId = ++demoRequestSequence.current;
    setDemoOutcome(null);
    setDemoRunning(true);
    try {
      const outcome = await runFoundationDemo(selectedTask, scenarioId, true);
      if (demoRequestSequence.current === requestId) {
        setDemoOutcome(outcome);
      }
    } finally {
      if (demoRequestSequence.current === requestId) {
        setDemoRunning(false);
      }
    }
  }

  function cancelSelectedTask() {
    demoRequestSequence.current += 1;
    setSelectedTask(null);
    setDemoOutcome(null);
    setDemoRunning(false);
  }

  async function copyTechnicalDetails() {
    setCopyState("idle");
    const scrubbed = scrubAuditDetails({
      confidence: scenario.confidence,
      ...(scenario.device?.targetId === null ||
      scenario.device?.targetId === undefined
        ? {}
        : { targetId: scenario.device.targetId }),
      providerId: "synthetic-foundation",
      validationLevel: "SYNTHETIC",
    });
    const details = JSON.stringify(
      {
        schemaVersion: "1",
        safeDetails: scrubbed.details,
        redactedFieldCount: scrubbed.redactedFieldCount,
        excludedFieldCount: scrubbed.excludedFieldCount,
        redactionCategories: scrubbed.redactionCategories,
      },
      null,
      2,
    );

    try {
      await navigator.clipboard.writeText(details);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="app-shell" dir={direction}>
      <a className="skip-link" href="#main-content">
        {t("navigation.skip")}
      </a>

      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#main-content" aria-label={t("app.name")}>
          <span className="brand-mark" aria-hidden="true">
            <RadioMark />
          </span>
          <span className="brand-copy">
            <strong>{t("app.shortName")}</strong>
            <small>{t("app.tagline")}</small>
          </span>
        </a>

        <div className="topbar-actions">
          <span className="status-pill status-pill-safe">
            <span className="status-dot" aria-hidden="true" />
            {t("status.systemReady")}
          </span>

          <div
            className="language-switcher"
            role="group"
            aria-label={t("language.switch")}
          >
            <button
              className={locale === "ar" ? "is-active" : undefined}
              type="button"
              onClick={() => setLocale("ar")}
              aria-pressed={locale === "ar"}
            >
              {t("language.arabic")}
            </button>
            <button
              className={locale === "en" ? "is-active" : undefined}
              type="button"
              onClick={() => setLocale("en")}
              aria-pressed={locale === "en"}
            >
              {t("language.english")}
            </button>
          </div>
        </div>
      </header>

      <div className="foundation-banner" role="status">
        <span className="foundation-banner-icon" aria-hidden="true">
          <LockIcon />
        </span>
        <span>{t("app.mockNotice")}</span>
        <span className="preview-validation">{t("status.previewBadge")}</span>
      </div>

      <main id="main-content" className="page" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow">
              <SparkIcon />
              {t("home.eyebrow")}
            </span>
            <h1 id="hero-title">{t("home.title")}</h1>
            <p>{t("home.description")}</p>
          </div>

          <aside className="safety-summary" aria-labelledby="safety-heading">
            <span className="safety-icon" aria-hidden="true">
              <ShieldIcon />
            </span>
            <div>
              <h2 id="safety-heading">{t("safety.heading")}</h2>
              <p>{t("safety.description")}</p>
            </div>
          </aside>
        </section>

        <section className="preview-strip" aria-labelledby="preview-heading">
          <div className="preview-heading">
            <div>
              <span className="section-kicker">{t("status.readOnly")}</span>
              <h2 id="preview-heading">{t("home.mockLabel")}</h2>
              <p>{t("home.mockHelp")}</p>
            </div>
            <span className="mock-badge">{t("status.mockBadge")}</span>
          </div>

          <div
            className="scenario-list"
            role="group"
            aria-label={t("home.mockHelp")}
          >
            {mockScenarios.map((item) => (
              <button
                key={item.id}
                className={
                  item.id === scenarioId
                    ? "scenario-chip is-active"
                    : "scenario-chip"
                }
                type="button"
                onClick={() => selectScenario(item.id)}
                aria-pressed={item.id === scenarioId}
              >
                <span
                  className={`scenario-indicator confidence-${item.confidence}`}
                  aria-hidden="true"
                />
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        </section>

        <div className="dashboard-grid">
          <section className="task-panel" aria-labelledby="tasks-heading">
            <div className="section-heading">
              <div>
                <span className="section-kicker">{t("mode.easy")}</span>
                <h2 id="tasks-heading">{t("home.title")}</h2>
              </div>
            </div>

            <div className="task-grid">
              {taskDefinitions.map((task) => {
                const blocked =
                  isSensitiveFoundationTask(task.id) &&
                  !canRunSensitiveFoundationTask(task.id, scenarioId);

                return (
                  <button
                    key={task.id}
                    className={`task-card task-${task.tone} ${selectedTask === task.id ? "is-selected" : ""} ${blocked ? "is-blocked" : ""}`}
                    type="button"
                    onClick={() => selectTask(task.id)}
                    aria-pressed={selectedTask === task.id}
                    aria-busy={selectedTask === task.id && demoRunning}
                    disabled={blocked || demoRunning}
                  >
                    <span className="task-icon" aria-hidden="true">
                      {task.icon}
                    </span>
                    <span className="task-content">
                      <strong>{t(task.titleKey)}</strong>
                      <span>{t(task.descriptionKey)}</span>
                    </span>
                    <span className="task-action">
                      {blocked ? t("discovery.blocked") : t(task.actionKey)}
                      {blocked ? <LockIcon /> : <ArrowIcon />}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedTaskDefinition ? (
              <div className="selection-notice">
                <span className="selection-check" aria-hidden="true">
                  <CheckIcon />
                </span>
                <div className="selection-copy">
                  <strong>
                    {t("task.selected")}: {t(selectedTaskDefinition.titleKey)}
                  </strong>
                  <p>{t("task.previewOnly")}</p>
                  {!selectedTaskIsSensitive ? (
                    <p role="status">{t("task.notImplemented")}</p>
                  ) : demoOutcome === null && !demoRunning ? (
                    <div className="confirmation-preview">
                      <strong>{t("task.confirmTitle")}</strong>
                      <p>
                        {selectedTaskCanRun
                          ? t("task.confirmDescription")
                          : t("task.blocked")}
                      </p>
                      <div className="confirmation-actions">
                        {selectedTaskCanRun ? (
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => void confirmSelectedTask()}
                          >
                            {t("task.confirmAction")}
                          </button>
                        ) : null}
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={cancelSelectedTask}
                        >
                          {t("task.cancelAction")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p role="status">
                      {demoRunning
                        ? t("task.mockRunning")
                        : demoOutcome?.errorCode !== null &&
                            demoOutcome?.errorCode !== undefined
                          ? t("task.mockError", {
                              state: demoOutcome.state,
                              message: translateOperationError(
                                locale,
                                demoOutcome.errorCode,
                              ),
                            })
                          : demoOutcome?.verificationPassed === true
                            ? t("task.mockVerified", {
                                state: demoOutcome.state,
                                events: demoOutcome.auditEventCount,
                              })
                            : demoOutcome === null
                              ? t("task.mockPending")
                              : t("task.mockNotVerified", {
                                  state: demoOutcome.state,
                                })}
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <section className="device-panel" aria-labelledby="device-heading">
            <DeviceOverview scenario={scenario} t={t} />
          </section>
        </div>

        <section className="details-grid">
          <DiscoveryProgress scenario={scenario} t={t} />
          <EvidencePanel scenario={scenario} t={t} />
        </section>

        <section
          className={
            !sensitiveActionsAvailable
              ? "safety-callout is-blocked"
              : "safety-callout"
          }
          aria-live="polite"
        >
          <span className="safety-callout-icon" aria-hidden="true">
            {!sensitiveActionsAvailable ? <LockIcon /> : <ShieldCheckIcon />}
          </span>
          <div>
            <h2>
              {!sensitiveActionsAvailable
                ? t("safety.blockedTitle")
                : t("safety.readOnlyTitle")}
            </h2>
            <p>
              {!sensitiveActionsAvailable
                ? t("safety.blockedDescription")
                : t("safety.readOnlyDescription")}
            </p>
          </div>
        </section>

        <div
          className="mock-divider"
          role="separator"
          aria-label={t("real.mockDivider")}
        >
          <span>{t("real.mockDivider")}</span>
        </div>

        <RealDeviceReadPanel
          locale={locale}
          origin={realOrigin}
          outcome={realOutcome}
          running={realRunning}
          progress={realProgress}
          reconnectState={realReconnectState}
          copyState={realCopyState}
          copyRunning={realCopyRunning}
          t={t}
          onOriginChange={selectRealOrigin}
          onRead={() => void readRealDevice()}
          onCancel={cancelRealDeviceRead}
          onCopy={() => void copyRealSupportDetails()}
          cancelButtonRef={realCancelButton}
          resultSummaryRef={realResultSummary}
        />

        <section
          className="advanced-section"
          aria-labelledby="advanced-heading"
        >
          <div className="advanced-toggle-row">
            <div>
              <span className="section-kicker">{t("mode.advanced")}</span>
              <h2 id="advanced-heading">{t("advanced.heading")}</h2>
              <p>{t("mode.advancedHint")}</p>
            </div>
            <button
              className="switch"
              type="button"
              role="switch"
              aria-checked={advanced}
              onClick={() => setAdvanced((current) => !current)}
            >
              <span aria-hidden="true" />
              <span className="sr-only">{t("mode.advanced")}</span>
            </button>
          </div>

          {advanced ? (
            <div className="advanced-content">
              <dl className="technical-grid">
                <TechnicalDatum
                  label={t("advanced.session")}
                  value={t(scenario.sessionDisplayKey)}
                />
                <TechnicalDatum
                  label={t("advanced.owner")}
                  value={t("advanced.ownerValue")}
                />
                <TechnicalDatum
                  label={t("advanced.provider")}
                  value={t("advanced.providerValue")}
                />
                <TechnicalDatum
                  label={t("advanced.operation")}
                  value={t("advanced.operationValue")}
                />
              </dl>
              <div className="log-row">
                <div>
                  <strong>{t("advanced.log")}</strong>
                  <p>
                    <code>{t("advanced.logLevel")}</code>{" "}
                    {t("advanced.logEntry")}
                  </p>
                  <p>{t("advanced.exportDescription")}</p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void copyTechnicalDetails()}
                >
                  <CopyIcon />
                  {copyState === "copied"
                    ? t("advanced.copied")
                    : t("advanced.copy")}
                </button>
              </div>
              {copyState !== "idle" ? (
                <p
                  className={`clipboard-status ${copyState === "failed" ? "is-error" : ""}`}
                  role="status"
                  aria-live="polite"
                >
                  {copyState === "failed"
                    ? t("advanced.copyFailed")
                    : t("advanced.copied")}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>

      <footer className="footer">
        <div>
          <strong>{t("footer.localFirst")}</strong>
          <span>{t("footer.noCloud")}</span>
        </div>
        <div className="footer-meta">
          <span>{t("footer.version")}</span>
          <span aria-hidden="true">·</span>
          <span>{t("app.independent")}</span>
          <span aria-hidden="true">·</span>
          <a href="THIRD_PARTY_NOTICES.txt">{t("footer.notices")}</a>
        </div>
      </footer>
    </div>
  );
}

type Translator = ReturnType<typeof createTranslator>;

function RealDeviceReadPanel({
  locale,
  origin,
  outcome,
  running,
  progress,
  reconnectState,
  copyState,
  copyRunning,
  t,
  onOriginChange,
  onRead,
  onCancel,
  onCopy,
  cancelButtonRef,
  resultSummaryRef,
}: {
  locale: Locale;
  origin: ExpressLrsLocalHttpOrigin;
  outcome: LocalHttpDiscoveryOutcome | null;
  running: boolean;
  progress: readonly ReadOnlyStageCategory[];
  reconnectState: ReadOnlyReconnectState;
  copyState: CopyState;
  copyRunning: boolean;
  t: Translator;
  onOriginChange: (origin: ExpressLrsLocalHttpOrigin) => void;
  onRead: () => void;
  onCancel: () => void;
  onCopy: () => void;
  cancelButtonRef: RefObject<HTMLButtonElement | null>;
  resultSummaryRef: RefObject<HTMLDivElement | null>;
}) {
  const connectionFailed = outcome?.state === "FAILED";
  const showConnectionHelp = outcome?.errorCode === "CONNECTION_LOST";
  const showChangeOriginHelp = outcome?.errorCode === "PROVIDER_UNSUPPORTED";
  const canRead = !running && (!connectionFailed || outcome.retryable);
  const readAction = connectionFailed
    ? t("real.retryAction")
    : outcome?.state === "SUCCESS"
      ? t("real.refreshAction")
      : t("real.readAction");
  const originDescriptionIds = [
    "real-origin-help",
    ...(showConnectionHelp ? ["real-connection-help"] : []),
    ...(showChangeOriginHelp ? ["real-change-origin-help"] : []),
  ].join(" ");
  const resultDescriptionIds = [
    ...(showConnectionHelp ? ["real-connection-help"] : []),
    ...(showChangeOriginHelp ? ["real-change-origin-help"] : []),
    ...(reconnectState === "NOT_ATTEMPTED" ? [] : ["real-reconnect-status"]),
  ];
  const localizedError =
    outcome?.state === "FAILED"
      ? t("real.errorDescription", {
          message: translateOperationError(
            locale,
            outcome.errorCode ?? "INTERNAL_ERROR",
          ),
        })
      : null;

  return (
    <section
      className="real-device-panel"
      aria-labelledby="real-device-heading"
      aria-busy={running}
    >
      <div className="real-device-heading">
        <div>
          <span className="section-kicker">{t("real.kicker")}</span>
          <h2 id="real-device-heading">{t("real.heading")}</h2>
          <p>{t("real.description")}</p>
        </div>
        <div className="real-device-badges">
          <span className="read-only-badge">
            <LockIcon />
            {t("real.readOnlyBadge")}
          </span>
          <span className="validation-badge">{t("real.unvalidatedBadge")}</span>
        </div>
      </div>

      <div className="real-device-grid">
        <div className="real-device-controls">
          <aside className="wifi-impact" aria-labelledby="wifi-impact-title">
            <span aria-hidden="true">
              <SignalIcon />
            </span>
            <div>
              <h3 id="wifi-impact-title">{t("real.impactTitle")}</h3>
              <p>{t("real.impactDescription")}</p>
            </div>
          </aside>

          <label className="origin-field" htmlFor="expresslrs-local-origin">
            <span>{t("real.originLabel")}</span>
            <select
              id="expresslrs-local-origin"
              value={origin}
              disabled={running}
              aria-describedby={originDescriptionIds}
              onChange={(event) => {
                const selected = expressLrsLocalHttpOrigins.find(
                  (candidate) => candidate === event.currentTarget.value,
                );
                if (selected !== undefined) {
                  onOriginChange(selected);
                }
              }}
            >
              {realOriginDefinitions.map((definition) => (
                <option key={definition.origin} value={definition.origin}>
                  {t(definition.labelKey)}
                </option>
              ))}
            </select>
          </label>

          <p className="real-idle-help" id="real-origin-help">
            {t("real.idleHelp")}
          </p>
          {showConnectionHelp || showChangeOriginHelp ? (
            <div
              className="real-connection-help"
              id={showConnectionHelp ? "real-connection-help" : undefined}
            >
              {showConnectionHelp ? <p>{t("real.connectionHelp")}</p> : null}
              {showChangeOriginHelp ? (
                <p id="real-change-origin-help">{t("real.changeOriginHelp")}</p>
              ) : null}
            </div>
          ) : null}
          <div className="real-device-actions">
            {running ? (
              <button
                ref={cancelButtonRef}
                className="secondary-button"
                type="button"
                onClick={onCancel}
              >
                {t("real.cancelAction")}
              </button>
            ) : canRead ? (
              <button className="primary-button" type="button" onClick={onRead}>
                <CableIcon />
                {readAction}
              </button>
            ) : null}
          </div>
        </div>

        <div className="real-device-result">
          {outcome !== null ? (
            <p
              className="sr-only"
              role={outcome?.state === "FAILED" ? "alert" : "status"}
              aria-atomic="true"
            >
              {outcome.state === "SUCCESS"
                ? t("real.successTitle")
                : outcome.state === "FAILED"
                  ? `${t("real.errorTitle")} ${localizedError ?? ""}`
                  : t("real.cancelled")}
            </p>
          ) : null}
          <div
            ref={resultSummaryRef}
            className="real-result-summary"
            tabIndex={-1}
            aria-describedby={
              resultDescriptionIds.length === 0
                ? undefined
                : resultDescriptionIds.join(" ")
            }
          >
            {running ? (
              <div className="real-result-state is-loading">
                <span className="real-state-icon" aria-hidden="true">
                  <SignalIcon />
                </span>
                <div>
                  <strong>{t("real.loading")}</strong>
                  <p>{t("real.noSecrets")}</p>
                </div>
              </div>
            ) : outcome?.state === "SUCCESS" ? (
              <RealDeviceSuccess outcome={outcome} t={t} />
            ) : outcome?.state === "FAILED" ? (
              <div className="real-result-state is-error">
                <span className="real-state-icon" aria-hidden="true">
                  <AlertIcon />
                </span>
                <div>
                  <strong>{t("real.errorTitle")}</strong>
                  <p>{localizedError}</p>
                  {!outcome.retryable ? (
                    <p>{t("real.retryUnavailable")}</p>
                  ) : null}
                </div>
              </div>
            ) : outcome?.state === "CANCELLED" ? (
              <div className="real-result-state">
                <span className="real-state-icon" aria-hidden="true">
                  <ShieldIcon />
                </span>
                <div>
                  <strong>{t("real.cancelled")}</strong>
                  <p>{t("real.noSecrets")}</p>
                </div>
              </div>
            ) : (
              <div className="real-result-state">
                <span className="real-state-icon" aria-hidden="true">
                  <ShieldCheckIcon />
                </span>
                <div>
                  <strong>{t("real.readOnlyBadge")}</strong>
                  <p>{t("real.noSecrets")}</p>
                </div>
              </div>
            )}
          </div>

          {running || progress.length > 0 ? (
            <RealReadProgress progress={progress} running={running} t={t} />
          ) : null}

          {reconnectState !== "NOT_ATTEMPTED" ? (
            <p
              id="real-reconnect-status"
              className={`real-reconnect-note ${reconnectState === "CHANGED" || reconnectState === "REQUIRED" ? "is-warning" : "is-consistent"}`}
            >
              {t(realReconnectMessage(reconnectState))}
            </p>
          ) : null}

          {outcome !== null ? (
            <div className="real-support">
              <p>{t("real.support.privacy")}</p>
              <div className="real-support-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={onCopy}
                  disabled={copyRunning}
                  aria-busy={copyRunning}
                >
                  {copyRunning
                    ? t("real.support.copying")
                    : t("real.support.copyAction")}
                </button>
                {copyState !== "idle" ? (
                  <p
                    className={`clipboard-status ${copyState === "failed" ? "is-error" : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    {copyState === "failed"
                      ? t("real.support.copyFailed")
                      : t("real.support.copied")}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function RealReadProgress({
  progress,
  running,
  t,
}: {
  progress: readonly ReadOnlyStageCategory[];
  running: boolean;
  t: Translator;
}) {
  const latest = progress.at(-1);

  return (
    <section className="real-progress" aria-labelledby="real-progress-heading">
      <h3 id="real-progress-heading">{t("real.progress.heading")}</h3>
      {running && latest !== undefined ? (
        <p className="sr-only" role="status" aria-atomic="true">
          {t(realProgressMessage(latest))}
        </p>
      ) : null}
      <ol className="real-progress-list">
        {progress.map((stage) => (
          <li
            key={stage}
            className={`real-progress-item ${stage === latest ? "is-current" : "is-observed"} ${stage === "FAILED" || stage === "CANCELLED" ? "is-terminal" : ""}`}
            aria-current={running && stage === latest ? "step" : undefined}
          >
            <span aria-hidden="true">
              {realProgressMarker(stage, latest, running)}
            </span>
            {t(realProgressMessage(stage))}
          </li>
        ))}
      </ol>
    </section>
  );
}

function realProgressMarker(
  stage: ReadOnlyStageCategory,
  latest: ReadOnlyStageCategory | undefined,
  running: boolean,
): string {
  if (stage === latest && running) {
    return "…";
  }
  if (stage === "FAILED") {
    return "!";
  }
  if (stage === "CANCELLED") {
    return "×";
  }
  if (stage === "SUCCESS" || latest === "SUCCESS") {
    return "✓";
  }
  return "•";
}

function realProgressMessage(stage: ReadOnlyStageCategory): MessageKey {
  const messages: Readonly<Record<ReadOnlyStageCategory, MessageKey>> = {
    PREPARING: "real.progress.preparing",
    DISCOVERING: "real.progress.discovering",
    IDENTIFYING: "real.progress.identifying",
    VERIFYING: "real.progress.verifying",
    SUCCESS: "real.progress.success",
    FAILED: "real.progress.failed",
    CANCELLED: "real.progress.cancelled",
  };
  return messages[stage];
}

function realReconnectMessage(
  state: Exclude<ReadOnlyReconnectState, "NOT_ATTEMPTED">,
): MessageKey {
  const messages: Readonly<
    Record<Exclude<ReadOnlyReconnectState, "NOT_ATTEMPTED">, MessageKey>
  > = {
    REQUIRED: "real.reconnect.required",
    CONSISTENT: "real.reconnect.consistent",
    CHANGED: "real.reconnect.changed",
  };
  return messages[state];
}

function RealDeviceSuccess({
  outcome,
  t,
}: {
  outcome: LocalHttpDiscoveryOutcome;
  t: Translator;
}) {
  return (
    <div className="real-success">
      <div className="real-success-heading">
        <span className="real-state-icon" aria-hidden="true">
          <CheckIcon />
        </span>
        <div>
          <strong>{t("real.successTitle")}</strong>
          <p>{t("real.successDescription")}</p>
        </div>
        <span className="reported-badge">{t("real.reportedBadge")}</span>
      </div>

      <dl className="real-facts">
        {outcome.facts.map((fact) => (
          <DeviceFact
            key={fact.key}
            label={t(realFactLabel(fact.key))}
            value={realFactValue(fact, t)}
            mono={fact.key === "target" || fact.key === "commit"}
          />
        ))}
      </dl>

      <div className="real-identity-warning">
        <LockIcon />
        <div>
          <strong>{t("real.unknownTitle")}</strong>
          <p>{t("real.unknownDescription")}</p>
        </div>
      </div>
      <p className="real-snapshot-note">{t("real.snapshotNotice")}</p>
      <p className="real-privacy-note">{t("real.noSecrets")}</p>
    </div>
  );
}

function realFactLabel(key: LocalHttpFactKey): MessageKey {
  const labels: Record<LocalHttpFactKey, MessageKey> = {
    product: "real.fact.product",
    target: "real.fact.target",
    version: "real.fact.version",
    commit: "real.fact.commit",
    role: "real.fact.role",
    radio: "real.fact.radio",
    band: "real.fact.band",
    regLow: "real.fact.regLow",
    regHigh: "real.fact.regHigh",
    custom: "real.fact.custom",
  };
  return labels[key];
}

function realFactValue(fact: LocalHttpDeviceFact, t: Translator): string {
  if (fact.key === "custom") {
    return fact.value === "true" ? t("real.value.yes") : t("real.value.no");
  }
  if (fact.key === "band") {
    const bands: Readonly<Record<string, MessageKey>> = {
      LOW_BAND: "real.value.lowBand",
      HIGH_BAND: "real.value.highBand",
      DUAL_BAND: "real.value.dualBand",
    };
    const key = bands[fact.value];
    return key === undefined ? t("real.value.unknownBand") : t(key);
  }
  return fact.value;
}

function DeviceOverview({
  scenario,
  t,
}: {
  scenario: MockScenarioViewModel;
  t: Translator;
}) {
  const { device } = scenario;

  return (
    <>
      <div className="section-heading device-heading-row">
        <div>
          <span className="section-kicker">{t("device.connection")}</span>
          <h2 id="device-heading">{t("device.heading")}</h2>
        </div>
        <ConnectionBadge state={device?.connection ?? "disconnected"} t={t} />
      </div>

      {device ? (
        <div className="device-card-body">
          <div className="device-identity">
            <span
              className={`device-glyph device-${device.kind}`}
              aria-hidden="true"
            >
              {device.kind === "receiver" ? (
                <ReceiverIcon />
              ) : (
                <TransmitterIcon />
              )}
            </span>
            <div>
              <span className="device-kind">
                {device.kind === "receiver"
                  ? t("device.receiver")
                  : t("device.transmitter")}
              </span>
              <h3>{t(device.modelKey)}</h3>
              <p>{t(device.manufacturerKey)}</p>
            </div>
          </div>

          <dl className="device-facts">
            <DeviceFact
              label={t("device.target")}
              value={t(device.targetKey)}
              mono
            />
            <DeviceFact
              label={t("device.firmware")}
              value={t(device.firmwareKey)}
            />
            <DeviceFact label={t("device.band")} value={t(device.bandKey)} />
          </dl>

          <ConfidenceCard confidence={scenario.confidence} t={t} />
        </div>
      ) : (
        <div className="empty-device">
          <span aria-hidden="true">
            <CableIcon />
          </span>
          <h3>{t("device.none")}</h3>
          <p>{t("device.noneDescription")}</p>
        </div>
      )}
    </>
  );
}

function ConnectionBadge({
  state,
  t,
}: {
  state: ConnectionState;
  t: Translator;
}) {
  const labels: Record<ConnectionState, MessageKey> = {
    connected: "device.connection.connected",
    reconnecting: "device.connection.reconnecting",
    disconnected: "device.connection.disconnected",
  };

  return (
    <span className={`connection-badge connection-${state}`}>
      <span aria-hidden="true" />
      {t(labels[state])}
    </span>
  );
}

function ConfidenceCard({
  confidence,
  t,
}: {
  confidence: DetectionConfidence;
  t: Translator;
}) {
  const labels: Record<DetectionConfidence, MessageKey> = {
    confirmed: "confidence.confirmed",
    high: "confidence.high",
    ambiguous: "confidence.ambiguous",
    unknown: "confidence.unknown",
  };
  const help: Record<DetectionConfidence, MessageKey> = {
    confirmed: "confidence.confirmedHelp",
    high: "confidence.highHelp",
    ambiguous: "confidence.ambiguousHelp",
    unknown: "confidence.unknownHelp",
  };

  return (
    <div className={`confidence-card confidence-${confidence}`}>
      <span className="confidence-icon" aria-hidden="true">
        {confidence === "confirmed" ? (
          <CheckIcon />
        ) : confidence === "ambiguous" ? (
          <AlertIcon />
        ) : (
          <SignalIcon />
        )}
      </span>
      <div>
        <small>{t("confidence.label")}</small>
        <strong>{t(labels[confidence])}</strong>
        <p>{t(help[confidence])}</p>
      </div>
    </div>
  );
}

function DiscoveryProgress({
  scenario,
  t,
}: {
  scenario: MockScenarioViewModel;
  t: Translator;
}) {
  const stepLabels: Record<
    MockScenarioViewModel["steps"][number]["id"],
    MessageKey
  > = {
    discover: "discovery.discover",
    identify: "discovery.identify",
    crossCheck: "discovery.crossCheck",
    ready: "discovery.ready",
  };
  const stateLabels: Record<DiscoveryStepState, MessageKey> = {
    complete: "discovery.complete",
    active: "discovery.active",
    pending: "discovery.pending",
    blocked: "discovery.blocked",
  };

  return (
    <section
      className="info-panel discovery-panel"
      aria-labelledby="discovery-heading"
    >
      <div className="section-heading">
        <div>
          <span className="section-kicker">01</span>
          <h2 id="discovery-heading">{t("discovery.heading")}</h2>
          <p>{t("discovery.description")}</p>
        </div>
      </div>
      <ol className="progress-list">
        {scenario.steps.map((step, index) => (
          <li key={step.id} className={`progress-step step-${step.state}`}>
            <span className="step-marker" aria-hidden="true">
              {step.state === "complete" ? (
                <CheckIcon />
              ) : step.state === "blocked" ? (
                <LockIcon />
              ) : (
                index + 1
              )}
            </span>
            <div>
              <strong>{t(stepLabels[step.id])}</strong>
              <span>{t(stateLabels[step.state])}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EvidencePanel({
  scenario,
  t,
}: {
  scenario: MockScenarioViewModel;
  t: Translator;
}) {
  const sourceLabels: Record<EvidenceSource, MessageKey> = {
    runtime: "evidence.runtime",
    mdns: "evidence.mdns",
    catalog: "evidence.catalog",
    usb: "evidence.usb",
  };
  const strengthLabels: Record<EvidenceStrength, MessageKey> = {
    strong: "evidence.strong",
    supporting: "evidence.supporting",
    weak: "evidence.weak",
  };

  return (
    <section
      className="info-panel evidence-panel"
      aria-labelledby="evidence-heading"
    >
      <div className="section-heading">
        <div>
          <span className="section-kicker">02</span>
          <h2 id="evidence-heading">{t("evidence.heading")}</h2>
          <p>{t("discovery.description")}</p>
        </div>
      </div>

      {scenario.evidence.length > 0 ? (
        <div className="evidence-list">
          {scenario.evidence.map((evidence) => (
            <article key={evidence.id} className="evidence-row">
              <span
                className={`evidence-source source-${evidence.source}`}
                aria-hidden="true"
              >
                <EvidenceIcon source={evidence.source} />
              </span>
              <div className="evidence-copy">
                <span>
                  {sourceLabels[evidence.source]
                    ? t(sourceLabels[evidence.source])
                    : evidence.source}
                </span>
                <strong dir="auto">{t(evidence.valueKey)}</strong>
              </div>
              <span className={`strength-badge strength-${evidence.strength}`}>
                {t(strengthLabels[evidence.strength])}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-evidence">
          <SignalIcon />
          <span>{t("confidence.unknownHelp")}</span>
        </div>
      )}
    </section>
  );
}

function DeviceFact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined} dir="auto">
        {value}
      </dd>
    </div>
  );
}

function TechnicalDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd dir="auto">{value}</dd>
    </div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function RadioMark() {
  return (
    <Icon>
      <path d="M5 17.5h14M7 17.5l1.3-7h7.4l1.3 7M10 10.5V7a2 2 0 0 1 4 0v3.5" />
      <path d="M6.4 4.7a8 8 0 0 1 11.2 0M8.8 7a4.5 4.5 0 0 1 6.4 0" />
    </Icon>
  );
}
function LinkIcon() {
  return (
    <Icon>
      <path d="M9.5 14.5l5-5M7.2 16.8l-1.3 1.3a3.5 3.5 0 0 1-5-5l3.2-3.2a3.5 3.5 0 0 1 5 0M16.8 7.2l1.3-1.3a3.5 3.5 0 0 1 5 5l-3.2 3.2a3.5 3.5 0 0 1-5 0" />
    </Icon>
  );
}
function UpdateIcon() {
  return (
    <Icon>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.1 8A7 7 0 0 1 18.8 6L20 8M4 16l1.2 2A7 7 0 0 0 17.9 16" />
    </Icon>
  );
}
function SlidersIcon() {
  return (
    <Icon>
      <path d="M4 6h6M14 6h6M4 12h10M18 12h2M4 18h2M10 18h10" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </Icon>
  );
}
function PulseIcon() {
  return (
    <Icon>
      <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
    </Icon>
  );
}
function ShieldIcon() {
  return (
    <Icon>
      <path d="M12 3l7 3v5c0 4.7-2.9 8.1-7 10-4.1-1.9-7-5.3-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </Icon>
  );
}
function ShieldCheckIcon() {
  return <ShieldIcon />;
}
function SparkIcon() {
  return (
    <Icon>
      <path d="M12 2l1.2 4.8L18 8l-4.8 1.2L12 14l-1.2-4.8L6 8l4.8-1.2L12 2zM19 15l.6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15z" />
    </Icon>
  );
}
function CheckIcon() {
  return (
    <Icon>
      <path d="M5 12.5l4 4L19 7" />
    </Icon>
  );
}
function AlertIcon() {
  return (
    <Icon>
      <path d="M12 4l9 16H3L12 4zM12 9v5M12 17h.01" />
    </Icon>
  );
}
function SignalIcon() {
  return (
    <Icon>
      <path d="M5 15.5a10 10 0 0 1 14 0M8 18.5a6 6 0 0 1 8 0M12 21h.01M2 12.5a14 14 0 0 1 20 0" />
    </Icon>
  );
}
function LockIcon() {
  return (
    <Icon>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}
function ArrowIcon() {
  return (
    <Icon>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}
function CopyIcon() {
  return (
    <Icon>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Icon>
  );
}
function ReceiverIcon() {
  return (
    <Icon>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M8 8V5M16 8V5M8 14h.01M12 14h4" />
    </Icon>
  );
}
function TransmitterIcon() {
  return (
    <Icon>
      <rect x="3" y="7" width="18" height="13" rx="4" />
      <path d="M9 13H5M7 11v4M15 12h.01M18 15h.01M12 7V3" />
    </Icon>
  );
}
function CableIcon() {
  return (
    <Icon>
      <path d="M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-6 6v4M9 3h6" />
    </Icon>
  );
}
function EvidenceIcon({ source }: { source: EvidenceSource }) {
  if (source === "runtime") return <PulseIcon />;
  if (source === "mdns") return <SignalIcon />;
  if (source === "usb") return <CableIcon />;
  return (
    <Icon>
      <path d="M5 5h14v14H5zM9 9h6M9 13h6M9 17h3" />
    </Icon>
  );
}
