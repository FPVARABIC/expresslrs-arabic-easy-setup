import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { PhysicalAcceptanceContextSnapshot } from "../acceptance/physical-acceptance";
import type { PhysicalAcceptanceStorage } from "../acceptance/physical-acceptance-storage";
import { PhysicalAcceptancePanel } from "./PhysicalAcceptancePanel";

const CONTEXT: PhysicalAcceptanceContextSnapshot = Object.freeze({
  capturedAt: "2026-09-01T00:00:00.000Z",
  secureContext: true,
  webSerialSupported: true,
  connectionState: "DISCONNECTED",
  selectedRole: "tx",
  observedRole: null,
  productName: null,
  firmwareVersion: null,
  hardwareVersion: null,
  parameterCount: null,
  usbVendorId: null,
  usbProductId: null,
  targetId: null,
  targetKey: null,
  targetName: null,
  targetPlatform: null,
  targetConfidence: null,
  releaseLabel: null,
  releaseRevision: null,
  flashMethod: "uart",
  settingsBackupAvailable: false,
  writableParameterCount: 0,
  bindCommandAvailable: false,
  bootloaderCommandAvailable: false,
  packageFileName: null,
  recoveryFileName: null,
  packageSegmentCount: 0,
  packageSegmentHashes: Object.freeze([]),
  recoveryDownloaded: false,
  checkpointStage: null,
  flashStage: null,
  statusMessage: "جاهز",
});

const STORAGE_KEY = "elrs-easy:physical-acceptance:v1";

describe("PhysicalAcceptancePanel persistence resilience", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the operator when local persistence fails", async () => {
    const storage: PhysicalAcceptanceStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Synthetic quota exhausted", "QuotaExceededError");
      },
      removeItem: () => undefined,
    };

    render(<PhysicalAcceptancePanel context={CONTEXT} storage={storage} />);

    expect(
      await screen.findByText(/تعذر الحفظ المحلي/u),
    ).toBeInTheDocument();
  });

  it("hydrates a valid session written by another browser tab", async () => {
    render(<PhysicalAcceptancePanel context={CONTEXT} />);

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).not.toBeNull();

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEY,
        newValue: saved,
        storageArea: localStorage,
      }),
    );

    expect(
      await screen.findByText(/تمت مزامنة جلسة القبول/u),
    ).toBeInTheDocument();
  });

  it("ignores a corrupt cross-tab payload without erasing the current session", async () => {
    render(<PhysicalAcceptancePanel context={CONTEXT} />);

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });
    const before = localStorage.getItem(STORAGE_KEY);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEY,
        newValue: "{not-json",
        storageArea: localStorage,
      }),
    );

    expect(
      await screen.findByText(/تجاهل التطبيق تحديثًا تالفًا/u),
    ).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});
