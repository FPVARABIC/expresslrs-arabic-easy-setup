# PWA / Offline Foundation Acceptance

## Accepted scope

This acceptance covers only the software PWA/offline foundation. It keeps all real Binding, configuration, reboot, Firmware, and RF writes disabled and makes no Hardware-validation claim.

## Candidate

- reviewed commit: `4176240998419f46989cdecf862173450cabbbc8`
- GitHub Actions: CI run #94
- Hardware validation: `NONE`
- dependency additions: none

## Accepted behavior

The checkpoint is accepted because the application now:

- exposes Arabic-first repository-relative PWA metadata;
- registers a same-origin Service Worker only in a secure context when the platform supports it;
- avoids forced in-session Service Worker activation;
- performs network-first static-shell caching;
- leaves successful network responses valid even if cache storage fails;
- bypasses every cross-origin request, including all three reviewed ExpressLRS Local HTTP origins;
- explicitly bypasses Firmware, artifact, catalog, release, update-metadata, and update-manifest paths;
- shows a concise limited-offline status only when the browser reports offline;
- does not use the online/offline signal as device reachability authority;
- allows only same-origin workers in the reviewed CSP while retaining all other Browser restrictions;
- validates source and built PWA artifacts with a deterministic CI gate.

## Automated evidence

The PWA slice adds:

- 4 Service Worker registration tests;
- 4 limited-offline UI tests;
- 2 Arabic/English network-copy tests.

The full suite therefore reaches 41 test files and 539/539 tests.

CI run #94 also passed formatting, ESLint, TypeScript, dependency boundaries, Browser security policy, PWA policy, Markdown links, Master Plan verification, production build, dependency-license policy, and the high-severity advisory audit.

## Safety evidence

The Service Worker is intentionally outside the Firmware trust chain. It does not admit a Target, root key, catalog entry, rollback transition, Firmware artifact, build output, or writer.

The cache name is only a static-shell schema namespace. It must never be interpreted as a release/security version.

The existing Easy Mode remains exactly three primary actions. No PWA prompt, offline action, install action, or repair action was added to the ordinary task surface.

## Remaining PWA gates

Before claiming complete offline support, later work must prove at minimum:

- first-install and reload behavior across supported desktop/mobile browsers;
- cache-consistency/version strategy across deployments;
- operation-aware application-update UX;
- exact policy for any future cached documentation/metadata;
- Firmware artifact cache identity and authenticity rules before any Firmware cache is allowed;
- storage-pressure/eviction behavior;
- offline recovery behavior;
- Hardware/Browser testing for Local HTTP while a Service Worker is active.

Android packaging remains a later, separate platform decision.
