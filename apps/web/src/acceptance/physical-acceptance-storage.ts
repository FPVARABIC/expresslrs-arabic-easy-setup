import {
  parsePhysicalAcceptanceJson,
  serializePhysicalAcceptanceJson,
  type PhysicalAcceptanceSession,
} from "./physical-acceptance";

export const PHYSICAL_ACCEPTANCE_STORAGE_KEY =
  "elrs-easy:physical-acceptance:v1" as const;

export interface PhysicalAcceptanceStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

export type PhysicalAcceptanceStorageResult =
  Readonly<{ ok: true }> | Readonly<{ ok: false; message: string }>;

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
        .replace(/[\u202a-\u202e\u2066-\u2069]/gu, "")
        .replace(/\s+/gu, " ")
        .slice(0, 240)
    : "Unknown storage error";
}

export function browserPhysicalAcceptanceStorage(): PhysicalAcceptanceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadPhysicalAcceptanceSession(
  storage: PhysicalAcceptanceStorage | null = browserPhysicalAcceptanceStorage(),
): PhysicalAcceptanceSession | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(PHYSICAL_ACCEPTANCE_STORAGE_KEY);
    return raw === null ? null : parsePhysicalAcceptanceJson(raw);
  } catch {
    return null;
  }
}

export function savePhysicalAcceptanceSession(
  session: PhysicalAcceptanceSession,
  storage: PhysicalAcceptanceStorage | null = browserPhysicalAcceptanceStorage(),
): PhysicalAcceptanceStorageResult {
  if (storage === null) {
    return Object.freeze({
      ok: false,
      message: "Local storage is unavailable in this browser context",
    });
  }
  try {
    storage.setItem(
      PHYSICAL_ACCEPTANCE_STORAGE_KEY,
      serializePhysicalAcceptanceJson(session),
    );
    return Object.freeze({ ok: true });
  } catch (error: unknown) {
    return Object.freeze({
      ok: false,
      message: `Could not save the physical acceptance session: ${safeMessage(error)}`,
    });
  }
}

export function clearPhysicalAcceptanceSession(
  storage: PhysicalAcceptanceStorage | null = browserPhysicalAcceptanceStorage(),
): PhysicalAcceptanceStorageResult {
  if (storage === null) {
    return Object.freeze({
      ok: false,
      message: "Local storage is unavailable in this browser context",
    });
  }
  try {
    storage.removeItem(PHYSICAL_ACCEPTANCE_STORAGE_KEY);
    return Object.freeze({ ok: true });
  } catch (error: unknown) {
    return Object.freeze({
      ok: false,
      message: `Could not clear the physical acceptance session: ${safeMessage(error)}`,
    });
  }
}
