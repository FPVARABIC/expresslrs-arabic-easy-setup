import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";

import type { CrsfRole } from "../hardware/crsf";
import {
  connectUserHardwareSession,
  type HardwareDriverConnector,
  type SafeSettingsBackup,
  type UserHardwareConnectFailureStatus,
  type UserHardwareSession,
  type WritableCrsfParameter,
} from "../hardware/userSession";

type HubLocale = "ar" | "en";
type ConnectionMethod = "wifi" | "serial" | "etx" | "betaflight" | "stlink";
type Operation = "connect" | "setting" | "bind" | "restore" | "reboot";
type FeedbackTone = "neutral" | "success" | "warning" | "error";
type PresentationStatus =
  | "IDLE"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "UNSUPPORTED"
  | "ROLE_MISMATCH"
  | "FAILED";

interface Feedback {
  readonly tone: FeedbackTone;
  readonly message: string;
}

const officialWebFlasher = "https://expresslrs.github.io/web-flasher/";
const systemNow = () => Date.now();

const copy = {
  ar: {
    kicker: "اتصال واختبار حقيقي",
    title: "اتصال الجهاز",
    description:
      "المسار المباشر يطلب هوية CRSF حقيقية ويقرأ إعدادات الجهاز قبل إظهار أي عملية. فتح منفذ COM وحده لا يُعد نجاحًا.",
    roleLabel: "نوع الجهاز",
    tx: "جهاز إرسال TX",
    rx: "جهاز استقبال RX",
    methodLabel: "طريقة الاتصال",
    wifi: "Wi‑Fi مباشر",
    serial: "USB مباشر / CRSF",
    etx: "EdgeTX Passthrough",
    betaflight: "Betaflight Passthrough",
    stlink: "ST‑Link",
    wifiDescription:
      "اتصل أولًا بشبكة Wi‑Fi التي ينشئها الجهاز، ثم افتح صفحة الجهاز المحلية. المتصفح قد يمنع الطلبات المخفية من GitHub Pages، لذلك يفتح العنوان مباشرة.",
    openAp: "فتح صفحة الجهاز 10.0.0.1",
    openTx: "فتح عنوان المرسل elrs_tx.local",
    openRx: "فتح عنوان المستقبل elrs_rx.local",
    serialDescription:
      "اختر منفذ وحدة ExpressLRS المباشر. التطبيق يفتح 420000 baud ويرسل Device Ping ثم يطلب Device Info وجدول CRSF Parameters. منفذ EdgeTX العام قد لا يمرر CRSF للوحدة.",
    connect: "اختيار المنفذ والتعرف على الجهاز",
    cancel: "إلغاء المحاولة",
    disconnect: "قطع الاتصال",
    statusIdle: "لا يوجد اتصال",
    statusConnecting: "جارٍ التعرف عبر CRSF",
    statusConnected: "هوية CRSF مؤكدة",
    statusDisconnected: "انقطع الاتصال",
    statusCancelled: "أُلغيت المحاولة",
    statusTimedOut: "انتهت مهلة التعرف",
    statusUnsupported: "Web Serial غير مدعوم",
    statusRoleMismatch: "نوع الجهاز لا يطابق الاختيار",
    statusFailed: "فشل التعرف",
    elapsed: "المدة {seconds} ث",
    chooserNote:
      "نافذة اختيار المنفذ يتحكم بها المتصفح؛ عند الإلغاء أغلق نافذة الاختيار إن بقيت مفتوحة.",
    product: "المنتج",
    role: "الدور",
    firmware: "إصدار البرنامج",
    hardware: "إصدار العتاد",
    usb: "USB",
    parameters: "إعدادات CRSF المقروءة",
    transport: "النقل",
    targetLabel: "Target الكامل",
    targetUnverified:
      "غير مثبت من CRSF Device Info وحده. لن يختار التطبيق Firmware أو يبدأ مسحًا اعتمادًا على اسم المنتج فقط.",
    backupReady: "نسخة إعدادات آمنة جاهزة",
    backupDetails:
      "حُفظت {count} قيمة قابلة للكتابة في الذاكرة لهذه الجلسة. الحقول المخفية والحساسة مستبعدة.",
    settingsTitle: "إعدادات الجهاز",
    settingsDescription:
      "يظهر فقط ما أعلنه الجهاز كقيمة رقمية أو اختيارية وغير مخفية. كل كتابة تتبعها قراءة رجعية مطابقة.",
    settingLabel: "الإعداد",
    valueLabel: "القيمة الجديدة",
    saveSetting: "حفظ والتحقق",
    noWritableSettings: "لم يعلن الجهاز عن إعدادات آمنة قابلة للكتابة.",
    settingSaved: "تمت الكتابة وتطابقت القراءة الرجعية.",
    bindTitle: "الربط",
    bindReady: "الطرف الآخر في وضع الربط، والهوائيات والطاقة في حالة آمنة.",
    bindAction: "إرسال أمر الربط",
    bindCompleted:
      "اكتمل أمر الربط على النقل، لكن نجاح رابط RF لم يُثبت بعد. تحقق من اتصال TX وRX فعليًا.",
    restoreTitle: "استعادة إعدادات بداية الجلسة",
    restoreReady: "أوافق على إعادة القيم الآمنة المحفوظة في بداية هذه الجلسة.",
    restoreAction: "استعادة والتحقق",
    restoreCompleted: "عادت القيم المحفوظة واجتازت القراءة الرجعية.",
    rebootTitle: "إعادة التشغيل",
    rebootReady: "أوافق على إعادة تشغيل الجهاز المتصل الآن.",
    rebootAction: "إعادة التشغيل",
    rebootCompleted:
      "قبل الجهاز أمر إعادة التشغيل. انتظر ظهوره ثم أعد الاتصال للتحقق من الهوية.",
    flashTitle: "تفليش Firmware داخل التطبيق",
    flashUnavailable:
      "هذا الفرع لا يحتوي بعد مسارًا مكتملًا من حزمة Firmware موثقة إلى الكتابة ثم إعادة الاتصال والتحقق والاستعادة. الخيار مقفل بدل تقديم زر صوري أو مسح غير آمن.",
    flashDisabled: "التفليش الداخلي مقفل",
    externalDescription:
      "هذه الطريقة تُفتح في Web Flasher الرسمي. لا يعرضها التطبيق على أنها منفذة داخليًا.",
    externalOpen: "فتح Web Flasher الرسمي",
    operationFailed: "تعذر إكمال العملية بأمان. لم تُسجل كنجاح.",
    connectionHelp:
      "لا تستخدم منفذًا لمجرد أنه يحمل اسم USB Serial. التعرف ينجح فقط بعد استجابة ELRS Device Info صحيحة وفحص CRC.",
    roleTx: "TX",
    roleRx: "RX",
    unavailable: "غير متاح",
  },
  en: {
    kicker: "Real connection and test",
    title: "Connect the device",
    description:
      "The direct path requires a real CRSF identity and reads the device settings before exposing operations. Opening a COM port alone is not success.",
    roleLabel: "Device role",
    tx: "Transmitter TX",
    rx: "Receiver RX",
    methodLabel: "Connection method",
    wifi: "Direct Wi-Fi",
    serial: "Direct USB / CRSF",
    etx: "EdgeTX Passthrough",
    betaflight: "Betaflight Passthrough",
    stlink: "ST-Link",
    wifiDescription:
      "Join the device Wi-Fi network first, then open its local page. Browsers may block hidden requests from GitHub Pages, so the address is opened directly.",
    openAp: "Open device page 10.0.0.1",
    openTx: "Open transmitter address elrs_tx.local",
    openRx: "Open receiver address elrs_rx.local",
    serialDescription:
      "Select the direct ExpressLRS module port. The app opens 420000 baud, sends Device Ping, then requests Device Info and the CRSF parameter table. A general EdgeTX port may not expose module CRSF.",
    connect: "Select port and identify device",
    cancel: "Cancel attempt",
    disconnect: "Disconnect",
    statusIdle: "No connection",
    statusConnecting: "Identifying over CRSF",
    statusConnected: "CRSF identity confirmed",
    statusDisconnected: "Connection lost",
    statusCancelled: "Attempt cancelled",
    statusTimedOut: "Identification timed out",
    statusUnsupported: "Web Serial unsupported",
    statusRoleMismatch: "Device role does not match",
    statusFailed: "Identification failed",
    elapsed: "Elapsed {seconds}s",
    chooserNote:
      "The browser controls the port chooser; close that chooser if it remains open after cancellation.",
    product: "Product",
    role: "Role",
    firmware: "Firmware",
    hardware: "Hardware version",
    usb: "USB",
    parameters: "CRSF settings read",
    transport: "Transport",
    targetLabel: "Exact target",
    targetUnverified:
      "Not proven by CRSF Device Info alone. The app will not select firmware or erase a device from the product name only.",
    backupReady: "Safe settings snapshot ready",
    backupDetails:
      "{count} writable values are held in memory for this session. Hidden and sensitive fields are excluded.",
    settingsTitle: "Device settings",
    settingsDescription:
      "Only visible numeric and selection values declared by the device are shown. Every write requires exact read-back.",
    settingLabel: "Setting",
    valueLabel: "New value",
    saveSetting: "Save and verify",
    noWritableSettings: "The device exposed no safe writable settings.",
    settingSaved: "The write completed and exact read-back matched.",
    bindTitle: "Binding",
    bindReady:
      "The other device is in binding mode and antennas and power are safe.",
    bindAction: "Send bind command",
    bindCompleted:
      "The transport command completed, but a usable RF link is not yet proven. Verify the TX/RX link physically.",
    restoreTitle: "Restore session-start settings",
    restoreReady:
      "I approve restoring the safe values captured at the start of this session.",
    restoreAction: "Restore and verify",
    restoreCompleted: "The captured values were restored and read-back passed.",
    rebootTitle: "Reboot",
    rebootReady: "I approve rebooting the connected device now.",
    rebootAction: "Reboot device",
    rebootCompleted:
      "The device accepted its reboot command. Wait for it to return, then reconnect and verify identity.",
    flashTitle: "In-app firmware flashing",
    flashUnavailable:
      "This branch does not yet contain a complete path from a trusted firmware package through write, reconnect, verification, and recovery. The control is locked instead of presenting a fake or unsafe erase button.",
    flashDisabled: "In-app flashing locked",
    externalDescription:
      "This method opens the official Web Flasher. It is not presented as implemented inside this app.",
    externalOpen: "Open official Web Flasher",
    operationFailed:
      "The operation could not be completed safely and was not recorded as success.",
    connectionHelp:
      "Do not trust a port just because it is named USB Serial. Identification succeeds only after a CRC-valid ELRS Device Info response.",
    roleTx: "TX",
    roleRx: "RX",
    unavailable: "unavailable",
  },
} as const;

const connectionPortalHost = document.createElement("div");
connectionPortalHost.className = "device-connection-host";

function localeFromDocument(): HubLocale {
  return document.documentElement.lang.toLowerCase().startsWith("en")
    ? "en"
    : "ar";
}

function useDocumentLocale(): HubLocale {
  const [locale, setLocale] = useState<HubLocale>(localeFromDocument);

  useEffect(() => {
    const observer = new MutationObserver(() =>
      setLocale(localeFromDocument()),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
    return () => observer.disconnect();
  }, []);

  return locale;
}

function useConnectionPortalHost(): void {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>("main.page");
    if (page === null) return;
    const workspace = page.querySelector(".simple-workspace");
    page.insertBefore(connectionPortalHost, workspace);
    return () => connectionPortalHost.remove();
  }, []);
}

function methodsForRole(role: CrsfRole): readonly ConnectionMethod[] {
  return role === "tx"
    ? (["wifi", "serial", "etx"] as const)
    : (["wifi", "serial", "betaflight", "stlink"] as const);
}

function officialMethodUrl(
  role: CrsfRole,
  method: Exclude<ConnectionMethod, "wifi" | "serial">,
): string {
  const url = new URL(officialWebFlasher);
  url.searchParams.set("type", role);
  url.searchParams.set("method", method);
  return url.toString();
}

function formatUsbId(value: number | null, unavailable: string): string {
  return value === null
    ? unavailable
    : `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

function formatHardwareVersion(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;
}

function failureStatus(
  status: UserHardwareConnectFailureStatus,
): PresentationStatus {
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "TIMED_OUT") return "TIMED_OUT";
  if (status === "UNSUPPORTED" || status === "INSECURE_CONTEXT") {
    return "UNSUPPORTED";
  }
  if (status === "ROLE_MISMATCH") return "ROLE_MISMATCH";
  return "FAILED";
}

function operationErrorMessage(locale: HubLocale): string {
  return copy[locale].operationFailed;
}

function selectionValues(
  parameter: Extract<WritableCrsfParameter, { readonly kind: "selection" }>,
): readonly Readonly<{ value: number; label: string }>[] {
  return Object.freeze(
    Array.from({ length: parameter.max - parameter.min + 1 }, (_, offset) => {
      const value = parameter.min + offset;
      return Object.freeze({
        value,
        label: parameter.options[offset] ?? String(value),
      });
    }),
  );
}

function statusText(locale: HubLocale, status: PresentationStatus): string {
  const text = copy[locale];
  const labels: Readonly<Record<PresentationStatus, string>> = {
    IDLE: text.statusIdle,
    CONNECTING: text.statusConnecting,
    CONNECTED: text.statusConnected,
    DISCONNECTED: text.statusDisconnected,
    CANCELLED: text.statusCancelled,
    TIMED_OUT: text.statusTimedOut,
    UNSUPPORTED: text.statusUnsupported,
    ROLE_MISMATCH: text.statusRoleMismatch,
    FAILED: text.statusFailed,
  };
  return labels[status];
}

async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const taskPromise = task(controller.signal);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException("Operation timed out", "TimeoutError");
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    void taskPromise.catch(() => undefined);
  }
}

export function DeviceConnectionHub() {
  useConnectionPortalHost();
  const locale = useDocumentLocale();
  return createPortal(
    <DeviceConnectionHubPanel locale={locale} />,
    connectionPortalHost,
  );
}

export function DeviceConnectionHubPanel({
  locale,
  navigatorObject,
  secureContext,
  connectHardware,
  connectTimeoutMs,
  now = systemNow,
}: {
  readonly locale: HubLocale;
  readonly navigatorObject?: unknown;
  readonly secureContext?: boolean;
  readonly connectHardware?: HardwareDriverConnector;
  readonly connectTimeoutMs?: number;
  readonly now?: () => number;
}) {
  const text = copy[locale];
  const [role, setRole] = useState<CrsfRole>("tx");
  const [method, setMethod] = useState<ConnectionMethod>("wifi");
  const [status, setStatus] = useState<PresentationStatus>("IDLE");
  const [session, setSession] = useState<UserHardwareSession | null>(null);
  const [backup, setBackup] = useState<SafeSettingsBackup | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [writableParameters, setWritableParameters] = useState<
    readonly WritableCrsfParameter[]
  >([]);
  const [selectedSettingId, setSelectedSettingId] = useState<number | null>(
    null,
  );
  const [settingDraft, setSettingDraft] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [bindReady, setBindReady] = useState(false);
  const [restoreReady, setRestoreReady] = useState(false);
  const [rebootReady, setRebootReady] = useState(false);
  const sessionRef = useRef<UserHardwareSession | null>(null);
  const disconnectUnsubscribe = useRef<(() => void) | null>(null);
  const connectAbort = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const connectStartedAt = useRef(0);
  const methods = methodsForRole(role);
  const selectedSetting = writableParameters.find(
    (parameter) => parameter.id === selectedSettingId,
  );

  useEffect(() => {
    if (operation !== "connect") return;
    const update = () => {
      setElapsedSeconds(
        Math.max(0, Math.floor((now() - connectStartedAt.current) / 1_000)),
      );
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [now, operation]);

  useEffect(
    () => () => {
      requestSequence.current += 1;
      connectAbort.current?.abort();
      connectAbort.current = null;
      disconnectUnsubscribe.current?.();
      disconnectUnsubscribe.current = null;
      const current = sessionRef.current;
      sessionRef.current = null;
      if (current !== null) void current.close();
    },
    [],
  );

  function releaseSession(nextStatus: PresentationStatus = "IDLE") {
    requestSequence.current += 1;
    connectAbort.current?.abort();
    connectAbort.current = null;
    disconnectUnsubscribe.current?.();
    disconnectUnsubscribe.current = null;
    const current = sessionRef.current;
    sessionRef.current = null;
    if (current !== null) void current.close();
    setSession(null);
    setBackup(null);
    setOperation(null);
    setStatus(nextStatus);
    setFeedback(null);
    setElapsedSeconds(0);
    setWritableParameters([]);
    setSelectedSettingId(null);
    setSettingDraft("");
    setHasChanges(false);
    setBindReady(false);
    setRestoreReady(false);
    setRebootReady(false);
  }

  function selectRole(nextRole: CrsfRole) {
    releaseSession("IDLE");
    setRole(nextRole);
    setMethod("wifi");
  }

  function selectMethod(nextMethod: ConnectionMethod) {
    if (nextMethod !== "serial" && sessionRef.current !== null) {
      releaseSession("IDLE");
    }
    setMethod(nextMethod);
    setFeedback(null);
  }

  async function startConnection() {
    releaseSession("IDLE");
    const requestId = ++requestSequence.current;
    const controller = new AbortController();
    connectAbort.current = controller;
    connectStartedAt.current = now();
    setElapsedSeconds(0);
    setOperation("connect");
    setStatus("CONNECTING");
    setFeedback({ tone: "neutral", message: text.chooserNote });

    const outcome = await connectUserHardwareSession({
      role,
      ...(navigatorObject === undefined ? {} : { navigatorObject }),
      ...(secureContext === undefined ? {} : { secureContext }),
      ...(connectHardware === undefined ? {} : { connector: connectHardware }),
      ...(connectTimeoutMs === undefined
        ? {}
        : { timeoutMs: connectTimeoutMs }),
      signal: controller.signal,
    });
    if (requestSequence.current !== requestId) return;
    connectAbort.current = null;
    setOperation(null);

    if (outcome.status !== "CONNECTED") {
      setStatus(failureStatus(outcome.status));
      setFeedback({ tone: "error", message: operationErrorMessage(locale) });
      return;
    }

    sessionRef.current = outcome.session;
    setSession(outcome.session);
    setBackup(outcome.backup);
    const nextWritableParameters = outcome.session.writableParameters;
    const firstWritableParameter = nextWritableParameters[0];
    setWritableParameters(nextWritableParameters);
    setSelectedSettingId(firstWritableParameter?.id ?? null);
    setSettingDraft(
      firstWritableParameter === undefined
        ? ""
        : String(firstWritableParameter.value),
    );
    setStatus("CONNECTED");
    setFeedback(null);
    disconnectUnsubscribe.current = outcome.session.onDisconnected(() => {
      sessionRef.current = null;
      setSession(null);
      setBackup(null);
      setWritableParameters([]);
      setSelectedSettingId(null);
      setSettingDraft("");
      setOperation(null);
      setStatus("DISCONNECTED");
      setFeedback({ tone: "error", message: text.statusDisconnected });
    });
  }

  function cancelConnection() {
    requestSequence.current += 1;
    connectAbort.current?.abort();
    connectAbort.current = null;
    setOperation(null);
    setStatus("CANCELLED");
    setFeedback({ tone: "warning", message: text.chooserNote });
  }

  async function disconnect() {
    const current = sessionRef.current;
    releaseSession("DISCONNECTED");
    if (current !== null) await current.close();
  }

  function selectSetting(event: ChangeEvent<HTMLSelectElement>) {
    const id = Number(event.target.value);
    const parameter = writableParameters.find((item) => item.id === id);
    setSelectedSettingId(parameter?.id ?? null);
    setSettingDraft(parameter === undefined ? "" : String(parameter.value));
    setFeedback(null);
  }

  async function saveSetting() {
    if (session === null || selectedSetting === undefined) return;
    const value = Number(settingDraft);
    if (!Number.isSafeInteger(value)) {
      setFeedback({ tone: "error", message: text.operationFailed });
      return;
    }
    setOperation("setting");
    setFeedback(null);
    try {
      const result = await withTimeout(
        (signal) => session.writeParameter(selectedSetting.id, value, signal),
        10_000,
      );
      const nextWritableParameters = session.writableParameters;
      const nextSelectedSetting = nextWritableParameters.find(
        (parameter) => parameter.id === selectedSetting.id,
      );
      setWritableParameters(nextWritableParameters);
      setSelectedSettingId(nextSelectedSetting?.id ?? null);
      setSettingDraft(
        nextSelectedSetting === undefined
          ? String(result.requestedValue)
          : String(nextSelectedSetting.value),
      );
      setHasChanges(true);
      setFeedback({ tone: "success", message: text.settingSaved });
    } catch {
      setFeedback({ tone: "error", message: text.operationFailed });
    } finally {
      setOperation(null);
    }
  }

  async function bind() {
    if (session === null || !bindReady) return;
    setOperation("bind");
    setFeedback(null);
    try {
      await withTimeout(
        (signal) => session.startBinding({ confirmedByUser: true, signal }),
        12_000,
      );
      setFeedback({ tone: "warning", message: text.bindCompleted });
      setBindReady(false);
    } catch {
      setFeedback({ tone: "error", message: text.operationFailed });
    } finally {
      setOperation(null);
    }
  }

  async function restore() {
    if (session === null || backup === null || !restoreReady) return;
    setOperation("restore");
    setFeedback(null);
    try {
      await withTimeout(
        (signal) =>
          session.restoreBackup(backup, {
            confirmedByUser: true,
            signal,
          }),
        30_000,
      );
      const nextWritableParameters = session.writableParameters;
      const nextSelectedSetting =
        nextWritableParameters.find(
          (parameter) => parameter.id === selectedSettingId,
        ) ?? nextWritableParameters[0];
      setWritableParameters(nextWritableParameters);
      setSelectedSettingId(nextSelectedSetting?.id ?? null);
      setSettingDraft(
        nextSelectedSetting === undefined
          ? ""
          : String(nextSelectedSetting.value),
      );
      setHasChanges(false);
      setRestoreReady(false);
      setFeedback({ tone: "success", message: text.restoreCompleted });
    } catch {
      setFeedback({ tone: "error", message: text.operationFailed });
    } finally {
      setOperation(null);
    }
  }

  async function reboot() {
    if (session === null || !rebootReady) return;
    setOperation("reboot");
    setFeedback(null);
    try {
      await withTimeout(
        (signal) => session.reboot({ confirmedByUser: true, signal }),
        12_000,
      );
      setFeedback({ tone: "warning", message: text.rebootCompleted });
      setRebootReady(false);
    } catch {
      setFeedback({ tone: "error", message: text.operationFailed });
    } finally {
      setOperation(null);
    }
  }

  const busy = operation !== null;
  const statusClass =
    status === "CONNECTED"
      ? "status-connected"
      : status === "IDLE" || status === "CONNECTING"
        ? `status-${status.toLowerCase()}`
        : "status-error";

  return (
    <section
      className="device-connection-panel"
      aria-labelledby="device-connection-heading"
    >
      <div className="device-connection-heading">
        <div>
          <span className="section-kicker">{text.kicker}</span>
          <h2 id="device-connection-heading">{text.title}</h2>
          <p>{text.description}</p>
        </div>
        <span
          className={`connection-transport-status ${statusClass}`}
          role="status"
          aria-live="polite"
        >
          {statusText(locale, status)}
        </span>
      </div>

      <div className="connection-role-row">
        <span>{text.roleLabel}</span>
        <div
          className="connection-role-switch"
          role="group"
          aria-label={text.roleLabel}
        >
          <button
            type="button"
            className={role === "tx" ? "is-active" : undefined}
            aria-pressed={role === "tx"}
            disabled={busy}
            onClick={() => selectRole("tx")}
          >
            {text.tx}
          </button>
          <button
            type="button"
            className={role === "rx" ? "is-active" : undefined}
            aria-pressed={role === "rx"}
            disabled={busy}
            onClick={() => selectRole("rx")}
          >
            {text.rx}
          </button>
        </div>
      </div>

      <div
        className="connection-method-tabs"
        role="tablist"
        aria-label={text.methodLabel}
      >
        {methods.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={method === item}
            className={method === item ? "is-active" : undefined}
            disabled={busy}
            onClick={() => selectMethod(item)}
          >
            {text[item]}
          </button>
        ))}
      </div>

      <div className="connection-method-panel" role="tabpanel">
        {method === "wifi" ? (
          <>
            <p>{text.wifiDescription}</p>
            <div className="connection-link-row">
              <a
                href="http://10.0.0.1/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {text.openAp}
              </a>
              <a
                href={
                  role === "tx"
                    ? "http://elrs_tx.local/"
                    : "http://elrs_rx.local/"
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                {role === "tx" ? text.openTx : text.openRx}
              </a>
            </div>
          </>
        ) : method === "serial" ? (
          <>
            <p>{text.serialDescription}</p>
            {operation === "connect" ? (
              <p className="connection-progress" aria-live="polite">
                {text.elapsed.replace("{seconds}", String(elapsedSeconds))}
              </p>
            ) : null}
            <div className="connection-link-row">
              {session === null ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    aria-busy={operation === "connect"}
                    onClick={() => void startConnection()}
                  >
                    {text.connect}
                  </button>
                  {operation === "connect" ? (
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={cancelConnection}
                    >
                      {text.cancel}
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  className="secondary-action"
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  {text.disconnect}
                </button>
              )}
            </div>

            {session !== null ? (
              <div className="hardware-workbench">
                <div className="hardware-identity-card">
                  <dl className="hardware-facts">
                    <div>
                      <dt>{text.product}</dt>
                      <dd>{session.identity.productName}</dd>
                    </div>
                    <div>
                      <dt>{text.role}</dt>
                      <dd>
                        {session.identity.role === "tx"
                          ? text.roleTx
                          : text.roleRx}
                      </dd>
                    </div>
                    <div>
                      <dt>{text.firmware}</dt>
                      <dd dir="ltr">{session.identity.firmwareVersion}</dd>
                    </div>
                    <div>
                      <dt>{text.hardware}</dt>
                      <dd dir="ltr">
                        {formatHardwareVersion(
                          session.identity.hardwareVersion,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{text.usb}</dt>
                      <dd dir="ltr">
                        VID{" "}
                        {formatUsbId(
                          session.identity.usb.usbVendorId,
                          text.unavailable,
                        )}{" "}
                        · PID{" "}
                        {formatUsbId(
                          session.identity.usb.usbProductId,
                          text.unavailable,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{text.parameters}</dt>
                      <dd>{session.parameters.length}</dd>
                    </div>
                    <div>
                      <dt>{text.transport}</dt>
                      <dd dir="ltr">CRSF · 420000 baud</dd>
                    </div>
                  </dl>
                  <div className="hardware-target-warning">
                    <strong>{text.targetLabel}</strong>
                    <p>{text.targetUnverified}</p>
                  </div>
                </div>

                {backup !== null ? (
                  <div className="hardware-backup-note">
                    <strong>{text.backupReady}</strong>
                    <p>
                      {text.backupDetails.replace(
                        "{count}",
                        String(backup.values.length),
                      )}
                    </p>
                  </div>
                ) : null}

                <section className="hardware-operation-card">
                  <h3>{text.settingsTitle}</h3>
                  <p>{text.settingsDescription}</p>
                  {writableParameters.length === 0 ||
                  selectedSetting === undefined ? (
                    <p className="connection-empty-state">
                      {text.noWritableSettings}
                    </p>
                  ) : (
                    <div className="hardware-setting-grid">
                      <label>
                        <span>{text.settingLabel}</span>
                        <select
                          value={selectedSetting.id}
                          disabled={busy}
                          onChange={selectSetting}
                        >
                          {writableParameters.map((parameter) => (
                            <option key={parameter.id} value={parameter.id}>
                              {parameter.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>{text.valueLabel}</span>
                        {selectedSetting.kind === "selection" ? (
                          <select
                            value={settingDraft}
                            disabled={busy}
                            onChange={(event) =>
                              setSettingDraft(event.target.value)
                            }
                          >
                            {selectionValues(selectedSetting).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="number"
                            min={selectedSetting.min}
                            max={selectedSetting.max}
                            step={1}
                            value={settingDraft}
                            disabled={busy}
                            onChange={(event) =>
                              setSettingDraft(event.target.value)
                            }
                          />
                        )}
                      </label>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          settingDraft === "" ||
                          Number(settingDraft) === selectedSetting.value
                        }
                        onClick={() => void saveSetting()}
                      >
                        {text.saveSetting}
                      </button>
                    </div>
                  )}
                </section>

                {session.hasBindCommand ? (
                  <section className="hardware-operation-card">
                    <h3>{text.bindTitle}</h3>
                    <label className="hardware-confirmation">
                      <input
                        type="checkbox"
                        checked={bindReady}
                        disabled={busy}
                        onChange={(event) => setBindReady(event.target.checked)}
                      />
                      <span>{text.bindReady}</span>
                    </label>
                    <button
                      type="button"
                      disabled={busy || !bindReady}
                      onClick={() => void bind()}
                    >
                      {text.bindAction}
                    </button>
                  </section>
                ) : null}

                {hasChanges && backup !== null ? (
                  <section className="hardware-operation-card">
                    <h3>{text.restoreTitle}</h3>
                    <label className="hardware-confirmation">
                      <input
                        type="checkbox"
                        checked={restoreReady}
                        disabled={busy}
                        onChange={(event) =>
                          setRestoreReady(event.target.checked)
                        }
                      />
                      <span>{text.restoreReady}</span>
                    </label>
                    <button
                      type="button"
                      disabled={busy || !restoreReady}
                      onClick={() => void restore()}
                    >
                      {text.restoreAction}
                    </button>
                  </section>
                ) : null}

                {session.hasRebootCommand ? (
                  <section className="hardware-operation-card">
                    <h3>{text.rebootTitle}</h3>
                    <label className="hardware-confirmation">
                      <input
                        type="checkbox"
                        checked={rebootReady}
                        disabled={busy}
                        onChange={(event) =>
                          setRebootReady(event.target.checked)
                        }
                      />
                      <span>{text.rebootReady}</span>
                    </label>
                    <button
                      type="button"
                      disabled={busy || !rebootReady}
                      onClick={() => void reboot()}
                    >
                      {text.rebootAction}
                    </button>
                  </section>
                ) : null}

                <section className="hardware-operation-card is-locked">
                  <h3>{text.flashTitle}</h3>
                  <p>{text.flashUnavailable}</p>
                  <button type="button" disabled>
                    {text.flashDisabled}
                  </button>
                </section>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p>{text.externalDescription}</p>
            <div className="connection-link-row">
              <a
                href={officialMethodUrl(role, method)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {text.externalOpen}
              </a>
            </div>
          </>
        )}
      </div>

      {feedback !== null ? (
        <div
          className={`connection-feedback is-${feedback.tone}`}
          role="alert"
          aria-live="assertive"
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="connection-boundary-note">
        <strong>{text.connectionHelp}</strong>
      </div>
    </section>
  );
}
