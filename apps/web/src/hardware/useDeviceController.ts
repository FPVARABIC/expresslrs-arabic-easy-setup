import { useEffect, useRef, useState } from "react";
import {
  createTranslator,
  defaultLocale,
  type Locale,
  type MessageKey,
  type TranslationParameters,
} from "@elrs-easy/i18n";

import type { PhysicalAcceptanceContextSnapshot } from "../acceptance/physical-acceptance";
import { buildSha } from "../build-identity";
import {
  DIAGNOSTICS_SCHEMA_VERSION,
  type DiagnosticsSnapshot,
} from "../diagnostics/diagnostics";
import { readBackMatches } from "../easy/easyOperations";

import {
  BindingLinkObserver,
  gradeBindingEvidence,
  isMachineVerifiedBinding,
  type BindingEvidence,
  type BindingEvidenceLevel,
} from "./binding-evidence";
import { verifyObservedFirmwareBuild } from "./build-verification";
import { copyToArrayBuffer } from "./byte-utils";
import type { CrsfFrame, CrsfParameter } from "./crsf";
import { flashEspFirmware } from "./esp-flasher";
import {
  downloadPreparedBytes,
  prepareOfficialFirmwarePackage,
} from "./firmware-package";
import { acquireOfficialLuaScript } from "./lua-package";
import {
  nativeBridgeNavigator,
  readNativeHardwareBridge,
} from "./native-bridge";
import { loadOfficialExpressLrsCatalog } from "./official-catalog";
import {
  devicePathBlocker,
  readGrantedDevices,
  readPlatformCapabilities,
  type DevicePathBlocker,
  type PlatformCapabilities,
} from "./platform-capabilities";
import {
  initializeSerialPassthrough,
  requestHardwarePort,
  type PassthroughMethod,
} from "./passthrough";
import type {
  ExpressLrsDeviceRole,
  ExpressLrsFirmwareOptions,
  ExpressLrsFlashMethod,
  FirmwareFlashProgress,
  OfficialCatalog,
  OfficialRelease,
  OfficialTarget,
  PreparedFirmwarePackage,
} from "./parity-types";
import {
  regulatoryRegionByKey,
  regulatoryRegionsForRadioKey,
} from "./regulatory-domain";
import { evaluateRxAsTxSupport, type RxAsTxSupport } from "./rx-as-tx";
import {
  clearRecoveryCheckpoint,
  loadRecoveryCheckpoint,
  saveRecoveryCheckpoint,
  validateRecoveryPackage,
  type RecoveryCheckpoint,
  type ValidatedRecoveryPackage,
} from "./recovery-package";
import type { ExpressLrsIdentity } from "./session";
import type { HardwareSerialPort } from "./serial";
import { verifyReconnectTarget } from "./reconnect-target-verification";
import { flashStm32DfuFirmware } from "./stm32-dfu";
import {
  matchHardwareIdentityToOfficialTargets,
  type TargetMatchResult,
} from "./target-match";
import {
  connectUserHardwareSession,
  type HardwareDriverConnector,
  type SafeSettingsBackup,
  type UserHardwareConnectOutcome,
  type UserHardwareSession,
  type WritableCrsfParameter,
} from "./userSession";
import { flashXmodemFirmware } from "./xmodem";
import {
  DeviceWriteAuthority,
  deviceFingerprint,
  type DeviceOperationKind,
  type WriteDenialReason,
} from "./write-authority";

const WRITE_DENIAL_KEYS: Readonly<Record<WriteDenialReason, MessageKey>> =
  Object.freeze({
    NO_DEVICE_SESSION: "wb.deny.NO_DEVICE_SESSION",
    IDENTITY_UNCONFIRMED: "wb.deny.IDENTITY_UNCONFIRMED",
    PORT_CLEANUP_UNCONFIRMED: "wb.deny.PORT_CLEANUP_UNCONFIRMED",
    OPERATION_IN_PROGRESS: "wb.deny.OPERATION_IN_PROGRESS",
    RECOVERY_JOURNAL_UNREADABLE: "wb.deny.RECOVERY_JOURNAL_UNREADABLE",
    PENDING_RECOVERY_CHECKPOINT: "wb.deny.PENDING_RECOVERY_CHECKPOINT",
    NO_PENDING_RECOVERY: "wb.deny.NO_PENDING_RECOVERY",
    TARGET_NOT_MATCHED: "wb.deny.TARGET_NOT_MATCHED",
    BAND_NOT_MATCHED: "wb.deny.BAND_NOT_MATCHED",
    ARTIFACT_NOT_VERIFIED: "wb.deny.ARTIFACT_NOT_VERIFIED",
    RECOVERY_NOT_AVAILABLE: "wb.deny.RECOVERY_NOT_AVAILABLE",
    BENCH_NOT_ACKNOWLEDGED: "wb.deny.BENCH_NOT_ACKNOWLEDGED",
    USER_CONFIRMATION_MISSING: "wb.deny.USER_CONFIRMATION_MISSING",
  });

function writeDenialMessage(reason: WriteDenialReason): ControllerMessage {
  return message(WRITE_DENIAL_KEYS[reason]);
}

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

export const METHOD_LABEL_KEYS: Readonly<
  Record<ExpressLrsFlashMethod, MessageKey>
> = Object.freeze({
  uart: "wb.method.uart",
  betaflight: "wb.method.betaflight",
  edgetx: "wb.method.edgetx",
  passthru: "wb.method.passthru",
  wifi: "wb.method.wifi",
  stlink: "wb.method.stlink",
  download: "wb.method.download",
});

/**
 * A message the controller wants shown, named rather than written.
 *
 * The controller used to build Arabic sentences directly, which is why the
 * technical workbench stayed Arabic when the operator chose English. It now
 * emits a catalog key plus its parameters and the view translates it, so both
 * locales are complete by construction.
 */
export interface ControllerMessage {
  readonly key: MessageKey;
  readonly params?: TranslationParameters;
  /**
   * An optional second sentence. It is itself a named message rather than a
   * pre-rendered string, so a composed status stays translatable.
   */
  readonly detail?: ControllerMessage;
}

function message(
  key: MessageKey,
  params?: TranslationParameters,
  detail?: ControllerMessage,
): ControllerMessage {
  return Object.freeze({
    key,
    ...(params === undefined ? {} : { params }),
    ...(detail === undefined ? {} : { detail }),
  }) as ControllerMessage;
}

/** An error carrying a named message, so a refusal survives translation. */
class ControllerError extends Error {
  public constructor(public readonly controllerMessage: ControllerMessage) {
    super(controllerMessage.key);
    this.name = "ControllerError";
  }
}

/**
 * The message for a caught error: a controller error keeps its own name, and
 * anything else is framed by the caller with its technical text as a detail.
 */
function errorMessage(
  error: unknown,
  frame: MessageKey,
  extra: TranslationParameters = {},
): ControllerMessage {
  if (error instanceof ControllerError) return error.controllerMessage;
  return message(frame, { ...extra, detail: safeMessage(error) });
}

/** How long to watch link telemetry after a bind command before grading it. */
const BIND_OBSERVATION_MS = 8_000;
const LINK_POLL_INTERVAL_MS = 250;

/**
 * Waits for the observer to reach the link threshold, or for the budget to run
 * out. Lives outside the hook so the clock is never read during render.
 */
async function waitForObservedLink(
  observer: BindingLinkObserver,
  budgetMs: number,
): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (!observer.linked && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LINK_POLL_INTERVAL_MS));
  }
  return observer.linked;
}

/**
 * What a destructive operation actually established. `verified` is true only
 * when the device came back and its identity and version were read and
 * matched; a write that merely finished is not a verified update.
 */
export interface DeviceOperationResult {
  readonly verified: boolean;
  readonly message: ControllerMessage;
}

/** What a bind attempt established, with the text that describes it. */
export interface BindingOperationResult {
  /** null when the attempt was refused before any command was sent. */
  readonly evidence: BindingEvidence | null;
  readonly message: ControllerMessage;
}

/** What a settings write established, with the text that describes it. */
export interface SettingWriteResult {
  /** null when the attempt was refused before any command was sent. */
  readonly applied: boolean | null;
  readonly message: ControllerMessage;
}

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
  return (error instanceof Error ? error.message : "unknown error")
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

export function formatBytes(value: number): string {
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

export function currentSettingValue(
  parameter: CrsfParameter | undefined,
): string {
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
    throw new ControllerError(
      message("wb.status.fileBounds", { maximum: formatBytes(maximumBytes) }),
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

export function isStableRelease(release: OfficialRelease): boolean {
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

export function releaseSelectionKey(release: OfficialRelease): string {
  return JSON.stringify([release.channel, release.label, release.revision]);
}

/**
 * The one device controller. It owns the serial session, the confirmed
 * identity, the write authority, the official catalog, the prepared package,
 * the recovery journal, and every operation that changes a device.
 *
 * Easy Mode and Advanced Mode are two views over a single instance of this
 * controller, so they cannot drift apart, cannot hold two sessions, and cannot
 * authorize a write through two different gates. Neither view implements a
 * device write of its own.
 */
export interface DeviceControllerInput {
  readonly hardwareConnector?: HardwareDriverConnector;
  /**
   * Used only where a message must be rendered into an exported artifact —
   * the diagnostics report and the acceptance context. Live status stays a
   * named message so the view re-renders it when the operator switches
   * language.
   */
  readonly locale?: Locale;
}

export function useDeviceController({
  hardwareConnector,
  locale = defaultLocale,
}: DeviceControllerInput = {}) {
  const translate = createTranslator(locale);
  /** Renders a named message, including its optional second sentence. */
  const renderMessage = (value: ControllerMessage): string => {
    const head = translate(value.key, value.params);
    return value.detail === undefined
      ? head
      : `${head} ${renderMessage(value.detail)}`;
  };
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
  const [status, setStatus] = useState<ControllerMessage>(() =>
    message("wb.status.idle"),
  );
  const [busy, setBusy] = useState(false);
  const writeAuthorityRef = useRef(new DeviceWriteAuthority());
  const sessionIdRef = useRef<string | null>(null);
  const sessionCounterRef = useRef(0);
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
  const [bindEvidence, setBindEvidence] = useState<BindingEvidenceLevel | null>(
    null,
  );
  const [hardwareCloseUncertain, setHardwareCloseUncertain] = useState(false);
  const [hardwareCloseInProgress, setHardwareCloseInProgress] = useState(false);

  // Read once per render from the APIs themselves. A test connector means the
  // host is driving the device path directly, so it is reported as available.
  const platformCapabilities: PlatformCapabilities =
    hardwareConnector === undefined
      ? readPlatformCapabilities()
      : Object.freeze({
          ...readPlatformCapabilities(),
          webSerial: true,
        });
  const deviceTransportBlocker: DevicePathBlocker | null =
    devicePathBlocker(platformCapabilities);

  const sessionRef = useRef<UserHardwareSession | null>(null);
  const hardwareCloseUncertainRef = useRef(false);
  const hardwareCloseInProgressRef = useRef<Promise<boolean> | null>(null);
  const disconnectUnsubscribeRef = useRef<(() => void) | null>(null);
  const catalogAbortRef = useRef<AbortController | null>(null);
  const operationAbortRef = useRef<AbortController | null>(null);
  const optionsRevisionRef = useRef(0);
  const lastRefusalRef = useRef<ControllerMessage | null>(null);

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
          message("wb.status.recoveryJournalUnreadable", {
            detail: safeMessage(error),
          }),
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
      sessionIdRef.current = null;
      // No revoke here: the authority instance is discarded with the component,
      // so outstanding capabilities cannot outlive this unmount.
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
  // Derived from the chosen Target and release, so the answer changes with the
  // device rather than with the build.
  const rxAsTxSupport: RxAsTxSupport = evaluateRxAsTxSupport({
    target: selectedTarget,
    release: selectedRelease,
  });

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
  // Device-changing operations are authorized from live evidence, never from a
  // project-phase flag. This mirrors evaluateDeviceWriteEvidence for the
  // enable/disable state; the authoritative check happens in each handler,
  // which requests and consumes a single-use capability.
  const recoveryPathKnown =
    hardwareCleanupReady &&
    recoveryJournalState === "ready" &&
    checkpoint === null;
  // A live confirmed identity is required to change a device over the wire.
  const deviceWritesReady = identity !== null && recoveryPathKnown;
  // The Wi-Fi and download methods do not write to the device from this
  // application: they produce a verified artifact and hand off to the device's
  // own updater. They still require a known recovery path, but demanding a live
  // USB identity for them would block a legitimate flow rather than protect it.
  const writeReady =
    (firmwareWriteMethod ? deviceWritesReady : recoveryPathKnown) &&
    prepared !== null &&
    selectedTarget !== null &&
    recoveryDownloaded &&
    powerAcknowledged &&
    (selectedTarget.role !== "tx" || antennaAcknowledged) &&
    (!operationNeedsTargetConfirmation || manualTargetConfirmed) &&
    (!firmwareWriteMethod || method !== "uart" || identity !== null);

  /**
   * Drops the secrets the operator typed as soon as they have been compiled
   * into the package. The derived UID and the Wi-Fi block already live inside
   * the prepared bytes, so keeping the plaintext in component state would only
   * widen where it can leak from — into a later render, a copied context, or a
   * rebuild the operator did not intend.
   */
  function wipeSecretOptions(): void {
    setOptions((current) =>
      current.bindPhrase === "" && current.wifiPassword === ""
        ? current
        : { ...current, bindPhrase: "", wifiPassword: "" },
    );
  }

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

  function latchUnconfirmedHardwareClose(detail?: ControllerMessage): void {
    hardwareCloseUncertainRef.current = true;
    setHardwareCloseUncertain(true);
    operationAbortRef.current?.abort(
      new DOMException("Hardware port cleanup is unconfirmed", "AbortError"),
    );
    disconnectUnsubscribeRef.current?.();
    disconnectUnsubscribeRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    sessionIdRef.current = null;
    writeAuthorityRef.current.revokeAll();
    if (session !== null) {
      void session.close().catch(() => undefined);
    }
    clearHardwarePresentation();
    setStatus(message("wb.status.sessionCloseUnproven", {}, detail));
  }

  function hardwareCleanupGateOpen(): boolean {
    return (
      !hardwareCloseUncertainRef.current &&
      hardwareCloseInProgressRef.current === null
    );
  }

  async function closePortOrLatch(
    port: HardwareSerialPort,
    detail: ControllerMessage,
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
    throw new ControllerError(
      message("wb.status.sessionChangedDuringOperation"),
    );
  }

  function observeSessionDisconnect(session: UserHardwareSession): void {
    disconnectUnsubscribeRef.current?.();
    disconnectUnsubscribeRef.current = session.onDisconnected(() => {
      if (sessionRef.current !== session) return;
      sessionRef.current = null;
      sessionIdRef.current = null;
      writeAuthorityRef.current.revokeAll();
      disconnectUnsubscribeRef.current = null;
      clearHardwarePresentation();
      setStatus(message("wb.status.disconnected"));
    });
  }

  async function disconnectHardware(): Promise<boolean> {
    if (hardwareCloseUncertainRef.current) {
      clearHardwarePresentation();
      setStatus(message("wb.status.cannotOpenNewSession"));
      return false;
    }
    const pendingClose = hardwareCloseInProgressRef.current;
    if (pendingClose !== null) return pendingClose;

    disconnectUnsubscribeRef.current?.();
    disconnectUnsubscribeRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    sessionIdRef.current = null;
    writeAuthorityRef.current.revokeAll();
    clearHardwarePresentation();
    wipeSecretOptions();
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
            message("wb.status.portCloseFailed", {
              detail: safeMessage(error),
            }),
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
    detail: ControllerMessage,
  ): Promise<boolean> {
    let closed = false;
    try {
      closed = await session.close();
    } catch (error: unknown) {
      latchUnconfirmedHardwareClose(
        message(
          "wb.status.portCloseFailed",
          { detail: safeMessage(error) },
          detail,
        ),
      );
      return false;
    }
    if (!closed) latchUnconfirmedHardwareClose(detail);
    return closed;
  }

  /**
   * Requests a single-use capability for one device-changing attempt. The
   * evidence is read live, so a repeated click, a swapped device, or missing
   * recovery readiness cannot inherit an earlier authorization. A refusal names
   * the missing condition instead of reporting a locked feature.
   */
  function authorizeDeviceOperation(operation: DeviceOperationKind): boolean {
    const fingerprint = identity === null ? null : deviceFingerprint(identity);
    const decision = writeAuthorityRef.current.request({
      operation,
      sessionId: sessionIdRef.current,
      deviceFingerprint: fingerprint,
      identityConfirmed: identity !== null && sessionRef.current !== null,
      portCleanupConfirmed: hardwareCleanupGateOpen(),
      operationInProgress: busy,
      recoveryJournalReadable: recoveryJournalState === "ready",
      pendingRecoveryCheckpoint: checkpoint !== null,
      userConfirmed: true,
      // Recovery re-opens a new port on a device that may no longer answer
      // CRSF, so its Target evidence is the operator's confirmed Target key
      // rather than a live identity match, and the package it restores is
      // verified against the pending checkpoint inside the handler.
      ...(operation === "FIRMWARE_WRITE"
        ? {
            targetMatchesDevice: selectedTarget !== null,
            bandMatchesDevice: selectedTarget !== null,
            artifactVerified: prepared !== null,
            recoveryAvailable: recoveryDownloaded,
            benchAcknowledged:
              powerAcknowledged &&
              (selectedTarget?.role !== "tx" || antennaAcknowledged),
          }
        : {}),
      ...(operation === "RECOVERY"
        ? {
            targetMatchesDevice:
              selectedTarget !== null && manualTargetConfirmed,
            bandMatchesDevice: selectedTarget !== null,
            benchAcknowledged:
              powerAcknowledged &&
              (selectedTarget?.role !== "tx" || antennaAcknowledged),
          }
        : {}),
    });
    if (!decision.granted) {
      const denial = writeDenialMessage(decision.reason);
      lastRefusalRef.current = denial;
      setStatus(denial);
      return false;
    }
    const consumed = writeAuthorityRef.current.consume(decision.capability, {
      sessionId: sessionIdRef.current,
      deviceFingerprint: fingerprint,
      operation,
    });
    if (consumed === null) {
      const stale = message("wb.status.authorizationStale");
      lastRefusalRef.current = stale;
      setStatus(stale);
      return false;
    }
    lastRefusalRef.current = null;
    return true;
  }

  /**
   * Reports a refusal that stopped an operation before anything was written.
   * The message names the missing condition, never a locked feature.
   */
  function refused(reason: ControllerMessage): DeviceOperationResult {
    setStatus(reason);
    return Object.freeze({ verified: false, message: reason });
  }

  function refusedBinding(reason: ControllerMessage): BindingOperationResult {
    setStatus(reason);
    return Object.freeze({ evidence: null, message: reason });
  }

  function refusedSetting(reason: ControllerMessage): SettingWriteResult {
    setStatus(reason);
    return Object.freeze({ applied: null, message: reason });
  }

  function deviceWriteLockMessage(): ControllerMessage {
    if (identity === null) {
      return message("wb.lock.needIdentity");
    }
    if (recoveryJournalState === "loading") {
      return message("wb.lock.journalLoading");
    }
    if (recoveryJournalState === "error") {
      return message("wb.lock.journalUnreadable");
    }
    if (hardwareCloseUncertainRef.current) {
      return message("wb.lock.portCleanupUnproven");
    }
    if (hardwareCloseInProgressRef.current !== null) {
      return message("wb.lock.closePending");
    }
    return message("wb.lock.pendingRecovery");
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
    setStatus(message("wb.catalog.loading"));
    try {
      const loaded = await loadOfficialExpressLrsCatalog({
        signal: controller.signal,
        onProgress(stage, receivedBytes, totalBytes) {
          setStatus(
            message(
              stage === "INDEX"
                ? "wb.catalog.progressIndex"
                : "wb.catalog.progressTargets",
              {
                received: formatBytes(receivedBytes),
                total:
                  totalBytes === null ? "" : ` / ${formatBytes(totalBytes)}`,
              },
            ),
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
          message("wb.catalog.loaded", {
            releases: buildableReleases.length,
            targets: loaded.targets.length,
          }),
        );
      } else if (match?.confidence === "EXACT") {
        setStatus(
          message("wb.catalog.loadedExact", {
            product: connectedIdentity.productName,
          }),
        );
      } else {
        setStatus(
          message("wb.catalog.loadedNoMatch", {
            confidence: match?.confidence ?? "NOT_FOUND",
          }),
        );
      }
    } catch (error: unknown) {
      setCatalogState("failed");
      setStatus(errorMessage(error, "wb.catalog.failed"));
    } finally {
      if (catalogAbortRef.current === controller) {
        catalogAbortRef.current = null;
      }
      setCancellable(false);
      setBusy(false);
    }
  }

  /**
   * Opens one CRSF session and confirms the device's identity. The role may be
   * overridden by the caller so a view can connect with the role the operator
   * just chose without waiting for a state update to land. The outcome is
   * returned so a view can present its own wording; null means a precondition
   * stopped the attempt before any port was opened.
   */
  async function connectHardware(override?: {
    readonly role?: ExpressLrsDeviceRole;
  }): Promise<UserHardwareConnectOutcome | null> {
    if (!(await disconnectHardware())) return null;
    const requestedRole = override?.role ?? role;
    if (requestedRole !== role) setRole(requestedRole);
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setStatus(message("wb.connect.prompt"));
    try {
      // A native host that implements the bridge supplies the serial API; the
      // rest of the device path is the same code either way.
      const bridge = readNativeHardwareBridge();
      const outcome = await connectUserHardwareSession({
        role: requestedRole,
        ...(hardwareConnector === undefined
          ? {}
          : { connector: hardwareConnector }),
        ...(hardwareConnector === undefined && bridge !== null
          ? { navigatorObject: nativeBridgeNavigator(bridge) }
          : {}),
        signal: controller.signal,
        onCleanupUnconfirmed: (detail: string) =>
          latchUnconfirmedHardwareClose(
            message("wb.status.portCloseFailed", { detail }),
          ),
      });
      if (outcome.status !== "CONNECTED") {
        if (outcome.status === "CLEANUP_UNCONFIRMED") {
          latchUnconfirmedHardwareClose(
            message("wb.status.portCloseFailed", { detail: outcome.message }),
          );
          return outcome;
        }
        setStatus(
          message("wb.connect.incomplete", { detail: outcome.message }),
        );
        return outcome;
      }
      if (hardwareCloseUncertainRef.current) {
        try {
          await outcome.session.close();
        } catch {
          // The existing latch already requires a page reload.
        }
        return null;
      }
      sessionRef.current = outcome.session;
      sessionCounterRef.current += 1;
      sessionIdRef.current = `session-${sessionCounterRef.current}`;
      writeAuthorityRef.current.revokeAll();
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
          message("wb.connect.exactMatch", {
            product: outcome.identity.productName,
          }),
        );
      } else if (catalog === null) {
        setStatus(
          message("wb.connect.noCatalog", {
            product: outcome.identity.productName,
          }),
        );
      } else {
        setStatus(
          message("wb.connect.noMatch", {
            confidence: match?.confidence ?? "NOT_FOUND",
          }),
        );
      }
      return outcome;
    } catch (error: unknown) {
      setStatus(errorMessage(error, "wb.connect.stopped"));
      return null;
    } finally {
      operationAbortRef.current = null;
      setCancellable(false);
      setBusy(false);
    }
  }

  /**
   * Writes one declared setting and reports whether the device read it back as
   * requested. Returns null when the attempt was refused before any command was
   * sent, so a view can distinguish a refusal from a failed write.
   */
  async function writeSetting(): Promise<SettingWriteResult> {
    const session = sessionRef.current;
    if (session === null || selectedSetting === undefined) {
      return refusedSetting(message("wb.settings.chooseFirst"));
    }
    if (!deviceWritesReady || !hardwareCleanupGateOpen()) {
      return refusedSetting(deviceWriteLockMessage());
    }
    const requestedValue = Number(settingDraft);
    if (!Number.isSafeInteger(requestedValue)) {
      return refusedSetting(message("wb.settings.invalidValue"));
    }
    if (!authorizeDeviceOperation("SETTINGS_WRITE")) {
      return refusedSetting(lastRefusalRef.current ?? deviceWriteLockMessage());
    }
    operationAbortRef.current?.abort();
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setStatus(message("wb.settings.writing", { name: selectedSetting.name }));
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
      // The session throws unless an independent read-back matched, so this
      // is a verified value, not a command that merely returned.
      const applied =
        result.verified && result.parameter.kind !== "command"
          ? readBackMatches(requestedValue, result.parameter)
          : false;
      const reported = message(
        applied ? "wb.settings.applied" : "wb.settings.mismatch",
        { name: selectedSetting.name },
      );
      setStatus(reported);
      return Object.freeze({ applied, message: reported });
    } catch (error: unknown) {
      const reported = errorMessage(error, "wb.settings.failed");
      setStatus(reported);
      return Object.freeze({ applied: false, message: reported });
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
    if (!authorizeDeviceOperation("SETTINGS_RESTORE")) return;
    operationAbortRef.current?.abort();
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setStatus(message("wb.settings.restoring"));
    try {
      const results = await session.restoreBackup(settingsBackup, {
        confirmedByUser: true,
        signal: controller.signal,
      });
      assertCurrentDeviceOperation(session, controller.signal);
      setParameters(session.parameters);
      setWritableParameters(session.writableParameters);
      setStatus(message("wb.settings.restored", { count: results.length }));
    } catch (error: unknown) {
      setStatus(errorMessage(error, "wb.settings.restoreFailed"));
    } finally {
      if (operationAbortRef.current === controller) {
        operationAbortRef.current = null;
      }
      setCancellable(false);
      setBusy(false);
    }
  }

  /**
   * Sends the bind command the device itself declares, watching link telemetry
   * across the attempt. The returned evidence says what was actually observed:
   * a command that was acknowledged is not a link, and only telemetry showing a
   * live RF link counts as machine verification. Returns null when the attempt
   * was refused before any command was sent.
   */
  async function startBinding(): Promise<BindingOperationResult> {
    const session = sessionRef.current;
    if (session === null) {
      return refusedBinding(message("wb.bind.needIdentity"));
    }
    if (!bindingAcknowledged) {
      return refusedBinding(message("wb.bind.needAcknowledgement"));
    }
    if (!deviceWritesReady || !hardwareCleanupGateOpen()) {
      return refusedBinding(deviceWriteLockMessage());
    }
    if (!authorizeDeviceOperation("BINDING")) {
      return refusedBinding(lastRefusalRef.current ?? deviceWriteLockMessage());
    }
    operationAbortRef.current?.abort();
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setBindingAcknowledged(false);
    setStatus(message("wb.bind.sending"));
    const observer = new BindingLinkObserver();
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = subscribeFrames((frame) => {
        observer.observe(frame);
      });
      const result = await session.startBinding({
        confirmedByUser: true,
        signal: controller.signal,
      });
      assertCurrentDeviceOperation(session, controller.signal);
      // Only wait for telemetry a transport can actually deliver; making the
      // operator watch a timer that can never resolve is worse than asking.
      if (canObserveFrames()) {
        await waitForObservedLink(observer, BIND_OBSERVATION_MS);
        assertCurrentDeviceOperation(session, controller.signal);
      }
      const evidence = gradeBindingEvidence({
        observer,
        userReportedLink: null,
      });
      setBindEvidence(evidence.level);
      const reported = isMachineVerifiedBinding(evidence)
        ? message("wb.bind.telemetry", {
            quality: evidence.statistics?.uplinkLinkQuality ?? 0,
          })
        : message("wb.bind.commandOnly", { information: result.information });
      setStatus(reported);
      return Object.freeze({ evidence, message: reported });
    } catch (error: unknown) {
      setBindEvidence(null);
      const reported = errorMessage(error, "wb.bind.stopped");
      setStatus(reported);
      return Object.freeze({ evidence: null, message: reported });
    } finally {
      unsubscribe?.();
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
      setStatus(message("wb.fw.needRegion"));
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
    setStatus(message("wb.fw.preparing"));
    try {
      const result = await prepareOfficialFirmwarePackage({
        release: selectedRelease,
        target: selectedTarget,
        options: packageOptions,
        signal: controller.signal,
        onProgress(progress) {
          setStatus(
            message("wb.catalog.progress", {
              stage: progress.stage,
              received: formatBytes(progress.receivedBytes),
              total:
                progress.totalBytes === null
                  ? ""
                  : ` / ${formatBytes(progress.totalBytes)}`,
            }),
          );
        },
      });
      if (inputRevision !== optionsRevisionRef.current) {
        setStatus(message("wb.fw.optionsChanged"));
        return;
      }
      setPrepared(result);
      // The phrase and Wi-Fi password are now inside the verified package, so
      // the plaintext is dropped rather than kept for a possible rebuild.
      wipeSecretOptions();
      setStatus(
        message("wb.fw.prepared", {
          segments: result.segments.length,
          binding: result.optionsSummary.bindingConfigured
            ? "wb.fw.preparedWithPhrase"
            : "",
        }),
      );
    } catch (error: unknown) {
      setStatus(errorMessage(error, "wb.fw.prepareFailed"));
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
    setStatus(
      message("wb.fw.downloadStarted", { file: prepared.primaryFileName }),
    );
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
    setStatus(message("wb.fw.recoveryDownloadStarted"));
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
    setStatus(message("wb.fw.luaDownloading"));
    try {
      const script = await acquireOfficialLuaScript({
        release: selectedRelease,
        target: selectedTarget,
        signal: controller.signal,
      });
      downloadPreparedBytes(script.bytes, script.fileName, "text/plain");
      setStatus(message("wb.fw.downloadStarted", { file: script.fileName }));
    } catch (error: unknown) {
      setStatus(errorMessage(error, "wb.fw.luaFailed"));
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

  /**
   * Moves an existing checkpoint to a new stage without inventing one. The
   * checkpoint is what makes a second recovery attempt possible, so it is only
   * ever restaged here — never cleared by this path.
   */
  async function restageCheckpoint(
    previous: RecoveryCheckpoint,
    stage: RecoveryCheckpoint["stage"],
    safeError: string | null,
  ): Promise<void> {
    const value: RecoveryCheckpoint = Object.freeze({
      ...previous,
      stage,
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
      detail: "",
      detailKey: "wb.reconnect.prompt",
    });
    setStatus(message("wb.reconnect.promptStatus"));
    const outcome = await connectUserHardwareSession({
      role: input.target.role,
      ...(hardwareConnector === undefined
        ? {}
        : { connector: hardwareConnector }),
      signal: input.signal,
      onCleanupUnconfirmed: (detail: string) =>
        latchUnconfirmedHardwareClose(
          message("wb.status.portCloseFailed", { detail }),
        ),
    });
    if (outcome.status !== "CONNECTED") {
      if (outcome.status === "CLEANUP_UNCONFIRMED") {
        latchUnconfirmedHardwareClose(
          message("wb.status.portCloseFailed", { detail: outcome.message }),
        );
      }
      throw new ControllerError(
        message("wb.reconnect.failed", { detail: outcome.message }),
      );
    }
    if (hardwareCloseUncertainRef.current || input.signal.aborted) {
      await closeSessionOrLatch(
        outcome.session,
        message("wb.reconnect.isolateFailed"),
      );
      throw new ControllerError(message("wb.reconnect.afterUnprovenClose"));
    }
    // Each step of the post-write sequence is reported as it is reached, so
    // "the device came back" is never a single opaque claim.
    setFlashProgress({
      stage: "RECONNECT",
      writtenBytes: input.totalBytes,
      totalBytes: input.totalBytes,
      detail: "",
      detailKey: "wb.reconnect.readingIdentity",
    });
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
        message("wb.reconnect.closeMismatchedFailed"),
      );
      throw new ControllerError(
        message("wb.reconnect.targetMismatch", {
          reason: targetVerification.reason,
        }),
      );
    }
    setFlashProgress({
      stage: "RECONNECT",
      writtenBytes: input.totalBytes,
      totalBytes: input.totalBytes,
      detail: "",
      detailKey: "wb.reconnect.confirmingTarget",
    });
    const build = verifyObservedFirmwareBuild({
      release: input.release,
      observedVersion: outcome.identity.firmwareVersion,
      parameters: outcome.parameters,
    });
    if (!build.verified) {
      await closeSessionOrLatch(
        outcome.session,
        message("wb.reconnect.closeVersionMismatchFailed"),
      );
      throw new ControllerError(
        message("wb.reconnect.versionMismatch", { expected: build.expected }),
      );
    }
    setFlashProgress({
      stage: "RECONNECT",
      writtenBytes: input.totalBytes,
      totalBytes: input.totalBytes,
      detail: "",
      detailKey: "wb.reconnect.confirmingVersion",
    });
    const oldSession = sessionRef.current;
    disconnectUnsubscribeRef.current?.();
    disconnectUnsubscribeRef.current = null;
    if (oldSession !== null && oldSession !== outcome.session) {
      const oldClosed = await closeSessionOrLatch(
        oldSession,
        message("wb.reconnect.closePreviousFailed"),
      );
      if (!oldClosed) {
        sessionRef.current = null;
        sessionIdRef.current = null;
        writeAuthorityRef.current.revokeAll();
        await closeSessionOrLatch(
          outcome.session,
          message("wb.reconnect.closeFallbackFailed"),
        );
        throw new ControllerError(
          message("wb.reconnect.previousCloseUnproven"),
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
        sessionIdRef.current = null;
        writeAuthorityRef.current.revokeAll();
        clearHardwarePresentation();
      }
      await closeSessionOrLatch(
        outcome.session,
        message("wb.reconnect.closeAfterGateChange"),
      );
      throw new ControllerError(message("wb.reconnect.gateChangedDuring"));
    }
    sessionRef.current = outcome.session;
    sessionCounterRef.current += 1;
    sessionIdRef.current = `session-${sessionCounterRef.current}`;
    writeAuthorityRef.current.revokeAll();
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
    // Only now, with the identity read and the Target and version confirmed,
    // is the checkpoint cleared. A completed write never reaches this line on
    // its own.
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
        sessionIdRef.current = null;
        writeAuthorityRef.current.revokeAll();
        clearHardwarePresentation();
      }
      await closeSessionOrLatch(
        outcome.session,
        message("wb.reconnect.closeAfterGateChange"),
      );
      throw new ControllerError(message("wb.reconnect.gateChangedBefore"));
    }
    setCheckpoint(null);
    setFlashProgress({
      stage: "COMPLETE",
      writtenBytes: input.totalBytes,
      totalBytes: input.totalBytes,
      detail: "",
      detailKey: "wb.reconnect.complete",
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
      throw new ControllerError(message("wb.transport.cleanupUnproven"));
    }
    if (input.selectedMethod === "uart") {
      const session = sessionRef.current;
      if (session === null) {
        throw new ControllerError(message("wb.transport.crsfClosed"));
      }
      const liveIdentity = await session.verifyCurrentIdentity(input.signal);
      if (!hardwareCleanupGateOpen()) {
        throw new ControllerError(
          message("wb.transport.gateChangedDuringIdentity"),
        );
      }
      if (
        selectedTarget === null ||
        liveIdentity.role !== selectedTarget.role
      ) {
        throw new ControllerError(message("wb.transport.roleMismatch"));
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
          throw new ControllerError(
            message("wb.transport.liveIdentityDrifted"),
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
          throw new ControllerError(
            message("wb.transport.bootloaderTargetMismatch", {
              target: bootloader.target,
            }),
          );
        }
      } else if (selectedTarget.role === "tx") {
        const command = commandForBootloader(parameters);
        if (command === null) {
          throw new ControllerError(
            message("wb.transport.noBootloaderCommand"),
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
          message("wb.transport.detachFailed", { detail: safeMessage(error) }),
        );
        throw error;
      } finally {
        sessionRef.current = null;
        sessionIdRef.current = null;
        writeAuthorityRef.current.revokeAll();
        clearHardwarePresentation();
      }
      return Object.freeze({ port, resetMode: "default_reset" });
    }

    const port = await requestHardwarePort();
    if (!hardwareCleanupGateOpen() || input.signal.aborted) {
      await closePortOrLatch(port, message("wb.transport.closeAfterCancel"));
      throw new ControllerError(message("wb.transport.gateChangedDuringPort"));
    }
    await initializeSerialPassthrough({
      method: input.selectedMethod as PassthroughMethod,
      port,
      flashBaud: input.family === "esp" ? 460_800 : 420_000,
      signal: input.signal,
    });
    return Object.freeze({ port, resetMode: "no_reset" });
  }

  async function flashPreparedFirmware(): Promise<DeviceOperationResult> {
    // Only an over-the-wire write needs device-write authority. Wi-Fi and
    // download hand the verified artifact to the device's own updater.
    if (firmwareWriteMethod && !authorizeDeviceOperation("FIRMWARE_WRITE")) {
      return refused(lastRefusalRef.current ?? deviceWriteLockMessage());
    }
    if (!hardwareCleanupGateOpen()) {
      return refused(deviceWriteLockMessage());
    }
    if (recoveryJournalState !== "ready") {
      return refused(
        message(
          recoveryJournalState === "loading"
            ? "wb.flash.journalLoading"
            : "wb.flash.journalUnreadable",
        ),
      );
    }
    if (prepared === null || selectedTarget === null) {
      return refused(message("wb.flash.needPackage"));
    }
    if (!writeReady) {
      return refused(message("wb.flash.gatesIncomplete"));
    }
    if (method === "download") {
      downloadFirmware();
      // A downloaded artifact is a handoff, not a device write: nothing was
      // written and nothing was read back, so it is not a verified update.
      return Object.freeze({
        verified: false,
        message: message("wb.flash.downloadOnly", {
          file: prepared.primaryFileName,
        }),
      });
    }
    if (method === "wifi") {
      downloadFirmware();
      window.open("http://10.0.0.1/", "_blank", "noopener,noreferrer");
      const reported = message("wb.flash.wifiHandoff");
      setStatus(reported);
      return Object.freeze({ verified: false, message: reported });
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
        throw new ControllerError(message("wb.flash.gateChangedBeforePort"));
      }
      const family = platformFamily(selectedTarget);
      if (family === "other") {
        throw new ControllerError(message("wb.flash.platformUnsupported"));
      }
      await saveCheckpoint(prepared, "BOOTLOADER");
      if (method === "stlink") {
        if (family !== "stm32") {
          throw new ControllerError(message("wb.flash.dfuPlatformMismatch"));
        }
        const firmware = prepared.segments.find(
          (segment) => segment.name === "firmware.bin",
        );
        if (firmware === undefined) {
          throw new ControllerError(message("wb.flash.stm32MissingFirmware"));
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
            message("wb.flash.stm32CleanupUnproven"),
          );
          throw new ControllerError(message("wb.flash.stm32CloseUnproven"));
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
              message("wb.flash.espCleanupUnproven"),
            );
            throw new ControllerError(message("wb.flash.espCloseUnproven"));
          }
        } else {
          const firmware = prepared.segments.find(
            (segment) => segment.name === "firmware.bin",
          );
          if (firmware === undefined) {
            throw new ControllerError(message("wb.flash.stm32MissingFirmware"));
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
      const reported = message("wb.flash.complete");
      setStatus(reported);
      return Object.freeze({ verified: true, message: reported });
    } catch (error: unknown) {
      const cleanupUnconfirmed = reportsUnconfirmedHardwareCleanup(error);
      if (cleanupUnconfirmed && !hardwareCloseUncertainRef.current) {
        latchUnconfirmedHardwareClose(message("wb.flash.writeCloseUnproven"));
      }
      const detailText = safeMessage(error);
      try {
        await saveCheckpoint(prepared, "RECOVERY_REQUIRED", detailText);
      } catch {
        // The visible recovery requirement remains even if IndexedDB is blocked.
      }
      const reported = message("wb.flash.stopped", {
        detail: detailText,
        reload: cleanupUnconfirmed ? "wb.flash.reloadFirst" : "",
      });
      setStatus(reported);
      return Object.freeze({ verified: false, message: reported });
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

  async function recoverFromFile(file: File): Promise<DeviceOperationResult> {
    const authorized = authorizeDeviceOperation("RECOVERY");
    if (!authorized) {
      return refused(lastRefusalRef.current ?? deviceWriteLockMessage());
    }
    if (!hardwareCleanupGateOpen()) {
      return refused(deviceWriteLockMessage());
    }
    if (recoveryJournalState !== "ready" || checkpoint === null) {
      return refused(
        message(
          recoveryJournalState === "loading"
            ? "wb.recovery.journalLoading"
            : "wb.recovery.journalUnreadable",
        ),
      );
    }
    const trustedCheckpoint = checkpoint;
    if (selectedTarget === null) {
      return refused(message("wb.recovery.needTarget"));
    }
    if (method === "wifi" || method === "download") {
      return refused(message("wb.recovery.needDirectPath"));
    }
    if (!manualTargetConfirmed) {
      return refused(message("wb.recovery.needTargetKey"));
    }
    if (!powerAcknowledged) {
      return refused(message("wb.recovery.needPower"));
    }
    if (selectedTarget.role === "tx" && !antennaAcknowledged) {
      return refused(message("wb.recovery.needAntenna"));
    }
    operationAbortRef.current?.abort();
    const controller = new AbortController();
    operationAbortRef.current = controller;
    setCancellable(true);
    setBusy(true);
    setStatus(message("wb.recovery.validating"));
    let writeFinished = false;
    try {
      const bytes = await boundedFileBytes(file, 64 * 1024 * 1024);
      const validated = await validateRecoveryPackage({
        bytes,
        expectedTarget: selectedTarget,
      });
      if (trustedCheckpoint.packageSha256 !== validated.packageSha256) {
        throw new ControllerError(message("wb.recovery.packageMismatch"));
      }
      if (!hardwareCleanupGateOpen()) {
        throw new ControllerError(message("wb.recovery.gateChangedBeforePort"));
      }
      const family = platformFamily(selectedTarget);
      const totalBytes = validated.segments.reduce(
        (sum, segment) => sum + segment.bytes.byteLength,
        0,
      );
      if (method === "stlink") {
        if (family !== "stm32") {
          throw new ControllerError(message("wb.flash.dfuPlatformMismatch"));
        }
        const firmware = validated.segments.find(
          (segment) => segment.name === "firmware.bin",
        );
        if (firmware === undefined) {
          throw new ControllerError(message("wb.recovery.missingFirmware"));
        }
        const flashResult = await flashStm32DfuFirmware({
          target: selectedTarget,
          segment: firmware,
          signal: controller.signal,
          onProgress: setFlashProgress,
        });
        if (!flashResult.cleanupVerified) {
          latchUnconfirmedHardwareClose(
            message("wb.recovery.stm32CleanupUnproven"),
          );
          throw new ControllerError(message("wb.recovery.stm32CloseUnproven"));
        }
      } else {
        const port = await requestHardwarePort();
        if (!hardwareCleanupGateOpen() || controller.signal.aborted) {
          await closePortOrLatch(port, message("wb.recovery.closeAfterCancel"));
          throw new ControllerError(
            message("wb.recovery.gateChangedDuringPort"),
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
              message("wb.recovery.espCleanupUnproven"),
            );
            throw new ControllerError(message("wb.recovery.espCloseUnproven"));
          }
        } else if (family === "stm32") {
          const firmware = validated.segments.find(
            (segment) => segment.name === "firmware.bin",
          );
          if (firmware === undefined) {
            throw new ControllerError(message("wb.recovery.missingFirmware"));
          }
          await flashXmodemFirmware({
            port,
            firmware: firmware.bytes,
            signal: controller.signal,
            onProgress: setFlashProgress,
          });
        } else {
          throw new ControllerError(message("wb.recovery.platformUnsupported"));
        }
      }
      // The write finished. That is not yet a recovery: the device still has
      // to come back and prove its Target and version.
      writeFinished = true;
      await reconnectAndVerify({
        target: selectedTarget,
        release: officialReleaseFromRecovery(validated),
        expectedIdentity: null,
        manualTargetWasConfirmed: manualTargetConfirmed,
        totalBytes,
        signal: controller.signal,
      });
      const reported = message("wb.recovery.complete");
      setStatus(reported);
      return Object.freeze({ verified: true, message: reported });
    } catch (error: unknown) {
      const cleanupUnconfirmed = reportsUnconfirmedHardwareCleanup(error);
      if (cleanupUnconfirmed && !hardwareCloseUncertainRef.current) {
        latchUnconfirmedHardwareClose(
          message("wb.recovery.writeCloseUnproven"),
        );
      }
      const detail = safeMessage(error);
      if (writeFinished) {
        // The bytes went out but the device did not come back readable. The
        // checkpoint is kept and restaged so a second attempt is still
        // possible; a completed write never clears it on its own.
        try {
          await restageCheckpoint(
            trustedCheckpoint,
            "RECOVERY_INCOMPLETE",
            detail,
          );
        } catch {
          // The visible pending recovery remains even if IndexedDB is blocked.
        }
      }
      const reported = message(
        writeFinished ? "wb.recovery.incomplete" : "wb.recovery.stopped",
        { detail },
        cleanupUnconfirmed ? message("wb.flash.reloadFirst") : undefined,
      );
      setStatus(reported);
      return Object.freeze({ verified: false, message: reported });
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

  /**
   * Captures what this session can actually be said to know. It is read at the
   * moment the operator asks for it, from the same live state both views
   * render, so a diagnostics report cannot describe a different session than
   * the one on screen.
   */
  /**
   * The same snapshot, after asking the browser how many devices this origin
   * has already been granted. That answer is asynchronous, so a caller that
   * can await it gets a fuller report than the synchronous capture.
   */
  async function captureDiagnosticsWithGrants(): Promise<DiagnosticsSnapshot> {
    const snapshot = captureDiagnostics();
    const granted = await readGrantedDevices(platformCapabilities);
    return Object.freeze({
      ...snapshot,
      environment: Object.freeze({
        ...snapshot.environment,
        grantedSerialPorts: granted.grantedSerialPorts,
        grantedUsbDevices: granted.grantedUsbDevices,
      }),
    });
  }

  function captureDiagnostics(): DiagnosticsSnapshot {
    const navigatorObject = navigator as Navigator & {
      readonly usb?: unknown;
    };
    return Object.freeze({
      schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
      capturedAt: nowIso(),
      buildSha: buildSha(),
      environment: Object.freeze({
        secureContext: window.isSecureContext,
        webSerialSupported: "serial" in navigator,
        webUsbSupported: navigatorObject.usb !== undefined,
        nativeBridge: platformCapabilities.nativeBridge,
        language: navigator.language,
        // userAgentData is absent outside Chromium, and the full user-agent
        // string is a fingerprint, so only the coarse platform hint is taken.
        platform:
          (navigator as Navigator & { userAgentData?: { platform?: string } })
            .userAgentData?.platform ?? "unknown",
        standaloneDisplay: platformCapabilities.standalone,
        serviceWorkerSupported: "serviceWorker" in navigator,
        browserVersion: platformCapabilities.browserVersion,
        android: platformCapabilities.android,
        serialPolicyAllowed: platformCapabilities.serialPolicyAllowed,
        usbPolicyAllowed: platformCapabilities.usbPolicyAllowed,
        // Filled by the panel, which can await the browser's answer. A
        // synchronous capture cannot, and must not guess a number.
        grantedSerialPorts: platformCapabilities.grantedSerialPorts,
        grantedUsbDevices: platformCapabilities.grantedUsbDevices,
      }),
      device: Object.freeze({
        connected: identity !== null,
        productName: identity?.productName ?? null,
        firmwareVersion: identity?.firmwareVersion ?? null,
        hardwareVersion: identity?.hardwareVersion ?? null,
        role: identity?.role ?? null,
        identityValidation: identity?.validation ?? null,
        parameterCount: identity?.parameterCount ?? null,
        usbVendorId: identity?.usb.usbVendorId ?? null,
        usbProductId: identity?.usb.usbProductId ?? null,
      }),
      capabilities: Object.freeze({
        writableParameterCount: writableParameters.length,
        bindCommandAvailable: hasBindCommand,
        linkTelemetryObservable: canObserveFrames(),
        settingsBackupAvailable: settingsBackup !== null,
      }),
      firmware: Object.freeze({
        catalogState,
        releaseLabel: selectedRelease?.label ?? null,
        targetId: selectedTarget?.id ?? null,
        targetPlatform: selectedTarget?.config.platform ?? null,
        targetConfidence: targetMatch?.confidence ?? null,
        updateMethod: method,
        regulatoryRegion: options.region === "" ? null : options.region,
        packageSegmentCount: prepared?.segments.length ?? 0,
        packageSegmentHashes: Object.freeze(
          prepared?.segments.map((segment) => segment.sha256) ?? [],
        ),
        // The phrase itself is never carried; only whether one was compiled in.
        bindingPhraseConfigured:
          prepared?.optionsSummary.bindingConfigured ?? false,
        recoveryPackageDownloaded: recoveryDownloaded,
      }),
      recovery: Object.freeze({
        journalState: recoveryJournalState,
        checkpointStage: checkpoint?.stage ?? null,
        checkpointProductName: checkpoint?.productName ?? null,
        checkpointSafeError: checkpoint?.safeError ?? null,
      }),
      binding: Object.freeze({ evidenceLevel: bindEvidence }),
      lastStatusMessage: renderMessage(status),
      evidence: Object.freeze({
        hardwareValidation: "NONE" as const,
        deviceWrites: "EVIDENCE_GATED" as const,
      }),
    });
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
      statusMessage: renderMessage(status),
    });

  /**
   * Subscribes to raw CRSF frames from the live session, so a view can grade an
   * operation on the device's own telemetry instead of on a command returning.
   * Returns a no-op unsubscribe when no session or transport can deliver them.
   */
  function subscribeFrames(listener: (frame: CrsfFrame) => void): () => void {
    const session = sessionRef.current;
    if (session === null || !session.canObserveFrames) return () => undefined;
    return session.subscribeFrames(listener);
  }

  /**
   * Whether the live transport can deliver CRSF frames. Read inside handlers,
   * never during render, so it always reflects the session in hand.
   */
  function canObserveFrames(): boolean {
    return sessionRef.current?.canObserveFrames ?? false;
  }

  return {
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
    parameters,
    firmwareWriteMethod,
    recoveryPathKnown,
    deviceWriteLockMessage,
    renderMessage,
    subscribeFrames,
    canObserveFrames,
    rxAsTxSupport,
    wipeSecretOptions,
    captureDiagnostics,
    captureDiagnosticsWithGrants,
    platformCapabilities,
    deviceTransportBlocker,
    bindEvidence,
  } as const;
}

/** The controller surface both product views render. */
export type DeviceController = ReturnType<typeof useDeviceController>;
