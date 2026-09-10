# Android signing: two channels

There are two build channels, and the difference between them is the signing
key. That is not a packaging detail — it decides whether a tester can install a
new candidate over the previous one without losing everything on the device.

| Channel | Task | Key | Installs over the previous build | Used for |
| --- | --- | --- | --- | --- |
| `debug-ci` | `assembleDebug` | Ephemeral. Android Gradle Plugin generates a debug keystore per machine, so **every CI run signs with a different key**. | **No.** Android refuses an update signed by a different key. | Proving the project compiles, lint, unit tests, and the instrumentation suite. |
| `physical-test` | `assemblePhysicalTest` | One stable keystore, supplied only through protected repository secrets. | **Yes.** | Iterative physical testing and release candidates. |

## Why the ephemeral key is not good enough for physical testing

Four consecutive CI runs of this project produced four different debug signing
certificates from identical sources. That is fine while all anyone wants is
"does it compile", and it is unacceptable the moment a person is testing on real
hardware:

- Installing candidate *n+1* over candidate *n* fails with
  `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, which reads like a broken APK.
- Working around it means uninstalling first, and an uninstall **erases app
  storage** — including the recovery journal. The durable recovery export
  exists precisely so a recovery survives that, but forcing an uninstall on
  every single update turns a safety net into a routine step, and routine steps
  get skipped.
- A debug-signed build cannot be traced to a controlled key at all, so an APK
  found on a phone months later cannot be attributed.

The `physical-test` channel therefore **fails closed**: if the signing secrets
are absent, both Gradle and the workflow refuse by name. Neither falls back to
the debug key. A candidate signed by an ephemeral key is not a candidate.

## What you need to do

Nothing in this repository can create a keystore for you, and nothing here will
invent credentials. These four steps are yours, and the release-candidate
workflow will refuse to produce an APK until they are done.

### 1. Create the keystore

Run this on a machine you control, **not** in CI, and not in this repository's
working tree:

```sh
keytool -genkeypair \
  -alias elrs-physical-test \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -keystore elrs-physical-test.jks \
  -storetype PKCS12 \
  -dname "CN=ExpressLRS Easy Setup physical test, O=FPVARABIC, C=SA"
```

`keytool` ships with the JDK. It will ask for a store password; with `PKCS12`
the key password is the same as the store password, which is one fewer thing to
lose.

**Keep this file and its password.** If you lose either, you cannot build a
candidate that installs over the ones already on a tester's phone — the only way
forward is a new key and an uninstall on every device. Back it up somewhere that
is not this repository and not a chat message.

10950 days is 30 years. A key that expires mid-project is a key that stops
working with no warning.

### 2. Read its certificate fingerprint

```sh
keytool -list -v -keystore elrs-physical-test.jks -alias elrs-physical-test \
  | grep -A 1 'SHA256:'
```

Take the `SHA256:` line, remove the colons, and lowercase it:

```sh
keytool -list -v -keystore elrs-physical-test.jks -alias elrs-physical-test \
  | sed -n 's/.*SHA256: *//p' | tr -d ':' | tr 'A-F' 'a-f'
```

That 64-character value goes in `android/signing/physical-test-certificate.sha256`
(see [`android/signing/README.md`](../android/signing/README.md)), committed to
this repository. The file does not exist yet, because it cannot: it can only be
read from a keystore that exists. **It is not a secret** — it is derivable from any
signed APK. Committing it is the point: it is the independent record that turns
a swapped or regenerated keystore into a build failure instead of a silently
different APK.

Send me that fingerprint, or commit it yourself, and CI will start checking every
candidate against it.

### 3. Base64-encode the keystore

```sh
base64 -w 0 elrs-physical-test.jks > elrs-physical-test.jks.base64
```

On macOS, `base64 -i elrs-physical-test.jks -o elrs-physical-test.jks.base64`.

### 4. Add four repository secrets

**Settings → Secrets and variables → Actions → New repository secret**, at
<https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/settings/secrets/actions>:

| Secret name | Value |
| --- | --- |
| `ELRS_KEYSTORE_BASE64` | The whole contents of `elrs-physical-test.jks.base64`, as one line. |
| `ELRS_KEYSTORE_PASSWORD` | The store password you chose in step 1. |
| `ELRS_KEY_ALIAS` | `elrs-physical-test` |
| `ELRS_KEY_PASSWORD` | The key password. With `PKCS12` this is the same as the store password. |

Then delete `elrs-physical-test.jks.base64`. Keep the `.jks` itself in your
backup.

**Do not paste any of these into a chat, an issue, a pull request, or a commit.**
A repository secret is write-only once saved: GitHub will not show it back to
you, which is the behaviour you want.

## What the workflow does with them

[`.github/workflows/android-release-candidate.yml`](../.github/workflows/android-release-candidate.yml)
is the only place they are readable, and `check:ci-hygiene` fails the build if
any other workflow so much as mentions them.

1. Refuses to run at all on a pull-request event, whatever its triggers say.
2. Checks out the exact tag or commit asked for.
3. Runs `pnpm check` — every gate — on that tree.
4. Decodes the keystore into `$RUNNER_TEMP`, outside the workspace, `chmod 600`,
   with the passwords `::add-mask::`ed so no accidental echo can print them.
5. Builds `assemblePhysicalTest` with a monotonic `versionCode` (the workflow
   run number) and a source-derived `versionName` (the tag, or `0.1.0-rc.<run>`,
   plus the short commit).
6. Runs `apksigner verify --verbose --print-certs` and keeps the full output
   beside the APK.
7. **Compares the observed certificate fingerprint against the committed one**
   and fails if they differ, or if none is recorded.
8. Checks the APK's embedded web and native source digests are real, so a
   candidate whose provenance says nothing cannot be published.
9. Writes `app-physicalTest.apk.provenance.json`: tag, commit, run, version
   code and name, SDK levels, certificate fingerprint, target-pack identity,
   and the embedded source digests.
10. Uploads only the APK and those public records — never the keystore, which is
    not in the workspace and so cannot be matched by an upload path.
11. Shreds the keystore in an `if: always()` step.

## Triggering a candidate

Tag the commit and push the tag:

```sh
git tag -a physical-test-1 -m "First signed physical-test candidate"
git push origin physical-test-1
```

Or run it by hand from **Actions → Android physical-test candidate → Run
workflow**, giving a tag or a full commit SHA. A branch name works but is a bad
idea: a candidate handed to a tester has to name a tree that cannot move.

## Optional hardening

Once the secrets exist, consider moving them into a GitHub **Environment**
(Settings → Environments) named `physical-test-signing` and adding a required
reviewer, then adding `environment: physical-test-signing` to the job. Every
candidate build would then need an explicit human approval. It is not required
for the boundary to hold — the tag-only trigger and the pull-request refusal do
that — but it converts "anyone who can push a tag" into "anyone who can push a
tag and get approved".

## If the key is ever lost or exposed

There is no key rotation that preserves installability: Android identifies an
app by its signing certificate. Recovery means creating a new keystore,
committing the new fingerprint, and telling every tester to uninstall before
installing the next candidate. Say so plainly when it happens rather than
shipping a candidate that mysteriously will not install.
