# Milestone 1 Acceptance Evidence

Status: **Implementation candidate ready for official CI, then owner review**.

This file maps the unchanged acceptance gate in
`docs/architecture/milestone-1-proposal.md` to evidence. It does not itself
accept the milestone.

| Gate | Candidate evidence | Current status |
| --- | --- | --- |
| Dependency direction enforced | `scripts/check-dependency-boundaries.mjs`; package graph plus Core React/DOM/browser exclusions are checked in `pnpm check` and CI | Locally passed |
| Core tests run without DOM/browser | Root Vitest project `core` uses `environment: node`, Core TypeScript configs use `ES2023` without DOM declarations, and Web has a separate `jsdom` project | Locally passed |
| Workflow failure fixtures end in non-success | Binding/Update provider-stage matrices plus wrong Target/version/no-return/no-link/permission/artifact, malformed SemVer, ignored cancellation, and adversarial input-mutation cases | Locally passed |
| Mock Easy Binding/Update demonstrate verification and recovery | `runEasyBinding`, `runFirmwareUpdate`, scripted providers, module facade, progress observer, and Web Mock invocation | Locally passed |
| Arabic RTL/English fallback smoke tests pass | Web tests plus catalog completeness, keyboard/focus, structured-error, clipboard privacy, scenario isolation, and viewport cases | Locally passed |
| CI clean | Last published baseline run #5 was green; this expanded candidate is not pushed yet | **Pending** |
| No upstream copy or hardware-write implementation | Repository inventory, boundaries, Synthetic fixtures, no Browser/native/Firmware provider | Locally confirmed |

## Local verification executed

```text
Frozen offline install: lockfile current; 272 entries passed supply-chain policy
pnpm check:
  Prettier format check: passed
  ESLint with zero warnings: passed
  TypeScript: passed
  Dependency boundaries: 7 workspace packages passed
  Markdown links: 45 local links across 47 files passed
  MASTER_PLAN contract: headings 1–449 and END marker passed
  Vitest: 16 files, 176/176 tests passed
  Production Web build: passed
Dependency license inventory: 248 package/version records,
  11 observed license expressions, 0 exact exceptions; policy passed
High-severity dependency advisory audit: no known vulnerabilities
git diff --check: passed
```

These results were produced from the pinned local lockfile on 2026-08-20. They
do not replace the required GitHub CI run on the exact pushed commits. Official
CI remains pending until the owner authorizes Stage/Commit/Push.

## Acceptance review order

1. review the local diff and explicit non-goals;
2. obtain separate authorization for Stage/Commit/Push;
3. run the complete GitHub CI matrix;
4. resolve any formatter/type/test/build/license/security finding;
5. update this evidence with immutable run links and exact test totals;
6. conduct the owner acceptance review;
7. only after acceptance, prepare a separate Milestone 2 proposal.

## Validation limits

- The Foundation candidate is locally `CODE_REVIEWED` and `BUILD_TESTED` with
  Synthetic providers only; official CI and owner acceptance remain pending.
- `HARDWARE_TESTED`, `FLIGHT_TESTED`, and `STABLE` do not apply.
- There is no ExpressLRS Firmware modification, Range claim, device support
  claim, Browser provider, Android build, or hardware write.
- `ArtifactProvenance` and `VerificationPlan` are provisional shapes, not wired
  enforcement. Production CSP remains a later trusted-hosting/Release gate;
  GitHub Actions are pinned to verified immutable SHAs but still need this
  candidate's official CI run.
