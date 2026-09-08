import { useEffect, useRef, useState } from "react";
import { createTranslator, type Locale } from "@elrs-easy/i18n";

import {
  easyStateFromOutcome,
  easyTechnicalDetail,
  type EasyDeviceState,
} from "../easy/easyDeviceModel";
import {
  connectUserHardwareSession,
  type HardwareDriverConnector,
  type UserHardwareSession,
} from "../hardware/userSession";

export interface EasySetupProps {
  readonly locale: Locale;
  readonly onOpenAdvanced: () => void;
  /** Injected only by tests; production always uses the real Web Serial path. */
  readonly hardwareConnector?: HardwareDriverConnector;
}

type Recheck = "idle" | "busy" | "ok" | "changed";

function buildSha(): string {
  const value = import.meta.env.VITE_BUILD_SHA;
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value)
    ? value
    : "unpinned-development-build";
}

export function EasySetup({
  locale,
  onOpenAdvanced,
  hardwareConnector,
}: EasySetupProps) {
  const t = createTranslator(locale);
  const [role, setRole] = useState<"tx" | "rx">("tx");
  const [state, setState] = useState<EasyDeviceState>({ kind: "IDLE" });
  const [recheck, setRecheck] = useState<Recheck>("idle");
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const sessionRef = useRef<UserHardwareSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => () => {
      unsubscribeRef.current?.();
      abortRef.current?.abort();
      void sessionRef.current?.close();
    },
    [],
  );

  // Move focus to the result region so a keyboard or screen-reader user lands
  // on the answer instead of having to hunt for it after activating the button.
  useEffect(() => {
    if (state.kind === "IDENTIFIED" || state.kind === "FAILED") {
      resultRef.current?.focus();
    }
  }, [state.kind]);

  async function releaseSession(): Promise<void> {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session !== null) await session.close();
  }

  async function identify(): Promise<void> {
    if (state.kind === "CONNECTING") return;
    await releaseSession();
    setRecheck("idle");
    setCopied("idle");
    setState({ kind: "CONNECTING" });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const outcome = await connectUserHardwareSession({
        role,
        signal: controller.signal,
        ...(hardwareConnector === undefined
          ? {}
          : { connector: hardwareConnector }),
      });
      const next = easyStateFromOutcome(outcome);
      if (outcome.status === "CONNECTED") {
        if (next.kind === "IDENTIFIED") {
          sessionRef.current = outcome.session;
          unsubscribeRef.current = outcome.session.onDisconnected(() => {
            sessionRef.current = null;
            setState({
              kind: "FAILED",
              messageKey: "easy.fail.UNKNOWN",
              detail: "disconnected",
            });
          });
        } else {
          // Refused identity: never keep a port open for a device Easy Mode
          // will not describe.
          await outcome.session.close();
        }
      }
      setState(next);
    } catch (error: unknown) {
      setState({
        kind: "FAILED",
        messageKey: "easy.fail.CONNECT_FAILED",
        detail: error instanceof Error ? error.message : "connect failed",
      });
    } finally {
      abortRef.current = null;
    }
  }

  async function recheckDevice(): Promise<void> {
    const session = sessionRef.current;
    if (session === null) return;
    setRecheck("busy");
    try {
      await session.verifyCurrentIdentity();
      setRecheck("ok");
    } catch {
      // A changed or unverifiable device ends the session rather than leaving
      // a stale identity on screen.
      await releaseSession();
      setRecheck("changed");
      setState({ kind: "IDLE" });
    }
  }

  async function copyDetails(): Promise<void> {
    if (state.kind !== "IDENTIFIED") return;
    const text = easyTechnicalDetail({
      identity: state.identity,
      buildSha: buildSha(),
      at: new Date().toISOString(),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  const busy = state.kind === "CONNECTING";

  return (
    <section className="easy" aria-labelledby="easy-heading">
      <h1 id="easy-heading">{t("easy.title")}</h1>
      <p className="easy-intro">{t("easy.intro")}</p>

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
            <span>{value === "tx" ? t("easy.roleTx") : t("easy.roleRx")}</span>
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

      <div
        className="easy-result"
        ref={resultRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
      >
        {state.kind === "IDENTIFIED" ? (
          <>
            <h2>{t("easy.identityHeading")}</h2>
            <dl className="easy-facts">
              <dt>{t("easy.fieldProduct")}</dt>
              <dd>{state.identity.productName}</dd>
              <dt>{t("easy.fieldRole")}</dt>
              <dd>
                {state.identity.role === "tx"
                  ? t("easy.roleTx")
                  : t("easy.roleRx")}
              </dd>
              <dt>{t("easy.fieldFirmware")}</dt>
              <dd>{state.identity.firmwareVersion}</dd>
              <dt>{t("easy.fieldHardware")}</dt>
              <dd>{state.identity.hardwareVersion}</dd>
              <dt>{t("easy.confidence")}</dt>
              <dd>{t("easy.confidenceConfirmed")}</dd>
            </dl>
            <p className="easy-note">{t("easy.noHardwareClaim")}</p>
            <div className="easy-actions">
              <button
                type="button"
                onClick={() => void recheckDevice()}
                disabled={recheck === "busy"}
              >
                {recheck === "busy" ? t("easy.rechecking") : t("easy.recheck")}
              </button>
              <button type="button" onClick={() => void copyDetails()}>
                {copied === "done" ? t("easy.copied") : t("easy.copyDetails")}
              </button>
              <button type="button" onClick={() => void releaseSession()}>
                {t("easy.disconnect")}
              </button>
            </div>
            {recheck === "ok" ? <p>{t("easy.recheckOk")}</p> : null}
            {copied === "failed" ? <p>{t("easy.copyFailed")}</p> : null}
          </>
        ) : null}

        {state.kind === "FAILED" ? (
          <div className="easy-error">
            <h2>{t("easy.errorHeading")}</h2>
            <p>{t(state.messageKey)}</p>
          </div>
        ) : null}

        {recheck === "changed" ? <p>{t("easy.recheckChanged")}</p> : null}
      </div>

      <section className="easy-locked" aria-labelledby="easy-locked-heading">
        <h2 id="easy-locked-heading">{t("easy.lockedHeading")}</h2>
        <ul>
          <li>{t("easy.lockedBinding")}</li>
          <li>{t("easy.lockedSettings")}</li>
          <li>{t("easy.lockedUpdate")}</li>
        </ul>
        <p>{t("easy.lockedWhy")}</p>
      </section>

      <button type="button" className="easy-advanced" onClick={onOpenAdvanced}>
        {t("easy.advancedCta")}
      </button>
      <p className="easy-note">{t("easy.advancedHint")}</p>
    </section>
  );
}
