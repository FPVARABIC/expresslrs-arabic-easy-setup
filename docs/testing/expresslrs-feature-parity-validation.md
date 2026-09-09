# Historical failed ExpressLRS TX/RX software parity certification

This file preserves the failed output for candidate
`5b17692eb11d016a4d62db9037d45d306b97943f`; it is not the current branch
status. The historical combined “DFU / ST-Link” claim below was inaccurate:
the current writer implements STM32 ROM DFU/DfuSe only for upstream `dfu`
Targets, while upstream `stlink` means a debug-probe path that remains
unsupported. The old failure tails, including the `lua.zip` lookup, are kept
unchanged as evidence.

- Candidate SHA: `5b17692eb11d016a4d62db9037d45d306b97943f`
- Software certification: `FAIL`
- Test files passed: `UNKNOWN`
- Tests passed: `UNKNOWN`
- Hardware validation: `NONE`
- Stable public hardware writes enabled: `NO`

| Gate | Result |
|---|---|
| Frozen install | `SUCCESS` |
| Implementation matrix | `FAILURE` |
| Formatting | `SUCCESS` |
| Lint | `SUCCESS` |
| TypeScript | `SUCCESS` |
| Policy gates | `FAILURE` |
| Automated tests | `SUCCESS` |
| Live official contracts | `FAILURE` |
| Production build | `SUCCESS` |
| Pages artifact | `FAILURE` |
| Licenses/advisories | `FAILURE` |

## ExpressLRS Web Flasher comparison — TX/RX scope

| Official capability | Implementation |
|---|---|
| Release and branch index | Implemented from official sources |
| Vendor/band/Target catalog | Implemented from official targets archive |
| Binding phrase UID | Implemented |
| Regulatory domains | Implemented with explicit selection |
| TX and RX build options | Implemented and validated |
| Target-specific firmware configuration | Implemented |
| Firmware download | Implemented |
| Target-specific Lua download | Implemented |
| Wi-Fi update | Configured file + local-device handoff |
| Direct UART Espressif | Implemented in software |
| EdgeTX passthrough | Implemented in software |
| Flight-controller passthrough | Implemented in software |
| STM32 XMODEM | Implemented in software |
| STM32 WebUSB DFU / ST-Link path | Implemented in software with page erase and byte read-back |

## Additional safety/product capabilities

- CRSF identity and bounded complete parameter enumeration.
- Device-advertised setting write with exact read-back.
- Settings snapshot and same-device restore.
- TX Bind command and RX Bind transmission without false RF-success claims.
- Mandatory recovery package with per-segment SHA-256.
- Pre-write identity recheck.
- Power and TX-antenna acknowledgements.
- Post-write exact Target and release-version/branch-commit verification.

## Scope boundary

- Backpack and VRX devices remain outside this TX/RX checkpoint.
- Software certification is not physical hardware evidence.

## Failed gate tails

### Implementation matrix

```text
apps/web/src/components/ExpressLrsParityWorkbench.tsx missing downloadLuaScript
apps/web/src/components/ExpressLrsParityWorkbench.tsx missing flashStm32DfuFirmware
apps/web/src/components/ExpressLrsParityWorkbench.tsx missing verifyCurrentIdentity
apps/web/src/components/ExpressLrsParityWorkbench.tsx missing verifyObservedFirmwareBuild
apps/web/src/hardware/firmware-package.ts missing validateFirmwareOptions
apps/web/src/hardware/firmware-package.ts missing actualUncompressedBytes
Missing apps/web/src/hardware/stm32-dfu.ts
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

### Live official contracts

```text

[1m[30m[46m RUN [49m[39m[22m [36mv4.1.11 [39m[90m/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup[39m

 [32m✓[39m [30m[46m web [49m[39m apps/web/src/hardware/official-catalog.live.test.ts [2m([22m[2m1 test[22m[2m)[22m[33m 535[2mms[22m[39m
     [33m[2m✓[22m[39m parses the current official release index and target archive [33m 534[2mms[22m[39m
 [31m❯[39m [30m[46m web [49m[39m apps/web/src/hardware/official-artifacts.live.test.ts [2m([22m[2m1 test[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 566[2mms[22m[39m
[31m     [31m×[31m resolves the current Firmware and Lua archives without consuming them[39m[33m 565[2mms[22m[39m

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
[2m   Start at [22m 23:14:03
[2m   Duration [22m 1.43s[2m (transform 98ms, setup 306ms, import 87ms, tests 1.10s, environment 1.12s)[22m


::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/official-source.ts,title=[web] apps/web/src/hardware/official-artifacts.live.test.ts > live official ExpressLRS release artifacts > resolves the current Firmware and Lua archives without consuming them,line=88,column=9::OfficialSourceError: All official ExpressLRS artifact sources failed: https://expresslrs.github.io/web-flasher/assets/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/lua.zip: HTTP 404 | https://artifactory.expresslrs.org/ExpressLRS/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/lua.zip: HTTP 404%0A ❯ fetchOfficialExpressLrsResource apps/web/src/hardware/official-source.ts:88:9%0A ❯ apps/web/src/hardware/official-artifacts.live.test.ts:20:26%0A%0A⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯%0ASerialized Error: { code: 'NOT_FOUND' }%0A
```

### Pages artifact

```text
$ tsc --noEmit && vite build && node ../../scripts/build-pwa-worker.mjs && node ../../scripts/check-security-headers.mjs --built && node ../../scripts/check-pwa-safety.mjs --built
src/components/ExpressLrsParityWorkbench.tsx(142,5): error TS2345: Argument of type 'ArrayBuffer | SharedArrayBuffer' is not assignable to parameter of type 'BufferSource'.
  Type 'SharedArrayBuffer' is not assignable to type 'BufferSource'.
    Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
      Types of property '[Symbol.toStringTag]' are incompatible.
        Type '"SharedArrayBuffer"' is not assignable to type '"ArrayBuffer"'.
src/hardware/build-verification.ts(51,5): error TS2741: Property 'observedVersion' is missing in type 'Readonly<{ observedCommit: string | null; verified: boolean; expected: string; observed: string; reason: "EXACT_RELEASE" | "BRANCH_VERSION_OBSERVED" | "VERSION_MISMATCH" | "VERSION_UNAVAILABLE"; }>' but required in type 'FirmwareBuildVerificationResult'.
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

### Licenses/advisories

```text
$ pnpm licenses list --recursive --json > dependency-licenses.json
$ node scripts/check-license-policy.mjs
Dependency license policy check failed:
- pako@2.2.0: unapproved license expression (MIT AND Zlib); add evidence-backed exact review or reject the dependency
[ELIFECYCLE] Command failed with exit code 1.
```
