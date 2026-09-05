import { useEffect, useRef, useState } from "react";

import type { PhysicalAcceptanceContextSnapshot } from "../acceptance/physical-acceptance";
import { PhysicalAcceptancePanel } from "./PhysicalAcceptancePanel";

import { verifyObservedFirmwareBuild } from "../hardware/build-verification";
import { copyToArrayBuffer } from "../hardware/byte-utils";
import type { CrsfParameter } from "../hardware/crsf";
import { flashEspFirmware } from "../hardware/esp-flasher";
import {
  downloadPreparedBytes,
  prepareOfficialFirmwarePackage,
} from "../hardware/firmware-package";
import { acquireOfficialLuaScript } from "../hardware/lua-package";
import { loadOfficialExpressLrsCatalog } from "../hardware/official-catalog";
import {
  initializeSerialPassthrough,
  requestHardwarePort,
  type PassthroughMethod,
} from "../hardware/passthrough";
import type {
  ExpressLrsDeviceRole,
  ExpressLrsFirmwareOptions,
  ExpressLrsFlashMethod,
  FirmwareFlashProgress,
  OfficialCatalog,
  OfficialRelease,
  OfficialTarget,
  PreparedFirmwarePackage,
} from "../hardware/parity-types";
import {
  regulatoryRegionByKey,
  regulatoryRegionsForRadioKey,
} from "../hardware/regulatory-domain";
import {
  clearRecoveryCheckpoint,
  loadRecoveryCheckpoint,
  saveRecoveryCheckpoint,
  validateRecoveryPackage,
  type RecoveryCheckpoint,
  type ValidatedRecoveryPackage,
} from "../hardware/recovery-package";
import type { ExpressLrsIdentity } from "../hardware/session";
import type { HardwareSerialPort } from "../hardware/serial";
import { verifyReconnectTarget } from "../hardware/reconnect-target-verification";
import { flashStm32DfuFirmware } from "../hardware/stm32-dfu";
import {
  matchHardwareIdentityToOfficialTargets,
  type TargetMatchResult,
} from "../hardware/target-match";
import {
  connectUserHardwareSession,
  type HardwareDriverConnector,
  type SafeSettingsBackup,
  type UserHardwareSession,
  type WritableCrsfParameter,
} from "../hardware/userSession";
import { flashXmodemFirmware } from "../hardware/xmodem";

const DEFAULT_OPTIONS: ExpressLrsFirmwareOptions = Object.freeze({
  region: "",
  domain: -1,
  bindPhrase: "",
  wifiSsid: "",
  wifiPassword: "",
  wifiAutoOnInterval: 60,
  fanRuntime: 30,
  telemetryInterval: 240,
  uartInverted: false,
  unlockHigherPower: false,
  receiverUartBaud: 420_000,
  receiverInvertTx: false,
  lockOnFirstConnection: true,
  r9mmMiniSbus: false,
  receiverAsTransmitter: false,
});

const METHOD_LABELS: Readonly<Record<ExpressLrsFlashMethod, string>> =
  Object.freeze({
    uart: "USB مباشر / UART",
    betaflight: "عبر متحكم الطيران",
    edgetx: "عبر جهاز التحكم",
    passthru: "Passthrough جاهز",
    wifi: "Wi-Fi",
    stlink: "STM32 DFU",
    download: "تنزيل فقط",
  });

function nowIso(): string {
  return new Date().toISOString();
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "")
    .slice(0, 256);
}

function safeMessage(error: unknown): string {
  return (
    error instanceof Error ? error.message : "توقفت العملية بسبب خطأ غير معروف"
  )
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/\s+/gu, " ")
    .slice(0, 500);
}

function reportsUnconfirmedHardwareCleanup(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  try {
    return (
      Reflect.get(value, "cleanupVerified") === false ||
      Reflect.get(value, "code") === "CLEANUP_UNCONFIRMED"
    );
  } catch {
    return false;
  }
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${value} B`;
}

function platformFamily(target: OfficialTarget): "esp" | "stm32" | "other" {
  const platform = target.config.platform.toLocaleLowerCase("en-US");
  if (
    platform.startsWith("esp32") ||
    platform.includes("8285") ||
    platform.includes("8266")
  ) {
    return "esp";
  }
  if (platform.startsWith("stm32")) return "stm32";
  return "other";
}

function commandForBootloader(
  parameters: readonly CrsfParameter[],
): string | null {
  const parameter = parameters.find(
    (candidate) =>
      candidate.kind === "command" &&
      !candidate.hidden &&
      /(serial\s*update|bootloader|update\s*mode)/iu.test(candidate.name),
  );
  return parameter?.name ?? null;
}

function currentSettingValue(parameter: CrsfParameter | undefined): string {
  return parameter?.kind === "number" || parameter?.kind === "selection"
    ? String(parameter.value)
    : "";
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    copyToArrayBuffer(bytes),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function boundedFileBytes(
  file: File,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (file.size < 1 || file.size > maximumBytes) {
    throw new RangeError(
      `الملف يجب أن يكون بين 1 بايت و${formatBytes(maximumBytes)}`,
    );
  }
  return new Uint8Array(await file.arrayBuffer());
}

function officialReleaseFromRecovery(
  recovery: ValidatedRecoveryPackage,
): OfficialRelease {
  return Object.freeze({
    label: recovery.releaseLabel,
    revision: recovery.releaseRevision,
    channel: /^v?\d+\.\d+\.\d+(?:$|[-+])/u.test(recovery.releaseLabel)
      ? "release"
      : "branch",
  });
}

function isStableRelease(release: OfficialRelease): boolean {
  return (
    release.channel === "release" && /^v?\d+\.\d+\.\d+$/u.test(release.label)
  );
}

function isBuildableRelease(release: OfficialRelease): boolean {
  const match =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
      release.label.trim(),
    );
  if (match === null) return false;
  const validPrerelease = !(match[4]?.split(".") ?? []).some(
    (part) => /^\d+$/u.test(part) && part.length > 1 && part.startsWith("0"),
  );
  if (!validPrerelease) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 3 || (major === 4 && minor <= 1);
}

function releaseSelectionKey(release: OfficialRelease): string {
  return JSON.stringify([release.channel, release.label, release.revision]);
}

export interface ExpressLrsParityWorkbenchProps {
  readonly allowDestructiveWrites?: boolean;
  readonly hardwareConnector?: HardwareDriverConnector;
}

export function ExpressLrsParityWorkbench({
  allowDestructiveWrites = false,
  hardwareConnector,
}: ExpressLrsParityWorkbenchProps = {}) {
  const [catalog, setCatalog] = useState<OfficialCatalog | null>(null);
  const [catalogState, setCatalogState] = useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");
  const [role, setRole] = useState<ExpressLrsDeviceRole>("tx");
  const [selectedReleaseKey, setSelectedReleaseKey] = useState("");
  const [vendorKey, setVendorKey] = useState("");
  const [radioKey, setRadioKey] = useState("");
  const [targetId, setTargetId] = useState("");
  const [method, setMethod] = useState<ExpressLrsFlashMethod>("uart");
  const [options, setOptions] =
    useState<ExpressLrsFirmwareOptions>(DEFAULT_OPTIONS);
  const [status, setStatus] = useState(
    "يمكنك تعريف الجهاز مباشرة؛ حمّل الكتالوج فقط عند تجهيز Firmware رسمي.",
  );
  const [busy, setBusy] = useState(false);
  const [cancellable, setCancellable] = useState(false);
  const [identity, setIdentity] = useState<ExpressLrsIdentity | null>(null);
  const [parameters, setParameters] = useState<readonly CrsfParameter[]>([]);
  const [writableParameters, setWritableParameters] = useState<
    readonly WritableCrsfParameter[]
  >([]);
  const [hasBindCommand, setHasBindCommand] = useState(false);
  const [settingsBackup, setSettingsBackup] =
    useState<SafeSettingsBackup | null>(null);
  const [targetMatch, setTargetMatch] = useState<TargetMatchResult | null>(
    null,
  );
  const [selectedSettingId, setSelectedSettingId] = useState("");
  const [settingDraft, setSettingDraft] = useState("");
  const [prepared, setPrepared] = useState<PreparedFirmwarePackage | null>(
    null,
  );
  const [recoveryDownloadStarted, setRecoveryDownloadStarted] = useState(false);
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false);
  const [manualTargetConfirmation, setManualTargetConfirmation] = useState("");
  const [powerAcknowledged, setPowerAcknowledged] = useState(false);
  const [antennaAcknowledged, setAntennaAcknowledged] = useState(false);
  const [bindingAcknowledged, setBindingAcknowledged] = useState(false);
  const [flashProgress, setFlashProgress] =
    useState<FirmwareFlashProgress | null>(null);
  const [checkpoint, setCheckpoint] = useState<RecoveryCheckpoint | null>(null);
  const [recoveryJournalState, setRecoveryJournalState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [hardwareCloseUncertain, setHardwareCloseUncertain] = useState(false);
  const [hardwareCloseInProgress, setHardwareCloseInProgress] = useState(false);

  const sessionRef = useRef<UserHardwareSession | null>(null);
  const hardwareCloseUncertainRef = useRef(false);
  const hardwareCloseInProgressRef = useRef<Promise<boolean> | null>(null);
  const disconnectUnsubscribeRef = useRef<(() => void) | null>(null);
  const catalogAbortRef = useRef<AbortController | null>(null);
  const operationAbortRef = useRef<AbortController | null>(null);
  const optionsRevisionRef = useRef(0);

  useEffect(() => {
    let active = true;
    void loadRecoveryCheckpoint()
      .then((value) => {
        if (!active) return;
        setCheckpoint(value);
        setRecoveryJournalState("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRecoveryJournalState("error");
        setStatus(
          `تعذر التحقق من سجل الاستعادة؛ بقيت كل عمليات الكتابة مقفلة: ${safeMessage(error)}`,
        );
      });
    return () => {
      active = false;
      catalogAbortRef.current?.abort();
      operationAbortRef.current?.abort();
      disconnectUnsubscribeRef.current?.();
      disconnectUnsubscribeRef.current = null;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session !== null) void session.close();
    };
  }, []);

  useEffect(() => {
    if (!busy) return undefined;
    const preventNavigation = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventNavigation);
    return () => window.removeEventListener("beforeunload", preventNavigation);
  }, [busy]);

  const releases = (catalog?.releases ?? []).filter(isBuildableRelease);
  const roleTargets = (catalog?.targets ?? []).filter(
    (target) => target.role === role,
  );
  const vendors = [
    ...new Map(
      roleTargets.map((target) => [target.vendorKey, target.vendorName]),
    ).entries(),
  ];
  const vendorTargets = roleTargets.filter(
    (target) => target.vendorKey === vendorKey,
  );
  const radios = [...new Set(vendorTargets.map((target) => target.radioKey))];
  const visibleTargets = vendorTargets.filter(
    (target) => target.radioKey === radioKey,
  );
  const selectedRelease =
    releases.find(
      (release) => releaseSelectionKey(release) === selectedReleaseKey,
    ) ?? null;
  const selectedTarget =
    roleTargets.find((target) => target.id === targetId) ?? null;
  const availableMethods = selectedTarget?.config.uploadMethods ?? [];
  const regionChoices = regulatoryRegionsForRadioKey(radioKey);
  const selectedSetting = writableParameters.find(
    (parameter) => String(parameter.id) === selectedSettingId,
  );
  const exactHardwareTarget =
    selectedTarget !== null &&
    targetMatch?.confidence === "EXACT" &&
    targetMatch.selected?.id === selectedTarget.id;
  const manualTargetConfirmed =
    selectedTarget !== null &&
    normalized(manualTargetConfirmation) ===
      normalized(selectedTarget.targetKey);
  const sameDirectUartIdentity = method === "uart" && exactHardwareTarget;
  const operationNeedsTargetConfirmation =
    method !== "wifi" && method !== "download" && !sameDirectUartIdentity;
  const firmwareWriteMethod = !["wifi", "download"].includes(method);
  const hardwareCleanupReady =
    !hardwareCloseUncertain && !hardwareCloseInProgress;
  const deviceWritesReady =
    allowDestructiveWrites &&
    hardwareCleanupReady &&
    recoveryJournalState === "ready" &&
    checkpoint === null;
  const writeReady =
    deviceWritesReady &&
    prepared !== null &&
    selectedTarget !== null &&
    recoveryDownloaded &&
    powerAcknowledged &&
    (selectedTarget.role !== "tx" || antennaAcknowledged) &&
    (!operationNeedsTargetConfirmation || manualTargetConfirmed) &&
    (!firmwareWriteMethod || method !== "uart" || identity !== null);

  function resetPreparedState(): void {
    setPrepared(null);
    setRecoveryDownloadStarted(false);
    setRecoveryDownloaded(false);
    setPowerAcknowledged(false);
    setAntennaAcknowledged(false);
    setFlashProgress(null);
  }

  function targetDefaults(nextRole: ExpressLrsDeviceRole): void {
    const targets = (catalog?.targets ?? []).filter(
      (target) => target.role === nextRole,
    );
    const first = targets[0];
    setVendorKey(first?.vendorKey ?? "");
    setRadioKey(first?.radioKey ?? "");
    setTargetId(first?.id ?? "");
    const methods = first?.config.uploadMethods ?? [];
    setMethod(methods.includes("uart") ? "uart" : (methods[0] ?? "download"));
    setOptions((current) => ({ ...current, region: "", domain: -1 }));
    setManualTargetConfirmation("");
    resetPreparedState();
  }

  function clearHardwarePresentation(): void {
    setIdentity(null);
    setParameters([]);
    setWritableParameters([]);
    setHasBindCommand(false);
    setSettingsBackup(null);
    setTargetMatch(null);
    setSelectedSettingId("");
    setSettingDraft("");
    setBindingAcknowledged(false);
  }

  function latchUnconfirmedHardwareClose(detail?: string): void {
    hardwareCloseUncertainRef.current = true;
    setHardwareCloseUncertain(true);
    operationAbortRef.current?.abort(
      new DOMException("Hardware port cleanup is unconfirmed", "AbortError"),
    );
    disconnectUnsubscribeRef.current?.();
    disconnectUnsubscribeRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session !== null) {
      void session.close().catch(() => undefined);
    }
    clearHardwarePresentation();
    setStatus(
      `تعذر تأكيد إغلاق جلسة الجهاز؛ أُخفيت أي هوية وتوقفت إعادة الاتصال حتى إعادة تحميل الصفحة.${detail === undefined ? "" : ` ${detail}`}`,
    );
  }

  function hardwareCleanupGateOpen(): boolean {
    return (
      !hardwareCloseUncertainRef.current &&
      hardwareCloseInProgressRef.current === null
    );
  }

  async function closePortOrLatch(
    port: HardwareSerialPort,
    detail: string,
  ): Promise<boolean> {
    let closeTask: Promise<void>;
    try {
      closeTask = port.close();
    } catch {
      latchUnconfirmedHardwareClose(detail);
      return false;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const closed = await Promise.race([
      closeTask.then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), 1_500);
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
    if (!closed) latchUnconfirmedHardwareClose(detail);
    return closed;
  }

  function assertCurrentDeviceOperation(
    session: UserHardwareSession,
    signal: AbortSignal,
  ): void {
    if (
      hardwareCleanupGateOpen() &&
      sessionRef.current === session &&
      !session.closed &&
      !signal.aborted
    ) {
      return;
    }
    throw new Error(
      "تغيرت جلسة الجهاز أو حالة تنظيف المنفذ أثناء العملية؛ تم تجاهل النتيجة المتأخرة.",
    );
  }

  function observeSessionDisconnect(session: UserHardwareSession): void {
    disconnectUnsubscribeRef.current?.();
    disconnectUnsubscribeRef.current = session.onDisconnected(() => {
      if (sessionRef.current !== session) return;
      sessionRef.current = null;
      disconnectUnsubscribeRef.current = null;
      clearHardwarePresentation();
      setStatus("انقطع اتصال الجهاز. أعد اختياره يدويًا للمتابعة.");
    });
  }

  async function disconnectHardware(): Promise<boolean> {
    if (hardwareCloseUncertainRef.current) {
      clearHardwarePresentation();
      setStatus(
        "لا يمكن فتح جلسة أجهزة جديدة لأن إغلاق المنفذ السابق غير مثبت؛ أعد تحميل الصفحة بعد فصل الجهاز بأمان.",
      );
      return false;
    }
    const pendingClose = hardwareCloseInProgressRef.current;
    if (pendingClose !== null) return pendingClose;

    disconnectUnsubscribeRef.current?.();
    disconnectUnsubscribeRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    clearHardwarePresentation();
    if (session === null) return true;

    setHardwareCloseInProgress(true);
    const closeTask = Promise.resolve()
      .then(() => session.close())
      .then(
        (closed) => {
          if (!closed) latchUnconfirmedHardwareClose();
          return closed;
        },
        (error: unknown) => {
          latchUnconfirmedHardwareClose(
            `تعذر إغلاق المنفذ بأمان: ${safeMessage(error)}`,
          );
          return false;
        },
      );
    hardwareCloseInProgressRef.current = closeTask;
    try {
      return await closeTask;
    } finally {
      if (hardwareCloseInProgressRef.current === closeTask) {
        hardwareCloseInProgressRef.current = null;
        setHardwareCloseInProgress(false);
      }
    }
  }

  async function closeSessionOrLatch(
    session: UserHardwareSession,
    detail: string,
  ): Promise<boolean> {
    let closed = false;
    try {
      closed = await session.close();
    } catch (error: unknown) {
      latchUnconfirmedHardwareClose(`${detail}: ${safeMessage(error)}`);
      return false;
    }
    if (!closed) latchUnconfirmedHardwareClose(detail);
    return closed;
  }

  function deviceWriteLockMessage(): string {
    if (!allowDestructiveWrites) {
      return "أوامر تغيير الجهاز مقفلة في هذه النسخة؛ التعريف والقراءة فقط متاحان.";
    }
    if (recoveryJournalState === "loading") {
      return "انتظر اكتمال فحص سجل الاستعادة قبل تغيير الجهاز.";
    }
    if (recoveryJournalState === "error") {
      return "تعذر التحقق من سجل الاستعادة؛ كل أوامر تغيير الجهاز مقفلة بأمان.";
    }
    if (hardwareCloseUncertainRef.current) {
      return "إغلاق منفذ جهاز سابق غير مثبت؛ أعد تحميل الصفحة بعد فصل الجهاز بأمان.";
    }
    if (hardwareCloseInProgressRef.current !== null) {
      return "انتظر حتى يثبت إغلاق جلسة الجهاز السابقة.";
    }
    return "توجد استعادة معلقة؛ أكملها قبل إرسال أي أمر يغيّر الجهاز.";
  }

  function cancelCurrentOperation(): void {
    catalogAbortRef.current?.abort();
    operationAbortRef.current?.abort();
    setCancellable(false);
  }

  async function loadCatalog(): Promise<void> {
    catalogAbortRef.current?.abort();
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setCatalogState("loading");
    setStatus("جارٍ تحميل فهرس الإصدارات وكتالوج Targets الرسميين…");
    try {
      const loaded = await loadOfficialExpressLrsCatalog({
        signal: controller.signal,
        onProgress(stage, receivedBytes, totalBytes) {
          setStatus(
            `${stage === "INDEX" ? "فهرس الإصدارات" : "كتالوج Targets"}: ${formatBytes(receivedBytes)}${totalBytes === null ? "" : ` / ${formatBytes(totalBytes)}`}`,
          );
        },
      });
      setCatalog(loaded);
      setCatalogState("ready");
      const buildableReleases = loaded.releases.filter(isBuildableRelease);
      const defaultRelease = buildableReleases.find(isStableRelease);
      setSelectedReleaseKey(
        defaultRelease === undefined ? "" : releaseSelectionKey(defaultRelease),
      );
      const connectedIdentity = sessionRef.current?.identity ?? null;
      const match =
        connectedIdentity === null
          ? null
          : matchHardwareIdentityToOfficialTargets({
              identity: connectedIdentity,
              targets: loaded.targets,
            });
      const defaultTarget = loaded.targets.find(
        (target) => target.role === role,
      );
      const nextTarget =
        match?.confidence === "EXACT" && match.selected !== null
          ? match.selected
          : defaultTarget;
      setTargetMatch(match);
      setVendorKey(nextTarget?.vendorKey ?? "");
      setRadioKey(nextTarget?.radioKey ?? "");
      setTargetId(nextTarget?.id ?? "");
      const methods = nextTarget?.config.uploadMethods ?? [];
      setMethod(methods.includes("uart") ? "uart" : (methods[0] ?? "download"));
      setOptions((current) => ({ ...current, region: "", domain: -1 }));
      resetPreparedState();
      if (connectedIdentity === null) {
        setStatus(
          `تم تحميل ${buildableReleases.length} إصدارًا قابلاً للبناء و${loaded.targets.length} Target رسميًا.`,
        );
      } else if (match?.confidence === "EXACT") {
        setStatus(
          `تم تحميل الكتالوج ومطابقة ${connectedIdentity.productName} بـTarget رسمي واحد.`,
        );
      } else {
        setStatus(
          `تم تحميل الكتالوج مع بقاء هوية CRSF مثبتة. مطابقة Target: ${match?.confidence ?? "NOT_FOUND"}.`,
        );
      }
    } catch (error: unknown) {
      setCatalogState("failed");
      setStatus(`تعذر تحميل المصدر الرسمي: ${safeMessage(error)}`);
    } finally {
      if (catalogAbortRef.current === controller) {
        catalogAbortRef.current = null;
      }
      setCancellable(false);
      setBusy(false);
    }
  }

  async function connectHardware(): Promise<void> {
    if (!(await disconnectHardware())) return;
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setStatus(
      "اختر منفذ وحدة ExpressLRS المباشر؛ جارٍ إرسال CRSF Device Ping…",
    );
    try {
      const outcome = await connectUserHardwareSession({
        role,
        ...(hardwareConnector === undefined
          ? {}
          : { connector: hardwareConnector }),
        signal: controller.signal,
        onCleanupUnconfirmed: latchUnconfirmedHardwareClose,
      });
      if (outcome.status !== "CONNECTED") {
        if (outcome.status === "CLEANUP_UNCONFIRMED") {
          latchUnconfirmedHardwareClose(outcome.message);
          return;
        }
        setStatus(`لم يكتمل التعرف: ${outcome.message}`);
        return;
      }
      if (hardwareCloseUncertainRef.current) {
        try {
          await outcome.session.close();
        } catch {
          // The existing latch already requires a page reload.
        }
        return;
      }
      sessionRef.current = outcome.session;
      observeSessionDisconnect(outcome.session);
      const match =
        catalog === null
          ? null
          : matchHardwareIdentityToOfficialTargets({
              identity: outcome.identity,
              targets: catalog.targets,
            });
      setIdentity(outcome.identity);
      setParameters(outcome.session.parameters);
      setWritableParameters(outcome.session.writableParameters);
      setHasBindCommand(outcome.session.hasBindCommand);
      setSettingsBackup(outcome.backup);
      setTargetMatch(match);
      const firstWritable = outcome.session.writableParameters[0];
      setSelectedSettingId(
        firstWritable === undefined ? "" : String(firstWritable.id),
      );
      setSettingDraft(currentSettingValue(firstWritable));
      if (match?.confidence === "EXACT" && match.selected !== null) {
        const target = match.selected;
        setVendorKey(target.vendorKey);
        setRadioKey(target.radioKey);
        setTargetId(target.id);
        const methods = target.config.uploadMethods;
        setMethod(
          methods.includes("uart") ? "uart" : (methods[0] ?? "download"),
        );
        setOptions((current) => ({ ...current, region: "", domain: -1 }));
        resetPreparedState();
        setStatus(
          `تم إثبات CRSF ومطابقة ${outcome.identity.productName} بـTarget رسمي واحد.`,
        );
      } else if (catalog === null) {
        setStatus(
          `تم إثبات CRSF وهوية ${outcome.identity.productName}. يمكنك تحميل الكتالوج لاحقًا لمطابقة Target وتجهيز التحديث.`,
        );
      } else {
        setStatus(
          `تم إثبات CRSF وهوية الجهاز. مطابقة Target: ${match?.confidence ?? "NOT_FOUND"}؛ اختر Target الرسمي وأكّد مفتاحه قبل التفليش.`,
        );
      }
    } catch (error: unknown) {
      setStatus(`توقفت جلسة التعرف: ${safeMessage(error)}`);
    } finally {
      operationAbortRef.current = null;
      setCancellable(false);
      setBusy(false);
    }
  }

  async function writeSetting(): Promise<void> {
    const session = sessionRef.current;
    if (session === null || selectedSetting === undefined) return;
    if (!deviceWritesReady || !hardwareCleanupGateOpen()) {
      setStatus(deviceWriteLockMessage());
      return;
    }
    const requestedValue = Number(settingDraft);
    if (!Number.isSafeInteger(requestedValue)) {
      setStatus("أدخل قيمة صحيحة قبل حفظ الإعداد.");
      return;
    }
    operationAbortRef.current?.abort();
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setStatus(`جارٍ كتابة ${selectedSetting.name} ثم إعادة قراءته…`);
    try {
      const result = await session.writeParameter(
        selectedSetting.id,
        requestedValue,
        controller.signal,
      );
      assertCurrentDeviceOperation(session, controller.signal);
      setParameters(session.parameters);
      setWritableParameters(session.writableParameters);
      setSettingDraft(String(result.requestedValue));
      setStatus(
        `تم حفظ ${selectedSetting.name} والتحقق من القيمة بالقراءة الرجعية.`,
      );
    } catch (error: unknown) {
      setStatus(`تعذر حفظ الإعداد: ${safeMessage(error)}`);
    } finally {
      if (operationAbortRef.current === controller) {
        operationAbortRef.current = null;
      }
      setCancellable(false);
      setBusy(false);
    }
  }

  async function restoreSettings(): Promise<void> {
    const session = sessionRef.current;
    if (session === null || settingsBackup === null) return;
    if (!deviceWritesReady || !hardwareCleanupGateOpen()) {
      setStatus(deviceWriteLockMessage());
      return;
    }
    operationAbortRef.current?.abort();
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setStatus("جارٍ استعادة لقطة الإعدادات والتحقق من كل قيمة…");
    try {
      const results = await session.restoreBackup(settingsBackup, {
        confirmedByUser: true,
        signal: controller.signal,
      });
      assertCurrentDeviceOperation(session, controller.signal);
      setParameters(session.parameters);
      setWritableParameters(session.writableParameters);
      setStatus(`اكتملت استعادة ${results.length} قيمة مع قراءة رجعية.`);
    } catch (error: unknown) {
      setStatus(`توقفت استعادة الإعدادات: ${safeMessage(error)}`);
    } finally {
      if (operationAbortRef.current === controller) {
        operationAbortRef.current = null;
      }
      setCancellable(false);
      setBusy(false);
    }
  }

  async function startBinding(): Promise<void> {
    const session = sessionRef.current;
    if (session === null || !bindingAcknowledged) return;
    if (!deviceWritesReady || !hardwareCleanupGateOpen()) {
      setStatus(deviceWriteLockMessage());
      return;
    }
    operationAbortRef.current?.abort();
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setBindingAcknowledged(false);
    setStatus("جارٍ إرسال أمر الربط الحقيقي الذي يعلنه الجهاز عبر CRSF…");
    try {
      const result = await session.startBinding({
        confirmedByUser: true,
        signal: controller.signal,
      });
      assertCurrentDeviceOperation(session, controller.signal);
      setStatus(
        `اكتمل أمر الربط، لكن نجاح رابط RF يتطلب مشاهدة الطرفين: ${result.information}`,
      );
    } catch (error: unknown) {
      setStatus(`توقف الربط: ${safeMessage(error)}`);
    } finally {
      if (operationAbortRef.current === controller) {
        operationAbortRef.current = null;
      }
      setCancellable(false);
      setBusy(false);
    }
  }

  async function buildFirmware(): Promise<void> {
    if (selectedRelease === null || selectedTarget === null) return;
    const region = regulatoryRegionByKey(options.region);
    if (region === null) {
      setStatus("اختر المنطقة التنظيمية صراحة قبل بناء Firmware.");
      return;
    }
    operationAbortRef.current?.abort();
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    const inputRevision = optionsRevisionRef.current;
    const packageOptions: ExpressLrsFirmwareOptions = Object.freeze({
      ...options,
      region: region.artifactDirectory,
      domain: region.domain,
    });
    setBusy(true);
    resetPreparedState();
    setStatus("جارٍ تنزيل الحزمة الرسمية وتجهيز Firmware لهذا Target…");
    try {
      const result = await prepareOfficialFirmwarePackage({
        release: selectedRelease,
        target: selectedTarget,
        options: packageOptions,
        signal: controller.signal,
        onProgress(progress) {
          setStatus(
            `${progress.stage}: ${formatBytes(progress.receivedBytes)}${progress.totalBytes === null ? "" : ` / ${formatBytes(progress.totalBytes)}`}`,
          );
        },
      });
      if (inputRevision !== optionsRevisionRef.current) {
        setStatus("تغيرت الخيارات أثناء البناء؛ تم تجاهل الحزمة القديمة.");
        return;
      }
      setPrepared(result);
      setStatus(
        `تم تجهيز ${result.segments.length} قطاعًا والتحقق من SHA-256. نزّل حزمة الاستعادة قبل أي كتابة.`,
      );
    } catch (error: unknown) {
      setStatus(`تعذر تجهيز Firmware: ${safeMessage(error)}`);
    } finally {
      if (operationAbortRef.current === controller) {
        operationAbortRef.current = null;
      }
      setCancellable(false);
      setBusy(false);
    }
  }

  function downloadFirmware(): void {
    if (prepared === null) return;
    downloadPreparedBytes(
      prepared.primaryDownload,
      prepared.primaryFileName,
      prepared.primaryMimeType,
    );
    setStatus(`تم بدء تنزيل ${prepared.primaryFileName}.`);
  }

  function downloadRecovery(): void {
    if (prepared === null) return;
    downloadPreparedBytes(
      prepared.recoveryArchive,
      prepared.recoveryFileName,
      "application/zip",
    );
    setRecoveryDownloadStarted(true);
    setRecoveryDownloaded(false);
    setStatus(
      "بدأ المتصفح طلب تنزيل حزمة الاستعادة، لكن التطبيق لا يستطيع إثبات حفظها. بعد التحقق من وجود الملف، أكّد ذلك يدويًا.",
    );
  }

  async function downloadLuaScript(): Promise<void> {
    if (
      selectedRelease === null ||
      selectedTarget === null ||
      selectedTarget.role !== "tx"
    ) {
      return;
    }
    operationAbortRef.current?.abort();
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setStatus("جارٍ تنزيل ملف Lua الرسمي المتوافق مع إصدار ExpressLRS…");
    try {
      const script = await acquireOfficialLuaScript({
        release: selectedRelease,
        target: selectedTarget,
        signal: controller.signal,
      });
      downloadPreparedBytes(script.bytes, script.fileName, "text/plain");
      setStatus(`تم بدء تنزيل ${script.fileName}.`);
    } catch (error: unknown) {
      setStatus(`تعذر تنزيل ملف Lua: ${safeMessage(error)}`);
    } finally {
      if (operationAbortRef.current === controller) {
        operationAbortRef.current = null;
      }
      setCancellable(false);
      setBusy(false);
    }
  }

  async function saveCheckpoint(
    packageValue: PreparedFirmwarePackage,
    stage: RecoveryCheckpoint["stage"],
    safeError: string | null = null,
  ): Promise<void> {
    const packageSha256 = await sha256Hex(packageValue.recoveryArchive);
    const previous = checkpoint;
    const value: RecoveryCheckpoint = Object.freeze({
      schemaVersion: 1,
      targetId: packageValue.target.id,
      productName: packageValue.target.config.productName,
      packageSha256,
      stage,
      createdAt:
        previous?.targetId === packageValue.target.id
          ? previous.createdAt
          : nowIso(),
      updatedAt: nowIso(),
      safeError,
    });
    await saveRecoveryCheckpoint(value);
    setCheckpoint(value);
  }

  async function reconnectAndVerify(input: {
    readonly target: OfficialTarget;
    readonly release: OfficialRelease;
    readonly expectedIdentity: ExpressLrsIdentity | null;
    readonly manualTargetWasConfirmed: boolean;
    readonly totalBytes: number;
    readonly signal: AbortSignal;
  }): Promise<void> {
    setFlashProgress({
      stage: "RECONNECT",
      writtenBytes: input.totalBytes,
      totalBytes: input.totalBytes,
      detail: "أعد اختيار منفذ الجهاز بعد الإقلاع",
    });
    setStatus("أعد اختيار منفذ الجهاز بعد الإقلاع لإثبات الهوية والإصدار.");
    const outcome = await connectUserHardwareSession({
      role: input.target.role,
      ...(hardwareConnector === undefined
        ? {}
        : { connector: hardwareConnector }),
      signal: input.signal,
      onCleanupUnconfirmed: latchUnconfirmedHardwareClose,
    });
    if (outcome.status !== "CONNECTED") {
      if (outcome.status === "CLEANUP_UNCONFIRMED") {
        latchUnconfirmedHardwareClose(outcome.message);
      }
      throw new Error(`تعذرت إعادة قراءة الجهاز: ${outcome.message}`);
    }
    if (hardwareCloseUncertainRef.current || input.signal.aborted) {
      await closeSessionOrLatch(
        outcome.session,
        "تعذر عزل جلسة إعادة الاتصال بعد فشل تنظيف سابق",
      );
      throw new Error(
        "اكتملت إعادة قراءة الجهاز بعد رصد منفذ سابق غير مثبت الإغلاق.",
      );
    }
    const match = matchHardwareIdentityToOfficialTargets({
      identity: outcome.identity,
      targets: catalog?.targets ?? [],
    });
    const targetVerification = verifyReconnectTarget({
      expectedTarget: input.target,
      beforeIdentity: input.expectedIdentity,
      afterIdentity: outcome.identity,
      match,
      manualTargetConfirmed: input.manualTargetWasConfirmed,
    });
    if (!targetVerification.verified) {
      await closeSessionOrLatch(
        outcome.session,
        "تعذر تأكيد إغلاق جلسة إعادة الاتصال غير المطابقة",
      );
      throw new Error(
        `عاد جهاز، لكن أدلة Target لا تطابق العملية المخططة (${targetVerification.reason}).`,
      );
    }
    const build = verifyObservedFirmwareBuild({
      release: input.release,
      observedVersion: outcome.identity.firmwareVersion,
      parameters: outcome.parameters,
    });
    if (!build.verified) {
      await closeSessionOrLatch(
        outcome.session,
        "تعذر تأكيد إغلاق جلسة الإصدار غير المطابق",
      );
      throw new Error(
        `عاد الجهاز، لكن الإصدار/Commit لا يطابق ${build.expected}.`,
      );
    }
    const oldSession = sessionRef.current;
    disconnectUnsubscribeRef.current?.();
    disconnectUnsubscribeRef.current = null;
    if (oldSession !== null && oldSession !== outcome.session) {
      const oldClosed = await closeSessionOrLatch(
        oldSession,
        "تعذر تأكيد إغلاق جلسة CRSF السابقة بعد إعادة الاتصال",
      );
      if (!oldClosed) {
        sessionRef.current = null;
        await closeSessionOrLatch(
          outcome.session,
          "تعذر تأكيد إغلاق جلسة إعادة الاتصال الاحتياطية",
        );
        throw new Error(
          "تعذر إثبات إغلاق جلسة CRSF السابقة؛ أُوقفت إعادة الاتصال بأمان.",
        );
      }
    }
    if (
      !hardwareCleanupGateOpen() ||
      input.signal.aborted ||
      sessionRef.current !== oldSession
    ) {
      if (sessionRef.current === oldSession) {
        sessionRef.current = null;
        clearHardwarePresentation();
      }
      await closeSessionOrLatch(
        outcome.session,
        "تعذر تأكيد إغلاق جلسة إعادة الاتصال بعد تغير بوابة التنظيف",
      );
      throw new Error(
        "تغيرت جلسة الجهاز أو بوابة تنظيف المنفذ أثناء إعادة الاتصال؛ عُزلت الجلسة الجديدة.",
      );
    }
    sessionRef.current = outcome.session;
    observeSessionDisconnect(outcome.session);
    setIdentity(outcome.identity);
    setParameters(outcome.session.parameters);
    setWritableParameters(outcome.session.writableParameters);
    setHasBindCommand(outcome.session.hasBindCommand);
    setSettingsBackup(outcome.backup);
    const firstWritable = outcome.session.writableParameters[0];
    setSelectedSettingId(
      firstWritable === undefined ? "" : String(firstWritable.id),
    );
    setSettingDraft(currentSettingValue(firstWritable));
    setTargetMatch(match);
    await clearRecoveryCheckpoint();
    if (
      !hardwareCleanupGateOpen() ||
      input.signal.aborted ||
      sessionRef.current !== outcome.session ||
      outcome.session.closed
    ) {
      if (sessionRef.current === outcome.session) {
        const unsubscribeReconnect = disconnectUnsubscribeRef.current as
          (() => void) | null;
        unsubscribeReconnect?.();
        disconnectUnsubscribeRef.current = null;
        sessionRef.current = null;
        clearHardwarePresentation();
      }
      await closeSessionOrLatch(
        outcome.session,
        "تعذر تأكيد إغلاق جلسة إعادة الاتصال بعد تغير بوابة التنظيف",
      );
      throw new Error(
        "تغيرت جلسة الجهاز أو بوابة تنظيف المنفذ قبل اعتماد إعادة الاتصال.",
      );
    }
    setCheckpoint(null);
    setFlashProgress({
      stage: "COMPLETE",
      writtenBytes: input.totalBytes,
      totalBytes: input.totalBytes,
      detail: "تم إثبات الجهاز والإصدار/Commit بعد الإقلاع",
    });
  }

  async function prepareSerialTransport(input: {
    readonly selectedMethod: ExpressLrsFlashMethod;
    readonly family: "esp" | "stm32";
    readonly signal: AbortSignal;
    readonly exactTargetIdentityRequired: boolean;
  }): Promise<
    Readonly<{
      port: HardwareSerialPort;
      resetMode: "default_reset" | "no_reset";
    }>
  > {
    if (!hardwareCleanupGateOpen()) {
      throw new Error(
        "إغلاق منفذ جهاز سابق غير مثبت؛ أُوقف فتح أي منفذ كتابة جديد.",
      );
    }
    if (input.selectedMethod === "uart") {
      const session = sessionRef.current;
      if (session === null) {
        throw new Error("جلسة CRSF المباشرة مغلقة.");
      }
      const liveIdentity = await session.verifyCurrentIdentity(input.signal);
      if (!hardwareCleanupGateOpen()) {
        throw new Error(
          "تغيرت حالة تنظيف منفذ الجهاز أثناء التحقق من الهوية؛ أُوقفت الكتابة.",
        );
      }
      if (
        selectedTarget === null ||
        liveIdentity.role !== selectedTarget.role
      ) {
        throw new Error("نوع الجهاز تغير أو لا يطابق Target المختار.");
      }
      if (input.exactTargetIdentityRequired) {
        const liveMatch = matchHardwareIdentityToOfficialTargets({
          identity: liveIdentity,
          targets: catalog?.targets ?? [],
        });
        if (
          liveMatch.confidence !== "EXACT" ||
          liveMatch.selected?.id !== selectedTarget.id
        ) {
          throw new Error(
            "هوية الجهاز الحية لم تعد تطابق Target الذي حصل على إعفاء التأكيد اليدوي.",
          );
        }
      }
      if (input.family === "stm32" && selectedTarget.role === "rx") {
        const bootloader = await session.enterReceiverBootloader({
          expectedFirmwareTarget: selectedTarget.config.firmware,
          confirmedByUser: true,
          signal: input.signal,
        });
        const observed = normalized(bootloader.target);
        const accepted = [
          normalized(selectedTarget.targetKey),
          normalized(selectedTarget.config.firmware),
          normalized(selectedTarget.config.productName),
        ];
        if (
          !accepted.some(
            (candidate) =>
              candidate.length >= 3 &&
              (candidate.includes(observed) || observed.includes(candidate)),
          )
        ) {
          throw new Error(
            `Bootloader أبلغ Target مختلفًا: ${bootloader.target}`,
          );
        }
      } else if (selectedTarget.role === "tx") {
        const command = commandForBootloader(parameters);
        if (command === null) {
          throw new Error(
            "الجهاز لا يعلن أمر Bootloader صالحًا؛ أُوقفت الكتابة بأمان.",
          );
        }
        await session.enterTransmitterBootloader({
          commandName: command,
          confirmedByUser: true,
          signal: input.signal,
        });
      }
      disconnectUnsubscribeRef.current?.();
      disconnectUnsubscribeRef.current = null;
      let port: HardwareSerialPort;
      try {
        port = await session.detachPortForBootloader({
          confirmedByUser: true,
        });
      } catch (error: unknown) {
        latchUnconfirmedHardwareClose(
          `فشل تحرير منفذ CRSF للتفليش، لذلك لا يمكن إثبات إغلاقه: ${safeMessage(error)}`,
        );
        throw error;
      } finally {
        sessionRef.current = null;
        clearHardwarePresentation();
      }
      return Object.freeze({ port, resetMode: "default_reset" });
    }

    const port = await requestHardwarePort();
    if (!hardwareCleanupGateOpen() || input.signal.aborted) {
      await closePortOrLatch(
        port,
        "تعذر تأكيد إغلاق المنفذ الذي اختير بعد إلغاء عملية التفليش",
      );
      throw new Error(
        "تغيرت حالة تنظيف منفذ الجهاز أثناء اختيار المنفذ؛ أُوقفت الكتابة.",
      );
    }
    await initializeSerialPassthrough({
      method: input.selectedMethod as PassthroughMethod,
      port,
      flashBaud: input.family === "esp" ? 460_800 : 420_000,
      signal: input.signal,
    });
    return Object.freeze({ port, resetMode: "no_reset" });
  }

  async function flashPreparedFirmware(): Promise<void> {
    if (!allowDestructiveWrites) {
      setStatus(
        "الكتابة المباشرة وفتح مسار Wi-Fi مقفلان في نقطة الدخول العامة الحالية.",
      );
      return;
    }
    if (!hardwareCleanupGateOpen()) {
      setStatus(deviceWriteLockMessage());
      return;
    }
    if (recoveryJournalState !== "ready") {
      setStatus(
        recoveryJournalState === "loading"
          ? "انتظر اكتمال فحص سجل الاستعادة قبل أي كتابة."
          : "تعذر التحقق من سجل الاستعادة؛ كل عمليات الكتابة مقفلة بأمان.",
      );
      return;
    }
    if (prepared === null || selectedTarget === null) return;
    if (!writeReady) {
      setStatus("لم تكتمل بوابات Target والاستعادة والطاقة والهوائي.");
      return;
    }
    if (method === "download") {
      downloadFirmware();
      return;
    }
    if (method === "wifi") {
      downloadFirmware();
      window.open("http://10.0.0.1/", "_blank", "noopener,noreferrer");
      setStatus(
        "تم تنزيل ملف OTA وفتح 10.0.0.1. اختر الملف المنزّل داخل صفحة الجهاز.",
      );
      return;
    }

    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    const expectedIdentity = identity;
    const manualConfirmationSnapshot = manualTargetConfirmed;
    const totalBytes = prepared.segments.reduce(
      (sum, segment) => sum + segment.bytes.byteLength,
      0,
    );
    setBusy(true);
    setFlashProgress(null);
    try {
      await saveCheckpoint(prepared, "PACKAGE_SAVED");
      if (!hardwareCleanupGateOpen()) {
        throw new Error(
          "تغيرت حالة تنظيف منفذ الجهاز؛ أُوقفت الكتابة قبل فتح منفذ جديد.",
        );
      }
      const family = platformFamily(selectedTarget);
      if (family === "other") {
        throw new Error("منصة Target غير مدعومة داخل التطبيق.");
      }
      await saveCheckpoint(prepared, "BOOTLOADER");
      if (method === "stlink") {
        if (family !== "stm32") {
          throw new Error("STM32 DFU لا يطابق منصة Target المختار.");
        }
        const firmware = prepared.segments.find(
          (segment) => segment.name === "firmware.bin",
        );
        if (firmware === undefined) {
          throw new Error("حزمة STM32 لا تحتوي firmware.bin.");
        }
        await saveCheckpoint(prepared, "WRITING");
        const flashResult = await flashStm32DfuFirmware({
          target: selectedTarget,
          segment: firmware,
          signal: controller.signal,
          onProgress: setFlashProgress,
        });
        if (!flashResult.cleanupVerified) {
          latchUnconfirmedHardwareClose(
            "اكتملت كتابة STM32 لكن تعذر إثبات تحرير واجهة USB وإغلاقها",
          );
          throw new Error(
            "تعذر تأكيد إغلاق منفذ STM32 بعد الكتابة؛ أعد تحميل الصفحة قبل أي محاولة أخرى.",
          );
        }
      } else {
        const serial = await prepareSerialTransport({
          selectedMethod: method,
          family,
          signal: controller.signal,
          exactTargetIdentityRequired: sameDirectUartIdentity,
        });
        await saveCheckpoint(prepared, "WRITING");
        if (family === "esp") {
          const flashResult = await flashEspFirmware({
            port: serial.port,
            target: selectedTarget,
            segments: prepared.segments,
            resetMode: serial.resetMode,
            signal: controller.signal,
            onProgress: setFlashProgress,
          });
          if (!flashResult.cleanupVerified) {
            latchUnconfirmedHardwareClose(
              "اكتملت كتابة ESP لكن تعذر إثبات إغلاق منفذها التسلسلي",
            );
            throw new Error(
              "تعذر تأكيد إغلاق منفذ ESP بعد الكتابة؛ أعد تحميل الصفحة قبل أي محاولة أخرى.",
            );
          }
        } else {
          const firmware = prepared.segments.find(
            (segment) => segment.name === "firmware.bin",
          );
          if (firmware === undefined) {
            throw new Error("حزمة STM32 لا تحتوي firmware.bin.");
          }
          await flashXmodemFirmware({
            port: serial.port,
            firmware: firmware.bytes,
            signal: controller.signal,
            onProgress: setFlashProgress,
          });
        }
      }
      await saveCheckpoint(prepared, "RECONNECTING");
      await reconnectAndVerify({
        target: selectedTarget,
        release: prepared.release,
        expectedIdentity,
        manualTargetWasConfirmed: manualConfirmationSnapshot,
        totalBytes,
        signal: controller.signal,
      });
      setStatus("اكتمل التفليش وعاد الجهاز بالإصدار/Commit المتوقع.");
    } catch (error: unknown) {
      const cleanupUnconfirmed = reportsUnconfirmedHardwareCleanup(error);
      if (cleanupUnconfirmed && !hardwareCloseUncertainRef.current) {
        latchUnconfirmedHardwareClose(
          "تعذر إثبات إغلاق منفذ الكتابة بعد توقف التفليش",
        );
      }
      const message = safeMessage(error);
      try {
        await saveCheckpoint(prepared, "RECOVERY_REQUIRED", message);
      } catch {
        // The visible recovery requirement remains even if IndexedDB is blocked.
      }
      setStatus(
        `توقف التفليش وتحتاج العملية إلى الاستعادة: ${message}${cleanupUnconfirmed ? " أعد تحميل الصفحة قبل فتح أي منفذ آخر." : ""}`,
      );
    } finally {
      // Every flash or recovery is a distinct destructive attempt. Do not
      // carry Target, power, or antenna acknowledgements into another one.
      setManualTargetConfirmation("");
      setPowerAcknowledged(false);
      setAntennaAcknowledged(false);
      operationAbortRef.current = null;
      setCancellable(false);
      setBusy(false);
    }
  }

  async function recoverFromFile(file: File): Promise<void> {
    if (!allowDestructiveWrites) {
      setStatus("الاستعادة المباشرة مقفلة في نقطة الدخول العامة الحالية.");
      return;
    }
    if (!hardwareCleanupGateOpen()) {
      setStatus(deviceWriteLockMessage());
      return;
    }
    if (recoveryJournalState !== "ready" || checkpoint === null) {
      setStatus(
        recoveryJournalState === "loading"
          ? "انتظر اكتمال فحص سجل الاستعادة قبل اختيار الحزمة."
          : "لا يمكن تشغيل الاستعادة دون سجل استعادة موثوق ومقروء.",
      );
      return;
    }
    const trustedCheckpoint = checkpoint;
    if (selectedTarget === null) return;
    if (method === "wifi" || method === "download") {
      setStatus(
        "الاستعادة تتطلب مسار كتابة مباشرًا: UART أو Passthrough أو STM32 DFU.",
      );
      return;
    }
    if (!manualTargetConfirmed) {
      setStatus(
        "أكّد مفتاح Target قبل تشغيل الاستعادة؛ منفذ الاستعادة اختيار جديد ولا يرث هوية CRSF السابقة.",
      );
      return;
    }
    if (!powerAcknowledged) {
      setStatus("أكّد ثبات الطاقة قبل تشغيل الاستعادة.");
      return;
    }
    if (selectedTarget.role === "tx" && !antennaAcknowledged) {
      setStatus("أكّد تثبيت هوائي جهاز الإرسال قبل تشغيل الاستعادة.");
      return;
    }
    operationAbortRef.current?.abort();
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setStatus("جارٍ فحص حزمة الاستعادة وSHA-256 لكل قطاع…");
    try {
      const bytes = await boundedFileBytes(file, 64 * 1024 * 1024);
      const validated = await validateRecoveryPackage({
        bytes,
        expectedTarget: selectedTarget,
      });
      if (trustedCheckpoint.packageSha256 !== validated.packageSha256) {
        throw new Error(
          "الحزمة المختارة لا تطابق بصمة جلسة الاستعادة المعلقة.",
        );
      }
      if (!hardwareCleanupGateOpen()) {
        throw new Error(
          "تغيرت حالة تنظيف منفذ الجهاز؛ أُوقفت الاستعادة قبل فتح منفذ جديد.",
        );
      }
      const family = platformFamily(selectedTarget);
      const totalBytes = validated.segments.reduce(
        (sum, segment) => sum + segment.bytes.byteLength,
        0,
      );
      if (method === "stlink") {
        if (family !== "stm32") {
          throw new Error("STM32 DFU لا يطابق منصة Target المختار.");
        }
        const firmware = validated.segments.find(
          (segment) => segment.name === "firmware.bin",
        );
        if (firmware === undefined) {
          throw new Error("حزمة الاستعادة لا تحتوي firmware.bin.");
        }
        const flashResult = await flashStm32DfuFirmware({
          target: selectedTarget,
          segment: firmware,
          signal: controller.signal,
          onProgress: setFlashProgress,
        });
        if (!flashResult.cleanupVerified) {
          latchUnconfirmedHardwareClose(
            "اكتملت استعادة STM32 لكن تعذر إثبات تحرير واجهة USB وإغلاقها",
          );
          throw new Error(
            "تعذر تأكيد إغلاق منفذ STM32 بعد الاستعادة؛ أعد تحميل الصفحة قبل أي محاولة أخرى.",
          );
        }
      } else {
        const port = await requestHardwarePort();
        if (!hardwareCleanupGateOpen() || controller.signal.aborted) {
          await closePortOrLatch(
            port,
            "تعذر تأكيد إغلاق المنفذ الذي اختير بعد إلغاء الاستعادة",
          );
          throw new Error(
            "تغيرت حالة تنظيف منفذ الجهاز أثناء اختيار منفذ الاستعادة؛ أُوقفت الكتابة.",
          );
        }
        if (!["uart", "passthru"].includes(method)) {
          await initializeSerialPassthrough({
            method: method as PassthroughMethod,
            port,
            flashBaud: family === "esp" ? 460_800 : 420_000,
            signal: controller.signal,
          });
        }
        if (family === "esp") {
          const flashResult = await flashEspFirmware({
            port,
            target: selectedTarget,
            segments: validated.segments,
            resetMode: method === "uart" ? "default_reset" : "no_reset",
            signal: controller.signal,
            onProgress: setFlashProgress,
          });
          if (!flashResult.cleanupVerified) {
            latchUnconfirmedHardwareClose(
              "اكتملت استعادة ESP لكن تعذر إثبات إغلاق منفذها التسلسلي",
            );
            throw new Error(
              "تعذر تأكيد إغلاق منفذ ESP بعد الاستعادة؛ أعد تحميل الصفحة قبل أي محاولة أخرى.",
            );
          }
        } else if (family === "stm32") {
          const firmware = validated.segments.find(
            (segment) => segment.name === "firmware.bin",
          );
          if (firmware === undefined) {
            throw new Error("حزمة الاستعادة لا تحتوي firmware.bin.");
          }
          await flashXmodemFirmware({
            port,
            firmware: firmware.bytes,
            signal: controller.signal,
            onProgress: setFlashProgress,
          });
        } else {
          throw new Error("منصة الاستعادة غير مدعومة.");
        }
      }
      await reconnectAndVerify({
        target: selectedTarget,
        release: officialReleaseFromRecovery(validated),
        expectedIdentity: null,
        manualTargetWasConfirmed: manualTargetConfirmed,
        totalBytes,
        signal: controller.signal,
      });
      setStatus("اكتملت الاستعادة وعاد الجهاز بالإصدار/Commit المتوقع.");
    } catch (error: unknown) {
      const cleanupUnconfirmed = reportsUnconfirmedHardwareCleanup(error);
      if (cleanupUnconfirmed && !hardwareCloseUncertainRef.current) {
        latchUnconfirmedHardwareClose(
          "تعذر إثبات إغلاق منفذ الكتابة بعد توقف الاستعادة",
        );
      }
      setStatus(
        `توقفت الاستعادة: ${safeMessage(error)}${cleanupUnconfirmed ? " أعد تحميل الصفحة قبل فتح أي منفذ آخر." : ""}`,
      );
    } finally {
      setManualTargetConfirmation("");
      setPowerAcknowledged(false);
      setAntennaAcknowledged(false);
      if (operationAbortRef.current === controller) {
        operationAbortRef.current = null;
      }
      setCancellable(false);
      setBusy(false);
    }
  }

  function updateOption<Key extends keyof ExpressLrsFirmwareOptions>(
    key: Key,
    value: ExpressLrsFirmwareOptions[Key],
  ): void {
    optionsRevisionRef.current += 1;
    setOptions((current) => ({ ...current, [key]: value }));
    resetPreparedState();
  }

  const physicalAcceptanceContext: PhysicalAcceptanceContextSnapshot =
    Object.freeze({
      capturedAt: nowIso(),
      secureContext: window.isSecureContext,
      webSerialSupported: "serial" in navigator,
      connectionState: identity === null ? "DISCONNECTED" : "CRSF_CONNECTED",
      selectedRole: role,
      observedRole: identity?.role ?? null,
      productName: identity?.productName ?? null,
      firmwareVersion: identity?.firmwareVersion ?? null,
      hardwareVersion: identity?.hardwareVersion ?? null,
      parameterCount: identity?.parameterCount ?? null,
      usbVendorId: identity?.usb.usbVendorId ?? null,
      usbProductId: identity?.usb.usbProductId ?? null,
      targetId: selectedTarget?.id ?? null,
      targetKey: selectedTarget?.targetKey ?? null,
      targetName: selectedTarget?.config.productName ?? null,
      targetPlatform: selectedTarget?.config.platform ?? null,
      targetConfidence: targetMatch?.confidence ?? null,
      releaseLabel: selectedRelease?.label ?? null,
      releaseRevision: selectedRelease?.revision ?? null,
      flashMethod: method,
      settingsBackupAvailable: settingsBackup !== null,
      writableParameterCount: writableParameters.length,
      bindCommandAvailable: hasBindCommand,
      bootloaderCommandAvailable: commandForBootloader(parameters) !== null,
      packageFileName: prepared?.primaryFileName ?? null,
      recoveryFileName: prepared?.recoveryFileName ?? null,
      packageSegmentCount: prepared?.segments.length ?? 0,
      packageSegmentHashes: Object.freeze(
        prepared?.segments.map((segment) => segment.sha256) ?? [],
      ),
      recoveryDownloaded,
      checkpointStage: checkpoint?.stage ?? null,
      flashStage: flashProgress?.stage ?? null,
      statusMessage: status,
    });

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
                  disabled={
                    busy || !allowDestructiveWrites || !hardwareCleanupReady
                  }
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
                    disabled={
                      busy || !allowDestructiveWrites || !hardwareCleanupReady
                    }
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
                      disabled={
                        busy || !allowDestructiveWrites || !hardwareCleanupReady
                      }
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
                !allowDestructiveWrites ||
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

            {!allowDestructiveWrites ? (
              <p className="danger-note">
                هذه النسخة تسمح بتعريف الجهاز وقراءة المعاملات فقط؛ أوامر
                التغيير والربط والكتابة مقفلة في نقطة الدخول العامة الحالية.
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

        {!allowDestructiveWrites ? (
          <p className="danger-note">
            بناء الحزمة وتنزيلها متاحان، لكن التفليش والاستعادة وفتح صفحة Wi-Fi
            مقفلة في نقطة الدخول العامة الحالية؛ وتفعيلها يتطلب نقطة دخول منفصلة
            ومراجعة.
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
                  disabled={
                    busy || !allowDestructiveWrites || !hardwareCleanupReady
                  }
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
                  disabled={
                    busy || !allowDestructiveWrites || !hardwareCleanupReady
                  }
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
                    disabled={
                      busy || !allowDestructiveWrites || !hardwareCleanupReady
                    }
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
        deviceChangesEnabled={allowDestructiveWrites}
      />

      <footer className="parity-footer">
        <span>المصدر: ExpressLRS الرسمي</span>
        <span>لا يظهر HARDWARE_OBSERVED إلا بعد جلسة جهاز فعلية.</span>
      </footer>
    </main>
  );
}
