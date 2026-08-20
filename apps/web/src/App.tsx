import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createTranslator,
  defaultLocale,
  getDirection,
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

type TaskId = "bind" | "update" | "setup" | "diagnose";

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

export function App() {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [advanced, setAdvanced] = useState(false);
  const [scenarioId, setScenarioId] = useState<MockScenarioId>("rx24");
  const [selectedTask, setSelectedTask] = useState<TaskId | null>(null);
  const [copied, setCopied] = useState(false);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const scenario = getMockScenario(scenarioId);
  const selectedTaskDefinition = taskDefinitions.find(
    (task) => task.id === selectedTask,
  );
  const direction = getDirection(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.title = t("app.name");
  }, [direction, locale, t]);

  function selectScenario(nextScenario: MockScenarioId) {
    setScenarioId(nextScenario);
    setSelectedTask(null);
    setCopied(false);
  }

  async function copyTechnicalDetails() {
    const details = JSON.stringify(
      {
        scenario: scenario.id,
        session: scenario.sessionId,
        confidence: scenario.confidence,
        device: scenario.device ?? null,
        evidence: scenario.evidence,
      },
      null,
      2,
    );

    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="app-shell" dir={direction}>
      <a className="skip-link" href="#main-content">
        {locale === "ar" ? "انتقل إلى المحتوى" : "Skip to content"}
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
            <span className="mock-badge">MOCK</span>
          </div>

          <div className="scenario-list" role="list">
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
              {taskDefinitions.map((task) => (
                <button
                  key={task.id}
                  className={`task-card task-${task.tone} ${selectedTask === task.id ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => setSelectedTask(task.id)}
                  aria-pressed={selectedTask === task.id}
                >
                  <span className="task-icon" aria-hidden="true">
                    {task.icon}
                  </span>
                  <span className="task-content">
                    <strong>{t(task.titleKey)}</strong>
                    <span>{t(task.descriptionKey)}</span>
                  </span>
                  <span className="task-action">
                    {t(task.actionKey)}
                    <ArrowIcon />
                  </span>
                </button>
              ))}
            </div>

            {selectedTaskDefinition ? (
              <div className="selection-notice" role="status">
                <span className="selection-check" aria-hidden="true">
                  <CheckIcon />
                </span>
                <div>
                  <strong>
                    {t("task.selected")}: {t(selectedTaskDefinition.titleKey)}
                  </strong>
                  <p>{t("task.previewOnly")}</p>
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
            scenario.confidence === "ambiguous" ||
            scenario.confidence === "unknown"
              ? "safety-callout is-blocked"
              : "safety-callout"
          }
          aria-live="polite"
        >
          <span className="safety-callout-icon" aria-hidden="true">
            {scenario.confidence === "ambiguous" ||
            scenario.confidence === "unknown" ? (
              <LockIcon />
            ) : (
              <ShieldCheckIcon />
            )}
          </span>
          <div>
            <h2>
              {scenario.confidence === "ambiguous" ||
              scenario.confidence === "unknown"
                ? t("safety.blockedTitle")
                : t("safety.readOnlyTitle")}
            </h2>
            <p>
              {scenario.confidence === "ambiguous" ||
              scenario.confidence === "unknown"
                ? t("safety.blockedDescription")
                : t("safety.readOnlyDescription")}
            </p>
          </div>
        </section>

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
                  value={scenario.sessionId}
                />
                <TechnicalDatum
                  label={t("advanced.owner")}
                  value="@elrs-easy/platform-mock"
                />
                <TechnicalDatum
                  label={t("advanced.provider")}
                  value="DeterministicMockProvider"
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
                    <code>INFO</code> {t("advanced.logEntry")}
                  </p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void copyTechnicalDetails()}
                >
                  <CopyIcon />
                  {copied ? t("advanced.copied") : t("advanced.copy")}
                </button>
              </div>
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
        </div>
      </footer>
    </div>
  );
}

type Translator = ReturnType<typeof createTranslator>;

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
              <h3>{device.model}</h3>
              <p>{device.manufacturer}</p>
            </div>
          </div>

          <dl className="device-facts">
            <DeviceFact label={t("device.target")} value={device.target} mono />
            <DeviceFact label={t("device.firmware")} value={device.firmware} />
            <DeviceFact label={t("device.band")} value={device.band} />
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
                <strong dir="auto">{evidence.value}</strong>
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
