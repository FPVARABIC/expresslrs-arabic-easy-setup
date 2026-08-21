# Phase 0 Security Reconnaissance

## Assets

- Firmware source and binary artifacts.
- Target identity and compatibility mapping.
- Binding identity/phrase and Wi-Fi credentials.
- Build toolchain, dependencies, and release metadata.
- Device configuration and operation history.
- Browser/Android permissions and active device sessions.

## Trust boundaries

| Boundary | Main threat | Required control |
| --- | --- | --- |
| GitHub upstream → integration | Ref moved or repository substituted | Repository allowlist, full SHA, source digest |
| Targets → build | Mutable or malicious device mapping | Exact snapshot, schema validation, license gate |
| Artifact host → app | Partial, stale, or substituted binary | Signed manifest, SHA-256, atomic download, rollback protection |
| Registry → build | Compromised dependency | Lockfile, hashes, offline cache, SBOM and license/security scan |
| CI action → release | Mutable third-party action | Pin action commit SHA and runner/container digest |
| PWA cache → operation | Stale logic/metadata during sensitive workflow | Versioned cache, signed manifest, defer activation while operation active |
| Device → app | Spoofed or ambiguous identity | Evidence and confidence model; fail-closed write gate |
| User firmware → flasher | Malformed or wrong-target artifact | Parse, size/format/target/provenance checks and explicit confirmation |
| Storage/logs → support | Phrase/password/identifier leakage | Minimize, redact, scrub export, version and retention policy |
| Signing key → Stable channel | Malicious release | Protected/offline key, rotation and revocation plan |

## Findings from upstream tools

- Firmware/Configurator expose force-flash paths; Web Flasher can offer “Flash Anyway” after mismatch. Easy Mode must not expose such an override.
- Web Flasher passthrough can proceed when an exact target response is absent. Generic MCU/USB evidence must not authorize an Easy Mode write.
- Device Wi-Fi target-string scanning is bypassed at that layer for a gzip upload beginning with `0x1F`; the app must validate the decompressed artifact target before transfer.
- Configurator downloads commit-keyed firmware archives but the inspected path does not verify a signed manifest or expected digest before extraction.
- Web Flasher artifact acquisition and caching do not provide an application-level signed firmware manifest in the inspected source.
- Configurator stores binding-phrase history in plaintext local storage. Our default must be no persistence of Binding Phrase, derived UID, SSID, or Wi-Fi password.
- Device-hosted Web UI exposes configuration and update endpoints with permissive CORS. A hosted product must still pass browser Local Network Access, mixed-content, permission, and device-authenticity review.
- No application authentication was observed on the inspected device HTTP route layer; malicious web origins, local-network attackers, and CSRF-like state changes must be threat-modeled.

## Easy Mode safety policy

No Firmware write unless all are true:

1. Device identity evidence reaches the required confidence.
2. Target is confirmed and cross-checked.
3. Artifact source, format, target, and hash are valid.
4. Version transition and flash provider are supported.
5. Device state and permissions are appropriate.
6. User intent is explicit.
7. Post-write reconnection and verification are possible or the UI declares Recovery Required.

Unknown never becomes Success. Wrong-target override is prohibited in Easy Mode. A future expert recovery override must be isolated, explicit, auditable, and unavailable when identity evidence is insufficient.

## Required artifact provenance

Each artifact manifest must include:

```text
manifest_schema
app_version
core_version
channel
upstream_repository
upstream_tag
upstream_full_sha
upstream_source_archive_sha256
targets_repository
targets_full_sha
targets_snapshot_sha256
patch_set_id
patch_ids_and_sha256
dirty_tree
toolchain_or_container_digest
platformio_version
platform_versions
dependency_lock_digest
target_identifier
product_identifier
mcu
radio
band
regulatory_domain
non_secret_build_options
artifact_name
artifact_size
artifact_sha256
build_source_epoch
tests_and_validation_level
corresponding_source_url
notice_bundle
signature
```

Never record the Binding Phrase in provenance. UID-derived values are identifiers, not secure secret-storage substitutes.

## Phase 1 prerequisites

- Threat-model ADR and structured error model.
- Storage-key registry with purpose, schema, version, and retention.
- Privacy scrubber fixtures.
- Dependency admission policy.
- Content Security Policy baseline.
- Signed-manifest design spike before any real Firmware catalog/update implementation. [ADR-0014](../adr/ADR-0014-signed-manifest-trust-and-byte-verification.md) records the wire/trust design, [ADR-0015](../adr/ADR-0015-bounded-synthetic-manifest-verification.md) implements bounded parsing plus `VALID_UNTRUSTED` Synthetic Ed25519 evidence, and [ADR-0016](../adr/ADR-0016-synthetic-root-rotation-and-rollback-state.md) proves bounded Synthetic root rotation/revocation/expiry and unpersisted rollback transitions. Initial trust-root admission, atomic storage, and real writes remain blocked.
