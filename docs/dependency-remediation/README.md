# Dependency vulnerability remediation

Our policy for fixing Dependabot findings.

By using a more intelligent process using Claude and linked skill, we can reduce risk and avoid
unnecessary churn. This means:

- We can avoid changes deps when the vulnerable code is not reachable by us
- We can minimize `overrides`, which cause the lockfile to be re-evaluated, which can in turn
  introduce *new* vulns while we are trying to fix others.
- We can check that the sub-dep is compatible with the parent.
- We can consider safely upgrading parents of vulnerable sub-deps.
- We can detect missing test coverage related to dep upgrades and add it.

## Decision order

For each advisory group, take the first rule that applies:

1. **In range.** The fixed version already satisfies every parent's declared range. Just
   `pnpm update <pkg>`.
2. **Parent upgrade.** A newer direct dependency pins or allows the fix. Bump it (patch/minor
   freely; major only after the changelog and coverage checks below).
3. **Minimal override.** The parent pins an exact version and the fix is a patch within the same
   major. One narrow selector per package.
4. **Dismiss as unreachable.** The fix would be a breaking jump and the vulnerable code provably
   never loads in this app. Dismiss the Dependabot alert with reason `not_used` and a comment
   that records why and when to revisit.
5. **Accept or defer.** No fix exists or the only fix is a risky jump on a production path.
   Here, deeper compatibility analysis can be performed.

Every bump gets its release notes read. Every runtime bump gets a **test-coverage check**.
If the case is not covered, add coverage and proceed.

## Tooling

`node scripts/override-drift.js` classifies every override in `pnpm-workspace.yaml`:

| Status | Meaning | Action |
|---|---|---|
| `dead` | matches no parent in the lockfile | delete |
| `ineffective` | a matched parent still resolves outside the override's target | fix or delete |
| `redundant` | parents would resolve to a fixed version on their own | delete |
| `needed` | in range for every parent; the override is what holds the fixed version | keep, log |
| `forcing` | a parent runs a version outside its declared range (`worstJump` says how far) | justify in the log or replace with a parent upgrade |

`shadowed` marks overlapping selectors for the same package. Pass `--offline` to skip the
registry lookups that distinguish `redundant` from `needed`.

## Primary metric.

**Open Dependabot alerts** not `pnpm audit` is our primary metric.

`pnpm audit` keeps counting advisories we dismissed in GitHub.

