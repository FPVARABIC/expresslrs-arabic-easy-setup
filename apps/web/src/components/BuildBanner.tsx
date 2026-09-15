import { useState } from "react";
import { createTranslator, type Locale } from "@elrs-easy/i18n";

import { buildSha, isPinnedBuild, shortBuildSha } from "../build-identity";
import { readNativeHostIdentity } from "../hardware/native-bridge";

export interface BuildBannerProps {
  readonly locale: Locale;
}

/**
 * States what this build is, and which commit it is.
 *
 * It is informational only. It disables nothing, hides nothing, and is read by
 * no gate: every operation stays visible and pressable regardless of what this
 * says. Its purpose is that an operator reporting a result, and a maintainer
 * reading that report, are talking about the same tree.
 */
/** The first twelve characters, which is enough to name a digest in a report. */
function shortDigest(value: string): string {
  return value === "absent" ? value : value.slice(0, 12);
}

export function BuildBanner({ locale }: BuildBannerProps) {
  const t = createTranslator(locale);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const full = buildSha();
  // An installed host serves this page from inside itself, so the commit above
  // is the web build's and says nothing about the host around it. When a host
  // reports what it was built from, both are shown.
  const host = readNativeHostIdentity();

  async function copyFullSha(): Promise<void> {
    try {
      await navigator.clipboard.writeText(full);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="build-banner" role="note" data-build={full}>
      <strong className="build-banner-stage">{t("build.stage")}</strong>
      <span className="build-banner-note">{t("build.note")}</span>
      <code className="build-banner-sha" title={full}>
        {shortBuildSha()}
      </code>
      <button type="button" onClick={() => void copyFullSha()}>
        {copied === "done" ? t("build.copied") : t("build.copyFull")}
      </button>
      {copied === "failed" ? (
        <span className="build-banner-error">{t("build.copyFailed")}</span>
      ) : null}
      {isPinnedBuild() ? null : (
        <span className="build-banner-error">{t("build.unpinned")}</span>
      )}
      {host === null ? null : (
        <span className="build-banner-host" data-testid="build-banner-host">
          {t("build.host")}:{" "}
          {host.webBuildSha256 === null ? null : (
            <code title={host.webBuildSha256}>
              {t("build.hostWeb")} {shortDigest(host.webBuildSha256)}
            </code>
          )}{" "}
          {host.nativeSourceSha256 === null ? null : (
            <code title={host.nativeSourceSha256}>
              {t("build.hostNative")} {shortDigest(host.nativeSourceSha256)}
            </code>
          )}
        </span>
      )}
      {host === null ||
      host.bridge === null ||
      host.bridge === "AVAILABLE" ? null : (
        <span className="build-banner-error">
          {t("build.hostBridgeUnavailable", { reason: host.bridge })}
        </span>
      )}
    </div>
  );
}
