import { useState } from "react";
import { createTranslator, type Locale } from "@elrs-easy/i18n";

import {
  diagnosticsFileStem,
  serializeDiagnosticsJson,
  serializeDiagnosticsMarkdown,
  type DiagnosticsSnapshot,
} from "../diagnostics/diagnostics";

export interface DiagnosticsPanelProps {
  readonly locale: Locale;
  /** Reads the live session at the moment the operator asks. */
  readonly capture: () => DiagnosticsSnapshot;
  /**
   * The same read plus the browser's answer about already-granted devices,
   * which only an async call can obtain. Every action prefers this and falls
   * back to the synchronous read if the browser refuses to answer.
   */
  readonly captureWithGrants?: () => Promise<DiagnosticsSnapshot>;
}

function downloadTextFile(
  contents: string,
  fileName: string,
  mimeType: string,
): void {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The same diagnostics report in both modes. It is captured from the shared
 * controller, so what Easy Mode exports and what the Advanced view exports
 * describe one session, and neither can report a state the other cannot see.
 */
export function DiagnosticsPanel({
  locale,
  capture,
  captureWithGrants,
}: DiagnosticsPanelProps) {
  const t = createTranslator(locale);
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  async function snapshot(): Promise<DiagnosticsSnapshot> {
    if (captureWithGrants === undefined) return capture();
    try {
      return await captureWithGrants();
    } catch {
      // A browser that refuses to answer must not cost the whole report.
      return capture();
    }
  }

  async function show(): Promise<void> {
    setCopied("idle");
    setReport(serializeDiagnosticsMarkdown(await snapshot()));
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        serializeDiagnosticsMarkdown(await snapshot()),
      );
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  async function downloadJson(): Promise<void> {
    const value = await snapshot();
    downloadTextFile(
      serializeDiagnosticsJson(value),
      `${diagnosticsFileStem(value)}.json`,
      "application/json",
    );
  }

  async function downloadMarkdown(): Promise<void> {
    const value = await snapshot();
    downloadTextFile(
      serializeDiagnosticsMarkdown(value),
      `${diagnosticsFileStem(value)}.md`,
      "text/markdown",
    );
  }

  return (
    <section className="diagnostics" aria-labelledby="diagnostics-heading">
      <h2 id="diagnostics-heading">{t("diagnostics.heading")}</h2>
      <p className="easy-note">{t("diagnostics.intro")}</p>
      <p className="easy-note">{t("diagnostics.privacy")}</p>
      <div className="diagnostics-actions">
        <button type="button" onClick={() => void show()}>
          {t("diagnostics.show")}
        </button>
        <button type="button" onClick={() => void copy()}>
          {copied === "done" ? t("diagnostics.copied") : t("diagnostics.copy")}
        </button>
        <button type="button" onClick={() => void downloadJson()}>
          {t("diagnostics.downloadJson")}
        </button>
        <button type="button" onClick={() => void downloadMarkdown()}>
          {t("diagnostics.downloadMarkdown")}
        </button>
      </div>
      {copied === "failed" ? (
        <p className="easy-error">{t("diagnostics.copyFailed")}</p>
      ) : null}
      {report === null ? null : (
        <pre className="diagnostics-report" data-testid="diagnostics-report">
          {report}
        </pre>
      )}
    </section>
  );
}
