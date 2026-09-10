import { createTranslator, getDirection, type Locale } from "@elrs-easy/i18n";

import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { PhysicalAcceptancePanel } from "./PhysicalAcceptancePanel";

import type { ExpressLrsFlashMethod } from "../hardware/parity-types";
import type { RxAsTxMode } from "../hardware/rx-as-tx";
import type { DeviceOperation } from "../hardware/useDeviceController";
import {
  MAX_BIND_PHRASE_LENGTH,
  bindPhraseIssue,
} from "../hardware/bind-phrase";
import { regulatoryRegionByKey } from "../hardware/regulatory-domain";
import type { HardwareDriverConnector } from "../hardware/userSession";
import {
  METHOD_LABEL_KEYS,
  currentSettingValue,
  formatBytes,
  isStableRelease,
  releaseSelectionKey,
  useDeviceController,
  type DeviceController,
} from "../hardware/useDeviceController";

export interface ExpressLrsParityWorkbenchProps {
  readonly hardwareConnector?: HardwareDriverConnector;
  readonly locale?: Locale;
}

/**
 * The advanced view mounted on its own. It owns one device controller, which
 * is the same controller Easy Mode uses when both are mounted together.
 */
export function ExpressLrsParityWorkbench({
  hardwareConnector,
  locale = "ar",
}: ExpressLrsParityWorkbenchProps = {}) {
  const controller = useDeviceController({
    ...(hardwareConnector === undefined ? {} : { hardwareConnector }),
    locale,
  });
  return (
    <ExpressLrsParityWorkbenchView controller={controller} locale={locale} />
  );
}

export interface ExpressLrsParityWorkbenchViewProps {
  readonly controller: DeviceController;
  /**
   * Chosen by the operator in the shell. The workbench used to hardcode Arabic
   * and `dir="rtl"`, so choosing English left the technical view unreadable in
   * the wrong direction.
   */
  readonly locale: Locale;
}

/**
 * Renders the controller's state and calls its operations. It holds no device
 * state and performs no write of its own, so Easy Mode and Advanced Mode share
 * one session, one identity, and one write authority.
 */
export function ExpressLrsParityWorkbenchView({
  controller,
  locale,
}: ExpressLrsParityWorkbenchViewProps) {
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
    rxAsTxModeSupport,
    readiness,
    captureDiagnosticsWithGrants,
    catalog,
    catalogState,
    checkpoint,
    connectHardware,
    disconnectHardware,
    downloadFirmware,
    downloadLuaScript,
    downloadRecovery,
    exportDurableRecoveryPackage,
    importDurableRecoveryPackage,
    durableRecovery,
    exactHardwareTarget,
    flashPreparedFirmware,
    flashProgress,
    hardwareCleanupReady,
    hardwareCloseInProgress,
    hardwareCloseUncertain,
    hasBindCommand,
    identity,
    loadCatalog,
    manualTargetConfirmation,
    manualTargetConfirmed,
    method,
    operationNeedsTargetConfirmation,
    options,
    physicalAcceptanceContext,
    powerAcknowledged,
    prepared,
    radioKey,
    radios,
    recoverFromFile,
    renderMessage,
    recoveryDownloadStarted,
    recoveryDownloaded,
    recoveryJournalState,
    regionChoices,
    releases,
    resetPreparedState,
    restoreSettings,
    role,
    roleTargets,
    selectedRelease,
    selectedReleaseKey,
    selectedSetting,
    selectedSettingId,
    selectedTarget,
    setAntennaAcknowledged,
    setBindingAcknowledged,
    setManualTargetConfirmation,
    setMethod,
    setOptions,
    setPowerAcknowledged,
    setRadioKey,
    setRecoveryDownloaded,
    setRole,
    setSelectedReleaseKey,
    setSelectedSettingId,
    setSettingDraft,
    setStatus,
    setTargetId,
    setVendorKey,
    settingDraft,
    startBinding,
    status,
    targetDefaults,
    targetId,
    targetMatch,
    updateOption,
    vendorKey,
    vendorTargets,
    vendors,
    visibleTargets,
    writableParameters,
    writeSetting,
  } = controller;

  /**
   * Renders the live reasons one operation is not ready, right beside the
   * control it blocks. A disabled control that does not say why is a dead end
   * for the operator; this makes every one of them explainable.
   */
  const blockers = (operation: DeviceOperation) =>
    readiness[operation].ready ? null : (
      <ul
        className="parity-note operation-blockers"
        data-operation={operation}
        data-ready="no"
      >
        {readiness[operation].missing.map((reason) => (
          <li key={reason.key}>{renderMessage(reason)}</li>
        ))}
      </ul>
    );

  return (
    <main className="parity-shell" dir={getDirection(locale)}>
      <header className="parity-header">
        <div>
          <span className="section-kicker">{t("wb.ui.kicker")}</span>
          <h1>{t("wb.ui.title")}</h1>
          <p>{t("wb.ui.subtitle")}</p>
        </div>
        <span
          className={
            identity === null ? "parity-state" : "parity-state is-ready"
          }
        >
          {identity === null
            ? t("wb.ui.noCrsfSession")
            : t("wb.ui.crsfConnected")}
        </span>
      </header>

      <section className="parity-status" role="status" aria-live="polite">
        <strong>{t("wb.ui.statusLabel")}</strong>
        <span>{renderMessage(status)}</span>
        {busy && cancellable ? (
          <button type="button" onClick={cancelCurrentOperation}>
            {t("wb.ui.cancelOperation")}
          </button>
        ) : null}
      </section>

      {checkpoint === null ? null : (
        <section className="parity-warning" aria-labelledby="recovery-heading">
          <div>
            <strong id="recovery-heading">
              {t("wb.ui.pendingRecovery")} {checkpoint.stage}
            </strong>
            <p>
              {checkpoint.productName} — {t("wb.ui.recoveryPickSameTarget")}
            </p>
            {checkpoint.safeError === null ? null : (
              <p>{checkpoint.safeError}</p>
            )}
          </div>
          {selectedTarget === null ? null : (
            <div>
              <label className="manual-confirm">
                <span>{t("wb.ui.confirmTargetForRecovery")}</span>
                <input
                  type="text"
                  value={manualTargetConfirmation}
                  placeholder={selectedTarget.targetKey}
                  disabled={busy || !hardwareCleanupReady}
                  onChange={(event) =>
                    setManualTargetConfirmation(event.currentTarget.value)
                  }
                />
                <small>
                  {t("wb.ui.typeExactly")}
                  {selectedTarget.targetKey}
                </small>
              </label>
              <div className="flash-acknowledgements">
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={powerAcknowledged}
                    disabled={busy || !hardwareCleanupReady}
                    onChange={(event) =>
                      setPowerAcknowledged(event.currentTarget.checked)
                    }
                  />
                  <span>{t("wb.ui.powerStableRecovery")}</span>
                </label>
                {selectedTarget.role === "tx" ? (
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={antennaAcknowledged}
                      disabled={busy || !hardwareCleanupReady}
                      onChange={(event) =>
                        setAntennaAcknowledged(event.currentTarget.checked)
                      }
                    />
                    <span>{t("wb.ui.antennaFittedRecovery")}</span>
                  </label>
                ) : null}
              </div>
            </div>
          )}
          <label className="file-button">
            {t("wb.ui.chooseRecoveryPackage")}
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={
                busy ||
                selectedTarget === null ||
                !hardwareCleanupReady ||
                !manualTargetConfirmed ||
                !powerAcknowledged ||
                (selectedTarget.role === "tx" && !antennaAcknowledged)
              }
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined) void recoverFromFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </section>
      )}

      {recoveryJournalState === "loading" ? (
        <p className="danger-note" role="status">
          {t("wb.ui.journalChecking")}
        </p>
      ) : recoveryJournalState === "error" ? (
        <p className="danger-note" role="alert">
          {t("wb.ui.journalUnreadable")}
        </p>
      ) : null}

      <section className="parity-card" aria-labelledby="catalog-heading">
        <div className="parity-card-heading">
          <div>
            <span>1</span>
            <div>
              <h2 id="catalog-heading">{t("wb.ui.catalogHeading")}</h2>
              <p>{t("wb.ui.catalogSubtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void loadCatalog()}
          >
            {catalogState === "loading"
              ? t("wb.ui.loading")
              : t("wb.ui.loadCatalog")}
          </button>
        </div>

        <div className="segmented" aria-label={t("wb.ui.deviceType")}>
          {(["tx", "rx"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={role === item ? "is-active" : ""}
              disabled={busy}
              onClick={() => {
                setRole(item);
                void disconnectHardware();
                targetDefaults(item);
              }}
            >
              {item === "tx" ? t("wb.ui.deviceTx") : t("wb.ui.deviceRx")}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <label>
            <span>{t("wb.ui.release")}</span>
            <select
              value={selectedReleaseKey}
              disabled={catalog === null || busy}
              onChange={(event) => {
                setSelectedReleaseKey(event.currentTarget.value);
                resetPreparedState();
              }}
            >
              <option value="">{t("wb.ui.chooseRelease")}</option>
              {releases.map((release) => (
                <option
                  key={releaseSelectionKey(release)}
                  value={releaseSelectionKey(release)}
                >
                  {release.label}
                  {!isStableRelease(release)
                    ? t("wb.ui.experimentalSuffix")
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t("wb.ui.vendor")}</span>
            <select
              value={vendorKey}
              disabled={catalog === null || busy}
              onChange={(event) => {
                const nextVendor = event.currentTarget.value;
                const nextRadio =
                  roleTargets.find((target) => target.vendorKey === nextVendor)
                    ?.radioKey ?? "";
                const nextTarget = roleTargets.find(
                  (target) =>
                    target.vendorKey === nextVendor &&
                    target.radioKey === nextRadio,
                );
                setVendorKey(nextVendor);
                setRadioKey(nextRadio);
                setTargetId(nextTarget?.id ?? "");
                setManualTargetConfirmation("");
                setOptions((current) => ({
                  ...current,
                  region: "",
                  domain: -1,
                }));
                resetPreparedState();
              }}
            >
              {vendors.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t("wb.ui.bandFamily")}</span>
            <select
              value={radioKey}
              disabled={catalog === null || busy}
              onChange={(event) => {
                const nextRadio = event.currentTarget.value;
                const nextTarget = vendorTargets.find(
                  (target) => target.radioKey === nextRadio,
                );
                setRadioKey(nextRadio);
                setTargetId(nextTarget?.id ?? "");
                setManualTargetConfirmation("");
                setOptions((current) => ({
                  ...current,
                  region: "",
                  domain: -1,
                }));
                resetPreparedState();
              }}
            >
              {radios.map((radio) => (
                <option key={radio} value={radio}>
                  {radio}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Target</span>
            <select
              value={targetId}
              disabled={catalog === null || busy}
              onChange={(event) => {
                const nextId = event.currentTarget.value;
                const nextTarget = roleTargets.find(
                  (target) => target.id === nextId,
                );
                setTargetId(nextId);
                setManualTargetConfirmation("");
                const methods = nextTarget?.config.uploadMethods ?? [];
                setMethod(
                  methods.includes("uart")
                    ? "uart"
                    : (methods[0] ?? "download"),
                );
                resetPreparedState();
              }}
            >
              {visibleTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.config.productName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t("wb.ui.regulatoryRegion")}</span>
            <select
              value={options.region}
              disabled={selectedTarget === null || busy}
              onChange={(event) =>
                updateOption("region", event.currentTarget.value)
              }
            >
              <option value="">{t("wb.ui.chooseRegion")}</option>
              {regionChoices.map((region) => (
                <option key={region.key} value={region.key}>
                  {region.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t("wb.ui.updateMethod")}</span>
            <select
              value={method}
              disabled={selectedTarget === null || busy}
              onChange={(event) => {
                setMethod(event.currentTarget.value as ExpressLrsFlashMethod);
                setManualTargetConfirmation("");
                setPowerAcknowledged(false);
                setAntennaAcknowledged(false);
              }}
            >
              {availableMethods.map((item) => (
                <option key={item} value={item}>
                  {t(METHOD_LABEL_KEYS[item])}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedTarget === null ? null : (
          <dl className="target-summary">
            <div>
              <dt>{t("wb.ui.platform")}</dt>
              <dd>{selectedTarget.config.platform}</dd>
            </div>
            <div>
              <dt>Firmware key</dt>
              <dd>{selectedTarget.config.firmware}</dd>
            </div>
            <div>
              <dt>{t("wb.ui.officialTargetMethods")}</dt>
              <dd>
                {selectedTarget.config.uploadMethods
                  .map((item) => t(METHOD_LABEL_KEYS[item]))
                  .join(" · ")}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="parity-card" aria-labelledby="device-heading">
        <div className="parity-card-heading">
          <div>
            <span>2</span>
            <div>
              <h2 id="device-heading">{t("wb.ui.deviceHeading")}</h2>
              <p>{t("wb.ui.deviceSubtitle")}</p>
            </div>
          </div>
          {identity === null ? (
            <button
              type="button"
              className="primary-button"
              disabled={
                busy || hardwareCloseUncertain || hardwareCloseInProgress
              }
              onClick={() => void connectHardware()}
            >
              {t("wb.ui.identifyOverCrsf")}
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void disconnectHardware()}
            >
              {t("wb.ui.closeSession")}
            </button>
          )}
        </div>

        {identity === null ? (
          <p className="empty-state">{t("wb.ui.usePortNote")}</p>
        ) : (
          <>
            <dl className="target-summary">
              <div>
                <dt>{t("wb.ui.device")}</dt>
                <dd>{identity.productName}</dd>
              </div>
              <div>
                <dt>Firmware</dt>
                <dd>{identity.firmwareVersion}</dd>
              </div>
              <div>
                <dt>CRSF Parameters</dt>
                <dd>{identity.parameterCount}</dd>
              </div>
              <div>
                <dt>{t("wb.ui.targetMatch")}</dt>
                <dd>
                  {targetMatch?.confidence ??
                    (catalog === null
                      ? t("wb.ui.awaitingCatalog")
                      : "NOT_FOUND")}
                </dd>
              </div>
            </dl>
            {exactHardwareTarget ? (
              <p className="success-note">{t("wb.ui.targetAutoMatched")}</p>
            ) : catalog === null ? (
              <p className="empty-state">
                {t("wb.ui.identityPinnedLoadLater")}
              </p>
            ) : (
              <p className="danger-note">
                {t("wb.ui.identityPinnedNeedsManual")}
              </p>
            )}

            {identity === null ? (
              <p className="danger-note">{t("wb.ui.connectToReadSettings")}</p>
            ) : null}

            <div className="settings-grid">
              <label>
                <span>{t("wb.ui.setting")}</span>
                <select
                  value={selectedSettingId}
                  disabled={busy || writableParameters.length === 0}
                  onChange={(event) => {
                    const id = event.currentTarget.value;
                    setSelectedSettingId(id);
                    setSettingDraft(
                      currentSettingValue(
                        writableParameters.find(
                          (parameter) => String(parameter.id) === id,
                        ),
                      ),
                    );
                  }}
                >
                  {writableParameters.map((parameter) => (
                    <option key={parameter.id} value={parameter.id}>
                      {parameter.name}
                    </option>
                  ))}
                </select>
              </label>

              {selectedSetting?.kind === "selection" ? (
                <label>
                  <span>{t("wb.ui.value")}</span>
                  <select
                    value={settingDraft}
                    disabled={busy}
                    onChange={(event) =>
                      setSettingDraft(event.currentTarget.value)
                    }
                  >
                    {selectedSetting.options.map((label, index) => (
                      <option key={`${index}:${label}`} value={index}>
                        {label || index}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  <span>{t("wb.ui.value")}</span>
                  <input
                    type="number"
                    value={settingDraft}
                    min={
                      selectedSetting?.kind === "number"
                        ? selectedSetting.min
                        : undefined
                    }
                    max={
                      selectedSetting?.kind === "number"
                        ? selectedSetting.max
                        : undefined
                    }
                    disabled={busy || selectedSetting === undefined}
                    onChange={(event) =>
                      setSettingDraft(event.currentTarget.value)
                    }
                  />
                </label>
              )}

              <div className="settings-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={!readiness.settingsWrite.ready}
                  onClick={() => void writeSetting()}
                >
                  {t("wb.ui.saveWithReadBack")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!readiness.settingsRestore.ready}
                  onClick={() => void restoreSettings()}
                >
                  {t("wb.ui.restoreSnapshot")}
                </button>
                {hasBindCommand ? (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!readiness.binding.ready}
                    onClick={() => void startBinding()}
                  >
                    {t("wb.ui.runRealBinding")}
                  </button>
                ) : null}
              </div>
              {blockers("settingsWrite")}
              {blockers("settingsRestore")}
              {hasBindCommand ? blockers("binding") : null}
              {hasBindCommand ? (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={bindingAcknowledged}
                    disabled={!readiness.bindingPrerequisites.ready}
                    onChange={(event) =>
                      setBindingAcknowledged(event.currentTarget.checked)
                    }
                  />
                  <span>{t("wb.ui.bindingAcknowledgement")}</span>
                </label>
              ) : null}
              {bindEvidence === null ? null : (
                <p className="parity-note" data-evidence={bindEvidence}>
                  {t("wb.ui.bindEvidenceLevel")}
                  {bindEvidence}
                </p>
              )}
            </div>
          </>
        )}
      </section>

      <section className="parity-card" aria-labelledby="options-heading">
        <div className="parity-card-heading">
          <div>
            <span>3</span>
            <div>
              <h2 id="options-heading">{t("wb.ui.optionsHeading")}</h2>
              <p>{t("wb.ui.optionsSubtitle")}</p>
            </div>
          </div>
        </div>

        <div className="form-grid">
          <label>
            <span>{t("wb.ui.bindPhrase")}</span>
            <input
              type="password"
              autoComplete="off"
              value={options.bindPhrase}
              maxLength={MAX_BIND_PHRASE_LENGTH}
              disabled={busy}
              onChange={(event) =>
                updateOption("bindPhrase", event.currentTarget.value)
              }
            />
            <small>{t("wb.ui.bindPhraseNote")}</small>
            {bindPhraseIssue(options.bindPhrase) === null ? null : (
              <small className="parity-error">
                {t("wb.ui.bindPhraseInvalid")}
              </small>
            )}
          </label>
          <label>
            <span>{t("wb.ui.wifiSsid")}</span>
            <input
              type="text"
              autoComplete="off"
              value={options.wifiSsid}
              maxLength={32}
              disabled={busy}
              onChange={(event) =>
                updateOption("wifiSsid", event.currentTarget.value)
              }
            />
          </label>
          <label>
            <span>{t("wb.ui.wifiPassword")}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={options.wifiPassword}
              maxLength={63}
              disabled={busy}
              onChange={(event) =>
                updateOption("wifiPassword", event.currentTarget.value)
              }
            />
          </label>
          <label>
            <span>{t("wb.ui.wifiAutoOn")}</span>
            <input
              type="number"
              min={0}
              max={86400}
              value={options.wifiAutoOnInterval}
              disabled={busy}
              onChange={(event) =>
                updateOption(
                  "wifiAutoOnInterval",
                  Number(event.currentTarget.value),
                )
              }
            />
          </label>
          <label>
            <span>Fan runtime</span>
            <input
              type="number"
              min={0}
              max={86400}
              value={options.fanRuntime}
              disabled={busy}
              onChange={(event) =>
                updateOption("fanRuntime", Number(event.currentTarget.value))
              }
            />
          </label>

          {role === "tx" ? (
            <>
              <label>
                <span>Telemetry interval</span>
                <input
                  type="number"
                  min={0}
                  max={65535}
                  value={options.telemetryInterval}
                  disabled={busy}
                  onChange={(event) =>
                    updateOption(
                      "telemetryInterval",
                      Number(event.currentTarget.value),
                    )
                  }
                />
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={options.uartInverted}
                  disabled={busy}
                  onChange={(event) =>
                    updateOption("uartInverted", event.currentTarget.checked)
                  }
                />
                <span>{t("wb.ui.uartInverted")}</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={options.unlockHigherPower}
                  disabled={busy}
                  onChange={(event) =>
                    updateOption(
                      "unlockHigherPower",
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>{t("wb.ui.unlockHigherPower")}</span>
              </label>
            </>
          ) : (
            <>
              <label>
                <span>Receiver UART baud</span>
                <input
                  type="number"
                  min={9600}
                  max={2000000}
                  value={options.receiverUartBaud}
                  disabled={busy}
                  onChange={(event) =>
                    updateOption(
                      "receiverUartBaud",
                      Number(event.currentTarget.value),
                    )
                  }
                />
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={options.receiverInvertTx}
                  disabled={busy}
                  onChange={(event) =>
                    updateOption(
                      "receiverInvertTx",
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>{t("wb.ui.receiverInvertTx")}</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={options.lockOnFirstConnection}
                  disabled={busy}
                  onChange={(event) =>
                    updateOption(
                      "lockOnFirstConnection",
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>{t("wb.ui.lockOnFirstConnection")}</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={options.r9mmMiniSbus}
                  disabled={busy}
                  onChange={(event) =>
                    updateOption("r9mmMiniSbus", event.currentTarget.checked)
                  }
                />
                <span>R9MM Mini SBUS</span>
              </label>
              <label className="select-field">
                <span>{t("workbench.options.rxAsTx")}</span>
                <select
                  value={options.rxAsTxMode}
                  disabled={busy}
                  data-testid="rx-as-tx-mode"
                  onChange={(event) =>
                    updateOption(
                      "rxAsTxMode",
                      event.currentTarget.value as RxAsTxMode,
                    )
                  }
                >
                  <option value="off">
                    {t("workbench.options.rxAsTx.off")}
                  </option>
                  {rxAsTxModeSupport.map(({ mode, support }) => (
                    <option
                      key={mode}
                      value={mode}
                      disabled={!support.supported}
                    >
                      {t(`workbench.options.rxAsTx.${mode}`)}
                    </option>
                  ))}
                </select>
              </label>
              {/*
                One note per distinct reason. When every mode is closed for the
                same reason — no Target chosen yet, or an STM32 that has no
                transmitter build at all — repeating it once per mode would say
                the same thing twice.
              */}
              {[
                ...new Map(
                  rxAsTxModeSupport
                    .filter(({ support }) => !support.supported)
                    .map((entry) => [
                      entry.support.supported ? "" : entry.support.reason,
                      entry,
                    ]),
                ).values(),
              ].map(({ mode, support }) =>
                support.supported ? null : (
                  <p
                    key={support.reason}
                    className="parity-note rx-as-tx-note"
                    data-rx-as-tx-mode={mode}
                    data-rx-as-tx-reason={support.reason}
                  >
                    {t(`workbench.rxAsTx.${support.reason}`, {
                      target: support.targetName,
                      platform: support.platform,
                      modes: support.availableModes.join(", "),
                    })}
                  </p>
                ),
              )}
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={options.airportEnabled}
                  disabled={busy}
                  data-testid="airport-enabled"
                  onChange={(event) =>
                    updateOption("airportEnabled", event.currentTarget.checked)
                  }
                />
                <span>{t("workbench.options.airport")}</span>
              </label>
            </>
          )}
        </div>
      </section>

      <section className="parity-card" aria-labelledby="package-heading">
        <div className="parity-card-heading">
          <div>
            <span>4</span>
            <div>
              <h2 id="package-heading">{t("wb.ui.packageHeading")}</h2>
              <p>{t("wb.ui.packageSubtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={
              busy ||
              selectedRelease === null ||
              selectedTarget === null ||
              regulatoryRegionByKey(options.region) === null
            }
            onClick={() => void buildFirmware()}
          >
            {t("wb.ui.buildOfficialFirmware")}
          </button>
        </div>

        {readiness.firmwareWrite.ready ? null : (
          <div className="danger-note" data-testid="firmware-write-blockers">
            <strong>{t("wb.ui.flashNeeds")}</strong>
            <ul>
              {readiness.firmwareWrite.missing.map((reason) => (
                <li key={reason.key}>{renderMessage(reason)}</li>
              ))}
            </ul>
          </div>
        )}

        {prepared === null ? (
          <p className="empty-state">{t("wb.ui.noPackageYet")}</p>
        ) : (
          <>
            <dl className="segment-list">
              {prepared.segments.map((segment) => (
                <div key={`${segment.address}:${segment.name}`}>
                  <dt>
                    {segment.name} · 0x
                    {segment.address.toString(16).toUpperCase()}
                  </dt>
                  <dd>
                    {formatBytes(segment.bytes.byteLength)} ·{" "}
                    <code>{segment.sha256.slice(0, 16)}…</code>
                  </dd>
                </div>
              ))}
            </dl>

            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={downloadFirmware}
              >
                {t("wb.ui.downloadFirmware")}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={downloadRecovery}
              >
                {t("wb.ui.downloadRecovery")}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void exportDurableRecoveryPackage()}
              >
                {t("wb.ui.exportDurableRecovery")}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void importDurableRecoveryPackage()}
              >
                {t("wb.ui.importDurableRecovery")}
              </button>
              {selectedTarget?.role === "tx" ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void downloadLuaScript()}
                >
                  {t("wb.ui.downloadLua")}
                </button>
              ) : null}
            </div>

            {durableRecovery !== null ? (
              <p className="success-note">
                {t("wb.ui.durableRecoveryLocation")}:{" "}
                {durableRecovery.displayName} · {durableRecovery.sha256}
              </p>
            ) : (
              <p className="danger-note">{t("wb.ui.durableRecoveryPending")}</p>
            )}

            {recoveryDownloaded ? (
              <p className="success-note">{t("wb.ui.recoveryKeptConfirmed")}</p>
            ) : recoveryDownloadStarted ? (
              <label className="check-field danger-note">
                <input
                  type="checkbox"
                  // False in this branch by construction — the confirmed case
                  // renders the note above instead — but bound to the state it
                  // reflects rather than pinned to a literal.
                  checked={recoveryDownloaded}
                  disabled={busy}
                  onChange={(event) => {
                    if (!event.currentTarget.checked) return;
                    setRecoveryDownloaded(true);
                    setStatus({ key: "wb.recovery.savedConfirmed" });
                  }}
                />
                <span>{t("wb.ui.recoveryKeptCheckbox")}</span>
              </label>
            ) : (
              <p className="danger-note">{t("wb.ui.recoveryFirstNote")}</p>
            )}

            {operationNeedsTargetConfirmation && checkpoint === null ? (
              <label className="manual-confirm">
                <span>{t("wb.ui.confirmTarget")}</span>
                <input
                  type="text"
                  value={manualTargetConfirmation}
                  placeholder={selectedTarget?.targetKey ?? ""}
                  disabled={busy || !hardwareCleanupReady}
                  onChange={(event) =>
                    setManualTargetConfirmation(event.currentTarget.value)
                  }
                />
                <small>
                  {t("wb.ui.typeExactly")} {selectedTarget?.targetKey}
                </small>
              </label>
            ) : null}

            <div className="flash-acknowledgements">
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={powerAcknowledged}
                  disabled={busy || !hardwareCleanupReady}
                  onChange={(event) =>
                    setPowerAcknowledged(event.currentTarget.checked)
                  }
                />
                <span>{t("wb.ui.powerStableFlash")}</span>
              </label>
              {selectedTarget?.role === "tx" ? (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={antennaAcknowledged}
                    disabled={busy || !hardwareCleanupReady}
                    onChange={(event) =>
                      setAntennaAcknowledged(event.currentTarget.checked)
                    }
                  />
                  <span>{t("wb.ui.antennaFitted")}</span>
                </label>
              ) : null}
            </div>

            <button
              type="button"
              className="danger-button"
              disabled={!readiness.firmwareWrite.ready}
              onClick={() => void flashPreparedFirmware()}
            >
              {method === "wifi"
                ? t("wb.ui.downloadOpenWifi")
                : method === "download"
                  ? t("wb.ui.downloadPackage")
                  : method === "stlink"
                    ? t("wb.ui.startStm32Dfu")
                    : t("wb.ui.startRealFlash")}
            </button>
          </>
        )}

        {flashProgress === null ? null : (
          <div className="flash-progress" aria-live="polite">
            <strong>{flashProgress.stage}</strong>
            <progress
              max={Math.max(flashProgress.totalBytes, 1)}
              value={flashProgress.writtenBytes}
            />
            <span>{flashProgress.detail}</span>
          </div>
        )}
      </section>

      <PhysicalAcceptancePanel
        context={physicalAcceptanceContext}
        readiness={readiness}
        renderMessage={renderMessage}
        locale={locale}
      />

      <DiagnosticsPanel
        locale={locale}
        capture={captureDiagnostics}
        captureWithGrants={captureDiagnosticsWithGrants}
      />

      <footer className="parity-footer">
        <span>{t("wb.ui.sourceOfficial")}</span>
        <span>{t("wb.ui.hardwareObservedNote")}</span>
      </footer>
    </main>
  );
}
