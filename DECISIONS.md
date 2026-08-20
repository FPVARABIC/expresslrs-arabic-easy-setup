# Operational Decision Log

هذا السجل للقرارات التشغيلية المختصرة. القرارات المعمارية ذات البدائل والعواقب تبقى في `docs/adr/`.

| Date | ID | Decision | Reason / effect | Related record |
| --- | --- | --- | --- | --- |
| 2026-08-20 | DEC-001 | Use ExpressLRS 4.1.0 at full SHA as the stable Discovery baseline | Prevent moving “latest” and mixing unreleased behavior | ADR-0001 |
| 2026-08-20 | DEC-002 | Keep current `master` only as development awareness | LR2021/TH920-era changes are not stable 4.1 facts | Upstream baseline |
| 2026-08-20 | DEC-003 | Keep upstream read-only during Milestone 0 | Master Plan discovery gate | Phase 0 reports |
| 2026-08-20 | DEC-004 | Block copying Web Flasher and Targets materials | No explicit repository-level license at inspected SHAs | ADR-0003 |
| 2026-08-20 | DEC-005 | Treat provider completion as evidence, not final success | Official inspected flows do not perform required postcondition verification | ADR-0005 |
| 2026-08-20 | DEC-006 | Propose independent repo + immutable pin + patch queue | Minimize fork delta and preserve reproducibility/auditability | ADR-0002 |
| 2026-08-20 | DEC-007 | Recommend framework-independent TypeScript Core and Arabic React/Vite Web shell | Web/Android/Super-App reuse without UI-owned logic | ADR-0004 |
| 2026-08-20 | DEC-008 | Hold Phase 0 exit | Initial decision before the owner amended the execution order; superseded for Mock/Foundation only by DEC-011/013 | Phase 0 Exit Review |
| 2026-08-20 | DEC-009 | Do not stage, commit, push, merge or release in this checkpoint | No separate authorization and remote repository not available | STATUS.md |
| 2026-08-20 | DEC-010 | Link the empty GitHub repository as `origin` | Repository was created by the owner and verified empty | STATUS.md |
| 2026-08-20 | DEC-011 | Start M1 Foundation without owned reference models | Owner requires a flexible model-agnostic architecture; only mocks/read-only contracts are allowed until hardware exists | ADR-0007 |
| 2026-08-20 | DEC-012 | Use Cairo as the primary Arabic UI font | Explicit owner direction; package it locally for offline-ready rendering | ADR-0008 |
| 2026-08-20 | DEC-013 | Defer hardware/browser gates, not erase them | Lack of devices does not block Core/Foundation, but still blocks support/write/release claims | Phase 0 Exit Review |
| 2026-08-20 | DEC-014 | Keep every M1 device/model fixture synthetic | Prevent unvalidated commercial-device names from looking like support claims | ADR-0007 |
| 2026-08-20 | DEC-015 | Treat this implementation as an M1 checkpoint, not the M1 exit | Official dependency, lockfile, CI, browser, and remaining workflow gates are not all complete | STATUS.md |

New decisions append rows; they do not silently rewrite prior history. If a decision changes, record a new ID and link the superseding ADR where applicable.
