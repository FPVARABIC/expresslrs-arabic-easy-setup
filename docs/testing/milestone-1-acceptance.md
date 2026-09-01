# Milestone 1 Acceptance Evidence

Status: **Official CI passed; ready for owner acceptance review**.

Historical scope note: this record describes the M1 candidate at `5c543cb` on
`research/upstream-baseline`. [GitHub Actions run #7](https://github.com/melyanneahmed-rgb/expresslrs-arabic-easy-setup/actions/runs/32390823563)
passed that evidence-only successor. Later work on the isolated M2A branch does
not rewrite or imply owner acceptance of this M1 checkpoint.

This file maps the unchanged acceptance gate in
`docs/architecture/milestone-1-proposal.md` to evidence. It does not itself
accept the milestone.

| Gate | Candidate evidence | Current status |
| --- | --- | --- |
| Dependency direction enforced | `scripts/check-dependency-boundaries.mjs`; package graph plus Core React/DOM/browser exclusions are checked in `pnpm check` and CI | Passed locally and in CI |
| Core tests run without DOM/browser | Root Vitest project `core` uses `environment: node`, Core TypeScript configs use `ES2023` without DOM declarations, and Web has a separate `jsdom` project | Passed locally and in CI |
| Workflow failure fixtures end in non-success | Binding/Update provider-stage matrices plus wrong Target/version/no-return/no-link/permission/artifact, malformed SemVer, ignored cancellation, and adversarial input-mutation cases | Passed locally and in CI |
| Mock Easy Binding/Update demonstrate verification and recovery | `runEasyBinding`, `runFirmwareUpdate`, scripted providers, module facade, progress observer, and Web Mock invocation | Passed locally and in CI |
| Arabic RTL/English fallback smoke tests pass | Web tests plus catalog completeness, keyboard/focus, structured-error, clipboard privacy, scenario isolation, and viewport cases | Passed locally and in CI |
| CI clean | [GitHub Actions run #6](https://github.com/melyanneahmed-rgb/expresslrs-arabic-easy-setup/actions/runs/32389868663) passed on candidate commit `9db3f268d32732840d475281cd2435acbbe0f7bb` | Passed |
| No upstream copy or hardware-write implementation | Repository inventory, boundaries, Synthetic fixtures, no Browser/native/Firmware provider | Confirmed locally and in CI source tree |

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

These local results were produced from the pinned lockfile on 2026-08-20. The
same candidate tree was pushed to Draft PR #1 and GitHub Actions run #6 passed
the frozen install, formatting, lint/type/test/build, license inventory/policy,
and high-severity advisory gates. The evidence-only successor commit does not
change application code and must also retain a green PR check before review.

## Acceptance review order

1. confirm the evidence-only successor commit retains a green PR check;
2. review this evidence and the explicit non-goals;
3. conduct the owner acceptance review;
4. only after acceptance, prepare a separate Milestone 2 proposal.

## Validation limits

- The Foundation candidate is `CODE_REVIEWED` and `BUILD_TESTED` with Synthetic
  providers only; official CI passed and owner acceptance remains pending.
- `HARDWARE_TESTED`, `FLIGHT_TESTED`, and `STABLE` do not apply.
- There is no ExpressLRS Firmware modification, Range claim, device support
  claim, Browser provider, Android build, or hardware write.
- `ArtifactProvenance` and `VerificationPlan` are provisional shapes, not wired
  enforcement. Production CSP remains a later trusted-hosting/Release gate;
  GitHub Actions are pinned to verified immutable SHAs and were exercised by
  the successful official CI run.
