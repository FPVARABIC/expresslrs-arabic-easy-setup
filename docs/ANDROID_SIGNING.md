# Android signing, from the candidate side

**No workflow in this branch can read the signing key, and Gradle refuses to
run if one is present.** That is the whole content of this page. The signer
itself lives elsewhere, deliberately.

## Why the key is not here

Android identifies an application by its signing certificate, so the key that
signs this application is the key that can produce an APK Android accepts as an
*update* to it — inheriting its granted permissions, including USB access to a
transmitter whose firmware it can then rewrite. A leak is not recoverable by
rotation: a new key makes every candidate already on a tester's phone
un-updatable, and the only way forward is telling every tester to uninstall,
which erases the app storage the durable recovery export exists to outlive.

An earlier arrangement put the key in its own workflow and treated *"only one
workflow names the secrets"* as isolation. It was not. That workflow checked
out the candidate commit and ran Gradle with the key in the environment, and
Gradle runs this repository's own build scripts, its plugins, those plugins'
dependencies, and whatever shell steps the workflow contains. Anyone able to
open a pull request could change what ran there. The problem was not a missing
check; it was a design in which a check could have helped.

## What this branch does instead

| | Candidate build (`android.yml`) |
| --- | --- |
| Has the permanent key | **No** |
| Signs the `physicalTest` APK | **No** — it is unsigned |
| Runs | pnpm, Gradle, lint, unit tests, instrumentation, the emulator suites |
| Produces | `app-physicalTest.apk` (unsigned) and `app-physicalTest-unsigned.provenance.json` |

Unsigned is the correct output of a build that ran pull-request code, not a
degraded one. An unsigned APK cannot be installed, which is the honest state of
an artifact nobody has vouched for yet. The build asserts this about itself: a
step runs `apksigner verify` and **fails if the APK does verify**, because a
signature here would mean a key had been readable.

Beside the APK goes a machine-readable provenance manifest — source SHA,
workflow and run id, artifact name, APK SHA-256 and byte length, application id,
`versionCode`, `versionName`, build tools, and both embedded source digests.
Every field is checked non-empty and the three digests are checked to be 64 hex
characters before it is written, because these are the signer's only inputs: a
field that says nothing would let an untraceable APK through. The artifact id is
only known after upload, so the run summary records it alongside the other three
values the signer needs.

### Gradle refuses the secrets

`android/app/build.gradle.kts` has no consumer for `ELRS_KEYSTORE_BASE64`,
`ELRS_KEYSTORE_PASSWORD`, `ELRS_KEY_ALIAS` or `ELRS_KEY_PASSWORD` — and every
task throws if any of them is in the environment. That turns "we do not pass the
key to Gradle" from a promise into a build failure: a workflow edit that exposes
them fails the build that would have read them, instead of succeeding quietly.
The check is on every task rather than on packaging, because the leak that
matters is any candidate code reading the environment.

The only signing identity Gradle can configure is `disposableTest`, from
`ELRS_TEST_KEYSTORE_*`. The update-persistence job generates that keystore,
uses it, and shreds it; the property under test there is "the same key across
two builds", which any key satisfies. It is named apart from the permanent
secrets so the two cannot be confused or wired together by accident.

`pnpm check:ci-hygiene` enforces all of the above, and each rule was proven by
reintroducing its defect.

## Where the signer is

On its own branch, based directly on `main`, in
[PR #15](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/pull/15).
It is not part of this pull request on purpose: a `workflow_dispatch` workflow
is only dispatchable from the default branch anyway, and keeping it out of the
candidate diff is what makes "pull-request code cannot reach the key" a
structural claim rather than a promise. `check:ci-hygiene` fails if
`android-release-candidate.yml` reappears here.

That branch carries the full instructions — creating the keystore, the exact
`physical-test-signing` environment settings, the four **environment** secrets
(not repository secrets), the active tag ruleset proposal for `physical-test-*`,
and a fully local signing fallback for not merging it at all.

## The certificate fingerprint

`android/signing/physical-test-certificate.sha256` is committed once a keystore
exists. It is **not** a secret — it is derivable from any signed APK — and
committing it is the point: it is the independent record that turns a swapped or
regenerated keystore into a failure instead of a silently different APK. See
[`android/signing/README.md`](../android/signing/README.md).

## Status

Nothing has been signed. No keystore exists, no secrets are configured, and the
signer has never run, so `SIGNED_PHYSICAL_TEST_APK_READY` is **No**.
