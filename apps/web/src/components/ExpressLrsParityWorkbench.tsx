import { useEffect, useRef, useState } from "react";

import { flashEspFirmware } from "../hardware/esp-flasher";
import {
  downloadPreparedBytes,
  prepareOfficialFirmwarePackage,
} from "../hardware/firmware-package";
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
  OfficialTarget,
  PreparedFirmwarePackage,
} from "../hardware/parity-types";
import {
  clearRecoveryCheckpoint,
  loadRecoveryCheckpoint,
  saveRecoveryCheckpoint,
  validateRecoveryPackage,
  type RecoveryCheckpoint,
} from "../hardware/recovery-package";
import {
  ExpressLrsHardwareSession,
  type ExpressLrsIdentity,
  type ExpressLrsSettingsBackup,
} from "../hardware/session";
import {
  matchHardwareIdentityToOfficialTargets,
  type TargetMatchResult,
} from "../hardware/target-match";
import { flashXmodemFirmware } from "../hardware/xmodem";
import type { CrsfParameter } from "../hardware/crsf";

const DEFAULT_OPTIONS: ExpressLrsFirmwareOptions = Object.freeze({
  region: "FCC",
  domain: 0,
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

const METHOD_LABELS: Readonly<Record<ExpressLrsFlashMethod, string>> = Object.freeze({
  uart: "USB مباشر / UART",
  betaflight: "عبر متحكم الطيران",
  edgetx: "عبر جهاز التحكم",
  passthru: "Passthrough جاهز",
  wifi: "Wi-Fi",
  stlink: "ST-Link",
  download: "تنزيل فقط",
});

function nowIso(): string {
  return new Date().toISOString();
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "");
}

function platformFamily(target: OfficialTarget): "esp" | "stm32" | "other" {
  const platform = target.config.platform.toLocaleLowerCase("en-US");
  if (platform.startsWith("esp32") || platform.includes("8285") || platform.includes("8266")) {
    return "esp";
  }
  if (platform.startsWith("stm32")) return "stm32";
  return "other";
}

function regionsForRadio(radioKey: string): readonly string[] {
  if (radioKey.includes("2400")) return Object.freeze(["FCC", "EU_CE_2400"]);
  if (radioKey.includes("900") || radioKey.includes("868") || radioKey.includes("915")) {
    return Object.freeze(["FCC", "AU_915", "EU_868", "IN_866"]);
  }
  return Object.freeze(["FCC"]);
}

function commandForBootloader(parameters: readonly CrsfParameter[]): string | null {
  const command = parameters.find(
    (parameter) =>
      parameter.kind === "command" &&
      /(serial\s*update|bootloader|update\s*mode)/iu.test(parameter.name),
  );
  return command?.name ?? null;
}

function settingValue(parameter: CrsfParameter | undefined): string {
  return parameter?.kind === "number" || parameter?.kind === "selection"
    ? String(parameter.value)
    : "";
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${value} B`;
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "توقفت العملية بسبب خطأ غير معروف";
  return message
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .slice(0, 500);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function fileBytes(file: File, maximumBytes: number): Promise<Uint8Array> {
  if (file.size <= 0 || file.size > maximumBytes) {
    throw new RangeError(`الملف يجب أن يكون بين 1 و${formatBytes(maximumBytes)}`);
  }
  return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

export function ExpressLrsParityWorkbench() {
  const [catalog, setCatalog] = useState<OfficialCatalog | null>(null);
  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [role, setRole] = useState<ExpressLrsDeviceRole>("tx");
  const [releaseRevision, setReleaseRevision] = useState("");
  const [vendorKey, setVendorKey] = useState("");
  const [radioKey, setRadioKey] = useState("");
  const [targetId, setTargetId] = useState("");
  const [method, setMethod] = useState<ExpressLrsFlashMethod>("uart");
  const [options, setOptions] = useState<ExpressLrsFirmwareOptions>(DEFAULT_OPTIONS);
  const [status, setStatus] = useState("حمّل الكتالوج الرسمي للبدء.");
  const [busy, setBusy] = useState(false);
  const [sessionIdentity, setSessionIdentity] = useState<ExpressLrsIdentity | null>(null);
  const [parameters, setParameters] = useState<readonly CrsfParameter[]>([]);
  const [backup, setBackup] = useState<ExpressLrsSettingsBackup | null>(null);
  const [targetMatch, setTargetMatch] = useState<TargetMatchResult | null>(null);
  const [selectedSettingId, setSelectedSettingId] = useState("");
  const [settingDraft, setSettingDraft] = useState("");
  const [prepared, setPrepared] = useState<PreparedFirmwarePackage | null>(null);
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false);
  const [manualTargetConfirmation, setManualTargetConfirmation] = useState("");
  const [flashProgress, setFlashProgress] = useState<FirmwareFlashProgress | null>(null);
  const [checkpoint, setCheckpoint] = useState<RecoveryCheckpoint | null>(null);
  const sessionRef = useRef<ExpressLrsHardwareSession | null>(null);
  const catalogAbort = useRef<AbortController | null>(null);
  const operationAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    void loadRecoveryCheckpoint()
      .then((value) => {
        if (active) setCheckpoint(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      catalogAbort.current?.abort();
      operationAbort.current?.abort();
      void sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, []);

  const releases = catalog?.releases ?? [];
  const roleTargets = (catalog?.targets ?? []).filter((target) => target.role === role);
  const vendors = [...new Map(roleTargets.map((target) => [target.vendorKey, target.vendorName])).entries()];
  const vendorTargets = roleTargets.filter((target) => target.vendorKey === vendorKey);
  const radios = [...new Set(vendorTargets.map((target) => target.radioKey))];
  const visibleTargets = vendorTargets.filter((target) => target.radioKey === radioKey);
  const selectedRelease = releases.find((release) => release.revision === releaseRevision) ?? null;
  const selectedTarget = roleTargets.find((target) => target.id === targetId) ?? null;
  const regionChoices = regionsForRadio(radioKey);
  const methods = selectedTarget?.config.uploadMethods ?? [];
  const writableParameters = parameters.filter(
    (parameter) =>
      !parameter.hidden &&
      (parameter.kind === "number" || parameter.kind === "selection"),
  );
  const selectedSetting = writableParameters.find(
    (parameter) => String(parameter.id) === selectedSettingId,
  );
  const exactHardwareTarget =
    selectedTarget !== null &&
    targetMatch?.confidence === "EXACT" &&
    targetMatch.selected?.id === selectedTarget.id;
  const manualTargetConfirmed =
    selectedTarget !== null &&
    normalized(manualTargetConfirmation) === normalized(selectedTarget.targetKey);

  function resetTargetChain(nextRole = role) {
    const targets = (catalog?.targets ?? []).filter((target) => target.role === nextRole);
    const nextVendor = targets[0]?.vendorKey ?? "";
    const nextRadio = targets.find((target) => target.vendorKey === nextVendor)?.radioKey ?? "";
    const nextTarget = targets.find(
      (target) => target.vendorKey === nextVendor && target.radioKey === nextRadio,
    );
    setVendorKey(nextVendor);
    setRadioKey(nextRadio);
    setTargetId(nextTarget?.id ?? "");
    const nextMethods = nextTarget?.config.uploadMethods ?? [];
    setMethod(nextMethods.includes("uart") ? "uart" : (nextMethods[0] ?? "download"));
    setOptions((current) => ({
      ...current,
      region: regionsForRadio(nextRadio)[0] ?? "FCC",
    }));
    setPrepared(null);
    setRecoveryDownloaded(false);
    setManualTargetConfirmation("");
  }

  async function loadCatalog() {
    catalogAbort.current?.abort();
    const controller = new AbortController();
    catalogAbort.current = controller;
    setCatalogState("loading");
    setBusy(true);
    setStatus("جارٍ جلب كتالوج ExpressLRS الرسمي والتحقق من بنيته…");
    try {
      const loaded = await loadOfficialExpressLrsCatalog({
        signal: controller.signal,
        onProgress(stage, received, total) {
          const label = stage === "INDEX" ? "فهرس الإصدارات" : "كتالوج Targets";
          setStatus(
            `جارٍ تحميل ${label}: ${formatBytes(received)}${total === null ? "" : ` / ${formatBytes(total)}`}`,
          );
        },
      });
      setCatalog(loaded);
      setCatalogState("ready");
      setReleaseRevision(loaded.releases[0]?.revision ?? "");
      const firstRoleTarget = loaded.targets.find((target) => target.role === role);
      const nextVendor = firstRoleTarget?.vendorKey ?? "";
      const nextRadio = firstRoleTarget?.radioKey ?? "";
      setVendorKey(nextVendor);
      setRadioKey(nextRadio);
      setTargetId(firstRoleTarget?.id ?? "");
      const nextMethods = firstRoleTarget?.config.uploadMethods ?? [];
      setMethod(nextMethods.includes("uart") ? "uart" : (nextMethods[0] ?? "download"));
      setOptions((current) => ({
        ...current,
        region: regionsForRadio(nextRadio)[0] ?? "FCC",
      }));
      setStatus(
        `تم تحميل ${loaded.releases.length} إصدارًا و${loaded.targets.length} Target من المصدر الرسمي.`,
      );
    } catch (error: unknown) {
      setCatalogState("failed");
      setStatus(`تعذر تحميل الكتالوج الرسمي: ${safeMessage(error)}`);
    } finally {
      if (catalogAbort.current === controller) catalogAbort.current = null;
      setBusy(false);
    }
  }

  async function disconnectHardware() {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session !== null) await session.close();
    setSessionIdentity(null);
    setParameters([]);
    setBackup(null);
    setTargetMatch(null);
    setSelectedSettingId("");
    setSettingDraft("");
  }

  async function connectHardware() {
    if (catalog === null) {
      setStatus("حمّل الكتالوج الرسمي قبل تعريف الجهاز.");
      return;
    }
    await disconnectHardware();
    const controller = new AbortController();
    operationAbort.current = controller;
    setBusy(true);
    setStatus("اختر منفذ وحدة ExpressLRS المباشر. جارٍ إرسال CRSF Device Ping…");
    try {
      const outcome = await ExpressLrsHardwareSession.connect({
        role,
        signal: controller.signal,
      });
      if (outcome.status !== "CONNECTED") {
        setStatus(`لم يكتمل التعرف: ${outcome.message}`);
        return;
      }
      sessionRef.current = outcome.session;
      const match = matchHardwareIdentityToOfficialTargets({
        identity: outcome.identity,
        targets: catalog.targets,
      });
      const settingsBackup = outcome.session.createSettingsBackup();
      setSessionIdentity(outcome.identity);
      setParameters(outcome.parameters);
      setBackup(settingsBackup);
      setTargetMatch(match);
      const firstWritable = outcome.parameters.find(
        (parameter) =>
          !parameter.hidden &&
          (parameter.kind === "number" || parameter.kind === "selection"),
      );
      setSelectedSettingId(firstWritable === undefined ? "" : String(firstWritable.id));
      setSettingDraft(settingValue(firstWritable));
      if (match.confidence === "EXACT" && match.selected !== null) {
        setTargetId(match.selected.id);
        setVendorKey(match.selected.vendorKey);
        setRadioKey(match.selected.radioKey);
        const nextMethods = match.selected.config.uploadMethods;
        setMethod(nextMethods.includes("uart") ? "uart" : (nextMethods[0] ?? "download"));
        setOptions((current) => ({
          ...current,
          region: regionsForRadio(match.selected?.radioKey ?? "")[0] ?? "FCC",
        }));
        setStatus(`تم تعريف ${outcome.identity.productName} ومطابقته بـTarget رسمي واحد.`);
      } else {
        setStatus(
          `تم إثبات CRSF وهوية الجهاز، لكن مطابقة Target هي ${match.confidence}. تبقى الكتابة مغلقة.`,
        );
      }
    } catch (error: unknown) {
      setStatus(`توقفت جلسة التعرف: ${safeMessage(error)}`);
    } finally {
      operationAbort.current = null;
      setBusy(false);
    }
  }

  async function writeSetting() {
    const session = sessionRef.current;
    if (session === null || selectedSetting === undefined) return;
    const value = Number(settingDraft);
    setBusy(true);
    setStatus(`جارٍ كتابة ${selectedSetting.name} ثم إعادة قراءته…`);
    try {
      const result = await session.writeParameter(selectedSetting.id, value);
      setParameters(session.parameters);
      setSettingDraft(String(result.requestedValue));
      setStatus(
        result.verified
          ? `تم حفظ ${selectedSetting.name} والتحقق من القيمة بالقراءة الرجعية.`
          : `لم يتم إثبات القيمة الجديدة لـ${selectedSetting.name}.`,
      );
    } catch (error: unknown) {
      setStatus(`تعذر حفظ الإعداد: ${safeMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function restoreSettings() {
    const session = sessionRef.current;
    if (session === null || backup === null) return;
    setBusy(true);
    setStatus("جارٍ استعادة لقطة الإعدادات والتحقق من كل قيمة…");
    try {
      const results = await session.restoreSettingsBackup(backup);
      setParameters(session.parameters);
      setStatus(`اكتملت استعادة ${results.length} قيمة مع قراءة رجعية.`);
    } catch (error: unknown) {
      setStatus(`توقفت الاستعادة: ${safeMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function startBinding() {
    const session = sessionRef.current;
    if (session === null || !exactHardwareTarget) return;
    setBusy(true);
    setStatus("جارٍ إرسال أمر الربط الحقيقي عبر CRSF…");
    try {
      const result = await session.startBinding();
      setStatus(
        result.verified
          ? `أقر الجهاز أمر الربط: ${result.information}`
          : `تم إرسال أمر الربط، لكن رابط RF لا يزال يحتاج تحققًا من الطرفين: ${result.information}`,
      );
    } catch (error: unknown) {
      setStatus(`توقف الربط: ${safeMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function buildFirmware() {
    if (selectedRelease === null || selectedTarget === null) return;
    operationAbort.current?.abort();
    const controller = new AbortController();
    operationAbort.current = controller;
    setBusy(true);
    setPrepared(null);
    setRecoveryDownloaded(false);
    setFlashProgress(null);
    setStatus("جارٍ تنزيل حزمة الإصدار الرسمية وتجهيز Firmware لهذا Target…");
    try {
      const result = await prepareOfficialFirmwarePackage({
        release: selectedRelease,
        target: selectedTarget,
        options,
        signal: controller.signal,
        onProgress(progress) {
          setStatus(
            `مرحلة ${progress.stage}: ${formatBytes(progress.receivedBytes)}${progress.totalBytes === null ? "" : ` / ${formatBytes(progress.totalBytes)}`}`,
          );
        },
      });
      setPrepared(result);
      setStatus(
        `تم تجهيز ${result.segments.length} قطاعًا والتحقق من SHA-256 لكل قطاع. احفظ حزمة الاستعادة قبل التفليش.`,
      );
    } catch (error: unknown) {
      setStatus(`تعذر تجهيز Firmware: ${safeMessage(error)}`);
    } finally {
      if (operationAbort.current === controller) operationAbort.current = null;
      setBusy(false);
    }
  }

  function downloadFirmware() {
    if (prepared === null) return;
    downloadPreparedBytes(
      prepared.primaryDownload,
      prepared.primaryFileName,
      prepared.primaryMimeType,
    );
    setStatus(`تم بدء تنزيل ${prepared.primaryFileName}.`);
  }

  function downloadRecovery() {
    if (prepared === null) return;
    downloadPreparedBytes(
      prepared.recoveryArchive,
      prepared.recoveryFileName,
      "application/zip",
    );
    setRecoveryDownloaded(true);
    setStatus("تم تنزيل حزمة الاستعادة. احتفظ بها حتى اكتمال إعادة الاتصال والتحقق.");
  }

  async function updateCheckpoint(
    packageValue: PreparedFirmwarePackage,
    stage: RecoveryCheckpoint["stage"],
    safeError: string | null = null,
  ): Promise<RecoveryCheckpoint> {
    const packageSha256 = await sha256Hex(packageValue.recoveryArchive);
    const previous = checkpoint;
    const value: RecoveryCheckpoint = Object.freeze({
      schemaVersion: 1,
      targetId: packageValue.target.id,
      productName: packageValue.target.config.productName,
      packageSha256,
      stage,
      createdAt: previous?.targetId === packageValue.target.id ? previous.createdAt : nowIso(),
      updatedAt: nowIso(),
      safeError,
    });
    await saveRecoveryCheckpoint(value);
    setCheckpoint(value);
    return value;
  }

  async function reconnectAndVerify(target: OfficialTarget): Promise<void> {
    setFlashProgress({
      stage: "RECONNECT",
      writtenBytes: prepared?.segments.reduce((sum, segment) => sum + segment.bytes.byteLength, 0) ?? 0,
      totalBytes: prepared?.segments.reduce((sum, segment) => sum + segment.bytes.byteLength, 0) ?? 0,
      detail: "أعد اختيار منفذ الجهاز بعد إعادة التشغيل",
    });
    setStatus("أعد اختيار منفذ الجهاز بعد إعادة التشغيل لإثبات الهوية والإصدار.");
    const outcome = await ExpressLrsHardwareSession.connect({ role: target.role });
    if (outcome.status !== "CONNECTED") {
      throw new Error(`تعذرت إعادة قراءة الجهاز: ${outcome.message}`);
    }
    const match = matchHardwareIdentityToOfficialTargets({
      identity: outcome.identity,
      targets: catalog?.targets ?? [target],
    });
    if (match.confidence !== "EXACT" || match.selected?.id !== target.id) {
      await outcome.session.close();
      throw new Error("عاد جهاز بعد التفليش، لكن هويته لا تطابق Target المتوقع");
    }
    sessionRef.current = outcome.session;
    setSessionIdentity(outcome.identity);
    setParameters(outcome.parameters);
    setBackup(outcome.session.createSettingsBackup());
    setTargetMatch(match);
    await clearRecoveryCheckpoint();
    setCheckpoint(null);
    setFlashProgress({
      stage: "COMPLETE",
      writtenBytes: prepared?.segments.reduce((sum, segment) => sum + segment.bytes.byteLength, 0) ?? 0,
      totalBytes: prepared?.segments.reduce((sum, segment) => sum + segment.bytes.byteLength, 0) ?? 0,
      detail: "عاد Target المتوقع وتمت قراءة CRSF مجددًا",
    });
  }

  async function flashPreparedFirmware() {
    if (prepared === null || selectedTarget === null) return;
    if (!recoveryDownloaded) {
      setStatus("احفظ حزمة الاستعادة أولًا. التفليش مقفل حتى تأكيد ذلك.");
      return;
    }
    if (method === "wifi") {
      downloadFirmware();
      window.open(
        selectedTarget.role === "tx" ? "http://elrs_tx.local/" : "http://elrs_rx.local/",
        "_blank",
        "noopener,noreferrer",
      );
      setStatus("تم تجهيز ملف Wi-Fi وفتح صفحة الجهاز المحلية. اختر الملف المنزّل داخلها.");
      return;
    }
    if (method === "download") {
      downloadFirmware();
      return;
    }
    if (method === "stlink") {
      setStatus("مسار ST-Link الداخلي لم يُفتح بعد؛ لا توجد كتابة صورية. استخدم التنزيل مع أداة ST-Link المعتمدة حاليًا.");
      return;
    }
    const direct = method === "uart";
    if (direct && (!exactHardwareTarget || sessionRef.current === null)) {
      setStatus("USB المباشر يتطلب جلسة CRSF وTarget رسميًا متطابقًا قبل الكتابة.");
      return;
    }
    if (!direct && !manualTargetConfirmed) {
      setStatus("اكتب مفتاح Target الظاهر حرفيًا لتأكيد مسار Passthrough الذي لا يملك هوية CRSF مستقلة.");
      return;
    }

    const controller = new AbortController();
    operationAbort.current = controller;
    setBusy(true);
    setFlashProgress(null);
    try {
      await updateCheckpoint(prepared, "PACKAGE_SAVED");
      const family = platformFamily(selectedTarget);
      if (family === "other") throw new Error("منصة Target غير مدعومة داخل التطبيق");
      let port;
      let resetMode: "default_reset" | "no_reset" = "default_reset";
      if (direct) {
        const session = sessionRef.current;
        if (session === null) throw new Error("جلسة CRSF أغلقت قبل التفليش");
        await updateCheckpoint(prepared, "BOOTLOADER");
        if (selectedTarget.role === "rx") {
          const bootloader = await session.enterReceiverBootloader();
          const observed = normalized(bootloader.target);
          const allowed = [
            normalized(selectedTarget.targetKey),
            normalized(selectedTarget.config.firmware),
            normalized(selectedTarget.config.productName),
          ];
          if (!allowed.some((value) => value.length >= 3 && (observed.includes(value) || value.includes(observed)))) {
            throw new Error(`Bootloader أبلغ Target مختلفًا: ${bootloader.target}`);
          }
        } else {
          const command = commandForBootloader(parameters);
          if (command !== null) await session.executeCommand(command, controller.signal);
        }
        port = await session.detachPortForBootloader();
        sessionRef.current = null;
        setSessionIdentity(null);
        setParameters([]);
      } else {
        port = await requestHardwarePort();
        await updateCheckpoint(prepared, "BOOTLOADER");
        await initializeSerialPassthrough({
          method: method as PassthroughMethod,
          port,
          flashBaud: family === "esp" ? 460_800 : 420_000,
          signal: controller.signal,
        });
        resetMode = "no_reset";
      }

      await updateCheckpoint(prepared, "WRITING");
      if (family === "esp") {
        await flashEspFirmware({
          port,
          target: selectedTarget,
          segments: prepared.segments,
          resetMode,
          signal: controller.signal,
          onProgress(progress) {
            setFlashProgress(progress);
          },
        });
      } else {
        const firmware = prepared.segments.find((segment) => segment.name === "firmware.bin");
        if (firmware === undefined) throw new Error("حزمة STM32 لا تحتوي firmware.bin");
        await flashXmodemFirmware({
          port,
          firmware: firmware.bytes,
          signal: controller.signal,
          onProgress(progress) {
            setFlashProgress(progress);
          },
        });
      }
      await updateCheckpoint(prepared, "RECONNECTING");
      await reconnectAndVerify(selectedTarget);
      setStatus("اكتمل التفليش، عاد Target المتوقع، وأعيدت قراءة CRSF بنجاح.");
    } catch (error: unknown) {
      const message = safeMessage(error);
      try {
        await updateCheckpoint(prepared, "RECOVERY_REQUIRED", message);
      } catch {
        // The visible error remains useful even if IndexedDB is unavailable.
      }
      setStatus(`توقف التفليش وتحتاج العملية إلى الاستعادة: ${message}`);
    } finally {
      operationAbort.current = null;
      setBusy(false);
    }
  }

  async function recoverFromFile(file: File) {
    if (selectedTarget === null) return;
    setBusy(true);
    setStatus("جارٍ فحص حزمة الاستعادة وSHA-256 لكل قطاع…");
    try {
      const bytes = await fileBytes(file, 64 * 1024 * 1024);
      const validated = await validateRecoveryPackage({
        bytes,
        expectedTarget: selectedTarget,
      });
      if (
        checkpoint !== null &&
        checkpoint.packageSha256 !== validated.packageSha256
      ) {
        throw new Error("الحزمة المختارة لا تطابق بصمة جلسة الاستعادة المعلقة");
      }
      const port = await requestHardwarePort();
      const family = platformFamily(selectedTarget);
      if (family === "esp") {
        await flashEspFirmware({
          port,
          target: selectedTarget,
          segments: validated.segments,
          onProgress: setFlashProgress,
        });
      } else if (family === "stm32") {
        const firmware = validated.segments.find((segment) => segment.name === "firmware.bin");
        if (firmware === undefined) throw new Error("حزمة الاستعادة لا تحتوي firmware.bin");
        await flashXmodemFirmware({
          port,
          firmware: firmware.bytes,
          onProgress: setFlashProgress,
        });
      } else {
        throw new Error("منصة الاستعادة غير مدعومة");
      }
      await reconnectAndVerify(selectedTarget);
      setStatus("اكتملت الاستعادة وعاد Target المتوقع.");
    } catch (error: unknown) {
      setStatus(`توقفت الاستعادة: ${safeMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function updateOption<Key extends keyof ExpressLrsFirmwareOptions>(
    key: Key,
    value: ExpressLrsFirmwareOptions[Key],
  ) {
    setOptions((current) => ({ ...current, [key]: value }));
    setPrepared(null);
    setRecoveryDownloaded(false);
  }

  return (
    <main className="parity-shell" dir="rtl">
      <header className="parity-header">
        <div>
          <span className="section-kicker">ELRS السهل · Hardware Lab</span>
          <h1>إعداد وتحديث ExpressLRS</h1>
          <p>كتالوج رسمي، تعريف CRSF، إعدادات حقيقية، حزمة استعادة، ونجاح مشروط بعودة الجهاز المتوقع.</p>
        </div>
        <span className={sessionIdentity === null ? "parity-state" : "parity-state is-ready"}>
          {sessionIdentity === null ? "لا توجد جلسة جهاز" : "CRSF متصل"}
        </span>
      </header>

      <section className="parity-status" role="status" aria-live="polite">
        <strong>الحالة</strong>
        <span>{status}</span>
        {busy ? (
          <button type="button" onClick={() => operationAbort.current?.abort()}>
            إلغاء العملية
          </button>
        ) : null}
      </section>

      {checkpoint === null ? null : (
        <section className="parity-warning" aria-labelledby="recovery-heading">
          <div>
            <strong id="recovery-heading">استعادة معلّقة · {checkpoint.stage}</strong>
            <p>{checkpoint.productName} — احتفظ بالجهاز موصولًا واختر حزمة الاستعادة المطابقة.</p>
            {checkpoint.safeError === null ? null : <p>{checkpoint.safeError}</p>}
          </div>
          <label className="file-button">
            اختيار حزمة الاستعادة
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={busy || selectedTarget === null}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined) void recoverFromFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </section>
      )}

      <section className="parity-card" aria-labelledby="catalog-heading">
        <div className="parity-card-heading">
          <div>
            <span>1</span>
            <div>
              <h2 id="catalog-heading">الإصدار وTarget</h2>
              <p>البيانات تأتي من Artifactory الرسمي ولا تُقبل قبل فحص البنية والحدود.</p>
            </div>
          </div>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void loadCatalog()}>
            {catalogState === "loading" ? "جارٍ التحميل…" : "تحميل الكتالوج الرسمي"}
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
                resetTargetChain(item);
              }}
            >
              {item === "tx" ? "جهاز إرسال TX" : "جهاز استقبال RX"}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <label>
            <span>الإصدار</span>
            <select value={releaseRevision} disabled={catalog === null || busy} onChange={(event) => { setReleaseRevision(event.currentTarget.value); setPrepared(null); }}>
              {releases.map((release) => (
                <option key={`${release.channel}:${release.revision}`} value={release.revision}>
                  {release.label}{release.channel === "branch" ? " · تجريبي" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>الشركة</span>
            <select value={vendorKey} disabled={catalog === null || busy} onChange={(event) => {
              const nextVendor = event.currentTarget.value;
              const nextRadio = roleTargets.find((target) => target.vendorKey === nextVendor)?.radioKey ?? "";
              const nextTarget = roleTargets.find((target) => target.vendorKey === nextVendor && target.radioKey === nextRadio);
              setVendorKey(nextVendor); setRadioKey(nextRadio); setTargetId(nextTarget?.id ?? ""); setPrepared(null);
            }}>
              {vendors.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>
          </label>
          <label>
            <span>النطاق / العائلة</span>
            <select value={radioKey} disabled={catalog === null || busy} onChange={(event) => {
              const nextRadio = event.currentTarget.value;
              const nextTarget = vendorTargets.find((target) => target.radioKey === nextRadio);
              setRadioKey(nextRadio); setTargetId(nextTarget?.id ?? ""); updateOption("region", regionsForRadio(nextRadio)[0] ?? "FCC");
            }}>
              {radios.map((radio) => <option key={radio} value={radio}>{radio}</option>)}
            </select>
          </label>
          <label>
            <span>Target</span>
            <select value={targetId} disabled={catalog === null || busy} onChange={(event) => {
              const nextId = event.currentTarget.value;
              const nextTarget = roleTargets.find((target) => target.id === nextId);
              setTargetId(nextId); setPrepared(null); setRecoveryDownloaded(false);
              if (nextTarget !== undefined) {
                const nextMethods = nextTarget.config.uploadMethods;
                setMethod(nextMethods.includes("uart") ? "uart" : (nextMethods[0] ?? "download"));
              }
            }}>
              {visibleTargets.map((target) => <option key={target.id} value={target.id}>{target.config.productName}</option>)}
            </select>
          </label>
          <label>
            <span>المنطقة التنظيمية</span>
            <select value={options.region} disabled={selectedTarget === null || busy} onChange={(event) => updateOption("region", event.currentTarget.value)}>
              {regionChoices.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
          </label>
          <label>
            <span>طريقة التحديث</span>
            <select value={method} disabled={selectedTarget === null || busy} onChange={(event) => setMethod(event.currentTarget.value as ExpressLrsFlashMethod)}>
              {methods.map((item) => <option key={item} value={item}>{METHOD_LABELS[item]}</option>)}
            </select>
          </label>
        </div>

        {selectedTarget === null ? null : (
          <dl className="target-summary">
            <div><dt>المنصة</dt><dd>{selectedTarget.config.platform}</dd></div>
            <div><dt>Firmware key</dt><dd>{selectedTarget.config.firmware}</dd></div>
            <div><dt>طرق Target</dt><dd>{selectedTarget.config.uploadMethods.map((item) => METHOD_LABELS[item]).join(" · ")}</dd></div>
          </dl>
        )}
      </section>

      <section className="parity-card" aria-labelledby="device-heading">
        <div className="parity-card-heading">
          <div><span>2</span><div><h2 id="device-heading">تعريف الجهاز وإعداداته</h2><p>فتح COM وحده لا يكفي؛ يلزم Device Info وCRC ثم Target رسمي واحد.</p></div></div>
          <div className="button-row">
            {sessionIdentity === null ? (
              <button type="button" className="primary-button" disabled={busy || catalog === null} onClick={() => void connectHardware()}>تعريف الجهاز عبر CRSF</button>
            ) : (
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void disconnectHardware()}>إغلاق الجلسة</button>
            )}
          </div>
        </div>

        {sessionIdentity === null ? (
          <p className="empty-state">استخدم USB المباشر لوحدة ELRS. منفذ Joystick أو منفذ الراديو العام لن يمر من بوابة CRSF.</p>
        ) : (
          <>
            <dl className="target-summary">
              <div><dt>الجهاز</dt><dd>{sessionIdentity.productName}</dd></div>
              <div><dt>Firmware</dt><dd>{sessionIdentity.firmwareVersion}</dd></div>
              <div><dt>CRSF Parameters</dt><dd>{sessionIdentity.parameterCount}</dd></div>
              <div><dt>مطابقة Target</dt><dd>{targetMatch?.confidence ?? "NOT_FOUND"}</dd></div>
            </dl>
            {exactHardwareTarget ? <p className="success-note">Target المختار مطابق لهوية CRSF. بوابات الكتابة المباشرة مفتوحة.</p> : <p className="danger-note">لا توجد مطابقة EXACT بين الجهاز وTarget المختار؛ التفليش المباشر والربط مقفلان.</p>}

            <div className="settings-grid">
              <label>
                <span>الإعداد</span>
                <select value={selectedSettingId} disabled={busy || writableParameters.length === 0} onChange={(event) => {
                  const id = event.currentTarget.value;
                  setSelectedSettingId(id);
                  setSettingDraft(settingValue(writableParameters.find((parameter) => String(parameter.id) === id)));
                }}>
                  {writableParameters.map((parameter) => <option key={parameter.id} value={parameter.id}>{parameter.name}</option>)}
                </select>
              </label>
              {selectedSetting?.kind === "selection" ? (
                <label><span>القيمة</span><select value={settingDraft} disabled={busy} onChange={(event) => setSettingDraft(event.currentTarget.value)}>{selectedSetting.options.map((label, index) => <option key={`${index}:${label}`} value={index}>{label || index}</option>)}</select></label>
              ) : (
                <label><span>القيمة</span><input type="number" value={settingDraft} min={selectedSetting?.kind === "number" ? selectedSetting.min : undefined} max={selectedSetting?.kind === "number" ? selectedSetting.max : undefined} disabled={busy || selectedSetting === undefined} onChange={(event) => setSettingDraft(event.currentTarget.value)} /></label>
              )}
              <div className="settings-actions">
                <button type="button" className="primary-button" disabled={busy || !exactHardwareTarget || selectedSetting === undefined} onClick={() => void writeSetting()}>حفظ مع قراءة رجعية</button>
                <button type="button" className="secondary-button" disabled={busy || backup === null} onClick={() => void restoreSettings()}>استعادة اللقطة</button>
                <button type="button" className="secondary-button" disabled={busy || !exactHardwareTarget} onClick={() => void startBinding()}>تشغيل الربط الحقيقي</button>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="parity-card" aria-labelledby="config-heading">
        <div className="parity-card-heading"><div><span>3</span><div><h2 id="config-heading">خيارات Firmware</h2><p>عبارة الربط وكلمة Wi-Fi لا تُحفظان في المتصفح؛ تبقيان في الذاكرة حتى بناء الحزمة.</p></div></div></div>
        <div className="form-grid">
          <label><span>عبارة الربط</span><input type="password" autoComplete="off" value={options.bindPhrase} maxLength={128} onChange={(event) => updateOption("bindPhrase", event.currentTarget.value)} /></label>
          <label><span>اسم شبكة Wi-Fi</span><input type="text" autoComplete="off" value={options.wifiSsid} maxLength={32} onChange={(event) => updateOption("wifiSsid", event.currentTarget.value)} /></label>
          <label><span>كلمة مرور Wi-Fi</span><input type="password" autoComplete="new-password" value={options.wifiPassword} maxLength={64} onChange={(event) => updateOption("wifiPassword", event.currentTarget.value)} /></label>
          <label><span>تشغيل Wi-Fi تلقائيًا بعد (ثانية)</span><input type="number" min={0} max={3600} value={options.wifiAutoOnInterval} onChange={(event) => updateOption("wifiAutoOnInterval", Number(event.currentTarget.value))} /></label>
          <label><span>Fan runtime</span><input type="number" min={0} max={3600} value={options.fanRuntime} onChange={(event) => updateOption("fanRuntime", Number(event.currentTarget.value))} /></label>
          {role === "tx" ? (
            <>
              <label><span>Telemetry interval</span><input type="number" min={0} max={10000} value={options.telemetryInterval} onChange={(event) => updateOption("telemetryInterval", Number(event.currentTarget.value))} /></label>
              <label className="check-field"><input type="checkbox" checked={options.uartInverted} onChange={(event) => updateOption("uartInverted", event.currentTarget.checked)} /><span>UART مقلوب</span></label>
              <label className="check-field"><input type="checkbox" checked={options.unlockHigherPower} onChange={(event) => updateOption("unlockHigherPower", event.currentTarget.checked)} /><span>فتح مستويات الطاقة الأعلى</span></label>
            </>
          ) : (
            <>
              <label><span>Receiver UART baud</span><input type="number" min={9600} max={1_000_000} value={options.receiverUartBaud} onChange={(event) => updateOption("receiverUartBaud", Number(event.currentTarget.value))} /></label>
              <label className="check-field"><input type="checkbox" checked={options.receiverInvertTx} onChange={(event) => updateOption("receiverInvertTx", event.currentTarget.checked)} /><span>عكس خرج TX للمستقبل</span></label>
              <label className="check-field"><input type="checkbox" checked={options.lockOnFirstConnection} onChange={(event) => updateOption("lockOnFirstConnection", event.currentTarget.checked)} /><span>قفل أول اتصال</span></label>
              <label className="check-field"><input type="checkbox" checked={options.r9mmMiniSbus} onChange={(event) => updateOption("r9mmMiniSbus", event.currentTarget.checked)} /><span>R9MM Mini SBUS</span></label>
              <label className="check-field"><input type="checkbox" checked={options.receiverAsTransmitter} onChange={(event) => updateOption("receiverAsTransmitter", event.currentTarget.checked)} /><span>استخدام RX كمرسل</span></label>
            </>
          )}
        </div>
      </section>

      <section className="parity-card" aria-labelledby="package-heading">
        <div className="parity-card-heading"><div><span>4</span><div><h2 id="package-heading">بناء الحزمة والتفليش</h2><p>كل قطاع يحصل على SHA-256، وحزمة الاستعادة إلزامية قبل أول كتابة.</p></div></div><button type="button" className="primary-button" disabled={busy || selectedRelease === null || selectedTarget === null} onClick={() => void buildFirmware()}>بناء Firmware الرسمي</button></div>

        {prepared === null ? <p className="empty-state">لم تُبنَ حزمة بعد.</p> : (
          <>
            <dl className="segment-list">
              {prepared.segments.map((segment) => <div key={`${segment.address}:${segment.name}`}><dt>{segment.name} · 0x{segment.address.toString(16).toUpperCase()}</dt><dd>{formatBytes(segment.bytes.byteLength)} · <code>{segment.sha256.slice(0, 16)}…</code></dd></div>)}
            </dl>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={downloadFirmware}>تنزيل Firmware</button>
              <button type="button" className="secondary-button" onClick={downloadRecovery}>تنزيل حزمة الاستعادة</button>
            </div>
            {!recoveryDownloaded ? <p className="danger-note">زر التفليش يبقى مقفلًا حتى تنزيل حزمة الاستعادة.</p> : <p className="success-note">تم تأكيد تنزيل حزمة الاستعادة لهذه الجلسة.</p>}

            {method === "uart" ? null : method === "wifi" || method === "download" || method === "stlink" ? null : (
              <label className="manual-confirm"><span>تأكيد Target لمسار Passthrough</span><input type="text" value={manualTargetConfirmation} placeholder={selectedTarget?.targetKey ?? ""} onChange={(event) => setManualTargetConfirmation(event.currentTarget.value)} /><small>اكتب: {selectedTarget?.targetKey}</small></label>
            )}

            <button type="button" className="danger-button" disabled={busy || !recoveryDownloaded || selectedTarget === null || (method === "uart" ? !exactHardwareTarget : !["wifi", "download", "stlink"].includes(method) && !manualTargetConfirmed)} onClick={() => void flashPreparedFirmware()}>
              {method === "wifi" ? "تنزيل وفتح صفحة Wi-Fi" : method === "download" ? "تنزيل الحزمة" : method === "stlink" ? "عرض حالة ST-Link" : "بدء التفليش الحقيقي"}
            </button>
          </>
        )}

        {flashProgress === null ? null : (
          <div className="flash-progress" aria-live="polite">
            <strong>{flashProgress.stage}</strong>
            <progress max={Math.max(flashProgress.totalBytes, 1)} value={flashProgress.writtenBytes} />
            <span>{flashProgress.detail}</span>
          </div>
        )}
      </section>

      <footer className="parity-footer">
        <span>المصدر: ExpressLRS Artifactory الرسمي</span>
        <span>لا يُعلن HARDWARE_OBSERVED إلا بعد جلسة جهاز فعلية.</span>
      </footer>
    </main>
  );
}
