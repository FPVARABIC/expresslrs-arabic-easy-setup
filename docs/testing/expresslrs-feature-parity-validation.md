# ExpressLRS TX/RX software certification

- Candidate SHA: `c05de659c1ac2bec300b0ab030e08ab2b27c03ea`
- Software certification: `FAIL`
- Test files passed: `UNKNOWN`
- Tests passed: `UNKNOWN`
- Hardware validation: `NONE`
- Physical RF bind proven: `NO`
- Stable public writes enabled: `NO`

| Gate | Result |
|---|---|
| Frozen install | `SUCCESS` |
| Formatting | `FAILURE` |
| Lint | `FAILURE` |
| TypeScript | `FAILURE` |
| Policy gates | `FAILURE` |
| Automated tests | `FAILURE` |
| Live official artifacts | `FAILURE` |
| Production build | `FAILURE` |
| Pages artifact | `FAILURE` |
| Licenses and advisories | `FAILURE` |

## Feature comparison with official ExpressLRS Web Flasher

| Feature | Status |
|---|---|
| Official releases and branches | Implemented |
| Official vendors, bands, and TX/RX Targets | Implemented |
| Regulatory domains | Implemented with explicit selection |
| Binding phrase UID | Implemented |
| TX options | Implemented |
| RX options | Implemented |
| Target-specific Firmware generation | Implemented |
| Firmware and recovery download | Implemented |
| Target-specific Lua | Implemented |
| Direct UART / Espressif | Software implemented |
| EdgeTX passthrough | Software implemented |
| Flight-controller passthrough | Software implemented |
| STM32 XMODEM | Software implemented |
| Wi-Fi update | Prepared image + local-device handoff |
| CRSF settings write/read-back | Implemented |
| Settings backup and restore | Implemented |
| Bind | Implemented; RF result still needs physical observation |
| Recovery checkpoint and package | Implemented |
| Post-write Target + version/commit verification | Implemented |
| Internal ST-Link/WebUSB | Not certified in this candidate |
| Backpack / VRX | Outside current TX/RX scope |

## Failed gate tails

### Formatting

```text
$ prettier --check .
Checking formatting...
[[31merror[39m] .github/workflows/m2-parity-authoritative.yml: SyntaxError: All mapping items must start at the same column (119:1)
[[31merror[39m]   117 |           text, count = direct_fetch.subn(
[[31merror[39m]   118 |               '''    const response = await fetchOfficialExpressLrsResource({
[[31merror[39m] > 119 |       path: input.path,
[[31merror[39m]       | ^
[[31merror[39m]   120 |       signal: bridge.signal,
[[31merror[39m]   121 |       ...(input.fetchImplementation === undefined
[[31merror[39m]   122 |         ? {}
[[31merror[39m] .github/workflows/m2-parity-green-v1.yml: SyntaxError: Nested mappings are not allowed in compact mappings (111:25)
[[31merror[39m]   109 |   readonly signal?: AbortSignal;
[[31merror[39m]   110 |   readonly fetchImplementation?: typeof fetch;
[[31merror[39m] > 111 |   readonly onProgress?: (received: number, total: number | null) => void;
[[31merror[39m]       |                         ^
[[31merror[39m]   112 | }): Promise<Uint8Array> {
[[31merror[39m]   113 |   const bridge = abortBridge(input.signal, 45_000);
[[31merror[39m]   114 |   try {
[[31merror[39m] .github/workflows/m2-parity-normalize.yml: SyntaxError: Implicit keys need to be on a single line (71:1)
[[31merror[39m]   69 |           if 'parseOfficialReleaseIndexFlexible' not in text:
[[31merror[39m]   70 |               insertion = '''import { parseOfficialReleaseIndexFlexible } from "./official-index";
[[31merror[39m] > 71 | import { parseOfficialTargetsFlexible } from "./official-target-index";
[[31merror[39m]      | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
[[31merror[39m] > 72 | '''
[[31merror[39m]      | ^^^
[[31merror[39m] > 73 |               marker = 'import type {\n'
[[31merror[39m]      | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
[[31merror[39m] > 74 |               index = text.find(marker)
[[31merror[39m]      | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
[[31merror[39m] > 75 |               if index < 0:
[[31merror[39m]      | ^^^^^^^^^^^^^^^^^^^^^^^^^^
[[31merror[39m]   76 |                   raise SystemExit('Official catalog import marker is missing')
[[31merror[39m]   77 |               text = text[:index] + insertion + text[index:]
[[31merror[39m]   78 |           text = text.replace(
[[31merror[39m] .github/workflows/m2-parity-repair-v2.yml: SyntaxError: All mapping items must start at the same column (83:1)
[[31merror[39m]   81 |           text = path.read_text(encoding='utf-8')
[[31merror[39m]   82 |           old = '''    while (Date.now() < handshakeDeadline) {
[[31merror[39m] > 83 |       const byte = await inbox.next({ timeoutMs: 1_000, signal: input.signal });
[[31merror[39m]      | ^
[[31merror[39m]   84 |       if (byte === CRC_REQUEST || byte === NAK) {
[[31merror[39m]   85 |         handshake = byte;
[[31merror[39m]   86 |         break;
[[31merror[39m] .github/workflows/m2-parity-repair-v3.yml: SyntaxError: Implicit keys need to be on a single line (97:5)
[[31merror[39m]    95 |               handler_marker = '  function downloadRecovery() {\n'
[[31merror[39m]    96 |               handler = '''  async function downloadLuaScript() {
[[31merror[39m] >  97 |     if (
[[31merror[39m]       |     ^^^^
[[31merror[39m] >  98 |       selectedRelease === null ||
[[31merror[39m]       | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
[[31merror[39m] >  99 |       selectedTarget === null ||
[[31merror[39m]       | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
[[31merror[39m] > 100 |       selectedTarget.role !== "tx" ||
[[31merror[39m]       | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
[[31merror[39m] > 101 |       selectedTarget.config.luaName === null
[[31merror[39m]       | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
[[31merror[39m] > 102 |     ) {
[[31merror[39m]       | ^^^^^^^
[[31merror[39m] > 103 |       return;
[[31merror[39m]       | ^^^^^^^^^^^^^
[[31merror[39m] > 104 |     }
[[31merror[39m]       | ^^^^^
[[31merror[39m] > 105 |     setBusy(true);
[[31merror[39m]       | ^^^^^^^^^^^^^^^^^^
[[31merror[39m] > 106 |     setStatus("جارٍ تنزيل ملف Lua الرسمي المطابق لهذا Target…");
[[31merror[39m]       | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
[[31merror[39m] > 107 |     try {
[[31merror[39m]       | ^^^^^^^^^
[[31merror[39m] > 108 |       const script = await acquireOfficialLuaScript({
[[31merror[39m]       | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
[[31merror[39m] > 109 |         release: selectedRelease,
[[31merror[39m]       | ^^^^^^^^^^^^^^^
[[31merror[39m]   110 |         target: selectedTarget,
[[31merror[39m]   111 |       });
[[31merror[39m]   112 |       downloadPreparedBytes(script.bytes, script.fileName, "text/plain");
[[31merror[39m] .github/workflows/m2-write-path-fixups.yml: SyntaxError: Unexpected scalar at node end (94:21)
[[31merror[39m]   92 |         channel: /^v?\d+\.\d+\.\d+/u.test(validated.releaseLabel)
[[31merror[39m]   93 |           ? "release"
[[31merror[39m] > 94 |           : "branch",
[[31merror[39m]      |                     ^
[[31merror[39m]   95 |       });''',
[[31merror[39m]   96 |           )
[[31merror[39m]   97 |           text = text[:recovery_start] + recovery + text[recovery_end:]
[[31merror[39m] .github/workflows/m2-write-path-hardening.yml: SyntaxError: Unexpected flow-map-end token in YAML stream: "}" (91:3)
[[31merror[39m]   89 |     target: input.target,
[[31merror[39m]   90 |     options: input.options,
[[31merror[39m] > 91 |   });
[[31merror[39m]      |   ^
[[31merror[39m]   92 | ''',
[[31merror[39m]   93 |                   1,
[[31merror[39m]   94 |               )
[[33mwarn[39m] apps/web/src/hardware/build-verification.test.ts
Error occurred when checking code style in 7 files.
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
apps/web/src/hardware/build-verification.ts(51,5): error TS2741: Property 'observedVersion' is missing in type 'Readonly<{ observedCommit: string | null; verified: boolean; expected: string; observed: string; reason: "EXACT_RELEASE" | "BRANCH_VERSION_OBSERVED" | "VERSION_MISMATCH" | "VERSION_UNAVAILABLE"; }>' but required in type 'FirmwareBuildVerificationResult'.
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
apps/web/src/hardware/official-artifacts.live.test.ts(6,17): error TS2591: Cannot find name 'process'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
apps/web/src/hardware/official-catalog.live.test.ts(5,17): error TS2591: Cannot find name 'process'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
apps/web/src/hardware/official-catalog.test.ts(96,27): error TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BodyInit | null | undefined'.
  Type 'Uint8Array<ArrayBufferLike>' is missing the following properties from type 'URLSearchParams': size, append, delete, get, and 2 more.
apps/web/src/hardware/official-source.ts(82,11): error TS2367: This comparison appears to be unintentional because the types 'false | undefined' and 'true' have no overlap.
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

### Automated tests

```text
[31m+     "logoFile": null,[39m
[31m+     "luaName": null,[39m
[31m+     "minVersion": null,[39m
[31m+     "overlay": null,[39m
[31m+     "platform": "esp8285",[39m
[31m+     "productName": "Receiver",[39m
[31m+     "raw": {[39m
[31m+       "firmware": "VENDOR_RX",[39m
[31m+       "platform": "esp8285",[39m
[31m+       "product_name": "Receiver",[39m
[31m+       "upload_method": "bf",[39m
[31m+     },[39m
[2m      "uploadMethods": [[22m
[2m        "betaflight",[22m
[2m        "download",[22m
[2m      ],[22m
[2m    },[22m
[32m-   "radioKey": "rx_900",[39m
[31m+   "id": "vendor/receiver/receiver",[39m
[31m+   "radioKey": "receiver",[39m
[2m    "role": "rx",[22m
[2m    "targetKey": "receiver",[22m
[31m+   "vendorKey": "vendor",[39m
[31m+   "vendorName": "Vendor",[39m
[2m  }[22m

[36m [2m❯[22m apps/web/src/hardware/official-target-index.test.ts:[2m51:24[22m[39m
    [90m 49|[39m     })[33m;[39m
    [90m 50|[39m
    [90m 51|[39m     [34mexpect[39m(targets[[34m0[39m])[33m.[39m[34mtoEqual[39m(
    [90m   |[39m                        [31m^[39m
    [90m 52|[39m       expect[33m.[39m[34mobjectContaining[39m({
    [90m 53|[39m         role[33m:[39m [32m"rx"[39m[33m,[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/9]⎯[22m[39m

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

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/9]⎯[22m[39m

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

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/9]⎯[22m[39m

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

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/9]⎯[22m[39m


[2m Test Files [22m [1m[31m7 failed[39m[22m[2m | [22m[1m[32m62 passed[39m[22m[2m | [22m[33m2 skipped[39m[90m (71)[39m
[2m      Tests [22m [1m[31m9 failed[39m[22m[2m | [22m[1m[32m682 passed[39m[22m[2m | [22m[33m2 skipped[39m[90m (693)[39m
[2m   Start at [22m 23:08:51
[2m   Duration [22m 22.03s[2m (transform 2.54s, setup 6.77s, import 5.13s, tests 10.42s, environment 30.02s)[22m


::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/components/ExpressLrsParityWorkbench.test.tsx,title=[web] apps/web/src/components/ExpressLrsParityWorkbench.test.tsx > primary ExpressLRS hardware workbench > loads official TX/RX targets and requires an explicit regulatory region,line=112,column=19::Error: expect(element).toBeDisabled()%0A%0AReceived element is not disabled:%0A  <button%0A  class="primary-button"%0A  type="button"%0A/>%0A ❯ apps/web/src/components/ExpressLrsParityWorkbench.test.tsx:112:19%0A%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/firmware-package-options.test.ts,title=[web] apps/web/src/hardware/firmware-package-options.test.ts > firmware package option gate > fails before network acquisition when an option is NaN,line=61,column=6::AssertionError: expected FirmwarePackageError: Cannot read propert… { code: '…' } to match object { field: 'domain' }%0A(2 matching properties omitted from actual)%0A%0A- Expected%0A+ Received%0A%0A- {%0A-   "field": "domain",%0A+ FirmwarePackageError {%0A+   "message": "Cannot read properties of undefined (reading 'ok')",%0A+   "code": "NETWORK",%0A+   "name": "FirmwarePackageError",%0A  }%0A%0A ❯ apps/web/src/hardware/firmware-package-options.test.ts:61:6%0A%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/firmware-package.ts,title=[web] apps/web/src/hardware/firmware-package.test.ts > official firmware package preparation > extracts only the selected target%2C appends configuration%2C hashes segments%2C and emits recovery,line=255,column=11::FirmwarePackageError: The selected hardware layout is not valid bounded JSON%0A ❯ parseLayout apps/web/src/hardware/firmware-package.ts:255:11%0A ❯ targetLayout apps/web/src/hardware/firmware-package.ts:569:14%0A ❯ prepareOfficialFirmwarePackage apps/web/src/hardware/firmware-package.ts:736:19%0A ❯ apps/web/src/hardware/firmware-package.test.ts:101:22%0A%0A⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯%0ASerialized Error: { code: 'INVALID_FIRMWARE' }%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/lua-package.ts,title=[web] apps/web/src/hardware/lua-package.test.ts > official Lua script acquisition > returns only the exact target-declared script,line=100,column=11::LuaPackageError: Expected one example.lua script, found 0%0A ❯ acquireOfficialLuaScript apps/web/src/hardware/lua-package.ts:100:11%0A ❯ apps/web/src/hardware/lua-package.test.ts:45:20%0A%0A⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯%0ASerialized Error: { code: 'SCRIPT_NOT_FOUND' }%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/official-catalog.ts,title=[web] apps/web/src/hardware/official-catalog.test.ts > official ExpressLRS catalog > loads the index and the single targets.json from bounded responses,line=374,column=11::OfficialCatalogError: Official hardware archive does not contain one unambiguous targets.json%0A ❯ targetJsonFromHardwareArchive apps/web/src/hardware/official-catalog.ts:374:11%0A ❯ loadOfficialExpressLrsCatalog apps/web/src/hardware/official-catalog.ts:422:15%0A ❯ apps/web/src/hardware/official-catalog.test.ts:99:21%0A%0A⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯%0ASerialized Error: { code: 'ARCHIVE' }%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/official-target-index.test.ts,title=[web] apps/web/src/hardware/official-target-index.test.ts > flexible official Target hierarchy > finds a target below an added category layer,line=51,column=24::AssertionError: expected { Object (id, role, ...) } to deeply equal ObjectContaining{…}%0A%0A- Expected%0A+ Received%0A%0A- ObjectContaining {%0A-   "config": ObjectContaining {%0A+ {%0A+   "config": {%0A+     "customLayout": null,%0A+     "firmware": "VENDOR_RX",%0A+     "layoutFile": null,%0A+     "logoFile": null,%0A+     "luaName": null,%0A+     "minVersion": null,%0A+     "overlay": null,%0A+     "platform": "esp8285",%0A+     "productName": "Receiver",%0A+     "raw": {%0A+       "firmware": "VENDOR_RX",%0A+       "platform": "esp8285",%0A+       "product_name": "Receiver",%0A+       "upload_method": "bf",%0A+     },%0A      "uploadMethods": [%0A        "betaflight",%0A        "download",%0A      ],%0A    },%0A-   "radioKey": "rx_900",%0A+   "id": "vendor/receiver/receiver",%0A+   "radioKey": "receiver",%0A    "role": "rx",%0A    "targetKey": "receiver",%0A+   "vendorKey": "vendor",%0A+   "vendorName": "Vendor",%0A  }%0A%0A ❯ apps/web/src/hardware/official-target-index.test.ts:51:24%0A%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/recovery-package.ts,title=[web] apps/web/src/hardware/recovery-package.test.ts > recovery package validation > accepts the exact target and verifies every segment hash,line=119,column=11::RecoveryPackageError: Recovery package does not contain a bounded manifest%0A ❯ validateRecoveryPackage apps/web/src/hardware/recovery-package.ts:119:11%0A ❯ apps/web/src/hardware/recovery-package.test.ts:70:26%0A%0A⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯%0ASerialized Error: { code: 'INVALID_MANIFEST' }%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/recovery-package.test.ts,title=[web] apps/web/src/hardware/recovery-package.test.ts > recovery package validation > rejects a package for another target before returning flash bytes,line=92,column=6::AssertionError: expected RecoveryPackageError: Recovery package do… { code: '…' } to match object { code: 'TARGET_MISMATCH' }%0A(1 matching property omitted from actual)%0A%0A- Expected%0A+ Received%0A%0A- {%0A-   "code": "TARGET_MISMATCH",%0A+ RecoveryPackageError {%0A+   "code": "INVALID_MANIFEST",%0A  }%0A%0A ❯ apps/web/src/hardware/recovery-package.test.ts:92:6%0A%0A

::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/recovery-package.test.ts,title=[web] apps/web/src/hardware/recovery-package.test.ts > recovery package validation > rejects a corrupted firmware segment,line=101,column=6::AssertionError: expected RecoveryPackageError: Recovery package do… { code: '…' } to match object { code: 'HASH_MISMATCH' }%0A(1 matching property omitted from actual)%0A%0A- Expected%0A+ Received%0A%0A- {%0A-   "code": "HASH_MISMATCH",%0A+ RecoveryPackageError {%0A+   "code": "INVALID_MANIFEST",%0A  }%0A%0A ❯ apps/web/src/hardware/recovery-package.test.ts:101:6%0A%0A
[ELIFECYCLE] Test failed. See above for more details.
```

### Live official artifacts

```text

[1m[30m[46m RUN [49m[39m[22m [36mv4.1.11 [39m[90m/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup[39m

 [32m✓[39m [30m[46m web [49m[39m apps/web/src/hardware/official-catalog.live.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 227[2mms[22m[39m
 [31m❯[39m [30m[46m web [49m[39m apps/web/src/hardware/official-artifacts.live.test.ts [2m([22m[2m1 test[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 1411[2mms[22m[39m
[31m     [31m×[31m resolves the current Firmware and Lua archives without consuming them[39m[33m 1409[2mms[22m[39m

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
[2m   Start at [22m 23:09:14
[2m   Duration [22m 2.50s[2m (transform 82ms, setup 355ms, import 131ms, tests 1.64s, environment 1.41s)[22m


::error file=/home/runner/work/expresslrs-arabic-easy-setup/expresslrs-arabic-easy-setup/apps/web/src/hardware/official-source.ts,title=[web] apps/web/src/hardware/official-artifacts.live.test.ts > live official ExpressLRS release artifacts > resolves the current Firmware and Lua archives without consuming them,line=88,column=9::OfficialSourceError: All official ExpressLRS artifact sources failed: https://expresslrs.github.io/web-flasher/assets/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/lua.zip: HTTP 404 | https://artifactory.expresslrs.org/ExpressLRS/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/lua.zip: HTTP 404%0A ❯ fetchOfficialExpressLrsResource apps/web/src/hardware/official-source.ts:88:9%0A ❯ apps/web/src/hardware/official-artifacts.live.test.ts:20:26%0A%0A⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯%0ASerialized Error: { code: 'NOT_FOUND' }%0A
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
apps/web build: src/hardware/build-verification.ts(51,5): error TS2741: Property 'observedVersion' is missing in type 'Readonly<{ observedCommit: string | null; verified: boolean; expected: string; observed: string; reason: "EXACT_RELEASE" | "BRANCH_VERSION_OBSERVED" | "VERSION_MISMATCH" | "VERSION_UNAVAILABLE"; }>' but required in type 'FirmwareBuildVerificationResult'.
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
apps/web build: src/hardware/official-source.ts(82,11): error TS2367: This comparison appears to be unintentional because the types 'false | undefined' and 'true' have no overlap.
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

### Licenses and advisories

```text
$ pnpm licenses list --recursive --json > dependency-licenses.json
$ node scripts/check-license-policy.mjs
Dependency license policy check failed:
- pako@2.2.0: unapproved license expression (MIT AND Zlib); add evidence-backed exact review or reject the dependency
[ELIFECYCLE] Command failed with exit code 1.
```

