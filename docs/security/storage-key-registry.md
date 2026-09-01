# Application Storage-Key Registry

Registry schema: `1`

## Current state

**No application-managed persistent storage is used or approved in Milestone 1.**

| Mechanism | Registered keys/databases/caches | Status |
| --- | --- | --- |
| `localStorage` | None | Prohibited until registered |
| `sessionStorage` | None | Prohibited until registered |
| IndexedDB | None | Prohibited until registered |
| Cache Storage / Service Worker | None | No service worker is registered |
| Cookies | None | Application does not set cookies |
| Origin Private File System / File System Access | None | Not used |
| Native Android preferences/database/files | None | Android not implemented |

React component state and in-memory operation/session maps are intentionally
ephemeral. The browser's ordinary HTTP cache for versioned static build assets
is platform-managed and is not an application data store. Clipboard writes are
explicit exports and remain subject to the privacy scrubber policy.

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
