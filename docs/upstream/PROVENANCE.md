# Upstream provenance

Which upstream revision each thing comes from, and where two of them are not
the same revision.

## What the two SHAs are

Both appear in [`baseline.md`](baseline.md) and they are not interchangeable.

| SHA | What it is | Date | Tag |
| --- | --- | --- | --- |
| `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6` | **The `4.1.0` release.** `git rev-list -n1 4.1.0` resolves to exactly this commit. | 2026-07-14 | `4.1.0` |
| `73ce820ba51437f73f31686233b607c58e188e7b` | **The tip of `master` when the baseline was captured** — post-4.1.0 development, subject "Merge pull request #3697 from pkendall64/4.2/lr2021". Not a release. | 2026-08-20 | none |

Earlier reports cited `73ce820b` for behaviour without saying it was a
development snapshot rather than the release. That was ambiguous, and this
table replaces it.

### Does the difference change anything we rely on?

Checked file by file, not assumed:

| File | `4.1.0` vs `master` |
| --- | --- |
| `src/include/crsf_protocol.h` | identical blob |
| `src/lib/CrsfProtocol/CRSFEndpoint.cpp` | identical blob |
| `src/lib/CrsfProtocol/CRSFRouter.cpp` | identical blob |
| `src/lib/rx-crsf/RXEndpoint.cpp` | identical blob |
| `src/lib/tx-crsf/TXModuleEndpoint.h` | identical blob |
| `src/python/binary_configurator.py` | differs, **but not in the rx-as-tx gate** |
| `src/python/UnifiedConfiguration.py` | differs, **but not in the rx-as-tx layout rewrite** |

So every fact this application depends on holds at both revisions. Only the
line numbers move:

| Behaviour | at `4.1.0` | at `master` |
| --- | --- | --- |
| rx-as-tx platform gate and `_RX` → `_TX` swap | `binary_configurator.py:229-235` | `:237-243` |
| rx-as-tx layout rewrite | `UnifiedConfiguration.py:53-61` | `:59-67` |
| `is-airport` set from `--airport-baud` only | `binary_configurator.py` (same hunk) | `:89-94` |
| CRSF endpoint addresses | `crsf_protocol.h` (identical) | identical |

## Reference sources — read, never shipped

These are read to establish correct behaviour. No byte of them reaches a
device; they are not dependencies.

| Repository | Purpose | Revision | Release |
| --- | --- | --- | --- |
| `ExpressLRS/ExpressLRS` | Firmware and CRSF protocol semantics | `73ce820ba51437f73f31686233b607c58e188e7b` | also read at `a9d4a9cb…` = `4.1.0` |
| `ExpressLRS/ExpressLRS-Configurator` | Cross-check of the rx-as-tx per-platform mode lists and artifact swap | `421d656f1987117e37472979444cee464e3fcdef` | `1.8.3` at the same SHA |
| `ExpressLRS/web-flasher` | Browser flasher architecture | `4125a4e07d37ce1e872bb562ebd4286e6fd143f9` | none selected; reuse blocked pending a license answer |

## Runtime sources — what actually reaches a device

Everything is fetched from the official Web Flasher mirror:

```
https://expresslrs.github.io/web-flasher/assets/firmware
```

**These are scoped to the release the operator selected** (`<revision>` is that
release's revision), so a firmware image and its boot assets always come from
one release together:

| Artifact | Path |
| --- | --- |
| Application image | `/<revision>/<FCC\|LBT>/<firmware>/firmware.bin` |
| ESP32 bootloader | `/<revision>/<FCC\|LBT>/<firmware>/bootloader.bin` |
| ESP32 partitions | `/<revision>/<FCC\|LBT>/<firmware>/partitions.bin` |
| ESP32 boot_app0 | `/<revision>/<FCC\|LBT>/<firmware>/boot_app0.bin` |

**These are not release-scoped.** The mirror publishes one current set:

| Artifact | Path | Consequence |
| --- | --- | --- |
| Target catalog | `/hardware/targets.json` | The Target list describes the mirror's current hardware set, not the selected release |
| Hardware layout | `/hardware/<RX\|TX>/<layout_file>` | The pin map appended to a firmware image is the mirror's current one |
| Logo | `/hardware/logo/<logo_file>` | Cosmetic |

### The honest statement about mixing

**This application does combine a release-scoped firmware image with a
mirror-current hardware layout and Target catalog.** That is how the official
mirror is laid out — it publishes a single `hardware/` tree rather than one per
release — so any client reading it has the same property, upstream's own web
flasher included. It is stated here rather than left implied.

What bounds it:

- Every Target entry declares `minVersion`, and packaging **refuses** a release
  older than it (`firmware-package.ts`, `assertTargetSupportsRelease`). A
  Target whose layout has moved on cannot be applied to a firmware release that
  predates it.
- A Target that declares no `minVersion` at all is refused outright rather than
  packaged on a guess.
- A branch build is refused for STM32, whose configuration-block version cannot
  be established from a branch label.

What is not bounded: a layout change published *after* a release, for a Target
whose `minVersion` was not raised, will be applied to that older release. If
that matters for a given device, pin the layout by selecting a release whose
`minVersion` covers it, and record the observed pin map in the physical
acceptance sheet.

## Integrity

Every artifact that reaches a device is hashed, and the hashes are recorded:

| Where | What |
| --- | --- |
| `FirmwareSegment.sha256` | SHA-256 of every segment's final bytes, after the options block, hardware layout and logo are appended |
| Recovery manifest | The same per-segment name, address and SHA-256, written into the recovery archive |
| Recovery validation | A restore recomputes and compares before writing; a mismatched archive is refused |
| `capture-upstream-manifest.mjs` | SHA-256 of `index.json` and `targets.json` as CI serves them, plus per-platform Target counts, uploaded as a CI artifact so upstream drift is visible |

The per-artifact hashes for a specific run are not listed here because they are
per-release and per-Target: they are produced at build time and recorded in the
recovery manifest and the diagnostics report for the exact package an operator
built. This environment cannot fetch them — its egress gateway answers
`403 CONNECT` for `expresslrs.github.io` — so the `upstream-live` CI workflow
captures them instead.
