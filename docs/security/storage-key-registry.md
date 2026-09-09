# Application Storage-Key Registry

Registry schema: `1`

## Current state

**No application-managed persistent storage is used or approved in the current
Foundation/M2A candidate.** ADR-0016 records one exact `PROPOSED` IndexedDB
bundle so its transaction and lifecycle can be reviewed before implementation;
the application does not open that database.

| Mechanism | Registered keys/databases/caches | Status |
| --- | --- | --- |
| `localStorage` | None | Prohibited until registered |
| `sessionStorage` | None | Prohibited until registered |
| IndexedDB | `elrs-easy-security-v1` / `firmware-trust-bundles` / `synthetic` | `PROPOSED`; no runtime database or adapter exists |
| Cache Storage / Service Worker | None | No service worker is registered |
| Cookies | None | Application does not set cookies |
| Origin Private File System / File System Access | None | Not used |
| Native Android preferences/database/files | None | Android not implemented |

React component state and in-memory operation/session maps are intentionally
ephemeral. Sanitized Local HTTP discovery snapshots are also ephemeral and do
not register a storage key. The Browser request uses `cache: "no-store"`. The
browser's ordinary HTTP cache for versioned static build assets is
platform-managed and is not an application data store. Clipboard writes are
explicit exports and remain subject to the privacy scrubber policy. The M2A
real-device panel can copy only a fixed-category, value-free diagnostic report
after a user action; it is generated in memory and does not register a storage
key.

## Registration gate

Before introducing any key, database, object store, named cache, cookie, or
native storage item, add one row containing:

| Field | Required meaning |
| --- | --- |
| Registry ID | Stable identifier such as `STO-001` |
| Mechanism and exact key/name | No wildcard or undocumented prefix |
| Owner | Package/module responsible for reads, writes, and deletion |
| Purpose | User-visible reason the data must persist |
| Schema version | Machine-readable version and validation rule |
| Data classes | Classes from the privacy/audit policy |
| Default retention | Duration or event that deletes the value |
| User controls | Inspect/export/delete behavior where applicable |
| Migration | Upgrade, rollback, corruption, and unknown-version behavior |
| Offline/PWA behavior | Cache compatibility and stale-data handling |
| Tests | Round-trip, migration, deletion, corruption, and privacy cases |
| Decision/status | `PROPOSED`, `ACCEPTED`, `DEPRECATED`, or `REMOVED` |

The implementation and registry change must land together. Unregistered storage
is a release-blocking finding.

## Values that may not be registered for routine persistence

- Binding Phrase or its derived UID;
- Wi-Fi password or access token;
- signing/private keys;
- raw hardware serial, MAC address, or stable device identifier without a
  separate necessity/privacy decision;
- unredacted diagnostic payloads, raw exception objects, or arbitrary adapter
  responses.

If a future recovery requirement appears to need one of these values, it needs a
new threat/privacy decision and must not be added as an ordinary registry row.

## Proposed security-state registration

| Field | `STO-001` proposal |
| --- | --- |
| Registry ID | `STO-001` |
| Mechanism and exact key/name | IndexedDB database `elrs-easy-security-v1`, object store `firmware-trust-bundles`, singleton record key `synthetic` |
| Owner | Future Browser security-storage adapter; Workflow owns the bounded codec and monotonic transition rules |
| Purpose | Atomically retain an admitted root envelope with the highest root version and per-channel/Target release floors needed to reject rollback |
| Schema version | Bundle schema to be decided; the implemented inner Synthetic rollback-state codec is exact schema `1` and 32 KiB/128-floor bounded |
| Data classes | `PUBLIC` signing metadata plus `OPERATIONAL` Target IDs, release sequences, artifact SHA-256 values, and root versions; no private/signing key or device identifier |
| Default retention | Until an explicitly reviewed trust re-bootstrap, application-data removal, or uninstall; ordinary cache clearing must not be presented as a safe reset |
| User controls | Future inspect/export of public metadata; deletion requires explicit warning that trusted update continuity is lost and an out-of-band re-bootstrap is required |
| Migration | Unknown version, corruption, partial record, lower version, or non-atomic update fails closed; root and floors must change in one transaction |
| Offline/PWA behavior | Cached metadata may be used only while fresh; offline state never bypasses expiry, revocation, root continuity, or release floors |
| Tests | Current pure codec/transition tests cover corruption, duplicate floors, deterministic round-trip, root mismatch/rollback, release rollback/conflict/replay; IndexedDB transaction, race, migration, eviction, deletion, and recovery tests remain mandatory with implementation |
| Decision/status | `PROPOSED`; ADR-0016 design evidence only, with no persistent read/write path |

Changing `STO-001` to `ACCEPTED` must land with the storage adapter and its full
test matrix. An admitted Stable/Beta channel needs a separately reviewed exact
record key; the Synthetic proposal is not a wildcard registration.
