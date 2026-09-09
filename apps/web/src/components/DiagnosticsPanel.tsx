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
export function DiagnosticsPanel({ locale, capture }: DiagnosticsPanelProps) {
  const t = createTranslator(locale);
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  function show(): void {
    setCopied("idle");
    setReport(serializeDiagnosticsMarkdown(capture()));
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        serializeDiagnosticsMarkdown(capture()),
      );
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  function downloadJson(): void {
    const snapshot = capture();
    downloadTextFile(
      serializeDiagnosticsJson(snapshot),
      `${diagnosticsFileStem(snapshot)}.json`,
      "application/json",
    );
  }

  function downloadMarkdown(): void {
    const snapshot = capture();
    downloadTextFile(
      serializeDiagnosticsMarkdown(snapshot),
      `${diagnosticsFileStem(snapshot)}.md`,
      "text/markdown",
    );
  }

  return (
    <section className="diagnostics" aria-labelledby="diagnostics-heading">
      <h2 id="diagnostics-heading">{t("diagnostics.heading")}</h2>
      <p className="easy-note">{t("diagnostics.intro")}</p>
      <p className="easy-note">{t("diagnostics.privacy")}</p>
      <div className="diagnostics-actions">
        <button type="button" onClick={() => show()}>
          {t("diagnostics.show")}
        </button>
        <button type="button" onClick={() => void copy()}>
          {copied === "done" ? t("diagnostics.copied") : t("diagnostics.copy")}
        </button>
        <button type="button" onClick={() => downloadJson()}>
          {t("diagnostics.downloadJson")}
        </button>
        <button type="button" onClick={() => downloadMarkdown()}>
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
