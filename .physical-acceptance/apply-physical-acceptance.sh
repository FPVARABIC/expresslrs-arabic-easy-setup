#!/usr/bin/env bash
set -euo pipefail

: "${TARGET_BRANCH:?}"
: "${TARGET_HEAD:?}"
: "${HELPER_BRANCH:?}"

actual="$(git rev-parse HEAD)"
test "$actual" = "$TARGET_HEAD" || {
  echo "::error::Target branch moved from $TARGET_HEAD to $actual."
  exit 1
}

helper="refs/remotes/origin/${HELPER_BRANCH}"
mkdir -p apps/web/src/acceptance apps/web/src/components docs/hardware scripts

git show "${helper}:.physical-acceptance/physical-acceptance.ts" > apps/web/src/acceptance/physical-acceptance.ts
git show "${helper}:.physical-acceptance/physical-acceptance-storage.ts" > apps/web/src/acceptance/physical-acceptance-storage.ts
git show "${helper}:.physical-acceptance/physical-acceptance.test.ts" > apps/web/src/acceptance/physical-acceptance.test.ts
git show "${helper}:.physical-acceptance/physical-acceptance-storage.test.ts" > apps/web/src/acceptance/physical-acceptance-storage.test.ts
git show "${helper}:.physical-acceptance/PhysicalAcceptancePanel.tsx" > apps/web/src/components/PhysicalAcceptancePanel.tsx
git show "${helper}:.physical-acceptance/PhysicalAcceptancePanel.test.tsx" > apps/web/src/components/PhysicalAcceptancePanel.test.tsx
git show "${helper}:.physical-acceptance/physical-acceptance.css" > apps/web/src/physical-acceptance.css
git show "${helper}:.physical-acceptance/PHYSICAL_ACCEPTANCE_PLAN_AR.md" > docs/hardware/PHYSICAL_ACCEPTANCE_PLAN_AR.md
git show "${helper}:.physical-acceptance/PHYSICAL_ACCEPTANCE_RESULT_SCHEMA.md" > docs/hardware/PHYSICAL_ACCEPTANCE_RESULT_SCHEMA.md
git show "${helper}:.physical-acceptance/check-physical-acceptance-package.mjs" > scripts/check-physical-acceptance-package.mjs

python <<'PY'
from __future__ import annotations

import json
from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one replacement, found {count}")
    path.write_text(text.replace(old, new), encoding="utf-8")

panel = Path("apps/web/src/components/PhysicalAcceptancePanel.tsx")
text = panel.read_text(encoding="utf-8")
text = text.replace(
    '} from "./physical-acceptance";',
    '} from "../acceptance/physical-acceptance";',
)
text = text.replace(
    '} from "./physical-acceptance-storage";',
    '} from "../acceptance/physical-acceptance-storage";',
)
old_capture = '''    const patch: Parameters<typeof updatePhysicalAcceptanceStep>[2] = {
      evidence: evidenceWithCapture(
        current.evidence,
        context.capturedAt,
        suggestion.evidence,
      ),
    };
    if (suggestion.status !== null) patch.status = suggestion.status;
    updateStep(step, patch);'''
new_capture = '''    updateStep(step, {
      evidence: evidenceWithCapture(
        current.evidence,
        context.capturedAt,
        suggestion.evidence,
      ),
      ...(suggestion.status === null ? {} : { status: suggestion.status }),
    });'''
if text.count(old_capture) != 1:
    raise SystemExit("PhysicalAcceptancePanel capture patch did not match exactly once")
text = text.replace(old_capture, new_capture)
panel.write_text(text, encoding="utf-8")

panel_test = Path("apps/web/src/components/PhysicalAcceptancePanel.test.tsx")
text = panel_test.read_text(encoding="utf-8")
old_mock = '''  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
  });'''
new_mock = '''  beforeEach(() => {
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
  });'''
if text.count(old_mock) != 1:
    raise SystemExit("PhysicalAcceptancePanel test mock patch did not match")
panel_test.write_text(text.replace(old_mock, new_mock), encoding="utf-8")

main = Path("apps/web/src/main.tsx")
replace_once(
    main,
    'import "./parity-workbench.css";\n',
    'import "./parity-workbench.css";\nimport "./physical-acceptance.css";\n',
    "main stylesheet import",
)

workbench = Path("apps/web/src/components/ExpressLrsParityWorkbench.tsx")
text = workbench.read_text(encoding="utf-8")
text = text.replace(
    'import { useEffect, useRef, useState } from "react";\n\n',
    'import { useEffect, useRef, useState } from "react";\n\nimport type { PhysicalAcceptanceContextSnapshot } from "../acceptance/physical-acceptance";\nimport { PhysicalAcceptancePanel } from "./PhysicalAcceptancePanel";\n\n',
    1,
)
anchor = '''  function updateOption<Key extends keyof ExpressLrsFirmwareOptions>(
    key: Key,
    value: ExpressLrsFirmwareOptions[Key],
  ): void {
    optionsRevisionRef.current += 1;
    setOptions((current) => ({ ...current, [key]: value }));
    resetPreparedState();
  }

  return ('''
replacement = '''  function updateOption<Key extends keyof ExpressLrsFirmwareOptions>(
    key: Key,
    value: ExpressLrsFirmwareOptions[Key],
  ): void {
    optionsRevisionRef.current += 1;
    setOptions((current) => ({ ...current, [key]: value }));
    resetPreparedState();
  }

  const physicalAcceptanceContext: PhysicalAcceptanceContextSnapshot =
    Object.freeze({
      capturedAt: nowIso(),
      secureContext: window.isSecureContext,
      webSerialSupported: "serial" in navigator,
      connectionState:
        identity === null ? "DISCONNECTED" : "CRSF_CONNECTED",
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
      bindCommandAvailable: parameters.some(
        (parameter) =>
          parameter.kind === "command" && /\\bbind\\b/iu.test(parameter.name),
      ),
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
      statusMessage: status,
    });

  return ('''
if text.count(anchor) != 1:
    raise SystemExit("workbench context insertion anchor did not match")
text = text.replace(anchor, replacement)
footer = '      <footer className="parity-footer">'
if text.count(footer) != 1:
    raise SystemExit("workbench footer anchor did not match")
text = text.replace(
    footer,
    '      <PhysicalAcceptancePanel context={physicalAcceptanceContext} />\n\n'
    + footer,
)
workbench.write_text(text, encoding="utf-8")

package_path = Path("package.json")
package = json.loads(package_path.read_text(encoding="utf-8"))
scripts = package["scripts"]
scripts["check:physical-acceptance"] = (
    "node scripts/check-physical-acceptance-package.mjs"
)
check = scripts["check"]
if "pnpm check:physical-acceptance" not in check:
    check = check.replace(
        "pnpm check:ci-hygiene && ",
        "pnpm check:ci-hygiene && pnpm check:physical-acceptance && ",
        1,
    )
scripts["check"] = check
package_path.write_text(
    json.dumps(package, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
PY

pnpm install --frozen-lockfile
pnpm format
pnpm check:physical-acceptance
pnpm check
pnpm licenses:report
pnpm licenses:check
pnpm security:audit

test "$(git rev-parse HEAD)" = "$TARGET_HEAD"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add --all
test -n "$(git status --short)"
git commit -m 'feat(hardware): add unlocked physical acceptance recorder'
git push origin "HEAD:${TARGET_BRANCH}"
