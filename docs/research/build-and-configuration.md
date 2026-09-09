# Build and Configuration Trace

Baseline: ExpressLRS 4.1.0 at `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6`.

## Source-to-artifact trace

```text
Firmware source + PlatformIO environment
→ target class (TX/RX, MCU, radio, upload method)
→ user/super defines
→ build_flags.py validation and option extraction
→ PlatformIO compile/link
→ UnifiedConfiguration hardware/product trailer
→ platform-specific artifact(s)
→ artifact validation, hash, and provenance
```

## Build selection

- `src/platformio.ini` imports target-environment files under `src/targets/`.
- `src/targets/common.ini` defines common TX/RX flags, radio-family flags, MCU platforms, libraries, and build scripts.
- Environment names encode the generic Firmware class and upload route; `TARGET_TX` or `TARGET_RX` selects the main program.
- The selected hardware product is a dotted `board_config` reference into `hardware/targets.json`, whose entry provides platform, generic Firmware environment, layout, and supported upload methods.

## Configuration injection

`src/python/build_flags.py` reads `user_defines.txt`, then `super_defines.txt` as an override. It:

- validates radio/regulatory combinations;
- converts `MY_BINDING_PHRASE` into a six-byte MD5-derived `MY_UID`;
- extracts runtime options such as Wi-Fi, UART baud, telemetry interval, fan runtime, and lock-on-first-connection;
- adds a random `flash-discriminator`;
- embeds short git commit/version and normalized target name build flags.

`src/python/UnifiedConfiguration.py` runs as a post-build action for Unified targets. It appends:

- product name;
- Lua/device name;
- serialized non-hardware options;
- merged hardware layout and target overlay;
- optional logo;
- prior target name where defined.

The device Firmware then reads these embedded options/layout at runtime. Runtime Web UI settings may override some values, while a later Firmware flash can overwrite them; the workflow must preview which source wins.

## Prebuilt-binary path

`src/python/binary_configurator.py` can take an upstream binary, resolve a catalog target, inject the same style of options/hardware configuration, generate the platform-specific output, and optionally invoke an upload provider.

Configurator 1.8.3 has two orchestration strategies:

- `PlatformioFlashingStrategy`: fetches a selected tag/branch/commit/local source, writes user defines, and builds/flashes through PlatformIO.
- `BinaryFlashingStrategy`: downloads commit-keyed prebuilt bundles, patches them through the binary configurator, and flashes or emits a binary.

Its `FlashingStrategyLocator` is a useful architectural concept: select a compatible provider outside UI components. The implementation remains desktop-specific and GPL-governed; it is not directly browser-portable.

## Platform artifact shapes

| Platform | Typical relevant outputs |
| --- | --- |
| ESP8285 | `firmware.bin`, Wi-Fi `firmware.bin.gz`, sometimes `firmware.elrs` |
| ESP32 family | application `firmware.bin` plus bootloader, partitions, and `boot_app0` for direct serial flash |
| STM32/legacy | target-specific binary/bootloader route including STLink or XMODEM where supported |

Exact shape and offsets belong to the resolved target/provider capability; UI must not hard-code one universal file layout.

## Existing useful provenance

Firmware embeds version, short commit, target name, product, options, and layout. This helps identification but does not identify every build input. Our build result must additionally record full SHAs, exact Targets snapshot, patch set, toolchain/container digest, dependency lock, non-secret options, artifact SHA-256, and validation level.

## Reproducibility gaps

The official 4.1.0 workflow and local bootstrap can resolve Targets without an immutable ref, and the release workflow uses mutable tool/runner inputs. Therefore:

- source SHA alone is not a reproducible-build identity;
- official artifact baseline and controlled source baseline must remain separate;
- our build service must pin every input and set `dirty_tree=false` before Release;
- repeat-build comparison is a required later spike.

## Proposed Build Service boundary

```text
resolveSource()
resolveTarget()
validateBuildOptions()
materializePinnedInputs()
applyPatchSet()
build()
collectMetadata()
validateArtifact()
hashArtifact()
emitProvenance()
```

No implementation is started in Milestone 0.
