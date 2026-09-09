# ADR-0008: Cairo as the Arabic Interface Font

- Status: Accepted
- Date: 2026-08-20

## Context

The product is Arabic-first and the owner selected Cairo for the interface. The app also targets offline/PWA behavior, so relying solely on a remote font request would make rendering inconsistent.

## Decision

Use Cairo Variable as the primary UI font through a pinned self-hosted package, with Arabic-capable system fallbacks. Load it in the Web application and use logical CSS properties so RTL layout remains independent of physical left/right assumptions.

## Alternatives

- Remote Google Fonts request: rejected as the only path because it harms offline/privacy reliability.
- System font only: rejected because visual identity would vary widely.
- Bundle an untracked font binary manually: rejected in favor of a pinned package with explicit license metadata.

## Consequences

- Font package/version/license enter dependency review and lockfile.
- The app can render Cairo without an online font request after installation/build.
- English fallback remains supported within the same design system.
