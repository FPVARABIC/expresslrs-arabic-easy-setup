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
| 2026-08-20 | DEC-016 | Adopt the M1 security/governance baseline | Establish explicit trust boundaries, direct-dependency admission, privacy-safe audit rules, and zero application-managed persistent storage before real adapters | ADR-0009; dependency and security policies |
| 2026-08-20 | DEC-017 | Expose a provisional UI-independent Foundation module over Synthetic providers | Prove Web/Android/future-host reuse and verified Binding/Update state semantics without admitting a real hardware provider | Core API and Mock workflow docs |
| 2026-08-20 | DEC-018 | Describe M1 as no-real-device-I/O, not globally read-only | Discovery is read-only, while Synthetic Binding/Update providers deliberately simulate sensitive command/write states in memory | Privacy policy; Core API |
| 2026-08-20 | DEC-019 | Admit an isolated M2A Local HTTP candidate with no write authority | Fixed origins, explicit `GET /config`, an empty Target Catalog, and `UNVALIDATED` self-reported evidence permit a real read spike without creating a support or Target-confirmation claim | ADR-0010; M2A architecture and acceptance records |
| 2026-08-20 | DEC-020 | Export read-only support evidence as fixed categories, never raw values or field names | Attacker-controlled names and values can themselves disclose secrets; bounded counts/categories preserve useful state without forwarding provider payloads | Privacy policy; `packages/diagnostics` |
| 2026-08-20 | DEC-021 | Treat reconnect results as comparisons of explicit snapshots only | A matching later read is not a live connection or authenticated physical identity; polling and automatic reconnect remain absent | M2A architecture and Hardware/Browser runbook |
| 2026-08-20 | DEC-022 | Ship and verify a strict production browser-header artifact | Restrict browser connections and executable content to the reviewed surface; incompatible hosts must translate and verify the same policy before release | M2A architecture; security-header checker |
| 2026-08-20 | DEC-023 | Supersede DEC-009 for staging, committing, pushing, and opening/updating a Draft PR for the current M2A branch | The owner explicitly authorized GitHub upload and repository work for this implementation; merge and release remain outside this checkpoint | Current owner authorization; STATUS.md |

New decisions append rows; they do not silently rewrite prior history. If a decision changes, record a new ID and link the superseding ADR where applicable.
