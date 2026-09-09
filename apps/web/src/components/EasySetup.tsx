import { useEffect, useRef, useState } from "react";
import { createTranslator, type Locale } from "@elrs-easy/i18n";

import {
  easyStateFromOutcome,
  easyTechnicalDetail,
  type EasyDeviceState,
} from "../easy/easyDeviceModel";
import {
  DENIAL_MESSAGE_KEYS,
  EASY_OPERATIONS,
  EASY_STEPS,
  OPERATION_DESCRIPTION_KEYS,
  OPERATION_TITLE_KEYS,
  STEP_TITLE_KEYS,
  essentialSettings,
  operationCompatibility,
  readBackMatches,
  stepStatuses,
  type EasyOperationId,
  type EasyStepId,
} from "../easy/easyOperations";
import type { CrsfParameter } from "../hardware/crsf";
import type { ExpressLrsIdentity } from "../hardware/session";
import {
  connectUserHardwareSession,
  type HardwareDriverConnector,
  type UserHardwareSession,
} from "../hardware/userSession";
import {
  DeviceWriteAuthority,
  deviceFingerprint,
  type DeviceOperationKind,
} from "../hardware/write-authority";

export interface EasySetupProps {
  readonly locale: Locale;
  readonly onOpenAdvanced: () => void;
  /** Injected only by tests; production always uses the real Web Serial path. */
  readonly hardwareConnector?: HardwareDriverConnector;
}

type Outcome =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "info"; text: string }>
  | Readonly<{ kind: "verified"; text: string }>
  | Readonly<{ kind: "failed"; text: string }>;

function buildSha(): string {
  const value = import.meta.env.VITE_BUILD_SHA;
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value)
    ? value
    : "unpinned-development-build";
}

function parameterValue(parameter: CrsfParameter): number | null {
  return parameter.kind === "selection" || parameter.kind === "number"
    ? parameter.value
    : null;
}

function describeValue(parameter: CrsfParameter): string {
  if (parameter.kind === "selection") {
    return parameter.options[parameter.value] ?? String(parameter.value);
  }
  if (parameter.kind === "number") return String(parameter.value);
  return "";
}

export function EasySetup({
  locale,
  onOpenAdvanced,
  hardwareConnector,
}: EasySetupProps) {
  const t = createTranslator(locale);
  const [operation, setOperation] = useState<EasyOperationId | null>(null);
  const [role, setRole] = useState<"tx" | "rx">("tx");
  const [step, setStep] = useState<EasyStepId>("connect");
  const [failed, setFailed] = useState(false);
  const [device, setDevice] = useState<EasyDeviceState>({ kind: "IDLE" });
  const [parameters, setParameters] = useState<readonly CrsfParameter[]>([]);
  const [identity, setIdentity] = useState<ExpressLrsIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  const [settingId, setSettingId] = useState("");
  const [settingDraft, setSettingDraft] = useState("");
  const [bindAwaitingObservation, setBindAwaitingObservation] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const sessionRef = useRef<UserHardwareSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionCounterRef = useRef(0);
  const authorityRef = useRef(new DeviceWriteAuthority());
  const abortRef = useRef<AbortController | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => () => {
      unsubscribeRef.current?.();
      abortRef.current?.abort();
      void sessionRef.current?.close();
    },
    [],
  );

  useEffect(() => {
    if (operation !== null) panelRef.current?.focus();
  }, [operation]);

  async function releaseSession(): Promise<void> {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    authorityRef.current.revokeAll();
    sessionIdRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    setIdentity(null);
    if (session !== null) await session.close();
  }

  function startOperation(next: EasyOperationId): void {
    setOperation(next);
    setStep(sessionRef.current === null ? "connect" : "compatibility");
    setFailed(false);
    setOutcome({ kind: "none" });
    setBindAwaitingObservation(false);
  }

  async function identify(): Promise<void> {
    setBusy(true);
    setFailed(false);
    setOutcome({ kind: "none" });
    setStep("identify");
    await releaseSession();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await connectUserHardwareSession({
        role,
        signal: controller.signal,
        ...(hardwareConnector === undefined
          ? {}
          : { connector: hardwareConnector }),
      });
      const next = easyStateFromOutcome(result);
      if (result.status === "CONNECTED" && next.kind === "IDENTIFIED") {
        sessionRef.current = result.session;
        sessionCounterRef.current += 1;
        sessionIdRef.current = `easy-${sessionCounterRef.current}`;
        setParameters(result.parameters);
        setIdentity(result.identity);
        unsubscribeRef.current = result.session.onDisconnected(() => {
          sessionRef.current = null;
          sessionIdRef.current = null;
          setIdentity(null);
          setDevice({
            kind: "FAILED",
            messageKey: "easy.fail.UNKNOWN",
            detail: "disconnected",
          });
          setFailed(true);
        });
        setDevice(next);
        setStep("compatibility");
      } else {
        if (result.status === "CONNECTED") await result.session.close();
        setDevice(next);
        setFailed(true);
      }
    } catch (error: unknown) {
      setDevice({
        kind: "FAILED",
        messageKey: "easy.fail.CONNECT_FAILED",
        detail: error instanceof Error ? error.message : "connect failed",
      });
      setFailed(true);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  /**
   * Requests a single-use capability from the shared authority. Easy Mode has no
   * private path to a device write: a refusal here names the missing condition,
   * exactly as it does in the Advanced workbench.
   */
  function authorize(kind: DeviceOperationKind): boolean {
    const fingerprint = identity === null ? null : deviceFingerprint(identity);
    const decision = authorityRef.current.request({
      operation: kind,
      sessionId: sessionIdRef.current,
      deviceFingerprint: fingerprint,
      identityConfirmed: device.kind === "IDENTIFIED",
      portCleanupConfirmed: true,
      operationInProgress: busy,
      recoveryJournalReadable: true,
      pendingRecoveryCheckpoint: false,
      userConfirmed: true,
    });
    if (!decision.granted) {
      setOutcome({
        kind: "failed",
        text: t(DENIAL_MESSAGE_KEYS[decision.reason]),
      });
      setFailed(true);
      return false;
    }
    return (
      authorityRef.current.consume(decision.capability, {
        sessionId: sessionIdRef.current,
        deviceFingerprint: fingerprint,
        operation: kind,
      }) !== null
    );
  }

  async function runBinding(): Promise<void> {
    const session = sessionRef.current;
    if (session === null || !authorize("BINDING")) return;
    setBusy(true);
    setStep("execute");
    try {
      const result = await session.startBinding({ confirmedByUser: true });
      // A command acknowledgement is not a link. The operator must observe the
      // other side before this is recorded as a successful bind.
      setBindAwaitingObservation(true);
      setStep("verify");
      setOutcome({
        kind: "info",
        text: `${t("easy.binding.sent")} (${result.information})`,
      });
    } catch (error: unknown) {
      setFailed(true);
      setOutcome({
        kind: "failed",
        text: error instanceof Error ? error.message : "binding failed",
      });
    } finally {
      setBusy(false);
    }
  }

  function confirmBindObservation(linked: boolean): void {
    setBindAwaitingObservation(false);
    setOutcome(
      linked
        ? { kind: "verified", text: t("easy.binding.verified") }
        : { kind: "failed", text: t("easy.binding.unverified") },
    );
    setFailed(!linked);
  }

  async function runSettingsWrite(): Promise<void> {
    const session = sessionRef.current;
    const selected = essentialSettings(parameters).find(
      (parameter) => String(parameter.id) === settingId,
    );
    if (session === null || selected === undefined) return;
    const requested = Number(settingDraft);
    if (!Number.isFinite(requested)) return;
    if (!authorize("SETTINGS_WRITE")) return;
    setBusy(true);
    setStep("execute");
    try {
      // The shared session performs the write and reads the value back; Easy
      // Mode does not implement a second write path. A write is only reported
      // as applied when the device returns the value that was requested.
      const written = await session.writeParameter(selected.id, requested);
      setStep("verify");
      const applied =
        written.verified && readBackMatches(requested, written.parameter);
      setParameters(session.parameters);
      setOutcome(
        applied
          ? { kind: "verified", text: t("easy.settings.applied") }
          : { kind: "failed", text: t("easy.settings.mismatch") },
      );
      setFailed(!applied);
    } catch (error: unknown) {
      setFailed(true);
      setOutcome({
        kind: "failed",
        text: error instanceof Error ? error.message : "settings write failed",
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyDetails(): Promise<void> {
    if (device.kind !== "IDENTIFIED") return;
    try {
      await navigator.clipboard.writeText(
        easyTechnicalDetail({
          identity: device.identity,
          buildSha: buildSha(),
          at: new Date().toISOString(),
        }),
      );
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  const compatibility =
    operation === null
      ? null
      : operationCompatibility(operation, { identity, parameters });
  const statuses = stepStatuses(step, failed);
  const settings = essentialSettings(parameters);
  const selectedSetting = settings.find(
    (parameter) => String(parameter.id) === settingId,
  );

  if (operation === null) {
    return (
      <section className="easy" aria-labelledby="easy-heading">
        <h1 id="easy-heading">{t("easy.title")}</h1>
        <p className="easy-intro">{t("easy.intro")}</p>
        <ul className="easy-operations">
          {EASY_OPERATIONS.map((id) => (
            <li key={id} className="easy-operation">
              <h2>{t(OPERATION_TITLE_KEYS[id])}</h2>
              <p>{t(OPERATION_DESCRIPTION_KEYS[id])}</p>
              <button
                type="button"
                className="easy-primary"
                onClick={() => startOperation(id)}
              >
                {t("easy.op.start")}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="easy-advanced"
          onClick={onOpenAdvanced}
        >
          {t("easy.advancedCta")}
        </button>
        <p className="easy-note">{t("easy.advancedHint")}</p>
      </section>
    );
  }

  return (
    <section className="easy" aria-labelledby="easy-heading">
      <h1 id="easy-heading">{t(OPERATION_TITLE_KEYS[operation])}</h1>
      <button
        type="button"
        className="easy-advanced"
        onClick={() => {
          setOperation(null);
          void releaseSession();
        }}
      >
        {t("easy.op.back")}
      </button>

      <ol className="easy-steps">
        {EASY_STEPS.map((id) => (
          <li key={id} data-status={statuses[id]}>
            {t(STEP_TITLE_KEYS[id])}
          </li>
        ))}
      </ol>

      <div
        className="easy-result"
        ref={panelRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
      >
        {device.kind !== "IDENTIFIED" ? (
          <>
            <p>{t("easy.step.connectHint")}</p>
            <fieldset className="easy-role" disabled={busy}>
              <legend>{t("easy.roleLabel")}</legend>
              {(["tx", "rx"] as const).map((value) => (
                <label key={value} className="easy-role-option">
                  <input
                    type="radio"
                    name="easy-role"
                    value={value}
                    checked={role === value}
                    onChange={() => setRole(value)}
                  />
                  <span>
                    {value === "tx" ? t("easy.roleTx") : t("easy.roleRx")}
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className="easy-primary"
              onClick={() => void identify()}
              disabled={busy}
            >
              {busy ? t("easy.connecting") : t("easy.connect")}
            </button>
            {device.kind === "FAILED" ? (
              <div className="easy-error">
                <h2>{t("easy.errorHeading")}</h2>
                <p>{t(device.messageKey)}</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <dl className="easy-facts">
              <dt>{t("easy.fieldProduct")}</dt>
              <dd>{device.identity.productName}</dd>
              <dt>{t("easy.fieldFirmware")}</dt>
              <dd>{device.identity.firmwareVersion}</dd>
              <dt>{t("easy.confidence")}</dt>
              <dd>{t("easy.confidenceConfirmed")}</dd>
            </dl>

            {compatibility !== null && !compatibility.supported ? (
              <div className="easy-error">
                <p>{t(compatibility.reasonKey)}</p>
              </div>
            ) : null}

            {operation === "settings" && compatibility?.supported === true ? (
              <div className="easy-settings">
                <label>
                  <span>{t("easy.settings.choose")}</span>
                  <select
                    value={settingId}
                    onChange={(event) => {
                      setSettingId(event.currentTarget.value);
                      const next = settings.find(
                        (parameter) =>
                          String(parameter.id) === event.currentTarget.value,
                      );
                      setSettingDraft(
                        next === undefined
                          ? ""
                          : String(parameterValue(next) ?? ""),
                      );
                    }}
                  >
                    <option value="">—</option>
                    {settings.map((parameter) => (
                      <option key={parameter.id} value={String(parameter.id)}>
                        {parameter.name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedSetting !== undefined ? (
                  <>
                    <p>
                      {t("easy.settings.current")}:{" "}
                      <strong>{describeValue(selectedSetting)}</strong>
                    </p>
                    <label>
                      <span>{t("easy.settings.newValue")}</span>
                      <input
                        type="number"
                        value={settingDraft}
                        onChange={(event) =>
                          setSettingDraft(event.currentTarget.value)
                        }
                      />
                    </label>
                  </>
                ) : null}
              </div>
            ) : null}

            {operation === "firmware" && compatibility?.supported === true ? (
              <p className="easy-note">{t("easy.firmware.handoff")}</p>
            ) : null}

            <div className="easy-actions">
              {compatibility?.supported === true ? (
                <button
                  type="button"
                  className="easy-primary"
                  disabled={
                    busy ||
                    (operation === "settings" && selectedSetting === undefined)
                  }
                  onClick={() => {
                    if (operation === "binding") void runBinding();
                    else if (operation === "settings") void runSettingsWrite();
                    else onOpenAdvanced();
                  }}
                >
                  {busy
                    ? t("easy.run.busy")
                    : operation === "binding"
                      ? t("easy.run.binding")
                      : operation === "settings"
                        ? t("easy.run.settings")
                        : t("easy.run.firmware")}
                </button>
              ) : null}
              <button type="button" onClick={() => void copyDetails()}>
                {copied === "done" ? t("easy.copied") : t("easy.copyDetails")}
              </button>
              <button type="button" onClick={() => void releaseSession()}>
                {t("easy.disconnect")}
              </button>
            </div>

            {bindAwaitingObservation ? (
              <div className="easy-observe">
                <p>{t("easy.binding.confirmQuestion")}</p>
                <button
                  type="button"
                  onClick={() => confirmBindObservation(true)}
                >
                  {t("easy.binding.linked")}
                </button>
                <button
                  type="button"
                  onClick={() => confirmBindObservation(false)}
                >
                  {t("easy.binding.notLinked")}
                </button>
              </div>
            ) : null}

            {outcome.kind !== "none" ? (
              <p
                className={
                  outcome.kind === "failed" ? "easy-error" : "easy-note"
                }
              >
                {outcome.text}
              </p>
            ) : null}
            {copied === "failed" ? <p>{t("easy.copyFailed")}</p> : null}
          </>
        )}
      </div>

      <p className="easy-note">{t("easy.noHardwareClaim")}</p>
    </section>
  );
}
