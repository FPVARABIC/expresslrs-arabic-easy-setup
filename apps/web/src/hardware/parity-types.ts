export type ExpressLrsDeviceRole = "tx" | "rx";

export type ExpressLrsFlashMethod =
  | "uart"
  | "betaflight"
  | "edgetx"
  | "passthru"
  | "wifi"
  | "stlink"
  | "download";

export interface OfficialRelease {
  readonly label: string;
  readonly revision: string;
  readonly channel: "release" | "branch";
}

export interface OfficialTargetConfig {
  readonly productName: string;
  readonly platform: string;
  readonly firmware: string;
  readonly luaName: string | null;
  readonly layoutFile: string | null;
  readonly logoFile: string | null;
  readonly uploadMethods: readonly ExpressLrsFlashMethod[];
  readonly minVersion: string | null;
  readonly customLayout: Readonly<Record<string, unknown>> | null;
  readonly overlay: Readonly<Record<string, unknown>> | null;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface OfficialTarget {
  readonly id: string;
  readonly role: ExpressLrsDeviceRole;
  readonly vendorKey: string;
  readonly vendorName: string;
  readonly radioKey: string;
  readonly targetKey: string;
  readonly config: OfficialTargetConfig;
}

export interface OfficialCatalog {
  readonly source: "EXPRESSLRS_ARTIFACTORY";
  readonly loadedAt: string;
  readonly releases: readonly OfficialRelease[];
  readonly targets: readonly OfficialTarget[];
}

export interface ExpressLrsFirmwareOptions {
  readonly region: string;
  readonly domain: number;
  readonly bindPhrase: string;
  readonly wifiSsid: string;
  readonly wifiPassword: string;
  readonly wifiAutoOnInterval: number;
  readonly fanRuntime: number;
  readonly telemetryInterval: number;
  readonly uartInverted: boolean;
  readonly unlockHigherPower: boolean;
  readonly receiverUartBaud: number;
  readonly receiverInvertTx: boolean;
  readonly lockOnFirstConnection: boolean;
  readonly r9mmMiniSbus: boolean;
  readonly receiverAsTransmitter: boolean;
}

export interface FirmwareSegment {
  readonly name: string;
  readonly address: number;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

export interface PreparedFirmwarePackage {
  readonly schemaVersion: 1;
  readonly release: OfficialRelease;
  readonly target: OfficialTarget;
  readonly optionsSummary: Readonly<{
    readonly region: string;
    readonly domain: number;
    readonly bindingConfigured: boolean;
    readonly wifiConfigured: boolean;
  }>;
  readonly segments: readonly FirmwareSegment[];
  readonly primaryFileName: string;
  readonly primaryDownload: Uint8Array;
  readonly primaryMimeType: string;
  readonly recoveryFileName: string;
  readonly recoveryArchive: Uint8Array;
  readonly createdAt: string;
}

export interface FirmwareBuildProgress {
  readonly stage:
    | "CATALOG"
    | "FIRMWARE_ARCHIVE"
    | "HARDWARE_ARCHIVE"
    | "EXTRACT"
    | "CONFIGURE"
    | "HASH"
    | "PACKAGE";
  readonly receivedBytes: number;
  readonly totalBytes: number | null;
}

export type FirmwareBuildProgressListener = (
  progress: FirmwareBuildProgress,
) => void;

export interface FirmwareFlashProgress {
  readonly stage:
    | "PRECHECK"
    | "PASSTHROUGH"
    | "BOOTLOADER"
    | "ERASE"
    | "WRITE"
    | "VERIFY"
    | "RESET"
    | "RECONNECT"
    | "COMPLETE";
  readonly writtenBytes: number;
  readonly totalBytes: number;
  readonly detail: string;
}

export type FirmwareFlashProgressListener = (
  progress: FirmwareFlashProgress,
) => void;
