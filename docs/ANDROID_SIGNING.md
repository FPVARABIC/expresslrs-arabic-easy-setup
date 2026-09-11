# Signing the Android physical-test candidate

There is one permanent signing key for the Android host. Everything in this
document exists to keep that key away from code that arrives in a pull request.

## Why the key is not in the build

Android identifies an application by its signing certificate. The key that
signs this application is the key that can produce an APK Android will accept
as an *update* to it — silently inheriting its granted permissions, including
USB access to a transmitter it can then rewrite firmware on. There is no
rotation that undoes a leak: changing the key makes every candidate already on
a tester's phone un-updatable, so recovery means telling every tester to
uninstall, which erases the app storage the durable recovery export exists to
outlive.

An earlier arrangement kept the key in its own workflow and treated "only one
workflow names the secrets" as isolation. It was not. That workflow checked out
the candidate commit and ran Gradle with the key in the environment. Gradle runs
the candidate's own build scripts, its plugins, its plugins' dependencies and
any shell step in the workflow — so anyone able to open a pull request could
have read the key. The mistake was not a missing check; it was a design in
which a check could have helped.

## The two-phase arrangement

| Phase | Where | Has the key | What runs |
| --- | --- | --- | --- |
| Candidate build | `android.yml`, on pull requests and branches | **No** | The whole toolchain: pnpm, Gradle, lint, unit tests, instrumentation. Produces `app-physicalTest-unsigned.apk` and a provenance manifest. |
| Trusted signing | `android-physical-test-signer.yml`, default branch, `workflow_dispatch` | Yes, in one job | `base64`, `zipalign`, `apksigner`, `sha256sum`, `shred`. Nothing else. |

The signer never checks out the candidate SHA, never runs Gradle, npm, pnpm, a
repository hook, a candidate script, or any code from inside the APK.

It is split into two jobs, and the split is the substance:

- **`verify`** runs with no environment and no secrets. It establishes that the
  artifact is the output of a *successful* run of the *allowlisted* workflow, on
  the *claimed commit*, in *this repository*, with the *claimed digest*, and
  that the APK is not already signed. `scripts/verify-unsigned-candidate.mjs`
  makes those comparisons; every one is fatal.
- **`sign`** runs in the protected environment and has no decisions left to
  make. By the time a key exists in the runner, whether this artifact deserves
  it has already been settled.

The candidate build asserts its own output is unsigned and fails if it is not,
because a signature there would mean a key had been readable by pull-request
code. Gradle also refuses to run at all if any of the four secret names appears
in its environment, which turns "we do not pass the key to Gradle" from a
promise into a build failure.

## What you need to do

Nothing here can create a keystore for you, and nothing here will invent
credentials. These steps are yours.

### 1. Create the keystore

On a machine you control — not in CI, not in a clone of this repository:

```sh
keytool -genkeypair \
  -alias elrs-physical-test \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -keystore elrs-physical-test.jks \
  -storetype PKCS12 \
  -dname "CN=ExpressLRS Easy Setup physical test, O=FPVARABIC, C=SA"
```

`keytool` ships with the JDK. With `PKCS12` the key password is the store
password, which is one fewer thing to lose. 10950 days is 30 years: a key that
expires mid-project stops working with no warning.

**Back this file and its password up somewhere that is not this repository and
not a chat message.** Losing either means a new key and an uninstall on every
tester's phone.

### 2. Record the certificate fingerprint

```sh
keytool -list -v -keystore elrs-physical-test.jks -alias elrs-physical-test \
  | sed -n 's/.*SHA256: *//p' | tr -d ':' | tr 'A-F' 'a-f'
```

That 64-character value goes in `android/signing/physical-test-certificate.sha256`,
committed. It is **not a secret** — it is derivable from any signed APK.
Committing it is the point: it is the independent record that makes a swapped or
regenerated keystore a build failure instead of a silently different APK. The
signer refuses to publish a candidate when the file is absent.

### 3. Create the protected environment

**Settings → Environments → New environment**, named exactly:

```
physical-test-signing
```

Configure it as follows. The workflow references the environment by name, so a
missing or differently-named environment means the signing job never gets the
secrets and fails closed.

| Setting | Value | Why |
| --- | --- | --- |
| Environment name | `physical-test-signing` | What `environment:` in the workflow names. |
| Required reviewers | At least one — you | Every candidate signing needs an explicit human approval. This converts "anyone who can dispatch the workflow" into "anyone who can dispatch it *and* be approved". |
| Prevent self-review | Enable if available | Stops the person who dispatched from approving their own run. On a single-maintainer repository this will block you; leave it off then, and know that is the trade. |
| Allow administrators to bypass configured protection rules | **Disable** | An admin bypass is exactly the path an attacker with a stolen admin session would take. |
| Deployment branches and tags | **Selected branches** → add only `main` | The key is unreachable from any other ref, so a branch cannot carry a modified signer to it. |
| Wait timer | Optional | A few minutes gives you a window to cancel a dispatch you did not intend. |

### 4. Add the four secrets **to the environment**

On the environment page — *not* Settings → Secrets → Actions:

| Secret | Value |
| --- | --- |
| `ELRS_KEYSTORE_BASE64` | `base64 -w 0 elrs-physical-test.jks` output, as one line. On macOS: `base64 -i elrs-physical-test.jks`. |
| `ELRS_KEYSTORE_PASSWORD` | The store password from step 1. |
| `ELRS_KEY_ALIAS` | `elrs-physical-test` |
| `ELRS_KEY_PASSWORD` | The key password. With `PKCS12`, the same as the store password. |

Environment secrets, not repository secrets, is a real difference and not
bookkeeping: a repository secret is readable by *any* workflow and any job in
this repository, so adding it there would undo the isolation the two-phase
design buys. An environment secret is readable only by a job that declares
`environment: physical-test-signing`, and that declaration is what triggers the
approval.

Then delete the `.base64` file. Keep the `.jks` in your backup.

**Do not paste any of these into a chat, an issue, a pull request, or a commit.**
A saved secret is write-only: GitHub will not show it back to you, which is the
behaviour you want.

### 5. No automatic route to the key

Check, and keep checking, that there is no path which reaches
`physical-test-signing` without a person:

- The signer is `workflow_dispatch` **only**. It has no `pull_request`,
  `pull_request_target`, `push`, `schedule`, or `workflow_run` trigger. A
  `workflow_run` trigger would be the subtle one — it fires automatically on
  another workflow completing, which would sign every candidate build with no
  approval at all.
- No `workflow_call` either; a reusable workflow can be called by a caller you
  did not write.
- Deployment branches are restricted to `main`, so the ref carrying the signer
  cannot be swapped.
- `permissions:` is `contents: read` at the top level, and the signing job adds
  nothing.

## What the shell in this workflow is allowed to do

The signer's shell is part of the security boundary, not a style question, so
every rule below is enforced by `pnpm check:ci-hygiene` and every one of them
was proven by reintroducing the defect it names and watching the check fail.

| Rule | Why | The defect it caught |
| --- | --- | --- |
| No `${{ … }}` inside any `run:` block | Actions substitutes expressions into the script *text* before a shell parses it, so a value containing `$(…)` becomes a command | `github.run_id` pasted into an API URL; four `inputs.*` pasted into a JSON heredoc |
| The signed provenance is produced by a JSON encoder | `versionName` is read out of an APK built from pull-request code; in a document assembled by pasting strings, one quote rewrites the record | the heredoc was unquoted, so a command substitution in an input would have run in the job holding the key |
| `apksigner`'s answer is read, not its exit status | `apksigner verify` exits non-zero for a missing file, an unreadable zip or a JVM that would not start | any of those read as "no signature found", which is how a broken toolchain hands an APK to the key |
| Bounded formats for every candidate-controlled value | a field with no shape is a field with no meaning | `versionCode` and `versionName` were unbounded |
| The APK is `app-physicalTest-unsigned.apk` | AGP appends the suffix exactly when no signing config was applied, so the name is the claim | the signer looked for `app-physicalTest.apk` and would have died silently at `test -f` on its first real run |
| Build-tools pinned, not "newest present" | apksigner's signature-scheme defaults move between versions | the version was chosen by `ls | sort -V | tail -1` |
| Exactly one signer certificate | `head -1` on a multiply-signed APK checks the first and says nothing about the rest | the fingerprint check read only the first digest |

Two of these were latent rather than exploitable today: nothing could reach the
heredoc's command substitution, because the verify job's regexes happen to
exclude the characters. That is a property of a check in a different job rather
than of the step itself, and the whole point of splitting `verify` from `sign`
is not to have the key's safety rest on where a check happens to sit.

Neither the injection nor the filename defect could be found by reading alone.
Both were confirmed by running the shell: the old heredoc, given a value
containing `$(touch …)`, created the file and forged `"signed": false` in its
own provenance; the replacement stores the same value as text, runs nothing,
and leaves the record intact.

## Dispatching a signing run

**Actions → Android physical-test signer → Run workflow**, from `main`, with the
four values the candidate build printed in its run summary:

| Input | Where it comes from |
| --- | --- |
| `source_sha` | The full 40-character commit the candidate was built from. |
| `source_run_id` | The `android.yml` run id. |
| `artifact_name` | `elrs-android-physicaltest-unsigned-<sha>`. |
| `artifact_id` | The numeric artifact id, printed in the run summary. |
| `expected_apk_sha256` | The unsigned APK's SHA-256, printed in the same summary. |

The run then waits for the environment approval. On approval it aligns, signs,
verifies with `apksigner verify --verbose --print-certs`, compares the observed
certificate against the committed fingerprint, writes a provenance record
carrying both the unsigned and signed digests, and uploads only the signed APK
and those public records. The keystore lives in `$RUNNER_TEMP`, outside the
workspace, so no upload path can reach it, and it is shredded in an
`if: always()` step.

## Proposed tag ruleset for `physical-test-*`

A candidate handed to a tester has to name a tree that cannot move. A tag that
can be deleted and recreated names nothing. Create this before the first
candidate tag exists.

**Settings → Rules → Rulesets → New ruleset → New tag ruleset**

| Field | Value |
| --- | --- |
| Ruleset name | `physical-test tags are immutable` |
| Enforcement status | **Active** (not "Evaluate" — evaluate mode reports and permits) |
| Bypass list | **Empty.** Not even repository admin. A bypass entry is the whole hole. |
| Target tags | Include by pattern: `physical-test-*` |
| Restrict creations | Off — you need to be able to create them |
| Restrict updates | **On** — a tag may not be moved to another commit |
| Restrict deletions | **On** — a tag may not be deleted and reused |
| Block force pushes | **On** |

With updates and deletions restricted, `physical-test-1` means one commit
forever. Getting a different candidate means `physical-test-2`, which is the
correct outcome: the numbers are cheap and the confusion is not.

## Fully local signing fallback

If you would rather not merge the signer workflow at all, the same result is
reachable by hand, and the security properties are actually *better* — the key
never leaves your machine. What you give up is the audit trail and the
enforced verification.

Download the unsigned candidate from the `android.yml` run's artifacts, then:

```sh
# 0. What the run summary said the unsigned APK should be.
EXPECTED=<expected_apk_sha256 from the run summary>

unzip elrs-android-physicaltest-unsigned-<sha>.zip
sha256sum app-physicalTest-unsigned.apk

# 1. Refuse to continue on a mismatch. This is the check the verify job runs;
#    doing it by hand means actually doing it.
test "$(sha256sum app-physicalTest-unsigned.apk | cut -d' ' -f1)" = "$EXPECTED" \
  || { echo "digest mismatch — do not sign this"; exit 1; }

# 2. Confirm it is unsigned — and read the answer rather than the exit status.
#    A signature here would mean the candidate build had access to a key. But
#    `apksigner verify` also exits non-zero for a missing file, an unreadable
#    zip or a JVM that would not start, and none of those is a statement about
#    signatures. "It failed, so it must be unsigned" is how a broken toolchain
#    talks you into signing something.
out="$(apksigner verify app-physicalTest-unsigned.apk 2>&1)"; status=$?
if [ "$status" -eq 0 ]; then
  echo "ALREADY SIGNED — stop"; exit 1
fi
case "$out" in
  *"DOES NOT VERIFY"*|*"No JAR signature"*|*"Missing META-INF"*) ;;
  *) echo "apksigner exited $status without saying it is unsigned: $out"; exit 1 ;;
esac

# 3. Check the manifest describes this APK.
cat app-physicalTest-unsigned.provenance.json
aapt2 dump badging app-physicalTest-unsigned.apk | head -1

# 4. Align, then sign. Aligning after signing invalidates the v2 signature.
zipalign -p -f 4 app-physicalTest-unsigned.apk app-physicalTest-aligned.apk
zipalign -c -v 4 app-physicalTest-aligned.apk

apksigner sign \
  --ks elrs-physical-test.jks \
  --ks-key-alias elrs-physical-test \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --out app-physicalTest-signed.apk \
  app-physicalTest-aligned.apk

# 5. Verify, and check the certificate is the one you recorded.
apksigner verify --verbose --print-certs app-physicalTest-signed.apk
apksigner verify --print-certs app-physicalTest-signed.apk \
  | sed -n 's/.*SHA-256 digest: *//p' | head -1
cat android/signing/physical-test-certificate.sha256

# 6. Record what you produced, so a phone can be traced back to a tree.
sha256sum app-physicalTest-unsigned.apk app-physicalTest-signed.apk
```

Keep step 6's output with the APK. Without it there is no link between what a
tester installed and what the source said.

`scripts/verify-unsigned-candidate.mjs` can also be run locally against the
manifest, which is less error-prone than reading it:

```sh
node scripts/verify-unsigned-candidate.mjs \
  --manifest app-physicalTest-unsigned.provenance.json \
  --source-sha <sha> --run-id <run id> \
  --artifact-name elrs-android-physicaltest-unsigned-<sha> \
  --apk-sha256 "$(sha256sum app-physicalTest-unsigned.apk | cut -d' ' -f1)" \
  --application-id com.fpvarabic.elrs.bridge \
  --version-code <from aapt2> --version-name <from aapt2>
```

## If the key is ever lost or exposed

Say so plainly rather than shipping a candidate that mysteriously will not
install. There is no rotation that preserves installability: create a new
keystore, commit the new fingerprint, and tell every tester to uninstall before
installing the next candidate — which erases app storage, so they must export
their durable recovery package first.
