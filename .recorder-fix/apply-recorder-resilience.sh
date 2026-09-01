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

python3 <<'PY'
from pathlib import Path

path = Path("apps/web/src/components/PhysicalAcceptancePanel.tsx")
text = path.read_text(encoding="utf-8")

old_autosave = '''  useEffect(() => {
    savePhysicalAcceptanceSession(session, storage);
  }, [session, storage]);'''
new_autosave = '''  useEffect(() => {
    const result = savePhysicalAcceptanceSession(session, storage);
    if (result.ok) return undefined;
    const timer = window.setTimeout(() => {
      setMessage(`تعذر الحفظ المحلي: ${result.message}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session, storage]);'''
if text.count(old_autosave) != 1:
    raise SystemExit("autosave anchor did not match exactly once")
text = text.replace(old_autosave, new_autosave, 1)

cross_tab = '''

  useEffect(() => {
    if (storage !== browserPhysicalAcceptanceStorage) return undefined;
    const synchronize = (event: StorageEvent) => {
      if (
        event.key !== "elrs-easy:physical-acceptance:v1" ||
        event.newValue === null
      ) {
        return;
      }
      try {
        const remote = parsePhysicalAcceptanceJson(event.newValue);
        setSession(remote);
        setMessage(
          "تمت مزامنة جلسة القبول بعد تعديلها في تبويب آخر.",
        );
      } catch {
        setMessage(
          "تجاهل التطبيق تحديثًا تالفًا وصل من تبويب آخر ولم يغيّر الجلسة الحالية.",
        );
      }
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, [storage]);'''
if "تمت مزامنة جلسة القبول" in text:
    raise SystemExit("cross-tab synchronization is already present")
text = text.replace(new_autosave, new_autosave + cross_tab, 1)
path.write_text(text, encoding="utf-8")
PY

mkdir -p apps/web/src/components
git show "${helper}:.recorder-fix/PhysicalAcceptancePanel.resilience.test.tsx" \
  > apps/web/src/components/PhysicalAcceptancePanel.resilience.test.tsx

rm -f .acceptance-stage/probe.txt
rmdir .acceptance-stage 2>/dev/null || true

pnpm install --frozen-lockfile
pnpm format
pnpm check
pnpm licenses:report
pnpm licenses:check
pnpm security:audit

# Ensure the accidental probe is gone and both resilience behaviors are permanent.
test ! -e .acceptance-stage/probe.txt
grep -Fq 'تعذر الحفظ المحلي' apps/web/src/components/PhysicalAcceptancePanel.tsx
grep -Fq 'تمت مزامنة جلسة القبول' apps/web/src/components/PhysicalAcceptancePanel.tsx
grep -Fq 'persistence resilience' apps/web/src/components/PhysicalAcceptancePanel.resilience.test.tsx

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add --all
test -n "$(git status --short)"
git commit -m 'fix(hardware): harden physical recorder persistence'
git push origin "HEAD:${TARGET_BRANCH}"
