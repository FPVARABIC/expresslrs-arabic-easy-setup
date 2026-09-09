# ADR-0004: Web Architecture Recommendation

- Status: Accepted for M1 Foundation
- Date: 2026-08-20

## Context

The first product is an Arabic-first Web App, while Android and a future FPV host must reuse Core logic. Existing upstream tools are split between Electron/React and Vue/browser code and cannot be adopted wholesale without coupling and licensing concerns.

## Decision

Use a TypeScript workspace with independent Domain/Core, workflow state machines, ExpressLRS adapter interfaces, platform providers, and a separate Arabic-first React/Vite Web UI. Hardware APIs exist only in browser/Android provider packages.

## Alternatives

- Extend Configurator/Electron directly: rejected for browser/Android goals and UI coupling.
- Fork Web Flasher as the product: rejected for target-selection UX, missing Core boundary, verification gaps, and unresolved license.
- Framework-free UI: possible but adds avoidable UI/accessibility/state-management work.
- Choose Android framework now: rejected until real-device spike.

## Consequences

- Core has no React, DOM, `navigator.*`, Arabic text, or navigation dependency.
- Web Serial, WebUSB, local HTTP, files, and mocks are replaceable providers.
- Android can reuse Core/workflows and add a narrow native bridge only when proven necessary.
- Phase 1 must include mock/replay fixtures before any hardware write.
- Cairo is the primary Arabic interface font through a locally packaged Web dependency.
