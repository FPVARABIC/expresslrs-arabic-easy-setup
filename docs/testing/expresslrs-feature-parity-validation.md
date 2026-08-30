# ExpressLRS feature-parity validation

- Candidate input SHA: `27ababbcb87649c2474bafe36e02610e4ac90111`
- Overall: `FAIL`
- Hardware observed: `NONE`
- Real RF-link success claimed: `NO`

## Gate results

| Gate | Outcome |
|---|---|
| Install | `SUCCESS` |
| Format | `FAILURE` |
| Lint | `FAILURE` |
| TypeScript | `FAILURE` |
| Policy gates | `SUCCESS` |
| Automated tests | `FAILURE` |
| Live official catalog | `SUCCESS` |
| Production build | `FAILURE` |
| Pages build | `FAILURE` |
| Licenses and advisories | `FAILURE` |

## Implemented TX/RX parity scope

- Official release and Target catalog ingestion.
- Regulatory region/domain separation.
- Target-specific Firmware acquisition and configuration.
- Binding-phrase UID generation.
- TX/RX Firmware options, package hashes, and recovery package.
- CRSF identity, complete parameter enumeration, setting write/read-back, backup/restore, and Bind command.
- Direct Espressif serial flashing.
- EdgeTX and flight-controller serial passthrough.
- STM32 receiver XMODEM-CRC transfer.
- Wi-Fi handoff, Firmware download, and target-specific Lua download.
- Post-write reconnect and exact Target verification.

## Explicit remaining boundaries

- Internal ST-Link/WebUSB writing is not claimed by this checkpoint.
- Backpack and VRX targets are outside the current TX/RX scope.
- Physical success remains pending the first observed reference-device session.

## Failure tails

### Format

```text
[90mpackages/platform-browser/src/local-http-discovery-provider.test.ts[39m 69ms (unchanged)
[90mpackages/platform-browser/src/local-http-discovery-provider.ts[39m 56ms (unchanged)
[90mpackages/platform-browser/src/local-network-permission.test.ts[39m 4ms (unchanged)
[90mpackages/platform-browser/src/local-network-permission.ts[39m 4ms (unchanged)
[90mpackages/platform-mock/package.json[39m 1ms (unchanged)
[90mpackages/platform-mock/src/easy-binding.test.ts[39m 29ms (unchanged)
[90mpackages/platform-mock/src/firmware-update.test.ts[39m 35ms (unchanged)
[90mpackages/platform-mock/src/fixtures.ts[39m 11ms (unchanged)
[90mpackages/platform-mock/src/index.ts[39m 1ms (unchanged)
[90mpackages/platform-mock/src/manual-clock.ts[39m 2ms (unchanged)
[90mpackages/platform-mock/src/mock-discovery-provider.ts[39m 6ms (unchanged)
[90mpackages/platform-mock/src/mock-sensitive-operation-providers.ts[39m 19ms (unchanged)
[90mpackages/platform-mock/src/module-api.test.ts[39m 5ms (unchanged)
[90mpackages/platform-mock/src/read-only-discovery.test.ts[39m 20ms (unchanged)
[90mpackages/platform-mock/src/read-only-module-api.test.ts[39m 10ms (unchanged)
[90mpackages/platform-mock/src/replay-discovery-provider.test.ts[39m 6ms (unchanged)
[90mpackages/platform-mock/src/replay-discovery-provider.ts[39m 5ms (unchanged)
[90mpackages/platform-mock/src/sensitive-operation-fixtures.ts[39m 5ms (unchanged)
[90mpackages/platform-mock/src/synthetic-evidence-policy.ts[39m 2ms (unchanged)
[90mpackages/workflows/package.json[39m 1ms (unchanged)
[90mpackages/workflows/src/bounded-json.test.ts[39m 4ms (unchanged)
[90mpackages/workflows/src/bounded-json.ts[39m 21ms (unchanged)
[90mpackages/workflows/src/easy-binding.ts[39m 10ms (unchanged)
[90mpackages/workflows/src/firmware-acquisition.ts[39m 14ms (unchanged)
[90mpackages/workflows/src/firmware-artifact-bytes.test.ts[39m 7ms (unchanged)
[90mpackages/workflows/src/firmware-artifact-bytes.ts[39m 8ms (unchanged)
[90mpackages/workflows/src/firmware-artifact.test.ts[39m 10ms (unchanged)
[90mpackages/workflows/src/firmware-artifact.ts[39m 8ms (unchanged)
[90mpackages/workflows/src/firmware-build-evidence.ts[39m 34ms (unchanged)
[90mpackages/workflows/src/firmware-catalog-candidate.ts[39m 6ms (unchanged)
[90mpackages/workflows/src/firmware-compressed-artifact.test.ts[39m 25ms (unchanged)
[90mpackages/workflows/src/firmware-compressed-artifact.ts[39m 15ms (unchanged)
[90mpackages/workflows/src/firmware-distribution-candidate.ts[39m 6ms (unchanged)
[90mpackages/workflows/src/firmware-distribution-manifest.test.ts[39m 160ms (unchanged)
[90mpackages/workflows/src/firmware-distribution-manifest.ts[39m 22ms (unchanged)
[90mpackages/workflows/src/firmware-dual-form-manifest.test.ts[39m 52ms (unchanged)
[90mpackages/workflows/src/firmware-dual-form-manifest.ts[39m 15ms (unchanged)
[90mpackages/workflows/src/firmware-manifest.test.ts[39m 16ms (unchanged)
[90mpackages/workflows/src/firmware-manifest.ts[39m 39ms (unchanged)
[90mpackages/workflows/src/firmware-root-metadata.test.ts[39m 46ms (unchanged)
[90mpackages/workflows/src/firmware-root-metadata.ts[39m 63ms (unchanged)
[90mpackages/workflows/src/firmware-source-evidence.ts[39m 60ms (unchanged)
[90mpackages/workflows/src/firmware-trust-internals.ts[39m 6ms (unchanged)
[90mpackages/workflows/src/firmware-trust-state.ts[39m 16ms (unchanged)
[90mpackages/workflows/src/firmware-update-provider-selection.test.ts[39m 8ms (unchanged)
[90mpackages/workflows/src/firmware-update-provider-selection.ts[39m 7ms (unchanged)
[90mpackages/workflows/src/firmware-update.ts[39m 19ms (unchanged)
[90mpackages/workflows/src/index.ts[39m 1ms (unchanged)
[90mpackages/workflows/src/module-api.ts[39m 6ms (unchanged)
[90mpackages/workflows/src/operation-machine.test.ts[39m 10ms (unchanged)
[90mpackages/workflows/src/operation-machine.ts[39m 14ms (unchanged)
[90mpackages/workflows/src/performance-lab.test.ts[39m 12ms (unchanged)
[90mpackages/workflows/src/performance-lab.ts[39m 14ms (unchanged)
[90mpackages/workflows/src/read-only-discovery.ts[39m 11ms (unchanged)
[90mpackages/workflows/src/read-only-module-api.ts[39m 4ms (unchanged)
[90mpackages/workflows/src/sensitive-operation-contracts.ts[39m 4ms (unchanged)
[90mpackages/workflows/src/sensitive-operation-helpers.test.ts[39m 3ms (unchanged)
[90mpackages/workflows/src/sensitive-operation-helpers.ts[39m 11ms (unchanged)
[90mpackages/workflows/src/software-readiness.test.ts[39m 6ms (unchanged)
[90mpackages/workflows/src/software-readiness.ts[39m 5ms (unchanged)
[90mpackages/workflows/src/verification-plan.test.ts[39m 4ms (unchanged)
[90mpackages/workflows/src/verification-plan.ts[39m 7ms (unchanged)
[90mpnpm-workspace.yaml[39m 3ms (unchanged)
[90mprettier.config.mjs[39m 2ms (unchanged)
[90mscripts/build-pwa-worker.mjs[39m 12ms (unchanged)
[90mscripts/check-dependency-boundaries.mjs[39m 21ms (unchanged)
[90mscripts/check-license-policy.mjs[39m 11ms (unchanged)
[90mscripts/check-markdown-links.mjs[39m 12ms (unchanged)
[90mscripts/check-master-plan.mjs[39m 5ms (unchanged)
[90mscripts/check-pages-build.mjs[39m 7ms (unchanged)
[90mscripts/check-pwa-safety.mjs[39m 13ms (unchanged)
[90mscripts/check-security-headers.mjs[39m 8ms (unchanged)
[90mscripts/check-visual-theme.mjs[39m 9ms (unchanged)
[90mtsconfig.base.json[39m 2ms (unchanged)
[90mtsconfig.core-tests.json[39m 1ms (unchanged)
[90mtsconfig.core.json[39m 1ms (unchanged)
[90mtsconfig.json[39m 1ms (unchanged)
[90mvitest.config.ts[39m 2ms (unchanged)
[90mvitest.setup.ts[39m 1ms (unchanged)
[ELIFECYCLE] Command failed with exit code 2.
```

### Lint

```text
$ eslint . --max-warnings=0

/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/xmodem.ts
  85:13  error  'timer' is never reassigned. Use 'const' instead  prefer-const

✖ 1 problem (1 error, 0 warnings)

[ELIFECYCLE] Command failed with exit code 1.
```

### TypeScript

```text
$ tsc --noEmit --project tsconfig.json
apps/web/src/components/ExpressLrsParityWorkbench.tsx(142,5): error TS2345: Argument of type 'ArrayBuffer | SharedArrayBuffer' is not assignable to parameter of type 'BufferSource'.
  Type 'SharedArrayBuffer' is not assignable to type 'BufferSource'.
    Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
      Types of property '[Symbol.toStringTag]' are incompatible.
        Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
apps/web/src/hardware/bind-phrase.test.ts(1,28): error TS2591: Cannot find name 'node:crypto'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
apps/web/src/hardware/esp-flasher.ts(157,9): error TS2367: This comparison appears to be unintentional because the types 'false | undefined' and 'true' have no overlap.
apps/web/src/hardware/firmware-package.test.ts(95,11): error TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BodyInit | null | undefined'.
  Type 'Uint8Array<ArrayBufferLike>' is missing the following properties from type 'URLSearchParams': size, append, delete, get, and 2 more.
apps/web/src/hardware/firmware-package.test.ts(140,32): error TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BodyInit | null | undefined'.
  Type 'Uint8Array<ArrayBufferLike>' is missing the following properties from type 'URLSearchParams': size, append, delete, get, and 2 more.
apps/web/src/hardware/firmware-package.test.ts(176,11): error TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BodyInit | null | undefined'.
  Type 'Uint8Array<ArrayBufferLike>' is missing the following properties from type 'URLSearchParams': size, append, delete, get, and 2 more.
apps/web/src/hardware/firmware-package.ts(530,5): error TS2345: Argument of type 'ArrayBuffer | SharedArrayBuffer' is not assignable to parameter of type 'BufferSource'.
  Type 'SharedArrayBuffer' is not assignable to type 'BufferSource'.
    Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
      Types of property '[Symbol.toStringTag]' are incompatible.
        Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
apps/web/src/hardware/firmware-package.ts(859,26): error TS2322: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'BlobPart'.
  Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'ArrayBufferView<ArrayBuffer>'.
    Types of property 'buffer' are incompatible.
      Type 'ArrayBufferLike' is not assignable to type 'ArrayBuffer'.
        Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
          Types of property '[Symbol.toStringTag]' are incompatible.
            Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
apps/web/src/hardware/official-catalog.live.test.ts(5,17): error TS2591: Cannot find name 'process'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
apps/web/src/hardware/official-catalog.test.ts(96,27): error TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BodyInit | null | undefined'.
  Type 'Uint8Array<ArrayBufferLike>' is missing the following properties from type 'URLSearchParams': size, append, delete, get, and 2 more.
apps/web/src/hardware/recovery-package.test.ts(30,56): error TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BufferSource'.
  Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'ArrayBufferView<ArrayBuffer>'.
    Types of property 'buffer' are incompatible.
      Type 'ArrayBufferLike' is not assignable to type 'ArrayBuffer'.
        Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
          Types of property '[Symbol.toStringTag]' are incompatible.
            Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
apps/web/src/hardware/recovery-package.ts(64,5): error TS2345: Argument of type 'ArrayBuffer | SharedArrayBuffer' is not assignable to parameter of type 'BufferSource'.
  Type 'SharedArrayBuffer' is not assignable to type 'BufferSource'.
    Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
      Types of property '[Symbol.toStringTag]' are incompatible.
        Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
apps/web/src/hardware/xmodem.ts(221,11): error TS2367: This comparison appears to be unintentional because the types 'false | undefined' and 'true' have no overlap.
[ELIFECYCLE] Command failed with exit code 2.
```

### Automated tests

```text
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/6]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[46m web [49m[39m apps/web/src/hardware/recovery-package.test.ts[2m > [22mrecovery package validation[2m > [22maccepts the exact target and verifies every segment hash
[31m[1mRecoveryPackageError[22m: Recovery package does not contain a bounded manifest[39m
[36m [2m❯[22m validateRecoveryPackage apps/web/src/hardware/recovery-package.ts:[2m119:11[22m[39m
    [90m117|[39m   [35mconst[39m manifestBytes [33m=[39m entries[[32m"manifest.json"[39m][33m;[39m
    [90m118|[39m   if (manifestBytes === undefined || manifestBytes.byteLength > 128 * …
    [90m119|[39m     [35mthrow[39m [35mnew[39m [33mRecoveryPackageError[39m(
    [90m   |[39m           [31m^[39m
    [90m120|[39m       [32m"INVALID_MANIFEST"[39m[33m,[39m
    [90m121|[39m       [32m"Recovery package does not contain a bounded manifest"[39m[33m,[39m
[90m [2m❯[22m apps/web/src/hardware/recovery-package.test.ts:[2m70:26[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/6]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[46m web [49m[39m apps/web/src/hardware/recovery-package.test.ts[2m > [22mrecovery package validation[2m > [22mrejects a package for another target before returning flash bytes
[31m[1mAssertionError[22m: expected RecoveryPackageError: Recovery package do… { code: '…' } to match object { code: 'TARGET_MISMATCH' }
(1 matching property omitted from actual)[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- {[39m
[32m-   "code": "TARGET_MISMATCH",[39m
[31m+ RecoveryPackageError {[39m
[31m+   "code": "INVALID_MANIFEST",[39m
[2m  }[22m

[36m [2m❯[22m apps/web/src/hardware/recovery-package.test.ts:[2m92:6[22m[39m
    [90m 90|[39m         expectedTarget[33m:[39m target[33m,[39m
    [90m 91|[39m       })[33m,[39m
    [90m 92|[39m     )[33m.[39mrejects[33m.[39m[34mtoMatchObject[39m({ code[33m:[39m [32m"TARGET_MISMATCH"[39m })[33m;[39m
    [90m   |[39m      [31m^[39m
    [90m 93|[39m   })[33m;[39m
    [90m 94|[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/6]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[46m web [49m[39m apps/web/src/hardware/recovery-package.test.ts[2m > [22mrecovery package validation[2m > [22mrejects a corrupted firmware segment
[31m[1mAssertionError[22m: expected RecoveryPackageError: Recovery package do… { code: '…' } to match object { code: 'HASH_MISMATCH' }
(1 matching property omitted from actual)[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- {[39m
[32m-   "code": "HASH_MISMATCH",[39m
[31m+ RecoveryPackageError {[39m
[31m+   "code": "INVALID_MANIFEST",[39m
[2m  }[22m

[36m [2m❯[22m apps/web/src/hardware/recovery-package.test.ts:[2m101:6[22m[39m
    [90m 99|[39m         expectedTarget[33m:[39m target[33m,[39m
    [90m100|[39m       })[33m,[39m
    [90m101|[39m     )[33m.[39mrejects[33m.[39m[34mtoMatchObject[39m({ code[33m:[39m [32m"HASH_MISMATCH"[39m })[33m;[39m
    [90m   |[39m      [31m^[39m
    [90m102|[39m   })[33m;[39m
    [90m103|[39m })[33m;[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯[22m[39m


[2m Test Files [22m [1m[31m4 failed[39m[22m[2m | [22m[1m[32m57 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (62)[39m
[2m      Tests [22m [1m[31m6 failed[39m[22m[2m | [22m[1m[32m658 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (665)[39m
[2m   Start at [22m 22:37:06
[2m   Duration [22m 18.68s[2m (transform 2.98s, setup 5.25s, import 5.78s, tests 10.15s, environment 22.15s)[22m


::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/firmware-package.ts,title=[web] apps/web/src/hardware/firmware-package.test.ts > official firmware package preparation > extracts only the selected target%2C appends configuration%2C hashes segments%2C and emits recovery,line=255,column=11::FirmwarePackageError: The selected hardware layout is not valid bounded JSON%0A ❯ parseLayout apps/web/src/hardware/firmware-package.ts:255:11%0A ❯ targetLayout apps/web/src/hardware/firmware-package.ts:569:14%0A ❯ prepareOfficialFirmwarePackage apps/web/src/hardware/firmware-package.ts:736:19%0A ❯ apps/web/src/hardware/firmware-package.test.ts:101:22%0A%0A⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯%0ASerialized Error: { code: 'INVALID_FIRMWARE' }%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/lua-package.ts,title=[web] apps/web/src/hardware/lua-package.test.ts > official Lua script acquisition > returns only the exact target-declared script,line=100,column=11::LuaPackageError: Expected one example.lua script, found 0%0A ❯ acquireOfficialLuaScript apps/web/src/hardware/lua-package.ts:100:11%0A ❯ apps/web/src/hardware/lua-package.test.ts:45:20%0A%0A⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯%0ASerialized Error: { code: 'SCRIPT_NOT_FOUND' }%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/official-catalog.ts,title=[web] apps/web/src/hardware/official-catalog.test.ts > official ExpressLRS catalog > loads the index and the single targets.json from bounded responses,line=374,column=11::OfficialCatalogError: Official hardware archive does not contain one unambiguous targets.json%0A ❯ targetJsonFromHardwareArchive apps/web/src/hardware/official-catalog.ts:374:11%0A ❯ loadOfficialExpressLrsCatalog apps/web/src/hardware/official-catalog.ts:422:15%0A ❯ apps/web/src/hardware/official-catalog.test.ts:99:21%0A%0A⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯%0ASerialized Error: { code: 'ARCHIVE' }%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/recovery-package.ts,title=[web] apps/web/src/hardware/recovery-package.test.ts > recovery package validation > accepts the exact target and verifies every segment hash,line=119,column=11::RecoveryPackageError: Recovery package does not contain a bounded manifest%0A ❯ validateRecoveryPackage apps/web/src/hardware/recovery-package.ts:119:11%0A ❯ apps/web/src/hardware/recovery-package.test.ts:70:26%0A%0A⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯%0ASerialized Error: { code: 'INVALID_MANIFEST' }%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/recovery-package.test.ts,title=[web] apps/web/src/hardware/recovery-package.test.ts > recovery package validation > rejects a package for another target before returning flash bytes,line=92,column=6::AssertionError: expected RecoveryPackageError: Recovery package do… { code: '…' } to match object { code: 'TARGET_MISMATCH' }%0A(1 matching property omitted from actual)%0A%0A- Expected%0A+ Received%0A%0A- {%0A-   "code": "TARGET_MISMATCH",%0A+ RecoveryPackageError {%0A+   "code": "INVALID_MANIFEST",%0A  }%0A%0A ❯ apps/web/src/hardware/recovery-package.test.ts:92:6%0A%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/recovery-package.test.ts,title=[web] apps/web/src/hardware/recovery-package.test.ts > recovery package validation > rejects a corrupted firmware segment,line=101,column=6::AssertionError: expected RecoveryPackageError: Recovery package do… { code: '…' } to match object { code: 'HASH_MISMATCH' }%0A(1 matching property omitted from actual)%0A%0A- Expected%0A+ Received%0A%0A- {%0A-   "code": "HASH_MISMATCH",%0A+ RecoveryPackageError {%0A+   "code": "INVALID_MANIFEST",%0A  }%0A%0A ❯ apps/web/src/hardware/recovery-package.test.ts:101:6%0A%0A
[ELIFECYCLE] Test failed. See above for more details.
```

### Production build

```text
$ pnpm --recursive --if-present run build
Scope: 9 of 10 workspace projects
apps/web build$ tsc --noEmit && vite build && node ../../scripts/build-pwa-worker.mjs && node ../../scripts/check-security-headers.mjs --built && node ../../scripts/check-pwa-safety.mjs --built
apps/web build: src/components/ExpressLrsParityWorkbench.tsx(142,5): error TS2345: Argument of type 'ArrayBuffer | SharedArrayBuffer' is not assignable to parameter of type 'BufferSource'.
apps/web build:   Type 'SharedArrayBuffer' is not assignable to type 'BufferSource'.
apps/web build:     Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
apps/web build:       Types of property '[Symbol.toStringTag]' are incompatible.
apps/web build:         Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
apps/web build: src/hardware/esp-flasher.ts(157,9): error TS2367: This comparison appears to be unintentional because the types 'false | undefined' and 'true' have no overlap.
apps/web build: src/hardware/firmware-package.ts(530,5): error TS2345: Argument of type 'ArrayBuffer | SharedArrayBuffer' is not assignable to parameter of type 'BufferSource'.
apps/web build:   Type 'SharedArrayBuffer' is not assignable to type 'BufferSource'.
apps/web build:     Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
apps/web build:       Types of property '[Symbol.toStringTag]' are incompatible.
apps/web build:         Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
apps/web build: src/hardware/firmware-package.ts(859,26): error TS2322: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'BlobPart'.
apps/web build:   Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'ArrayBufferView<ArrayBuffer>'.
apps/web build:     Types of property 'buffer' are incompatible.
apps/web build:       Type 'ArrayBufferLike' is not assignable to type 'ArrayBuffer'.
apps/web build:         Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
apps/web build:           Types of property '[Symbol.toStringTag]' are incompatible.
apps/web build:             Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
apps/web build: src/hardware/recovery-package.ts(64,5): error TS2345: Argument of type 'ArrayBuffer | SharedArrayBuffer' is not assignable to parameter of type 'BufferSource'.
apps/web build:   Type 'SharedArrayBuffer' is not assignable to type 'BufferSource'.
apps/web build:     Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
apps/web build:       Types of property '[Symbol.toStringTag]' are incompatible.
apps/web build:         Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
apps/web build: src/hardware/xmodem.ts(221,11): error TS2367: This comparison appears to be unintentional because the types 'false | undefined' and 'true' have no overlap.
apps/web build: Failed
/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @elrs-easy/web@0.0.0 build: `tsc --noEmit && vite build && node ../../scripts/build-pwa-worker.mjs && node ../../scripts/check-security-headers.mjs --built && node ../../scripts/check-pwa-safety.mjs --built`
Exit status 2
[ELIFECYCLE] Command failed with exit code 2.
```

### Pages build

```text
$ tsc --noEmit && vite build && node ../../scripts/build-pwa-worker.mjs && node ../../scripts/check-security-headers.mjs --built && node ../../scripts/check-pwa-safety.mjs --built
src/components/ExpressLrsParityWorkbench.tsx(142,5): error TS2345: Argument of type 'ArrayBuffer | SharedArrayBuffer' is not assignable to parameter of type 'BufferSource'.
  Type 'SharedArrayBuffer' is not assignable to type 'BufferSource'.
    Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
      Types of property '[Symbol.toStringTag]' are incompatible.
        Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
src/hardware/esp-flasher.ts(157,9): error TS2367: This comparison appears to be unintentional because the types 'false | undefined' and 'true' have no overlap.
src/hardware/firmware-package.ts(530,5): error TS2345: Argument of type 'ArrayBuffer | SharedArrayBuffer' is not assignable to parameter of type 'BufferSource'.
  Type 'SharedArrayBuffer' is not assignable to type 'BufferSource'.
    Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
      Types of property '[Symbol.toStringTag]' are incompatible.
        Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
src/hardware/firmware-package.ts(859,26): error TS2322: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'BlobPart'.
  Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'ArrayBufferView<ArrayBuffer>'.
    Types of property 'buffer' are incompatible.
      Type 'ArrayBufferLike' is not assignable to type 'ArrayBuffer'.
        Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
          Types of property '[Symbol.toStringTag]' are incompatible.
            Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
src/hardware/recovery-package.ts(64,5): error TS2345: Argument of type 'ArrayBuffer | SharedArrayBuffer' is not assignable to parameter of type 'BufferSource'.
  Type 'SharedArrayBuffer' is not assignable to type 'BufferSource'.
    Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
      Types of property '[Symbol.toStringTag]' are incompatible.
        Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
src/hardware/xmodem.ts(221,11): error TS2367: This comparison appears to be unintentional because the types 'false | undefined' and 'true' have no overlap.
/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @elrs-easy/web@0.0.0 build: `tsc --noEmit && vite build && node ../../scripts/build-pwa-worker.mjs && node ../../scripts/check-security-headers.mjs --built && node ../../scripts/check-pwa-safety.mjs --built`
Exit status 2
```

### Licenses and advisories

```text
$ pnpm licenses list --recursive --json > dependency-licenses.json
$ node scripts/check-license-policy.mjs
Dependency license policy check failed:
- pako@2.2.0: unapproved license expression (MIT AND Zlib); add evidence-backed exact review or reject the dependency
[ELIFECYCLE] Command failed with exit code 1.
```

