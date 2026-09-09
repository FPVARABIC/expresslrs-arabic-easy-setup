import { PhysicalAcceptancePanel } from "./PhysicalAcceptancePanel";

import type { ExpressLrsFlashMethod } from "../hardware/parity-types";
import { regulatoryRegionByKey } from "../hardware/regulatory-domain";
import type { HardwareDriverConnector } from "../hardware/userSession";
import {
  METHOD_LABELS,
  currentSettingValue,
  formatBytes,
  isStableRelease,
  releaseSelectionKey,
  useDeviceController,
  type DeviceController,
} from "../hardware/useDeviceController";

export interface ExpressLrsParityWorkbenchProps {
  readonly hardwareConnector?: HardwareDriverConnector;
}

/**
 * The advanced view mounted on its own. It owns one device controller, which
 * is the same controller Easy Mode uses when both are mounted together.
 */
export function ExpressLrsParityWorkbench({
  hardwareConnector,
}: ExpressLrsParityWorkbenchProps = {}) {
  const controller = useDeviceController(
    hardwareConnector === undefined ? {} : { hardwareConnector },
  );
  return <ExpressLrsParityWorkbenchView controller={controller} />;
}

export interface ExpressLrsParityWorkbenchViewProps {
  readonly controller: DeviceController;
}

/**
 * Renders the controller's state and calls its operations. It holds no device
 * state and performs no write of its own, so Easy Mode and Advanced Mode share
 * one session, one identity, and one write authority.
 */
export function ExpressLrsParityWorkbenchView({
  controller,
}: ExpressLrsParityWorkbenchViewProps) {
  const {
    antennaAcknowledged,
    availableMethods,
    bindingAcknowledged,
    buildFirmware,
    busy,
    cancelCurrentOperation,
    cancellable,
    catalog,
    catalogState,
    checkpoint,
    connectHardware,
    deviceWritesReady,
    disconnectHardware,
    downloadFirmware,
    downloadLuaScript,
    downloadRecovery,
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
    settingsBackup,
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
    writeReady,
    writeSetting,
  } = controller;

  return (
    <main className="parity-shell" dir="rtl">
      <header className="parity-header">
        <div>
          <span className="section-kicker">ELRS السهل · Hardware Lab</span>
          <h1>إعداد وتحديث ExpressLRS</h1>
          <p>
            مصدر رسمي، تعريف CRSF، إعدادات حقيقية، استعادة إلزامية، ونجاح مشروط
            بعودة الجهاز المتوقع.
          </p>
        </div>
        <span
          className={
            identity === null ? "parity-state" : "parity-state is-ready"
          }
        >
          {identity === null ? "لا توجد جلسة CRSF" : "CRSF متصل"}
        </span>
      </header>

      <section className="parity-status" role="status" aria-live="polite">
        <strong>الحالة</strong>
        <span>{status}</span>
        {busy && cancellable ? (
          <button type="button" onClick={cancelCurrentOperation}>
            إلغاء العملية
          </button>
        ) : null}
      </section>

      {checkpoint === null ? null : (
        <section className="parity-warning" aria-labelledby="recovery-heading">
          <div>
            <strong id="recovery-heading">
              استعادة معلّقة · {checkpoint.stage}
            </strong>
            <p>
              {checkpoint.productName} — اختر نفس Target وطريقة الاستعادة ثم
              حزمة الاستعادة المطابقة.
            </p>
            {checkpoint.safeError === null ? null : (
              <p>{checkpoint.safeError}</p>
            )}
          </div>
          {selectedTarget === null ? null : (
            <div>
              <label className="manual-confirm">
                <span>تأكيد Target للاستعادة</span>
                <input
                  type="text"
                  value={manualTargetConfirmation}
                  placeholder={selectedTarget.targetKey}
                  disabled={busy || !hardwareCleanupReady}
                  onChange={(event) =>
                    setManualTargetConfirmation(event.currentTarget.value)
                  }
                />
                <small>اكتب حرفيًا: {selectedTarget.targetKey}</small>
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
                  <span>ثبات الطاقة أثناء الاستعادة</span>
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
                    <span>هوائي جهاز الإرسال مثبت أثناء الاستعادة</span>
                  </label>
                ) : null}
              </div>
            </div>
          )}
          <label className="file-button">
            اختيار حزمة الاستعادة
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
          جارٍ فحص سجل الاستعادة؛ عمليات الكتابة مقفلة مؤقتًا.
        </p>
      ) : recoveryJournalState === "error" ? (
        <p className="danger-note" role="alert">
          تعذر التحقق من سجل الاستعادة؛ عمليات التفليش والاستعادة مقفلة بأمان.
        </p>
      ) : null}

      <section className="parity-card" aria-labelledby="catalog-heading">
        <div className="parity-card-heading">
          <div>
            <span>1</span>
            <div>
              <h2 id="catalog-heading">الإصدار وTarget</h2>
              <p>
                الإصدارات وTargets وطرق التحديث تأتي من مصادر ExpressLRS
                الرسمية.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void loadCatalog()}
          >
            {catalogState === "loading"
              ? "جارٍ التحميل…"
              : "تحميل الكتالوج الرسمي"}
          </button>
        </div>

        <div className="segmented" aria-label="نوع الجهاز">
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
              {item === "tx" ? "جهاز إرسال TX" : "جهاز استقبال RX"}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <label>
            <span>الإصدار</span>
            <select
              value={selectedReleaseKey}
              disabled={catalog === null || busy}
              onChange={(event) => {
                setSelectedReleaseKey(event.currentTarget.value);
                resetPreparedState();
              }}
            >
              <option value="">اختر إصدارًا</option>
              {releases.map((release) => (
                <option
                  key={releaseSelectionKey(release)}
                  value={releaseSelectionKey(release)}
                >
                  {release.label}
                  {!isStableRelease(release) ? " · تجريبي" : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>الشركة</span>
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
            <span>النطاق / العائلة</span>
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
            <span>المنطقة التنظيمية</span>
            <select
              value={options.region}
              disabled={selectedTarget === null || busy}
              onChange={(event) =>
                updateOption("region", event.currentTarget.value)
              }
            >
              <option value="">اختر المنطقة</option>
              {regionChoices.map((region) => (
                <option key={region.key} value={region.key}>
                  {region.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>طريقة التحديث</span>
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
                  {METHOD_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedTarget === null ? null : (
          <dl className="target-summary">
            <div>
              <dt>المنصة</dt>
              <dd>{selectedTarget.config.platform}</dd>
            </div>
            <div>
              <dt>Firmware key</dt>
              <dd>{selectedTarget.config.firmware}</dd>
            </div>
            <div>
              <dt>طرق Target الرسمية</dt>
              <dd>
                {selectedTarget.config.uploadMethods
                  .map((item) => METHOD_LABELS[item])
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
              <h2 id="device-heading">تعريف الجهاز وإعداداته</h2>
              <p>
                لا تُعرض هوية قبل Device Info صحيح وCRC صالح، ولا يتطلب ذلك
                تحميل الكتالوج.
              </p>
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
              تعريف الجهاز عبر CRSF
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void disconnectHardware()}
            >
              إغلاق الجلسة
            </button>
          )}
        </div>

        {identity === null ? (
          <p className="empty-state">
            استخدم منفذ وحدة ELRS المباشر. منفذ Joystick أو منفذ الراديو العام
            لا يحقق بوابة CRSF.
          </p>
        ) : (
          <>
            <dl className="target-summary">
              <div>
                <dt>الجهاز</dt>
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
                <dt>مطابقة Target</dt>
                <dd>
                  {targetMatch?.confidence ??
                    (catalog === null ? "بانتظار الكتالوج" : "NOT_FOUND")}
                </dd>
              </div>
            </dl>
            {exactHardwareTarget ? (
              <p className="success-note">
                Target المختار مطابق تلقائيًا لهوية CRSF.
              </p>
            ) : catalog === null ? (
              <p className="empty-state">
                هوية CRSF مثبتة. حمّل الكتالوج لاحقًا فقط لمطابقة Target وتجهيز
                Firmware.
              </p>
            ) : (
              <p className="danger-note">
                CRSF مثبت، لكن Target يحتاج اختيارًا وتأكيدًا يدويًا قبل
                التفليش. الإعدادات والربط يعتمدان على المعاملات التي أعلنها
                الجهاز نفسه.
              </p>
            )}

            {identity === null ? (
              <p className="danger-note">
                وصّل الجهاز وعرّفه لقراءة إعداداته الحقيقية؛ كل كتابة تُقرأ
                رجعيًا بعدها للتحقق من أنها ثبتت فعلًا.
              </p>
            ) : null}

            <div className="settings-grid">
              <label>
                <span>الإعداد</span>
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
                  <span>القيمة</span>
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
                  <span>القيمة</span>
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
                  disabled={
                    busy || selectedSetting === undefined || !deviceWritesReady
                  }
                  onClick={() => void writeSetting()}
                >
                  حفظ مع قراءة رجعية
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    busy || settingsBackup === null || !deviceWritesReady
                  }
                  onClick={() => void restoreSettings()}
                >
                  استعادة اللقطة
                </button>
                {hasBindCommand ? (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={
                      busy || !bindingAcknowledged || !deviceWritesReady
                    }
                    onClick={() => void startBinding()}
                  >
                    تشغيل الربط الحقيقي
                  </button>
                ) : null}
              </div>
              {hasBindCommand ? (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={bindingAcknowledged}
                    disabled={busy || !deviceWritesReady}
                    onChange={(event) =>
                      setBindingAcknowledged(event.currentTarget.checked)
                    }
                  />
                  <span>
                    الطرف الآخر جاهز للربط، والطاقة والهوائيات في حالة آمنة
                  </span>
                </label>
              ) : null}
            </div>
          </>
        )}
      </section>

      <section className="parity-card" aria-labelledby="options-heading">
        <div className="parity-card-heading">
          <div>
            <span>3</span>
            <div>
              <h2 id="options-heading">خيارات Firmware</h2>
              <p>العبارة وكلمة Wi-Fi تبقيان في الذاكرة حتى بناء الحزمة.</p>
            </div>
          </div>
        </div>

        <div className="form-grid">
          <label>
            <span>عبارة الربط</span>
            <input
              type="password"
              autoComplete="off"
              value={options.bindPhrase}
              maxLength={128}
              disabled={busy}
              onChange={(event) =>
                updateOption("bindPhrase", event.currentTarget.value)
              }
            />
          </label>
          <label>
            <span>اسم شبكة Wi-Fi</span>
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
            <span>كلمة مرور Wi-Fi</span>
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
            <span>تشغيل Wi-Fi تلقائيًا بعد (ثانية)</span>
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
                <span>UART مقلوب</span>
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
                <span>فتح مستويات الطاقة الأعلى</span>
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
                <span>عكس خرج TX للمستقبل</span>
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
                <span>قفل أول اتصال</span>
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
              <label className="check-field">
                <input type="checkbox" checked={false} disabled readOnly />
                <span>
                  استخدام RX كمرسل — مقفل حتى تنفيذ تحويل ملف TX ومخطط العتاد
                  والتحقق منهما
                </span>
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
              <h2 id="package-heading">بناء الحزمة والتفليش</h2>
              <p>كل قطاع موثق بـSHA-256 وحزمة الاستعادة إلزامية.</p>
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
            بناء Firmware الرسمي
          </button>
        </div>

        {!deviceWritesReady ? (
          <p className="danger-note">
            التفليش يحتاج جهازًا معرّفًا وTarget مطابقًا وحزمة محققة وحزمة
            استعادة جاهزة وتأكيدك؛ يشرح الشريط أعلاه أي شرط ما زال ناقصًا.
          </p>
        ) : null}

        {prepared === null ? (
          <p className="empty-state">لم تُبنَ حزمة بعد.</p>
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
                تنزيل Firmware / OTA
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={downloadRecovery}
              >
                تنزيل حزمة الاستعادة
              </button>
              {selectedTarget?.role === "tx" ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void downloadLuaScript()}
                >
                  تنزيل ملف Lua
                </button>
              ) : null}
            </div>

            {recoveryDownloaded ? (
              <p className="success-note">
                أكد المستخدم أن حزمة الاستعادة محفوظة خارج التطبيق.
              </p>
            ) : recoveryDownloadStarted ? (
              <label className="check-field danger-note">
                <input
                  type="checkbox"
                  checked={false}
                  disabled={busy}
                  onChange={(event) => {
                    if (!event.currentTarget.checked) return;
                    setRecoveryDownloaded(true);
                    setStatus(
                      "سُجل تأكيدك اليدوي بأن حزمة الاستعادة محفوظة؛ احتفظ بها حتى اكتمال التحقق بعد الإقلاع.",
                    );
                  }}
                />
                <span>
                  أؤكد أن ملف حزمة الاستعادة حُفظ ويمكنني الوصول إليه دون هذا
                  التطبيق
                </span>
              </label>
            ) : (
              <p className="danger-note">
                الكتابة مقفلة حتى بدء التنزيل ثم تأكيدك اليدوي أن حزمة الاستعادة
                حُفظت.
              </p>
            )}

            {operationNeedsTargetConfirmation && checkpoint === null ? (
              <label className="manual-confirm">
                <span>تأكيد Target</span>
                <input
                  type="text"
                  value={manualTargetConfirmation}
                  placeholder={selectedTarget?.targetKey ?? ""}
                  disabled={busy || !hardwareCleanupReady}
                  onChange={(event) =>
                    setManualTargetConfirmation(event.currentTarget.value)
                  }
                />
                <small>اكتب حرفيًا: {selectedTarget?.targetKey}</small>
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
                <span>ثبات الطاقة أثناء التفليش</span>
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
                  <span>هوائي جهاز الإرسال مثبت</span>
                </label>
              ) : null}
            </div>

            <button
              type="button"
              className="danger-button"
              disabled={busy || !writeReady}
              onClick={() => void flashPreparedFirmware()}
            >
              {method === "wifi"
                ? "تنزيل وفتح صفحة Wi-Fi"
                : method === "download"
                  ? "تنزيل الحزمة"
                  : method === "stlink"
                    ? "بدء STM32 DFU"
                    : "بدء التفليش الحقيقي"}
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
        deviceChangesEnabled={deviceWritesReady}
      />

      <footer className="parity-footer">
        <span>المصدر: ExpressLRS الرسمي</span>
        <span>لا يظهر HARDWARE_OBSERVED إلا بعد جلسة جهاز فعلية.</span>
      </footer>
    </main>
  );
}
