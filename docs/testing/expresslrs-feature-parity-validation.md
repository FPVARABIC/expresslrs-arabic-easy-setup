# Final authoritative ExpressLRS TX/RX parity report

- Input SHA: `f00ec95e390c0ce3f6bbd1d873ad6f1d4e7cfc3d`
- Software result: `FAIL`
- Test files passed: `UNKNOWN`
- Tests passed: `UNKNOWN`
- Hardware validation: `NONE`
- Stable Pages real writes enabled: `NO`

| Gate | Outcome |
|---|---|
| Install | `SUCCESS` |
| Implementation wiring | `FAILURE` |
| Format | `FAILURE` |
| Lint | `SUCCESS` |
| TypeScript | `SUCCESS` |
| Policy gates | `FAILURE` |
| Automated tests | `SUCCESS` |
| Live official sources | `FAILURE` |
| Production build | `SUCCESS` |
| Pages build | `FAILURE` |
| Licenses and advisories | `FAILURE` |

## Official ExpressLRS comparison

| Capability | This checkpoint |
|---|---|
| Releases / branches | Implemented from official index |
| Vendors / bands / Targets | Implemented from official targets archive |
| Binding phrase UID | Implemented |
| Regulatory domains | Implemented with explicit user selection |
| TX and RX build options | Implemented and validated before acquisition |
| Target Firmware generation | Implemented with bounded extraction and SHA-256 |
| Firmware / recovery downloads | Implemented |
| Target-specific Lua | Implemented |
| Direct UART / Espressif | Implemented in software |
| EdgeTX passthrough | Implemented in software |
| Flight-controller passthrough | Implemented in software |
| STM32 XMODEM | Implemented in software |
| Wi-Fi path | Official-style download and local-device handoff |
| CRSF settings and backup/restore | Implemented; additional to Web Flasher |
| Bind command | Implemented; RF link still requires physical observation |
| Recovery checkpoint | Implemented; additional fail-closed gate |
| Reconnect verification | Requires exact Target and expected version |
| Internal ST-Link/WebUSB | Not yet claimed |
| Backpack / VRX | Outside current TX/RX scope |

## Evidence boundary

A software PASS proves formatting, static analysis, protocol/unit tests, live official-source contracts, production builds, Pages artifact checks, licenses, and dependency advisory gates. It does not prove a physical write on a commercial Target.

## Failure tails

### Implementation wiring

```text
apps/web/src/components/ExpressLrsParityWorkbench.tsx missing verifyCurrentIdentity
apps/web/src/components/ExpressLrsParityWorkbench.tsx missing verifyObservedFirmwareVersion
apps/web/src/components/ExpressLrsParityWorkbench.tsx missing downloadLuaScript
apps/web/src/components/ExpressLrsParityWorkbench.tsx missing ثبات الطاقة أثناء التفليش
apps/web/src/hardware/firmware-package.ts missing validateFirmwareOptions
apps/web/src/hardware/firmware-package.ts missing actualUncompressedBytes
apps/web/src/hardware/session.ts missing verifyCurrentIdentity
```

### Format

```text
[90mpackages/device/src/platform-readiness.ts[39m 8ms (unchanged)
[90mpackages/device/src/provider-boundary.test.ts[39m 20ms (unchanged)
[90mpackages/device/src/provider-boundary.ts[39m 24ms (unchanged)
[90mpackages/device/src/session.test.ts[39m 5ms (unchanged)
[90mpackages/device/src/session.ts[39m 5ms (unchanged)
[90mpackages/diagnostics/package.json[39m 1ms (unchanged)
[90mpackages/diagnostics/src/index.ts[39m 1ms (unchanged)
[90mpackages/diagnostics/src/read-only-health-adapter.test.ts[39m 8ms (unchanged)
[90mpackages/diagnostics/src/read-only-health-adapter.ts[39m 9ms (unchanged)
[90mpackages/diagnostics/src/read-only-health.test.ts[39m 13ms (unchanged)
[90mpackages/diagnostics/src/read-only-health.ts[39m 14ms (unchanged)
[90mpackages/diagnostics/src/read-only-report.test.ts[39m 17ms (unchanged)
[90mpackages/diagnostics/src/read-only-report.ts[39m 25ms (unchanged)
[90mpackages/domain/package.json[39m 1ms (unchanged)
[90mpackages/domain/src/audit.test.ts[39m 12ms (unchanged)
[90mpackages/domain/src/audit.ts[39m 18ms (unchanged)
[90mpackages/domain/src/cancellation.ts[39m 1ms (unchanged)
[90mpackages/domain/src/device.ts[39m 2ms (unchanged)
[90mpackages/domain/src/errors.test.ts[39m 4ms (unchanged)
[90mpackages/domain/src/errors.ts[39m 4ms (unchanged)
[90mpackages/domain/src/firmware.test.ts[39m 3ms (unchanged)
[90mpackages/domain/src/firmware.ts[39m 34ms (unchanged)
[90mpackages/domain/src/identity.test.ts[39m 3ms (unchanged)
[90mpackages/domain/src/identity.ts[39m 7ms (unchanged)
[90mpackages/domain/src/index.ts[39m 1ms (unchanged)
[90mpackages/domain/src/operation.ts[39m 2ms (unchanged)
[90mpackages/i18n/package.json[39m 1ms (unchanged)
[90mpackages/i18n/src/errors.ts[39m 1ms (unchanged)
[90mpackages/i18n/src/i18n.test.ts[39m 4ms (unchanged)
[90mpackages/i18n/src/index.ts[39m 3ms (unchanged)
[90mpackages/i18n/src/locales/ar.ts[39m 9ms (unchanged)
[90mpackages/i18n/src/locales/en.ts[39m 7ms (unchanged)
[90mpackages/i18n/src/network.test.ts[39m 5ms (unchanged)
[90mpackages/i18n/src/network.ts[39m 3ms (unchanged)
[90mpackages/i18n/tsconfig.json[39m 1ms (unchanged)
[90mpackages/platform-browser/package.json[39m 1ms (unchanged)
[90mpackages/platform-browser/src/firmware-artifact-crypto.test.ts[39m 12ms (unchanged)
[90mpackages/platform-browser/src/firmware-artifact-crypto.ts[39m 6ms (unchanged)
[90mpackages/platform-browser/src/firmware-artifact-decompression.ts[39m 8ms (unchanged)
[90mpackages/platform-browser/src/index.ts[39m 1ms (unchanged)
[90mpackages/platform-browser/src/local-http-discovery-provider.test.ts[39m 79ms (unchanged)
[90mpackages/platform-browser/src/local-http-discovery-provider.ts[39m 65ms (unchanged)
[90mpackages/platform-browser/src/local-network-permission.test.ts[39m 4ms (unchanged)
[90mpackages/platform-browser/src/local-network-permission.ts[39m 6ms (unchanged)
[90mpackages/platform-mock/package.json[39m 1ms (unchanged)
[90mpackages/platform-mock/src/easy-binding.test.ts[39m 33ms (unchanged)
[90mpackages/platform-mock/src/firmware-update.test.ts[39m 43ms (unchanged)
[90mpackages/platform-mock/src/fixtures.ts[39m 11ms (unchanged)
[90mpackages/platform-mock/src/index.ts[39m 1ms (unchanged)
[90mpackages/platform-mock/src/manual-clock.ts[39m 2ms (unchanged)
[90mpackages/platform-mock/src/mock-discovery-provider.ts[39m 4ms (unchanged)
[90mpackages/platform-mock/src/mock-sensitive-operation-providers.ts[39m 19ms (unchanged)
[90mpackages/platform-mock/src/module-api.test.ts[39m 5ms (unchanged)
[90mpackages/platform-mock/src/read-only-discovery.test.ts[39m 24ms (unchanged)
[90mpackages/platform-mock/src/read-only-module-api.test.ts[39m 14ms (unchanged)
[90mpackages/platform-mock/src/replay-discovery-provider.test.ts[39m 8ms (unchanged)
[90mpackages/platform-mock/src/replay-discovery-provider.ts[39m 5ms (unchanged)
[90mpackages/platform-mock/src/sensitive-operation-fixtures.ts[39m 5ms (unchanged)
[90mpackages/platform-mock/src/synthetic-evidence-policy.ts[39m 2ms (unchanged)
[90mpackages/workflows/package.json[39m 1ms (unchanged)
[90mpackages/workflows/src/bounded-json.test.ts[39m 4ms (unchanged)
[90mpackages/workflows/src/bounded-json.ts[39m 21ms (unchanged)
[90mpackages/workflows/src/easy-binding.ts[39m 20ms (unchanged)
[90mpackages/workflows/src/firmware-acquisition.ts[39m 23ms (unchanged)
[90mpackages/workflows/src/firmware-artifact-bytes.test.ts[39m 7ms (unchanged)
[90mpackages/workflows/src/firmware-artifact-bytes.ts[39m 7ms (unchanged)
[90mpackages/workflows/src/firmware-artifact.test.ts[39m 9ms (unchanged)
[90mpackages/workflows/src/firmware-artifact.ts[39m 10ms (unchanged)
[90mpackages/workflows/src/firmware-build-evidence.ts[39m 44ms (unchanged)
[90mpackages/workflows/src/firmware-catalog-candidate.ts[39m 9ms (unchanged)
[90mpackages/workflows/src/firmware-compressed-artifact.test.ts[39m 25ms (unchanged)
[90mpackages/workflows/src/firmware-compressed-artifact.ts[39m 14ms (unchanged)
[90mpackages/workflows/src/firmware-distribution-candidate.ts[39m 11ms (unchanged)
[90mpackages/workflows/src/firmware-distribution-manifest.test.ts[39m 169ms (unchanged)
[90mpackages/workflows/src/firmware-distribution-manifest.ts[39m 23ms (unchanged)
[90mpackages/workflows/src/firmware-dual-form-manifest.test.ts[39m 49ms (unchanged)
[90mpackages/workflows/src/firmware-dual-form-manifest.ts[39m 27ms (unchanged)
[90mpackages/workflows/src/firmware-manifest.test.ts[39m 25ms (unchanged)
[90mpackages/workflows/src/firmware-manifest.ts[39m 25ms (unchanged)
[90mpackages/workflows/src/firmware-root-metadata.test.ts[39m 55ms (unchanged)
[90mpackages/workflows/src/firmware-root-metadata.ts[39m 72ms (unchanged)
[90mpackages/workflows/src/firmware-source-evidence.ts[39m 65ms (unchanged)
[90mpackages/workflows/src/firmware-trust-internals.ts[39m 12ms (unchanged)
[90mpackages/workflows/src/firmware-trust-state.ts[39m 31ms (unchanged)
[90mpackages/workflows/src/firmware-update-provider-selection.test.ts[39m 8ms (unchanged)
[90mpackages/workflows/src/firmware-update-provider-selection.ts[39m 5ms (unchanged)
[90mpackages/workflows/src/firmware-update.ts[39m 29ms (unchanged)
[90mpackages/workflows/src/index.ts[39m 1ms (unchanged)
[90mpackages/workflows/src/module-api.ts[39m 6ms (unchanged)
[90mpackages/workflows/src/operation-machine.test.ts[39m 9ms (unchanged)
[90mpackages/workflows/src/operation-machine.ts[39m 15ms (unchanged)
[90mpackages/workflows/src/performance-lab.test.ts[39m 21ms (unchanged)
[90mpackages/workflows/src/performance-lab.ts[39m 13ms (unchanged)
[90mpackages/workflows/src/read-only-discovery.ts[39m 7ms (unchanged)
[90mpackages/workflows/src/read-only-module-api.ts[39m 4ms (unchanged)
[90mpackages/workflows/src/sensitive-operation-contracts.ts[39m 4ms (unchanged)
[90mpackages/workflows/src/sensitive-operation-helpers.test.ts[39m 6ms (unchanged)
[90mpackages/workflows/src/sensitive-operation-helpers.ts[39m 16ms (unchanged)
[90mpackages/workflows/src/software-readiness.test.ts[39m 6ms (unchanged)
[90mpackages/workflows/src/software-readiness.ts[39m 5ms (unchanged)
[90mpackages/workflows/src/verification-plan.test.ts[39m 4ms (unchanged)
[90mpackages/workflows/src/verification-plan.ts[39m 7ms (unchanged)
[90mpnpm-workspace.yaml[39m 3ms (unchanged)
[90mprettier.config.mjs[39m 2ms (unchanged)
[90mscripts/build-pwa-worker.mjs[39m 11ms (unchanged)
[90mscripts/check-dependency-boundaries.mjs[39m 21ms (unchanged)
[90mscripts/check-license-policy.mjs[39m 11ms (unchanged)
[90mscripts/check-markdown-links.mjs[39m 12ms (unchanged)
[90mscripts/check-master-plan.mjs[39m 6ms (unchanged)
[90mscripts/check-pages-build.mjs[39m 6ms (unchanged)
[90mscripts/check-pwa-safety.mjs[39m 11ms (unchanged)
[90mscripts/check-security-headers.mjs[39m 8ms (unchanged)
[90mscripts/check-visual-theme.mjs[39m 4ms (unchanged)
[90mtsconfig.base.json[39m 1ms (unchanged)
[90mtsconfig.core-tests.json[39m 1ms (unchanged)
[90mtsconfig.core.json[39m 1ms (unchanged)
[90mtsconfig.json[39m 1ms (unchanged)
[90mvitest.config.ts[39m 3ms (unchanged)
[90mvitest.setup.ts[39m 1ms (unchanged)
[ELIFECYCLE] Command failed with exit code 2.
```

### Policy gates

```text
$ node scripts/check-dependency-boundaries.mjs
Dependency boundaries verified for 9 workspace packages.
$ node scripts/check-security-headers.mjs
Browser security headers verified.
$ node scripts/check-pwa-safety.mjs
PWA safety policy verified.
$ node scripts/check-visual-theme.mjs
Cairo and FPV-ARBCON-aligned Web/PWA visual theme policy verified.
$ node scripts/check-markdown-links.mjs
Verified 121 local links across 69 Markdown files.
$ node scripts/check-master-plan.mjs
Verified MASTER_PLAN.md headings 1–449 in order and END OF MASTER PLAN.
undefined
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command "check:real-hardware-primary" not found

Did you mean "pnpm check:pwa-safety"?
```

### Live official sources

```text

[1m[30m[46m RUN [49m[39m[22m [36mv4.1.11 [39m[90m/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup[39m

 [32m✓[39m [30m[46m web [49m[39m apps/web/src/hardware/official-catalog.live.test.ts [2m([22m[2m1 test[22m[2m)[22m[33m 780[2mms[22m[39m
     [33m[2m✓[22m[39m parses the current official release index and target archive [33m 778[2mms[22m[39m
 [31m❯[39m [30m[46m web [49m[39m apps/web/src/hardware/official-artifacts.live.test.ts [2m([22m[2m1 test[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 1584[2mms[22m[39m
[31m     [31m×[31m resolves the current Firmware and Lua archives without consuming them[39m[33m 1582[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m [30m[46m web [49m[39m apps/web/src/hardware/official-artifacts.live.test.ts[2m > [22mlive official ExpressLRS release artifacts[2m > [22mresolves the current Firmware and Lua archives without consuming them
[31m[1mOfficialSourceError[22m: All official ExpressLRS artifact sources failed: https://expresslrs.github.io/web-flasher/assets/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/lua.zip: HTTP 404 | https://artifactory.expresslrs.org/ExpressLRS/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/lua.zip: HTTP 404[39m
[36m [2m❯[22m fetchOfficialExpressLrsResource apps/web/src/hardware/official-source.ts:[2m88:9[22m[39m
    [90m 86|[39m     }
    [90m 87|[39m   }
    [90m 88|[39m   [35mthrow[39m [35mnew[39m [33mOfficialSourceError[39m(
    [90m   |[39m         [31m^[39m
    [90m 89|[39m     failures[33m.[39m[34msome[39m((failure) [33m=>[39m [36m/HTTP 404\b/u[39m[33m.[39m[34mtest[39m(failure))
    [90m 90|[39m       [33m?[39m [32m"NOT_FOUND"[39m
[90m [2m❯[22m apps/web/src/hardware/official-artifacts.live.test.ts:[2m20:26[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m1 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m1 passed[39m[22m[90m (2)[39m
[2m   Start at [22m 22:58:57
[2m   Duration [22m 2.75s[2m (transform 125ms, setup 434ms, import 116ms, tests 2.36s, environment 1.45s)[22m


::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/official-source.ts,title=[web] apps/web/src/hardware/official-artifacts.live.test.ts > live official ExpressLRS release artifacts > resolves the current Firmware and Lua archives without consuming them,line=88,column=9::OfficialSourceError: All official ExpressLRS artifact sources failed: https://expresslrs.github.io/web-flasher/assets/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/lua.zip: HTTP 404 | https://artifactory.expresslrs.org/ExpressLRS/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/lua.zip: HTTP 404%0A ❯ fetchOfficialExpressLrsResource apps/web/src/hardware/official-source.ts:88:9%0A ❯ apps/web/src/hardware/official-artifacts.live.test.ts:20:26%0A%0A⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯%0ASerialized Error: { code: 'NOT_FOUND' }%0A
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
src/hardware/official-source.ts(82,11): error TS2367: This comparison appears to be unintentional because the types 'false | undefined' and 'true' have no overlap.
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

