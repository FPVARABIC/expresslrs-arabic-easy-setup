import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  closeWebSerialPort,
  connectWebSerialReadOnly,
  type WebSerialPort,
  type WebSerialPortInfo,
} from "../view-model/webSerialConnection";

type HubLocale = "ar" | "en";
type DeviceRole = "tx" | "rx";
type ConnectionMethod =
  | "wifi"
  | "serial"
  | "etx"
  | "betaflight"
  | "stlink";

type SerialPresentationStatus =
  | "IDLE"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "UNSUPPORTED"
  | "INSECURE_CONTEXT"
  | "CANCELLED"
  | "PERMISSION_DENIED"
  | "OPEN_FAILED"
  | "CLOSE_FAILED";

interface SerialPresentation {
  readonly status: SerialPresentationStatus;
  readonly info?: WebSerialPortInfo;
  readonly baudRate?: number;
}

const officialWebFlasher = "https://expresslrs.github.io/web-flasher/";

const copy = {
  ar: {
    kicker: "اتصال حقيقي",
    title: "اتصال الجهاز",
    description:
      "اختر طريقة الاتصال المناسبة. هذه الشاشة لا تستخدم الجهاز التجريبي ولا تعتبر فتح المنفذ تعريفًا مؤكدًا للجهاز.",
    roleLabel: "نوع الجهاز",
    tx: "جهاز إرسال TX",
    rx: "جهاز استقبال RX",
    methodLabel: "طريقة الاتصال",
    wifi: "Wi‑Fi مباشر",
    serial: "USB / UART",
    etx: "EdgeTX Passthrough",
    betaflight: "Betaflight Passthrough",
    stlink: "ST‑Link",
    wifiDescription:
      "اتصل أولًا بشبكة Wi‑Fi التي ينشئها الجهاز، ثم افتح صفحة الجهاز مباشرة. هذا المسار يتجنب منع طلبات HTTP المحلية من صفحة GitHub Pages المشفرة.",
    openAp: "فتح صفحة الجهاز 10.0.0.1",
    openTx: "فتح عنوان المرسل elrs_tx.local",
    openRx: "فتح عنوان المستقبل elrs_rx.local",
    serialDescription:
      "يفتح التطبيق منفذ USB/UART بسرعة 115200 من دون إرسال أي بايت. النجاح يثبت فتح النقل فقط، ولا يؤكد أن الجهاز ExpressLRS.",
    serialConnect: "اختيار وفتح منفذ USB",
    serialDisconnect: "إغلاق منفذ USB",
    externalDescription:
      "يفتح هذا الخيار Web Flasher الرسمي بالطريقة المحددة. اختيار Target والتحقق والتفليش يتمان في الأداة الرسمية إلى أن يكتمل الموصل داخل هذا التطبيق.",
    externalOpen: "فتح Web Flasher الرسمي",
    statusIdle: "لا يوجد اتصال حقيقي",
    statusConnecting: "جارٍ فتح منفذ USB",
    statusConnected: "منفذ USB مفتوح",
    statusDisconnected: "تم إغلاق منفذ USB",
    statusUnsupported: "Web Serial غير مدعوم في هذا المتصفح",
    statusInsecure: "فتح USB يحتاج صفحة آمنة HTTPS",
    statusCancelled: "أُلغي اختيار المنفذ",
    statusDenied: "رُفض إذن الوصول إلى المنفذ",
    statusOpenFailed: "تعذر فتح منفذ USB",
    statusCloseFailed: "تعذر تأكيد إغلاق منفذ USB",
    transportOnly:
      "حالة النقل فقط. تعريف Target والربط والتحديث والكتابة ما زالت مقفلة حتى يكتمل التحقق.",
    portInfo: "VID {vid} · PID {pid} · {baud} baud",
    unknownId: "غير متاح",
    operationsLocked:
      "العمليات الثلاث أسفل هذه اللوحة تبقى معاينات آمنة حاليًا. لن يعرض التطبيق جهازًا تجريبيًا على أنه جهازك الحقيقي.",
  },
  en: {
    kicker: "Real connection",
    title: "Connect the device",
    description:
      "Choose the appropriate transport. This panel does not use the demo device and never treats an opened port as confirmed device identity.",
    roleLabel: "Device role",
    tx: "Transmitter TX",
    rx: "Receiver RX",
    methodLabel: "Connection method",
    wifi: "Direct Wi-Fi",
    serial: "USB / UART",
    etx: "EdgeTX Passthrough",
    betaflight: "Betaflight Passthrough",
    stlink: "ST-Link",
    wifiDescription:
      "Join the Wi-Fi network created by the device, then open the device page directly. This avoids blocked local HTTP subrequests from encrypted GitHub Pages.",
    openAp: "Open device page 10.0.0.1",
    openTx: "Open transmitter address elrs_tx.local",
    openRx: "Open receiver address elrs_rx.local",
    serialDescription:
      "The app opens a USB/UART port at 115200 without writing a byte. Success proves transport access only, not ExpressLRS identity.",
    serialConnect: "Select and open USB port",
    serialDisconnect: "Close USB port",
    externalDescription:
      "This opens the official Web Flasher with the selected method. Target selection, verification, and flashing remain in the official tool until this app's native adapter is complete.",
    externalOpen: "Open official Web Flasher",
    statusIdle: "No real connection",
    statusConnecting: "Opening USB port",
    statusConnected: "USB port open",
    statusDisconnected: "USB port closed",
    statusUnsupported: "Web Serial is not supported by this browser",
    statusInsecure: "USB access requires a secure HTTPS page",
    statusCancelled: "Port selection was cancelled",
    statusDenied: "Port permission was denied",
    statusOpenFailed: "USB port could not be opened",
    statusCloseFailed: "USB port closure could not be confirmed",
    transportOnly:
      "Transport state only. Target identity, binding, updating, and writes stay locked until verification is complete.",
    portInfo: "VID {vid} · PID {pid} · {baud} baud",
    unknownId: "unavailable",
    operationsLocked:
      "The three operations below remain safe previews for now. The app will no longer present a demo device as your real device.",
  },
} as const;

function localeFromDocument(): HubLocale {
  return document.documentElement.lang.toLowerCase().startsWith("en")
    ? "en"
    : "ar";
}

function useDocumentLocale(): HubLocale {
  const [locale, setLocale] = useState<HubLocale>(localeFromDocument);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setLocale(localeFromDocument());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
    return () => observer.disconnect();
  }, []);

  return locale;
}

function useConnectionPortalHost(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const page = document.querySelector<HTMLElement>("main.page");
    if (page === null) {
      return;
    }

    const node = document.createElement("div");
    node.className = "device-connection-host";
    const workspace = page.querySelector(".simple-workspace");
    page.insertBefore(node, workspace);
    setHost(node);

    return () => node.remove();
  }, []);

  return host;
}

function methodsForRole(role: DeviceRole): readonly ConnectionMethod[] {
  return role === "tx"
    ? (["wifi", "serial", "etx"] as const)
    : (["wifi", "serial", "betaflight", "stlink"] as const);
}

function officialMethodUrl(
  role: DeviceRole,
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

function serialStatusText(
  locale: HubLocale,
  presentation: SerialPresentation,
): string {
  const text = copy[locale];
  const labels: Readonly<Record<SerialPresentationStatus, string>> = {
    IDLE: text.statusIdle,
    CONNECTING: text.statusConnecting,
    CONNECTED: text.statusConnected,
    DISCONNECTED: text.statusDisconnected,
    UNSUPPORTED: text.statusUnsupported,
    INSECURE_CONTEXT: text.statusInsecure,
    CANCELLED: text.statusCancelled,
    PERMISSION_DENIED: text.statusDenied,
    OPEN_FAILED: text.statusOpenFailed,
    CLOSE_FAILED: text.statusCloseFailed,
  };
  return labels[presentation.status];
}

export function DeviceConnectionHub() {
  const host = useConnectionPortalHost();
  const locale = useDocumentLocale();

  return host === null
    ? null
    : createPortal(<DeviceConnectionHubPanel locale={locale} />, host);
}

export function DeviceConnectionHubPanel({
  locale,
  navigatorObject,
  secureContext,
}: {
  readonly locale: HubLocale;
  readonly navigatorObject?: unknown;
  readonly secureContext?: boolean;
}) {
  const text = copy[locale];
  const [role, setRole] = useState<DeviceRole>("tx");
  const [method, setMethod] = useState<ConnectionMethod>("wifi");
  const [serial, setSerial] = useState<SerialPresentation>({ status: "IDLE" });
  const portRef = useRef<WebSerialPort | null>(null);
  const requestSequence = useRef(0);
  const methods = methodsForRole(role);

  useEffect(
    () => () => {
      requestSequence.current += 1;
      const port = portRef.current;
      portRef.current = null;
      if (port !== null) {
        void closeWebSerialPort(port);
      }
    },
    [],
  );

  function selectRole(nextRole: DeviceRole) {
    setRole(nextRole);
    setMethod("wifi");
  }

  async function connectSerial() {
    const requestId = ++requestSequence.current;
    setSerial({ status: "CONNECTING" });
    const outcome = await connectWebSerialReadOnly({
      ...(navigatorObject === undefined ? {} : { navigatorObject }),
      ...(secureContext === undefined ? {} : { secureContext }),
    });
    if (requestSequence.current !== requestId) {
      if (outcome.status === "CONNECTED") {
        await closeWebSerialPort(outcome.port);
      }
      return;
    }

    if (outcome.status !== "CONNECTED") {
      setSerial({ status: outcome.status });
      return;
    }

    portRef.current = outcome.port;
    try {
      outcome.port.ondisconnect = () => {
        if (portRef.current === outcome.port) {
          portRef.current = null;
          setSerial({ status: "DISCONNECTED" });
        }
      };
    } catch {
      // Some implementations expose disconnect only on navigator.serial.
    }
    setSerial({
      status: "CONNECTED",
      info: outcome.info,
      baudRate: outcome.baudRate,
    });
  }

  async function disconnectSerial() {
    requestSequence.current += 1;
    const port = portRef.current;
    portRef.current = null;
    if (port === null) {
      setSerial({ status: "DISCONNECTED" });
      return;
    }
    const closed = await closeWebSerialPort(port);
    setSerial({ status: closed ? "DISCONNECTED" : "CLOSE_FAILED" });
  }

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
          className={`connection-transport-status status-${serial.status.toLowerCase()}`}
          role="status"
          aria-live="polite"
        >
          {serialStatusText(locale, serial)}
        </span>
      </div>

      <div className="connection-role-row">
        <span>{text.roleLabel}</span>
        <div className="connection-role-switch" role="group" aria-label={text.roleLabel}>
          <button
            type="button"
            className={role === "tx" ? "is-active" : undefined}
            aria-pressed={role === "tx"}
            onClick={() => selectRole("tx")}
          >
            {text.tx}
          </button>
          <button
            type="button"
            className={role === "rx" ? "is-active" : undefined}
            aria-pressed={role === "rx"}
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
            onClick={() => setMethod(item)}
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
              <a href="http://10.0.0.1/" target="_blank" rel="noopener noreferrer">
                {text.openAp}
              </a>
              <a
                href={role === "tx" ? "http://elrs_tx.local/" : "http://elrs_rx.local/"}
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
            {serial.status === "CONNECTED" &&
            serial.info !== undefined &&
            serial.baudRate !== undefined ? (
              <p className="connection-port-info">
                {text.portInfo
                  .replace(
                    "{vid}",
                    formatUsbId(serial.info.usbVendorId, text.unknownId),
                  )
                  .replace(
                    "{pid}",
                    formatUsbId(serial.info.usbProductId, text.unknownId),
                  )
                  .replace("{baud}", String(serial.baudRate))}
              </p>
            ) : null}
            <div className="connection-link-row">
              {serial.status === "CONNECTED" ? (
                <button type="button" onClick={() => void disconnectSerial()}>
                  {text.serialDisconnect}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={serial.status === "CONNECTING"}
                  aria-busy={serial.status === "CONNECTING"}
                  onClick={() => void connectSerial()}
                >
                  {text.serialConnect}
                </button>
              )}
            </div>
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

      <div className="connection-boundary-note">
        <strong>{text.transportOnly}</strong>
        <p>{text.operationsLocked}</p>
      </div>
    </section>
  );
}
