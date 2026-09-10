# Physical-test signing

This directory holds **public** information about the signing identity of the
`physicalTest` build channel. It never holds a keystore or a password.

| File | Contents |
| --- | --- |
| `physical-test-certificate.sha256` | The SHA-256 fingerprint of the certificate that channel is expected to be signed by. Absent until the first keystore exists. |

The fingerprint is committed on purpose. It is the independent record that turns
a swapped, regenerated or wrong keystore into a build failure rather than into a
silently different APK that Android then refuses to install over the previous
one. A fingerprint is not a secret — it is derivable from any signed APK.

The keystore itself, its passwords and the key alias are never available to any
workflow in this branch, and Gradle refuses to run if one of them appears in its
environment. They are readable only by the trusted signer, which lives on the
default branch, runs on manual dispatch behind an environment approval, never
checks out a candidate commit, and never runs Gradle. See
[../../docs/ANDROID_SIGNING.md](../../docs/ANDROID_SIGNING.md) for the candidate
side of that arrangement and where the signer is.

**A keystore must never be committed to this repository.** Anyone holding it can
build an APK that Android accepts as an update to this application — which, for
an application that can rewrite the firmware of flight hardware over USB, is
worth considerably more than the one uninstall step a stable key saves.
