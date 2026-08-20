# Phase 0 Questions Register

| ID | Status | Question | Why it matters | Evidence needed |
| --- | --- | --- | --- | --- |
| Q-001 | OPEN | What is the exact license/reuse permission for `ExpressLRS/web-flasher` at the pinned SHA? | Code reuse and distribution gate | Explicit upstream license or maintainer clarification |
| Q-002 | OPEN | What is the exact license/reuse permission for `ExpressLRS/Targets` metadata at the pinned SHA? | Target database strategy and redistribution | Explicit upstream license or maintainer clarification |
| Q-003 | PARTIAL | Which binding-success evidence is available per official binding method without assuming command success? | Prevent false `SUCCESS` | Source trace defines evidence ladder; reference hardware must prove provider visibility |
| Q-004 | PARTIAL | Which targets expose trustworthy runtime identity and which require user-guided selection? | Wrong-target prevention | `/config` and bootloader surfaces mapped; protocol/device matrix still required |
| Q-005 | OPEN | Which current browsers/platforms support each required WebSerial/WebUSB path on real devices? | Web/Android architecture | Browser matrix spike on reference hardware |
| Q-006 | PARTIAL | Can device-hosted Wi-Fi flows expose a stable verification signal after update/binding? | Recovery and post-write verification | `/config` can verify runtime identity after return; Wi-Fi cannot prove live RF because radio stops; hardware test remains |
| Q-007 | OPEN | Which configuration can be snapshotted and restored safely per platform/target? | Honest backup/recovery UX | Source capability map and device validation |
| Q-008 | OPEN | What is the smallest legal, repeatable RF bench setup for baseline/degradation testing? | Performance gate | RF test plan and expert review |
| Q-009 | OPEN | Which project license best fits original app/Core code while satisfying every reused/derived component obligation? | Release gate | Completed license boundary matrix |
| Q-010 | OPEN | What exact host contract will avoid future USB/Serial session contention with the other FPV application? | Integration-ready architecture | Phase 0 contract proposal; later integration proof |
| Q-011 | OPEN | Which exact Targets SHA/toolchain produced the official ExpressLRS 4.1.0 artifacts? | Honest official-artifact provenance | Exact upstream workflow run or maintainer evidence |
| Q-012 | OPEN | Can a hosted HTTPS/PWA app reliably reach device HTTP across the supported LNA/browser matrix? | Wi-Fi automation and recovery | AP/home-network spike with permission grant/deny/revoke |
| Q-013 | OPEN | What distinct public product name and trademark wording will be approved? | Repository/package identity and public release | Naming decision plus trademark review |
| Q-014 | OPEN | What signed manifest/source-bundle design will protect firmware distribution? | Supply-chain and revocation gate | Manifest/signing ADR and end-to-end release prototype |
