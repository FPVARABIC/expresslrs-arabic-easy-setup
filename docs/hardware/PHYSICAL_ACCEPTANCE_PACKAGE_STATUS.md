# Physical acceptance package status

- Date: `2026-09-04`
- Integration branch: `feat/m2-real-hardware-first-test`
- Draft PR: [#7](https://github.com/FPVARABIC/expresslrs-arabic-easy-setup/pull/7) — Draft, unmerged
- Candidate identity: branch HEAD, injected at build time as the exact
  40-character `VITE_BUILD_SHA`; no pre-commit SHA is hard-coded here
- Draft PR CI: `PENDING POST-PUSH VERIFICATION`
- Full local Vitest: 79 files passed + 2 skipped (81 total); 935 tests passed +
  5 skipped (940 total)
- Focused sensitive suite: 17 files; 242 tests passed + 3 skipped
- Live official-source suite: 3 files; 31/31 tests passed
- Recorder schema: `1`
- Recorder test steps: `19`
- Sequential recorder locks: `NONE`
- Local persistence: `ENABLED`
- JSON export/import: `ENABLED`
- Markdown report export: `ENABLED`
- Live application context capture: `ENABLED`
- Sensitive free-text export redaction: `ENABLED`
- Hardware validation: `NONE`
- Public/default device-changing operations: `LOCKED`
- Deployment in this work: `NONE`; Draft PR events cannot trigger Pages
  publication

All nineteen result entries remain available from the first render. The displayed order is a risk-reduction recommendation, not a software prerequisite graph. Device-write code continues to require the actual safety evidence needed to avoid writing an unverified Target or starting without a recovery package, stable power acknowledgement, and—on TX—an attached antenna.

The exact Candidate SHA shown in an exported report must match the deployed build used during the physical session. The reviewed Pages workflow supplies this immutable value at build time; the recorder rejects imports from another SHA and disables export unless the value is exactly 40 lowercase hexadecimal characters.

The current hardening set passed the complete local Vitest suite, the focused
sensitive suite, and the live official-source suite recorded above. It replaces
the historical, nonexistent `lua.zip` lookup with the official ExpressLRS Web
Flasher CORS mirror's direct Lua artifact and updates `fflate` from 0.8.2 to
0.8.3. The exact-SHA Pages gates, security policy, formatting, type checks,
license policy, and moderate-or-higher advisory policy remain part of the local
and CI quality contract.

Official Draft PR #7 CI is not claimed green in this record. It must be checked
after the final branch commit is pushed, and its result applies only to the SHA
that workflow checks out.

No physical session or deployment is part of this checkpoint. Until a separately authorized session records reference TX/RX evidence, every Hardware result remains unverified and the public/default application keeps all device-changing operations locked.
