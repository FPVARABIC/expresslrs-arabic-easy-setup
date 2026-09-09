# ADR-0009 — Milestone 1 Threat Model

- Status: Accepted for M1 Foundation
- Date: 2026-08-20
- Scope: newly written Core, Mock providers, and Arabic Web shell only

## Context

Milestone 1 introduces executable application code and pinned third-party
dependencies, but it deliberately has no real-device provider or real-device
Firmware writer, Binding identity, cloud service, analytics, or
application-managed persistent storage. Synthetic providers do simulate the
sensitive workflow states in memory. The Foundation must still establish security boundaries that Web,
Android, and a future host application can share without turning synthetic
success into a hardware or release claim.

The assets relevant now or at the next adapter boundary are:

- source, lockfile, CI configuration, and dependency provenance;
- device identity evidence, Target candidates, capabilities, and operation
  history;
- future Binding Phrase/UID, Wi-Fi credentials, device identifiers, Firmware
  manifests, and artifact hashes;
- browser permissions, a single owned Device Session, and exported support
  reports.

The primary threats are dependency substitution, malicious or malformed adapter
data, identity spoofing, wrong-Target authorization, cross-site scripting,
accidental disclosure through logs/clipboard/export, stale application state,
and two modules concurrently controlling one device.

## Decision

### Trust boundaries

| Boundary | M1 decision | Later gate |
| --- | --- | --- |
| npm registry → workspace | Exact versions, reviewed direct-dependency ledger, lockfile, frozen CI install, release-age policy, fail-closed license policy, high-severity audit, and immutable CI action pins | Final legal notices, SBOM/signature gate, and official CI evidence before Release |
| Platform adapter → Core | All descriptors, evidence, capabilities, and errors are untrusted structured input | Provider-specific schema and hardware validation |
| Target Catalog → compatibility | Synthetic, versioned, injectable catalog only; ambiguity fails closed | License-approved pinned upstream catalog |
| Core → Web/Android/host | Machine states, codes, and privacy-classified facts; no localized strings as identifiers | Versioned public contract before external host integration |
| Operation → Device Session | One in-process owner at a time; stale leases fail closed | Cross-process/native ownership design during platform spikes |
| Audit/export → user/support | Data minimization and mandatory scrub before export | Tested diagnostic-export schema and retention UX |
| Browser origin → local device | No M1 network or hardware provider | Explicit permission, origin/LNA/CORS/device-authenticity tests |
| Firmware source → device | Synthetic artifact metadata/write states only; no real artifact intake or device I/O | Provenance, format, Target, hash, intent, write, reconnect, verify |

### Security invariants

1. M1 ships no real hardware read/write path and makes no supported-device
   claim.
2. Unknown, ambiguous, or conflicting identity evidence cannot authorize a
   sensitive operation.
3. Provider completion is evidence only; `SUCCESS` requires explicit
   verification of the workflow postcondition.
4. Binding Phrase, UID/derived UID, Wi-Fi password, access token, hardware
   serial, and comparable identifiers are never logged or persisted by default.
5. Secret values are neither hashed for correlation nor placed in error details;
   hashing a low-entropy secret is not redaction.
6. UI rendering treats device, catalog, file, and error detail as untrusted text.
   `dangerouslySetInnerHTML` or equivalent requires a separate security review.
7. Core decisions do not depend on DOM state, translated text, navigation, or a
   browser permission being present.
8. Every new runtime storage key, network destination, permission, dependency,
   or device capability requires an explicit registry/policy update and tests.

### Web baseline

The standalone production Web deployment must supply a Content Security Policy
before any hosted M1 preview is treated as a security-reviewed artifact. The
initial restrictive baseline is:

```text
default-src 'self';
script-src 'self';
style-src 'self';
font-src 'self';
img-src 'self' data:;
connect-src 'self';
object-src 'none';
base-uri 'none';
frame-ancestors 'none';
form-action 'self'
```

Development-server requirements do not weaken the production policy. A future
local-device provider must replace `connect-src 'self'` with the narrowest
tested origin strategy; it must not add a wildcard. Future Super-App embedding
requires a superseding decision for `frame-ancestors`.

## Alternatives

- **Defer security until real hardware:** rejected because dependency, XSS,
  privacy, and contract risks already exist in Foundation.
- **Trust devices on the local network:** rejected; local reachability is not
  device identity.
- **Log all raw evidence for support:** rejected because it creates an avoidable
  identifier/secret leak and couples support to uncontrolled data.
- **Use a cloud backend as the trust anchor:** rejected for M1 because the
  product is local-first and no server is required for Foundation.
- **Permit expert override of identity gates:** rejected for M1; no write
  provider exists and Easy Mode must fail closed.

## Consequences

- Security review can distinguish `MOCK/BUILD_TESTED` evidence from hardware
  validation.
- Audit and support exports require a privacy schema and scrubber before they can
  contain real adapter data.
- A storage-key registry remains normative even while it records zero keys.
- Direct dependencies may be used for M1 only under the admission ledger; this
  is not legal or security clearance for Release.
- The dependency license/advisory checks and immutable Action pins are configured
  but still need the official M1 CI run. CSP enforcement, signed Firmware
  manifests, SBOM/legal review, and real permission/device tests remain explicit
  later gates rather than implicit claims.
