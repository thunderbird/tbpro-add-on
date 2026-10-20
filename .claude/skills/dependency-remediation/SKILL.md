---
name: dependency-remediation
description: Careful remediation of Dependabot / pnpm audit findings. Prefers parent upgrades over overrides, reads changelogs, checks reachability and test coverage, surfaces high-risk findings without a clean fix for a human decision, and produces a PR with a QA Log. Run manually from a laptop.
---

# Dependency audit remediation

Policy lives in `docs/dependency-remediation/README.md`; this file is the procedure. The
primary metric is **open Dependabot alerts**, not the `pnpm audit` count.

There is no committed decision log. Two places hold the record: Dependabot keeps the dismissal
reason and comment for every alert we dismiss, and the PR body holds every other decision
(bumps, overrides, mitigations, accepted risks, verification). Never edit
`pnpm-workspace.yaml` overrides without explaining why in the PR.

## 0. Preconditions

- Clean checkout of `main` on a new branch, e.g. `dependency-audit-YYYY-MM-DD`.
- `HUSKY=0` exported (the pre-commit hook needs `pnpm` and `bun` on PATH, which laptops may lack).
- pnpm 10.16 or newer (`npx -y pnpm@10 ...` works when pnpm is not installed globally); the
  7-day cooling period in `pnpm-workspace.yaml` needs it (see step 3).
- `gh auth status` succeeds; the token can read and dismiss Dependabot alerts.
- Fresh install so `node_modules/.pnpm` matches the lockfile: `pnpm install --frozen-lockfile`.
- Test environments: backend needs `packages/send/backend/.env` from `.env.sample` plus
  `docker compose up -d --wait minio`; addon needs `packages/addon/.env` (contents are in
  `.github/workflows/validate.yml`). Both files are gitignored.

## 1. Collect the starting state

```sh
gh api "repos/thunderbird/tbpro-add-on/dependabot/alerts?state=open&per_page=100" \
  --jq '.[] | "\(.number)\t\(.security_advisory.severity)\t\(.dependency.package.name)\t\(.dependency.scope)\t\(.security_vulnerability.vulnerable_version_range) -> \(.security_vulnerability.first_patched_version.identifier // "none")\t\(.security_advisory.ghsa_id)"'
pnpm audit --json > /tmp/audit-before.json
node scripts/override-drift.js --json > /tmp/drift-before.json   # --offline skips registry lookups
```

Group alerts by the direct dependency that owns the path (`pnpm why <pkg>`). For each group note:
vulnerable package and version, parent chain, each parent's declared range (from the drift
report), fixed version, and whether the path is **runtime** (shipped backend/frontend/addon code)
or **dev/test only**.

## 2. Classify risk first

Before choosing a fix, rate each group:

- **High risk**: runtime path, and the vulnerable code is reachable (the module is imported and
  the triggering input can come from a user or the network), or severity is critical/high on a
  runtime path and reachability cannot be ruled out.
- **Normal**: everything else (dev tooling, test-only, nightly-only, or runtime but provably
  unreachable).

A high-risk group is never deferred or accepted on your own judgement. When it has a clean fix
(rules 1-3 in step 3), apply it. When it doesn't (a young fix version, or only a breaking jump
or no fix at all), stop and put the decision to the person running the skill: lay out the
options, the risks and benefits of each (exposure while waiting, breaking changes and the code
they hit, test coverage of the vulnerable path, effort), and your recommendation. Apply only
the option they choose. Record each such group in the PR's "High-risk decisions" section (see
step 6).

## 3. Decide, one group at a time

**Cooling period first.** `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (7 days,
strict), so pnpm will not resolve a version published less than a week ago and fails with a
resolution error instead of falling back. Check the fix version's age before deciding:

```sh
npm view <pkg>@<version> time.<version>
```

If it is younger than 7 days and the group is **normal** risk, defer the group to the next
pass: leave the alert open and list it under "Deferred for cooling period" in the PR. If the
group is **high** risk, surface it for a human decision (step 2): wait for the cooling period,
or bypass it. A bypass covers that one version only, by adding `name@version` to
`minimumReleaseAgeExclude` (never a bare package name, which exempts every future release);
justify it in the PR and note the date it ages out. On every pass, delete exclusions whose
version is now at least 7 days old.

Walk this list in order and stop at the first rule that applies.

1. **In range.** The fixed version satisfies every parent's declared range. Re-resolve it (see
   step 4) and remove any override for it.
2. **Parent upgrade reaches the fix.** A newer release of the direct dependency pins or allows
   the fixed version. Bump the direct dependency's range in the owning `package.json`. Patch or
   minor freely; a major bump needs the changelog step and the coverage check, and is flagged in
   the PR. Remove overrides the bump makes redundant.
3. **Minimal override.** Only when the parent pins an exact version and the fix is a patch
   within the same major (for 0.x: the same minor). One narrow selector per package, e.g.
   `handlebars@4.7.9: 4.7.10`. Collapse overlapping selectors: pnpm applies one and shadows the
   rest. An in-range *pin* is also acceptable to hold a transitive at a known-good version
   inside its parent's range (e.g. keep `nx` at `23.2.1` when `23.3.0` drags in a vulnerable pin).
4. **Dismiss as unreachable.** The fix would be a breaking jump and the vulnerable module or
   code path provably never loads: grep `packages/*/src` for imports of the trigger module, check
   which integrations the app enables, check runtime config. Dismiss via the API with
   `dismissed_reason=not_used` and a comment of at most 280 characters. The comment is the
   permanent record for that alert, so it must stand on its own: what was checked, why the code
   never loads, and the condition that would make us revisit. Repeat the rationale in the PR's
   "Dismissed alerts" section:

   ```sh
   gh api -X PATCH repos/thunderbird/tbpro-add-on/dependabot/alerts/<n> \
     -f state=dismissed -f dismissed_reason=not_used -f dismissed_comment="<rationale>"
   ```

5. **No clean fix.** Split by risk:
   - **High risk**: surface it for a human decision (step 2). The options to lay out: upgrade
     the parent across the major and adapt our code to its breaking changes; take the fixed
     sub-dependency via a forcing override and prove compatibility with tests that cover the
     parent's use of it; patch around the vulnerable behaviour in our own code (input
     validation, disabling the feature) while the upstream fix is pending; or accept/defer,
     leaving the alert open with a re-check condition. Whichever change they choose, add
     coverage for the vulnerable path.
   - **Normal risk, no fix upstream**: accept. List the package, why it is low risk, and the
     re-check condition in the PR's "Accepted / no upstream fix" section. If a Dependabot alert
     exists for it, leave the alert open; it is the reminder to re-check.

### Changelog step (every bump, including transitive ones)

Read the release notes between current and target version. Note breaking changes, Node engine
changes, peer-dependency changes, and behaviour changes tests would not catch.

```sh
gh api "repos/<owner>/<repo>/releases?per_page=40" --jq '.[] | select(.tag_name | test("^v1[.]9[.]")) | "### \(.tag_name)\n\(.body)"'
npm view <pkg>@<version> dependencies peerDependencies engines
```

### Test-coverage check (every runtime bump)

Map the package to its import sites and config in `packages/*/src`, then to the suites that
exercise them:

- unit: vitest per package (`pnpm test` in backend, frontend, addon)
- integration: `pnpm run test:integration:ci` (docker, backend container)
- e2e: `packages/send/e2e/tests/*.spec.ts` via `e2e-test.yml` or `pnpm --filter send-suite-e2e test:e2e:headless`
- nightly BrowserStack suites do **not** run on PRs; treat them as uncovered.

If nothing exercises the path, add a test in the same PR that drives the vulnerable behaviour
through our code (for example, X-Forwarded-For handling behind `trust proxy` for `proxy-addr`).
Then proceed with the upgrade. The new test and what it proves go in the QA Log.

## 4. Apply and prune

1. Edit `package.json` ranges and `pnpm-workspace.yaml` overrides as decided; then `pnpm install`.
2. **Lifting a transitive dependency within its parent's range**: `pnpm update <pkg>` only
   touches direct dependencies (even with `--depth Infinity`) and `pnpm dedupe` does not lift
   single versions. Delete the stale package's entries from the `packages:` and `snapshots:`
   sections of `pnpm-lock.yaml`, run `pnpm install`, and pnpm re-resolves just those. Finish with
   `pnpm install --lockfile-only` so the lockfile is written in pnpm's own format.
3. Check for new duplicate copies: compare the set of packages with more than one version
   against `main`. A second copy of a runtime library (vue, vue-i18n, pinia) is a regression;
   fix it with an in-range pin or by restoring the previous version before moving on.
4. Prune `minimumReleaseAgeExclude`: remove every entry whose version is now 7 days old or
   older. The list should be empty unless a high-risk bypass from step 3 is still within its week.
5. `node scripts/override-drift.js --json > /tmp/drift-after.json`. Delete overrides reported
   `dead` or `redundant`; collapse `shadowed` duplicates. Do not delete an `ineffective`
   override: it usually means the lockfile has not picked up the target yet (e.g. an override
   to `^3.1.8` while `3.1.7` is locked), and deleting it drops the fix. Re-resolve the package
   as in item 2 and re-run the report. If the target now resolves, judge the override by its
   new status. If pnpm cannot resolve it because of the cooling period, keep the override and
   list it under "Cooling period" in the PR. Repeat until every remaining override is `needed`,
   or `forcing` with a justification in the PR.
6. `pnpm install --frozen-lockfile` must succeed on the result.
7. `node scripts/bump-versions.js` (repo convention: dependency changes bump the patch version in
   the six version files so CI validates them).
8. Before committing, revert files touched only by formatters: `ci:validate` runs `eslint --fix`
   and `prettier --write` and reformats committed files, and the frontend build writes into
   `packages/send/backend/public/`.

## 5. Verify

- `pnpm audit --json > /tmp/audit-after.json`; compare with the before file.
- Backend (`packages/send/backend`, MinIO up): `pnpm prisma generate && pnpm ci:validate && pnpm typecheck`.
- Frontend (`packages/send/frontend`): `pnpm ci:validate && pnpm build` (`ci:validate` includes `typecheck`).
- Addon (`packages/addon`): `pnpm ci:validate && pnpm build`, then `pnpm typecheck` on its own: it
  is known to fail on `main`, so compare, don't block.
- Integration and e2e when a runtime path changed; otherwise rely on PR CI and say so in the QA Log.
- For every high-risk change chosen in step 3: run the new test against the *old* version too (it should fail
  or show the vulnerable behaviour) and against the new version (it passes). Both results go in
  the QA Log.
- `gh api ".../dependabot/alerts?state=dismissed"` shows the new dismissals with their comments.
- `git diff main -- pnpm-workspace.yaml` shows only removals plus the justified additions, and
  `minimumReleaseAge` / `minimumReleaseAgeStrict` are untouched.

## 6. Commit and open the PR

**Commits are concise.** Subject under 72 characters, body of a few lines at most naming the
direct bumps, override count change, and alert numbers fixed. Commit the dependency changes and
their supporting tests separately from any tooling or documentation changes. Do not put the
verification narrative in the commit.

**The PR is where the detail goes.** Body structure:

```markdown
## Summary
One paragraph: alerts addressed, direct bumps, overrides before -> after.

## Changes by alert
| Alert | Package | Parent declares | Fix | Decision |
one row per group, decisions in the words of step 3

## High-risk decisions
One subsection per high-risk group put to a human (omit the section if none): what was
reachable and how, the options presented with their risks and benefits, who decided, what they
chose and why. If a change was made: what breaking changes were handled and where our code
changed, which test now covers the path. If accepted or deferred: the re-check condition.

## Overrides
Added (with justification) / removed (with drift-script status).

## Dismissed alerts
Alert numbers, package, one-line rationale each (the 280-char API comment points here).

## Accepted / no upstream fix
Package, why it is low risk, re-check condition.

## Cooling period
Deferred: package, fix version, publish date, eligible date. Bypassed (high risk, human
decision only): the `minimumReleaseAgeExclude` entry added, why it could not wait, date to
remove it.

## QA Log
- bulleted list of every verification step actually run, with the command and the result
  (counts of test files/tests, build status, frozen-install result, audit before/after)
- for each new test: file, what it drives, result against old and new versions
- what was NOT run locally and is left to PR CI (integration, e2e)
- lockfile duplicate check result
- drift-script summary after
```

Open the PR against `main` so integration and e2e run. Link alerts by number so merging
closes them.
