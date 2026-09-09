# Targets and Device Detection

## Source model

The official hardware metadata is split from the Firmware repository:

- Firmware defines build environments in `src/targets/*.ini` and consumes a `src/hardware` directory.
- `ExpressLRS/Targets` supplies `targets.json`, per-device hardware layout JSON, logos, and validation scripts.
- A target entry maps `vendor.type.device` to product name, platform, generic Firmware environment, layout, minimum version, prior target name, capabilities/features, and allowed upload methods.

At inspected Targets SHA `c4bd7b823594c233e673828ab493a2f8319a756a`, the generated `targets.json` contains 330 device entries from 56 vendors:

| Category | Count |
| --- | ---: |
| RX 2.4 GHz | 135 |
| RX Sub-GHz | 59 |
| RX dual-band | 29 |
| TX 2.4 GHz | 61 |
| TX Sub-GHz | 34 |
| TX dual-band | 12 |

Platform totals at that snapshot are ESP32 145, ESP32-C3 65, ESP32-S3 10, ESP8285 85, and STM32 25. These counts describe only the pinned snapshot and must never be presented as timeless support claims.

## Metadata fields with direct product value

| Field | Product use |
| --- | --- |
| `product_name` | Human device name |
| dotted `vendor.type.device` key | Canonical catalog identifier within a pinned snapshot |
| `platform` | MCU family gate |
| `firmware` | Generic build environment / artifact family |
| `layout_file` + `overlay` | Hardware pins/capabilities injected into Unified Firmware |
| `upload_methods` | Candidate Flash Provider capabilities |
| `min_version` | Catalog/version filtering |
| `prior_target_name` | Controlled legacy-target compatibility alias |
| `features` | Optional UI/capability flags |
| `stlink` | STM32 CPU/offset/bootloader data where applicable |

The upstream validator checks required fields, firmware/platform consistency, TX/RX type consistency, allowed upload methods, layout existence, and hardware pin constraints. We should reuse these concepts, but copying the unlicensed repository code/data is blocked by ADR-0003.

## Runtime evidence surfaces

| Surface | Evidence available | Limits |
| --- | --- | --- |
| Device Web UI `GET /config` | product, target, version, git commit, TX/RX, radio type, bands/domains, UID/config | Self-reported, HTTP/local-network constraints, absent on non-Wi-Fi/old states |
| mDNS `_http._tcp` TXT | vendor=`elrs`, target, product, version, type, device/options | Discoverable on home network but unauthenticated and not reliable on every network/browser |
| RX serial/Betaflight bootloader | Reported current Firmware target; passthrough can compare it | May be missing/legacy; covers Firmware environment more readily than exact retail product |
| ESP bootloader | MCU/chip family | Does not identify the board/target by itself |
| STLink | Debugger and target CPU/flash information | MCU evidence, not exact ExpressLRS product identity |
| USB descriptors | VID/PID/product strings when present | Often describes the USB bridge or MCU, not the RF board |
| Firmware trailer/layout | product/config/layout/prior target when readable | Requires supported read path and validation; may be bare/custom/legacy |
| User selection | Manufacturer/model evidence supplied by user | Must be cross-checked; not automatic proof |

## Confidence model

Detection must preserve facts, provenance, and confidence separately:

| Level | Minimum meaning | Firmware-write policy |
| --- | --- | --- |
| `CONFIRMED` | Two independent compatible signals, including target-specific runtime evidence, agree | Eligible after all other gates |
| `HIGH_CONFIDENCE` | One strong target-specific signal plus matching MCU/type/band/capability evidence | Eligible only for a provider and transition explicitly validated by tests |
| `AMBIGUOUS` | Multiple products/targets remain possible or evidence conflicts | No automatic write |
| `UNKNOWN` | Only generic connection/MCU evidence or no trusted identity | No write |

Examples:

- ESP32 detection alone is `UNKNOWN`, not a Target.
- mDNS target + `/config` target/version/product + matching catalog entry can become `CONFIRMED` after hardware tests establish reliability.
- A bootloader target string matching the candidate Firmware plus a compatible MCU may be `HIGH_CONFIDENCE`, but cannot automatically prove exact manufacturer/model.
- Any conflict between device-reported target and selected artifact is `AMBIGUOUS` or a hard mismatch, never a candidate for guessing.

## Resolver pipeline

```text
Collect evidence
→ normalize identifiers without losing raw values
→ resolve against an immutable catalog snapshot
→ cross-check TX/RX, MCU, radio, band, version, and provider
→ calculate confidence with recorded reasons
→ return candidates or a single resolved target
```

Core returns structured evidence and candidate sets. UI never decides compatibility from labels or Arabic text.

## Catalog strategy

The catalog adapter must consume a content-addressed, license-approved snapshot. It must record repository/source, full SHA, schema version, snapshot hash, and effective application compatibility range. Never fetch `Targets/master` during a sensitive operation.

Because the official release build currently consumes an unpinned Targets checkout, our controlled source baseline must pin Targets independently. The exact snapshot used for the official 4.1.0 release artifact remains unknown until recovered from its workflow run.

## Open validation tasks

- Build a fixture corpus for every evidence source, including spoofed/conflicting values.
- Determine which supported devices expose `/config` and mDNS fields reliably.
- Test bootloader target strings across legacy/current ESP and STM32 paths.
- Establish whether a readable Firmware trailer can safely strengthen identity.
- Verify prior-target alias transitions without enabling arbitrary force flashing.
- Resolve Targets licensing before any redistribution.
