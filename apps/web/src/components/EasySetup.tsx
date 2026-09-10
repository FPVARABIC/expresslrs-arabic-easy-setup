import { useEffect, useRef, useState } from "react";
import { createTranslator, type Locale } from "@elrs-easy/i18n";

import { buildSha } from "../build-identity";
import {
  easyStateFromIdentity,
  easyStateFromOutcome,
  easyTechnicalDetail,
  type EasyDeviceState,
} from "../easy/easyDeviceModel";
import {
  EASY_OPERATIONS,
  EASY_STEPS,
  OPERATION_DESCRIPTION_KEYS,
  OPERATION_TITLE_KEYS,
  STEP_TITLE_KEYS,
  essentialSettings,
  operationCompatibility,
  stepStatuses,
  type EasyOperationId,
  type EasyStepId,
} from "../easy/easyOperations";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import type { CrsfParameter } from "../hardware/crsf";
import {
  MAX_BIND_PHRASE_LENGTH,
  bindPhraseIssue,
} from "../hardware/bind-phrase";
import { isMachineVerifiedBinding } from "../hardware/binding-evidence";
import type { ExpressLrsFlashMethod } from "../hardware/parity-types";
import type {
  BindingOperationResult,
  DeviceController,
} from "../hardware/useDeviceController";

export interface EasySetupProps {
  readonly locale: Locale;
  readonly onOpenAdvanced: () => void;
  /**
   * The one device controller. Easy Mode holds no session, no authority, and no
   * write path of its own: every operation here is the same operation the
   * Advanced view calls, on the same device, through the same gate.
   */
  readonly controller: DeviceController;
}

type Outcome =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "info"; text: string }>
  | Readonly<{ kind: "verified"; text: string }>
  | Readonly<{ kind: "failed"; text: string }>;

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
  controller,
}: EasySetupProps) {
  const t = createTranslator(locale);
  const {
    antennaAcknowledged,
    availableMethods,
    bindEvidence,
    bindingAcknowledged,
    buildFirmware,
    busy,
    cancelCurrentOperation,
    cancellable,
    captureDiagnostics,
    captureDiagnosticsWithGrants,
    deviceTransportBlocker,
    platformCapabilities,
    catalog,
    catalogState,
    checkpoint,
    connectHardware,
    disconnectHardware,
    downloadRecovery,
    exportDurableRecoveryPackage,
    pickRecoveryFile,
    recoverFromImportedPackage,
    unlockRecoveryFile,
    confirmImportedRecoveryIdentity,
    pickedRecovery,
    importedIdentityConfirmed,
    importedRecovery,
    durableRecovery,
    exactHardwareTarget,
    flashPreparedFirmware,
    flashProgress,
    identity,
    loadCatalog,
    manualTargetConfirmation,
    method,
    options,
    parameters,
    powerAcknowledged,
    prepared,
    recoverFromFile,
    recoveryDownloadStarted,
    recoveryDownloaded,
    regionChoices,
    releases,
    role,
    roleTargets,
    selectedRelease,
    selectedTarget,
    setAntennaAcknowledged,
    setBindingAcknowledged,
    setManualTargetConfirmation,
    setMethod,
    setPowerAcknowledged,
    setRecoveryDownloaded,
    setSelectedReleaseKey,
    setSelectedSettingId,
    setSettingDraft,
    setTargetId,
    settingDraft,
    renderMessage,
    startBinding,
    targetId,
    updateOption,
    writeReady,
    writeSetting,
  } = controller;

  const [operation, setOperation] = useState<EasyOperationId | null>(null);
  const [chosenRole, setChosenRole] = useState<"tx" | "rx">(role);
  const [step, setStep] = useState<EasyStepId>("connect");
  const [failed, setFailed] = useState(false);
  const [connectFailure, setConnectFailure] = useState<EasyDeviceState | null>(
    null,
  );
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  const [settingId, setSettingId] = useState("");
  /**
   * The recovery passphrases, held only in the field the operator typed them
   * into. Never persisted, never put in application state that is serialised,
   * and never included in diagnostics.
   */
  const [recoveryPassphrase, setRecoveryPassphrase] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [bindAwaitingObservation, setBindAwaitingObservation] = useState(false);
  const [operatorBindEvidence, setOperatorBindEvidence] = useState<
    string | null
  >(null);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (operation !== null) panelRef.current?.focus();
  }, [operation]);

  // Derived from the controller's live identity rather than mirrored into local
  // state, so a device that goes away — an unplugged cable, a port detached for
  // flashing — stops being shown as connected without a synchronising effect.
  const live = easyStateFromIdentity(identity);
  const device: EasyDeviceState =
    live.kind === "IDLE" ? (connectFailure ?? live) : live;

  function startOperation(next: EasyOperationId): void {
    setOperation(next);
    setStep(identity === null ? "connect" : "compatibility");
    setFailed(false);
    setOutcome({ kind: "none" });
    setBindAwaitingObservation(false);
    setOperatorBindEvidence(null);
    setConnectFailure(null);
  }

  async function identify(): Promise<void> {
    setFailed(false);
    setOutcome({ kind: "none" });
    setStep("identify");
    const result = await connectHardware({ role: chosenRole });
    if (result === null) {
      setConnectFailure({
        kind: "FAILED",
        messageKey: "easy.fail.CONNECT_FAILED",
        detail: "the attempt stopped before a device port was opened",
      });
      setFailed(true);
      return;
    }
    const next = easyStateFromOutcome(result);
    setConnectFailure(next.kind === "IDENTIFIED" ? null : next);
    if (next.kind === "IDENTIFIED") setStep("compatibility");
    else setFailed(true);
  }

  function applyBindEvidence(result: BindingOperationResult): void {
    setStep("verify");
    const evidence = result.evidence;
    if (evidence === null) {
      // The controller names the specific missing condition; Easy Mode shows
      // that, never a generic refusal.
      setFailed(true);
      setOutcome({ kind: "failed", text: renderMessage(result.message) });
      return;
    }
    if (isMachineVerifiedBinding(evidence)) {
      setFailed(false);
      setOutcome({
        kind: "verified",
        text: t("easy.binding.telemetry", {
          quality: evidence.statistics?.uplinkLinkQuality ?? 0,
        }),
      });
      setOperatorBindEvidence(evidence.level);
      return;
    }
    // No telemetry. Ask the operator, but never promote their answer to
    // machine evidence.
    setBindAwaitingObservation(true);
    setOutcome({ kind: "info", text: t("easy.binding.sent") });
  }

  async function runBinding(): Promise<void> {
    setStep("execute");
    setOutcome({ kind: "info", text: t("easy.binding.observing") });
    applyBindEvidence(await startBinding());
  }

  function confirmBindObservation(linked: boolean): void {
    setBindAwaitingObservation(false);
    setOperatorBindEvidence(
      linked ? "USER_CONFIRMED_LINK" : "COMMAND_ACKNOWLEDGED_ONLY",
    );
    // An operator's confirmation is recorded as their claim. It is never
    // machine-verified, so it is not presented as a verified success.
    setOutcome({
      kind: "info",
      text: linked
        ? t("easy.binding.userConfirmed")
        : t("easy.binding.commandOnly"),
    });
    setFailed(!linked);
  }

  async function runSettingsWrite(): Promise<void> {
    setStep("execute");
    const result = await writeSetting();
    setStep("verify");
    if (result.applied === null) {
      setFailed(true);
      setOutcome({ kind: "failed", text: renderMessage(result.message) });
      return;
    }
    setOutcome(
      result.applied
        ? { kind: "verified", text: t("easy.settings.applied") }
        : { kind: "failed", text: t("easy.settings.mismatch") },
    );
    setFailed(!result.applied);
  }

  async function runFirmwareWrite(): Promise<void> {
    setStep("execute");
    setOutcome({ kind: "none" });
    const result = await flashPreparedFirmware();
    setStep("verify");
    // The controller clears the recovery checkpoint only after the device came
    // back and its Target and version were read and matched, so that is the
    // only evidence Easy Mode reports as a completed update.
    setFailed(!result.verified);
    setOutcome(
      result.verified
        ? { kind: "verified", text: t("easy.fw.verified") }
        : { kind: "failed", text: renderMessage(result.message) },
    );
  }

  async function runRecovery(file: File): Promise<void> {
    setStep("execute");
    const result = await recoverFromFile(file);
    setStep("verify");
    setFailed(!result.verified);
    setOutcome(
      result.verified
        ? { kind: "verified", text: t("easy.fw.verified") }
        : { kind: "failed", text: renderMessage(result.message) },
    );
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
  const evidenceLevel = operatorBindEvidence ?? bindEvidence;
  const phraseIssue = bindPhraseIssue(options.bindPhrase);

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
        <DiagnosticsPanel
          locale={locale}
          capture={captureDiagnostics}
          captureWithGrants={captureDiagnosticsWithGrants}
        />
      </section>
    );
  }

  return (
    <section className="easy" aria-labelledby="easy-heading">
      <h1 id="easy-heading">{t(OPERATION_TITLE_KEYS[operation])}</h1>
      <button
        type="button"
        className="easy-advanced"
        onClick={() => setOperation(null)}
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
            {deviceTransportBlocker === null ? null : (
              <div
                className="easy-error"
                data-transport={deviceTransportBlocker}
              >
                <p>{t(`transport.${deviceTransportBlocker}`)}</p>
                <p>
                  {t("transport.detected", {
                    webSerial: String(platformCapabilities.webSerial),
                    webUsb: String(platformCapabilities.webUsb),
                    bridge: String(platformCapabilities.nativeBridge),
                    secure: String(platformCapabilities.secureContext),
                  })}
                </p>
              </div>
            )}
            <fieldset className="easy-role" disabled={busy}>
              <legend>{t("easy.roleLabel")}</legend>
              {(["tx", "rx"] as const).map((value) => (
                <label key={value} className="easy-role-option">
                  <input
                    type="radio"
                    name="easy-role"
                    value={value}
                    checked={chosenRole === value}
                    onChange={() => setChosenRole(value)}
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
              disabled={busy || deviceTransportBlocker !== null}
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

            {operation === "binding" && compatibility?.supported === true ? (
              <label className="easy-check">
                <input
                  type="checkbox"
                  checked={bindingAcknowledged}
                  disabled={busy}
                  onChange={(event) =>
                    setBindingAcknowledged(event.currentTarget.checked)
                  }
                />
                <span>{t("easy.binding.ready")}</span>
              </label>
            ) : null}

            {operation === "settings" && compatibility?.supported === true ? (
              <div className="easy-settings">
                <label>
                  <span>{t("easy.settings.choose")}</span>
                  <select
                    value={settingId}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSettingId(value);
                      setSelectedSettingId(value);
                      const next = settings.find(
                        (parameter) => String(parameter.id) === value,
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
                {selectedSetting === undefined ? null : (
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
                )}
              </div>
            ) : null}

            {operation === "firmware" && compatibility?.supported === true ? (
              <div className="easy-firmware">
                {catalogState === "ready" ? (
                  <>
                    <p className="easy-note">
                      {t("easy.fw.catalogReady", {
                        releases: releases.length,
                        targets: catalog?.targets.length ?? 0,
                      })}
                    </p>

                    <label>
                      <span>{t("easy.fw.release")}</span>
                      <select
                        value={
                          selectedRelease === null
                            ? ""
                            : JSON.stringify([
                                selectedRelease.channel,
                                selectedRelease.label,
                                selectedRelease.revision,
                              ])
                        }
                        onChange={(event) =>
                          setSelectedReleaseKey(event.currentTarget.value)
                        }
                      >
                        <option value="">—</option>
                        {releases.map((release) => {
                          const key = JSON.stringify([
                            release.channel,
                            release.label,
                            release.revision,
                          ]);
                          return (
                            <option key={key} value={key}>
                              {release.label}
                            </option>
                          );
                        })}
                      </select>
                    </label>

                    <label>
                      <span>{t("easy.fw.target")}</span>
                      <select
                        value={targetId}
                        onChange={(event) =>
                          setTargetId(event.currentTarget.value)
                        }
                      >
                        <option value="">—</option>
                        {roleTargets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.config.productName}
                          </option>
                        ))}
                      </select>
                    </label>

                    {exactHardwareTarget ? (
                      <p className="easy-note">{t("easy.fw.targetExact")}</p>
                    ) : (
                      <label>
                        <span>{t("easy.fw.targetConfirm")}</span>
                        <input
                          type="text"
                          value={manualTargetConfirmation}
                          onChange={(event) =>
                            setManualTargetConfirmation(
                              event.currentTarget.value,
                            )
                          }
                        />
                      </label>
                    )}

                    <label>
                      <span>{t("easy.fw.bindPhrase")}</span>
                      <input
                        type="password"
                        autoComplete="off"
                        maxLength={MAX_BIND_PHRASE_LENGTH}
                        value={options.bindPhrase}
                        disabled={busy}
                        onChange={(event) =>
                          updateOption("bindPhrase", event.currentTarget.value)
                        }
                      />
                    </label>
                    <p className="easy-note">{t("easy.fw.bindPhraseHint")}</p>
                    {phraseIssue === null ? null : (
                      <p className="easy-error">
                        {t(`easy.fw.bindPhrase.${phraseIssue}`)}
                      </p>
                    )}
                    {options.bindPhrase === "" ? null : (
                      <p className="easy-note">
                        {t("easy.fw.bindPhraseUnverifiable")}
                      </p>
                    )}

                    <label>
                      <span>{t("easy.fw.region")}</span>
                      <select
                        value={options.region}
                        onChange={(event) =>
                          updateOption("region", event.currentTarget.value)
                        }
                      >
                        <option value="">—</option>
                        {regionChoices.map((region) => (
                          <option key={region.key} value={region.key}>
                            {region.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>{t("easy.fw.method")}</span>
                      <select
                        value={method}
                        onChange={(event) =>
                          setMethod(
                            event.currentTarget.value as ExpressLrsFlashMethod,
                          )
                        }
                      >
                        {availableMethods.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={() => void buildFirmware()}
                      disabled={
                        busy ||
                        selectedRelease === null ||
                        selectedTarget === null ||
                        options.region === "" ||
                        phraseIssue !== null
                      }
                    >
                      {t("easy.fw.build")}
                    </button>

                    {/*
                      Outside the prepared-package block on purpose. It was
                      inside it, which meant the one path that recovers a
                      device after a reinstall required first building a
                      firmware package over the network. Exporting needs a
                      prepared package; importing needs only the file.
                    */}
                    <button
                      type="button"
                      onClick={() => void pickRecoveryFile()}
                      disabled={busy}
                    >
                      {t("easy.fw.pickRecoveryFile")}
                    </button>
                    {pickedRecovery === null ? null : (
                      <>
                        <p className="easy-note">
                          {t("easy.fw.pickedRecovery", {
                            product:
                              pickedRecovery.header.identity.target.productName,
                            created: pickedRecovery.header.identity.createdAt,
                          })}
                        </p>
                        <label className="easy-field">
                          <span>{t("easy.fw.recoveryPassphrase")}</span>
                          <input
                            type="password"
                            autoComplete="current-password"
                            value={importPassphrase}
                            onChange={(event) => {
                              setImportPassphrase(event.target.value);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            void unlockRecoveryFile(importPassphrase)
                          }
                          disabled={busy}
                        >
                          {t("easy.fw.unlockRecoveryFile")}
                        </button>
                      </>
                    )}
                    {importedRecovery === null ? null : (
                      <>
                        <p className="easy-note">
                          {t("easy.fw.importedIdentityHeading")}:{" "}
                          {importedRecovery.productName} ·{" "}
                          {importedRecovery.targetId} ·{" "}
                          {importedRecovery.releaseLabel}
                        </p>
                        <label className="easy-check">
                          <input
                            type="checkbox"
                            checked={importedIdentityConfirmed}
                            onChange={(event) => {
                              confirmImportedRecoveryIdentity(
                                event.target.checked,
                              );
                            }}
                          />
                          <span>{t("easy.fw.importedIdentityConfirm")}</span>
                        </label>
                        {/*
                              The control that actually restores from an
                              imported package — the path that works after a
                              reinstall, when the journal is gone. Refused by
                              name until the identity above is confirmed.
                            */}
                        <button
                          type="button"
                          onClick={() => void recoverFromImportedPackage()}
                          disabled={busy}
                        >
                          {t("easy.fw.restoreFromImported")}
                        </button>
                      </>
                    )}
                    {prepared === null ? null : (
                      <>
                        <p className="easy-note">
                          {t("easy.fw.prepared", {
                            segments: prepared.segments.length,
                          })}
                        </p>
                        {prepared.optionsSummary.bindingConfigured ? (
                          <p className="easy-note">
                            {t("easy.fw.bindPhraseConfigured")}
                          </p>
                        ) : null}
                        <label className="easy-field">
                          <span>{t("easy.fw.recoveryPassphrase")}</span>
                          <input
                            type="password"
                            autoComplete="new-password"
                            value={recoveryPassphrase}
                            onChange={(event) => {
                              setRecoveryPassphrase(event.target.value);
                            }}
                          />
                        </label>
                        <p className="easy-note">
                          {t("easy.fw.recoveryPassphraseHint")}
                        </p>
                        <p className="easy-note">
                          {t("easy.fw.recoveryPassphraseWhy")}
                        </p>
                        {/*
                          Always clickable. The passphrase is a prerequisite
                          collected right here, so pressing this with an empty
                          field answers with the exact reason rather than
                          presenting a dead control.
                        */}
                        <button
                          type="button"
                          onClick={() =>
                            void exportDurableRecoveryPackage(
                              recoveryPassphrase,
                            )
                          }
                          disabled={busy}
                        >
                          {t("easy.fw.exportDurableRecovery")}
                        </button>
                        {durableRecovery !== null ? (
                          <p className="easy-note">
                            {t("easy.fw.durableRecoveryVerified", {
                              location: durableRecovery.displayName,
                            })}
                          </p>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => downloadRecovery()}
                          disabled={busy}
                        >
                          {t("easy.fw.downloadRecovery")}
                        </button>
                        {recoveryDownloadStarted ? (
                          <label className="easy-check">
                            <input
                              type="checkbox"
                              checked={recoveryDownloaded}
                              onChange={(event) =>
                                setRecoveryDownloaded(
                                  event.currentTarget.checked,
                                )
                              }
                            />
                            <span>{t("easy.fw.recoverySaved")}</span>
                          </label>
                        ) : null}
                        <label className="easy-check">
                          <input
                            type="checkbox"
                            checked={powerAcknowledged}
                            onChange={(event) =>
                              setPowerAcknowledged(event.currentTarget.checked)
                            }
                          />
                          <span>{t("easy.fw.power")}</span>
                        </label>
                        {selectedTarget?.role === "tx" ? (
                          <label className="easy-check">
                            <input
                              type="checkbox"
                              checked={antennaAcknowledged}
                              onChange={(event) =>
                                setAntennaAcknowledged(
                                  event.currentTarget.checked,
                                )
                              }
                            />
                            <span>{t("easy.fw.antenna")}</span>
                          </label>
                        ) : null}
                        {writeReady ? null : (
                          <p className="easy-note">
                            {t("easy.fw.writeBlocked")}
                          </p>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void loadCatalog()}
                    disabled={busy}
                  >
                    {t("easy.fw.loadCatalog")}
                  </button>
                )}

                {flashProgress === null ? null : (
                  <p
                    className="easy-note"
                    data-flash-stage={flashProgress.stage}
                  >
                    {t("easy.fw.progress", {
                      stage: flashProgress.stage,
                      written: flashProgress.writtenBytes,
                      total: flashProgress.totalBytes,
                    })}
                  </p>
                )}
              </div>
            ) : null}

            <div className="easy-actions">
              {compatibility?.supported === true ? (
                <button
                  type="button"
                  className="easy-primary"
                  disabled={
                    busy ||
                    (operation === "binding" && !bindingAcknowledged) ||
                    (operation === "settings" &&
                      selectedSetting === undefined) ||
                    (operation === "firmware" && !writeReady)
                  }
                  onClick={() => {
                    if (operation === "binding") void runBinding();
                    else if (operation === "settings") void runSettingsWrite();
                    else void runFirmwareWrite();
                  }}
                >
                  {busy
                    ? t("easy.run.busy")
                    : operation === "binding"
                      ? t("easy.run.binding")
                      : operation === "settings"
                        ? t("easy.run.settings")
                        : t("easy.fw.write")}
                </button>
              ) : null}
              {busy && cancellable ? (
                <button type="button" onClick={() => cancelCurrentOperation()}>
                  {t("easy.fw.cancel")}
                </button>
              ) : null}
              <button type="button" onClick={() => void copyDetails()}>
                {copied === "done" ? t("easy.copied") : t("easy.copyDetails")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("connect");
                  setConnectFailure(null);
                  void disconnectHardware();
                }}
              >
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
          </>
        )}
        {/* A pending recovery and the last result stay visible even when
            the device is gone: a write that detached the port is exactly
            when the operator needs both. */}
        {checkpoint === null ? null : (
          <div className="easy-error">
            <p>{t("easy.fw.pending", { stage: checkpoint.stage })}</p>
            <p>{t("easy.fw.recoveryNote")}</p>
            <label>
              <span>{t("easy.fw.recoverFile")}</span>
              <input
                type="file"
                accept=".zip,application/zip"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file !== undefined) void runRecovery(file);
                }}
              />
            </label>
          </div>
        )}
        {evidenceLevel === null ? null : (
          <p className="easy-note" data-evidence={evidenceLevel}>
            {evidenceLevel}
          </p>
        )}

        {outcome.kind === "none" ? null : (
          <p
            data-outcome={outcome.kind}
            className={outcome.kind === "failed" ? "easy-error" : "easy-note"}
          >
            {outcome.text}
          </p>
        )}
        {copied === "failed" ? <p>{t("easy.copyFailed")}</p> : null}
      </div>

      <p className="easy-note">{t("easy.noHardwareClaim")}</p>
      <DiagnosticsPanel
        locale={locale}
        capture={captureDiagnostics}
        captureWithGrants={captureDiagnosticsWithGrants}
      />
    </section>
  );
}
