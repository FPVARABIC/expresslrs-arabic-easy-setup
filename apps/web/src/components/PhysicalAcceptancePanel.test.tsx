import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PhysicalAcceptanceContextSnapshot } from "../acceptance/physical-acceptance";
import type { PhysicalAcceptanceStorage } from "../acceptance/physical-acceptance-storage";
import { PhysicalAcceptancePanel } from "./PhysicalAcceptancePanel";

function storage(): PhysicalAcceptanceStorage & {
  readonly values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function context(
  patch: Partial<PhysicalAcceptanceContextSnapshot> = {},
): PhysicalAcceptanceContextSnapshot {
  return {
    capturedAt: "2026-09-01T13:00:00.000Z",
    secureContext: true,
    webSerialSupported: true,
    connectionState: "CRSF_CONNECTED",
    selectedRole: "tx",
    observedRole: "tx",
    productName: "Test ELRS TX",
    firmwareVersion: "4.1.0",
    hardwareVersion: 1,
    parameterCount: 12,
    usbVendorId: 0x303a,
    usbProductId: 0x1001,
    targetId: "vendor/radio/tx.json",
    targetKey: "TEST_TX",
    targetName: "Test TX",
    targetPlatform: "esp32",
    targetConfidence: "EXACT",
    releaseLabel: "4.1.0",
    releaseRevision: "4.1.0",
    flashMethod: "uart",
    settingsBackupAvailable: true,
    writableParameterCount: 4,
    bindCommandAvailable: true,
    bootloaderCommandAvailable: true,
    packageFileName: "firmware.bin",
    recoveryFileName: "recovery.zip",
    packageSegmentCount: 2,
    packageSegmentHashes: ["a".repeat(64), "b".repeat(64)],
    recoveryDownloaded: true,
    checkpointStage: "PACKAGE_SAVED",
    flashStage: null,
    statusMessage: "CRSF connected",
    ...patch,
  };
}

const fixedNow = () => new Date("2026-09-01T13:05:00.000Z");

describe("PhysicalAcceptancePanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(() => undefined),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
  });

  it("renders every physical test without sequential locking", () => {
    render(
      <PhysicalAcceptancePanel
        context={context()}
        storage={storage()}
        now={fixedNow}
        initialCandidateSha="abcdef123456"
      />,
    );

    expect(
      screen.getByText(/كل خطوة متاحة من البداية ولا توجد تبعية إجبارية/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("combobox", { name: /^نتيجة / })).toHaveLength(
      19,
    );
    expect(
      screen.getByRole("combobox", {
        name: "نتيجة استعادة بعد انقطاع متعمد",
      }),
    ).not.toBeDisabled();
  });

  it("records a late destructive result while earlier tests remain not started", () => {
    render(
      <PhysicalAcceptancePanel
        context={context()}
        storage={storage()}
        now={fixedNow}
      />,
    );

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "نتيجة تفليش طبيعي والتحقق من البايتات",
      }),
      { target: { value: "PASS" } },
    );

    expect(
      screen.getByRole("combobox", {
        name: "نتيجة تفليش طبيعي والتحقق من البايتات",
      }),
    ).toHaveValue("PASS");
    expect(
      screen.getByRole("combobox", {
        name: "نتيجة المتصفح والسياق الآمن",
      }),
    ).toHaveValue("NOT_RUN");
  });

  it("captures the current non-sensitive application context", () => {
    render(
      <PhysicalAcceptancePanel
        context={context()}
        storage={storage()}
        now={fixedNow}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "التقاط الحالة الحالية" }),
    );
    fireEvent.click(screen.getByText("آخر لقطة حالة محفوظة"));

    expect(screen.getByText(/productName: Test ELRS TX/)).toBeInTheDocument();
    expect(screen.getByText(/targetConfidence: EXACT/)).toBeInTheDocument();
    expect(screen.queryByText(/password/iu)).not.toBeInTheDocument();
  });

  it("uses observable evidence to suggest TX identity pass but not RF success", () => {
    render(
      <PhysicalAcceptancePanel
        context={context()}
        storage={storage()}
        now={fixedNow}
      />,
    );

    const evidenceButtons = screen.getAllByRole("button", {
      name: "التقاط دليل هذه الخطوة",
    });
    fireEvent.click(evidenceButtons[2]!);

    expect(
      screen.getByRole("combobox", { name: "نتيجة تعريف TX عبر CRSF" }),
    ).toHaveValue("PASS");

    fireEvent.click(evidenceButtons[12]!);
    expect(
      screen.getByRole("combobox", {
        name: "نتيجة مشاهدة رابط RF من الطرفين",
      }),
    ).toHaveValue("NOT_RUN");
    expect(screen.getByText(/النتيجة تحتاج مشاهدة المشغل/)).toBeInTheDocument();
  });

  it("persists operator metadata and step results locally", async () => {
    const persistent = storage();
    const first = render(
      <PhysicalAcceptancePanel
        context={context()}
        storage={persistent}
        now={fixedNow}
      />,
    );

    fireEvent.change(screen.getByLabelText("اسم المشغل المختصر"), {
      target: { value: "Operator-1" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "نتيجة المتصفح والسياق الآمن" }),
      { target: { value: "PASS" } },
    );

    await waitFor(() => expect(persistent.values.size).toBe(1));
    first.unmount();

    render(
      <PhysicalAcceptancePanel
        context={context()}
        storage={persistent}
        now={fixedNow}
      />,
    );

    expect(screen.getByLabelText("اسم المشغل المختصر")).toHaveValue(
      "Operator-1",
    );
    expect(
      screen.getByRole("combobox", { name: "نتيجة المتصفح والسياق الآمن" }),
    ).toHaveValue("PASS");
  });

  it("exports both machine-readable and reviewer-readable reports", () => {
    render(
      <PhysicalAcceptancePanel
        context={context()}
        storage={storage()}
        now={fixedNow}
        initialCandidateSha="abcdef123456"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "تصدير JSON" }));
    fireEvent.click(
      screen.getByRole("button", { name: "تصدير تقرير Markdown" }),
    );

    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2);
  });

  it("starts a clean session without disabling the tool", () => {
    render(
      <PhysicalAcceptancePanel
        context={context()}
        storage={storage()}
        now={fixedNow}
      />,
    );

    fireEvent.change(screen.getByLabelText("اسم المشغل المختصر"), {
      target: { value: "Operator-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "جلسة جديدة" }));

    expect(screen.getByLabelText("اسم المشغل المختصر")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "التقاط الحالة الحالية" }),
    ).toBeEnabled();
  });
});
