#!/usr/bin/env bash
set -euo pipefail

: "${TARGET_HEAD:?}"
: "${HELPER_BRANCH:?}"
: "${STAGE_BRANCH:?}"
: "${B64_SHA256:?}"
: "${GZIP_SHA256:?}"
: "${PATCH_SHA256:?}"

actual="$(git rev-parse HEAD)"
test "$actual" = "$TARGET_HEAD" || {
  echo "::error::Target branch moved from $TARGET_HEAD to $actual."
  exit 1
}

helper="refs/remotes/origin/${HELPER_BRANCH}"
: > /tmp/atomic-source.patch.gz.b64.with-breaks
git show "${helper}:.atomic-cleanup/part-01.txt" >> /tmp/atomic-source.patch.gz.b64.with-breaks
for part in 0 1 2 3 4 5; do
  git show "${helper}:.atomic-cleanup/part-02-${part}.txt" >> /tmp/atomic-source.patch.gz.b64.with-breaks
done
for part in 03 04 05; do
  git show "${helper}:.atomic-cleanup/part-${part}.txt" >> /tmp/atomic-source.patch.gz.b64.with-breaks
done
tr -d '\r\n' < /tmp/atomic-source.patch.gz.b64.with-breaks > /tmp/atomic-source.patch.gz.b64
printf '%s  %s\n' "$B64_SHA256" /tmp/atomic-source.patch.gz.b64 | sha256sum -c -
base64 --decode /tmp/atomic-source.patch.gz.b64 > /tmp/atomic-source.patch.gz
printf '%s  %s\n' "$GZIP_SHA256" /tmp/atomic-source.patch.gz | sha256sum -c -
gzip --decompress --stdout /tmp/atomic-source.patch.gz > /tmp/atomic-source.patch
printf '%s  %s\n' "$PATCH_SHA256" /tmp/atomic-source.patch | sha256sum -c -
git apply --check /tmp/atomic-source.patch
git apply /tmp/atomic-source.patch

mkdir -p config docs/security
git show "${helper}:.atomic-cleanup/dependency-license-policy.json" > config/dependency-license-policy.json
git show "${helper}:.atomic-cleanup/pako-2.2.0-license-review.md" > docs/security/pako-2.2.0-license-review.md
rm -f .github/patches/foundation-repair.patch
rmdir .github/patches 2>/dev/null || true

# The staging commit deliberately leaves .github/workflows untouched. The final
# atomic target commit will replace and delete them through the Git data API.
test -z "$(git diff --name-only -- .github/workflows)"

test ! -e apps/web/src/main-v2.tsx
test ! -e apps/web/src/components/ExpressLrsParityWorkbenchV2.tsx
test ! -e apps/web/src/components/ExpressLrsParityWorkbenchV2.test.tsx
test ! -e apps/web/src/hardware/official-catalog-v2.ts
test ! -e apps/web/src/hardware/official-target-index-v2.ts
test ! -e apps/web/src/hardware/official-target-index-v2.test.ts
test -f apps/web/src/hardware/stm32-dfu.ts
test -f scripts/check-ci-hygiene.mjs
grep -Fq 'from "./components/ExpressLrsParityWorkbench"' apps/web/src/main.tsx
grep -Fq '"pako"' config/dependency-license-policy.json

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add --all
git commit -m 'stage(ci): validated source consolidation payload'
git push --force-with-lease origin "HEAD:${STAGE_BRANCH}"
