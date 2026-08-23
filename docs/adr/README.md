# Architecture Decision Records

ADRs تسجل `Context / Decision / Alternatives / Consequences`. لا يُعاد تحرير تاريخ القرار؛ التغيير ينشئ ADR جديدًا superseding السابق.

السجل الحالي:

- ADR-0001: Stable upstream baseline — accepted for Discovery.
- ADR-0002: Hybrid upstream/patch strategy — accepted for Foundation.
- ADR-0003: no-copy boundary for unlicensed upstream material — accepted gate.
- ADR-0004: TypeScript Core + React/Vite Web — accepted for M1.
- ADR-0005: provider completion is not operation success — accepted gate.
- ADR-0006: versioned Target Catalog boundary — accepted; real data license-blocked.
- ADR-0007: model-agnostic device support — accepted.
- ADR-0008: Cairo typography — accepted.
- ADR-0009: Milestone 1 threat model and trust boundaries — accepted for M1.
- ADR-0010: read-only Local HTTP discovery — accepted for the M2A technical spike.
- ADR-0011: GitHub Pages public development preview — accepted with explicit hosting and Hardware limits.
- ADR-0012: automatic multi-method Firmware update selection — accepted for Core and Synthetic providers only.
- ADR-0013: Synthetic artifact provenance and Core-owned Verification Plan — accepted without signed-manifest or Hardware claims.
- ADR-0014: Signed-manifest trust design and byte-verification boundary — accepted without a trust root or real writer.
- ADR-0015: bounded Synthetic manifest parsing and Ed25519 verification — accepted as `VALID_UNTRUSTED` software evidence only.
- ADR-0016: bounded Synthetic root metadata, dual-threshold rotation, expiry, revocation, and unpersisted rollback-state transitions — accepted without an admitted root or storage adapter.
- ADR-0017: bounded Synthetic gzip, dual-form digest verification, and executable/Target identity — accepted as non-writable fixture evidence only.
- ADR-0018: separately versioned Synthetic dual-form Manifest plus internally branded root/rollback/artifact linkage — accepted as non-admitted, non-writable catalog-candidate evidence only.
- ADR-0019: separately signed Synthetic distribution statement, bounded exact-object acquisition, and source/notice linkage — accepted as byte-discarding, non-admitted, non-writable evidence only.

Android platform strategy remains intentionally undecided until the real-device spike.
