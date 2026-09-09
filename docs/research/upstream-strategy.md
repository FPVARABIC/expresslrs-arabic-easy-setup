# Upstream Integration Strategy

## Decision recommendation

Use a hybrid strategy: independent product repository, immutable upstream pin, auditable patch queue, generated integration worktree, and self-contained release source bundle.

## Options considered

| Option | Strength | Main weakness | Recommendation |
| --- | --- | --- | --- |
| Permanent firmware fork as product repository | Full history and direct firmware commits | Couples app/firmware histories and encourages growing fork delta | Reject as primary architecture |
| Git submodule | Immutable SHA and clear source boundary | Extra developer workflow and remote-availability dependency | Use as pinned development input if tooling proves acceptable |
| Vendored tree | Offline and self-contained | Large noisy diffs and harder upstream updates | Use only in release/source bundles |
| Patch queue | Each change is identifiable, testable, removable, and retireable | Requires conflict discipline | Use for all local Firmware changes |
| Build-time fetch | Small checkout | Network substitution and reproducibility risk | Allow only as verified cache hydration |
| Hybrid | Pinning, low delta, auditability, and releasable source | Requires automation and policy | **Recommended** |

## Proposed mechanics

1. The product repository remains canonical and independent.
2. `upstream.lock` or an equivalent machine-readable record identifies repository URL, tag, full SHA, inspection date, and source archive SHA-256.
3. A submodule or verified fetch materializes exactly that SHA; never `latest`, a floating branch, or an unverified tag.
4. Each Firmware change lives in an ordered patch record with:
   - patch ID and patch SHA-256;
   - upstream base SHA;
   - touched files and reason;
   - hypothesis and expected effect;
   - required tests and measured result;
   - upstream PR/status;
   - decision `KEEP / MODIFY / REJECT / RETIRED`.
5. Patches apply only in a disposable worktree or integration branch. Upstream source remains unmodified during Discovery.
6. A general improvement should be proposed upstream; once upstream contains an equivalent or better change, the local patch is retired.
7. Each release emits a materialized source bundle containing upstream source, patched source, exact target snapshot, scripts, configuration, notices, and provenance.

## Sync procedure

```text
Detect release
→ pin tag and full SHA
→ classify changes
→ inspect RF/protocol/binding/target-sensitive areas
→ create new official baseline
→ apply patch queue
→ build matrix
→ unit/integration tests
→ patch-specific regressions
→ hardware validation where required
→ release candidate
```

An upstream update never automatically merges RF-sensitive code into Stable.

## Reproducibility finding

ExpressLRS 4.1.0 source is necessary but not sufficient to reproduce its published binaries exactly. At the pinned tag:

- `.github/workflows/build.yml` checks out `ExpressLRS/Targets` without an immutable `ref`;
- `src/python/build_env_setup.py` clones Targets without a ref when absent;
- the workflow installs mutable PlatformIO/wheel inputs and updates packages;
- runner images and some tool/action references are not content-addressed.

Therefore we must maintain two identities:

- **Official artifact baseline:** exact official binary plus its locally calculated hash.
- **Controlled source baseline:** Firmware SHA + exact Targets SHA + pinned toolchain + zero patches.

The exact Targets SHA used to produce the official 4.1.0 artifact remains an open provenance question unless recovered from the corresponding workflow run.

## Healthy-fork indicators

Track:

- number and size of active patches;
- patch age and upstream status;
- conflicts per upstream release;
- percentage of patches with current evidence;
- time required to integrate a new upstream release;
- retired patches after upstream adoption.

The goal is the smallest necessary delta, not ownership of a permanent fork.
