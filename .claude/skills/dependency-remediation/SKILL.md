---
name: dependency-remediation
description: Careful remediation of Dependabot / pnpm audit findings. Prefers parent upgrades over overrides, reads changelogs, checks reachability and test coverage, surfaces high-risk findings without a clean fix for a human decision, and produces a routine PR plus one gated PR per decision that needs review, each with a QA Log. Run manually from a laptop.
---

# Dependency audit remediation

Policy lives in `docs/dependency-remediation/README.md`; this file is the procedure. The
primary metric is **open Dependabot alerts**, not the `pnpm audit` count.

There is no committed decision log. Two places hold the record: Dependabot keeps the dismissal
reason and comment for every alert we dismiss, and the PR bodies hold every other decision
(bumps, overrides, mitigations, accepted risks, verification). Never edit
`pnpm-workspace.yaml` overrides without explaining why in the PR.

## One pass, several PRs

Changes are split by gate so that the routine work merges every week and nothing waits on a
discussion it is not part of.

- **Routine PR**: `deps/<date>-routine`. In-range bumps, patch/minor parent upgrades, removal of
  dead or redundant overrides, dismissals (with their reasons repeated in the body), accepted
  normal-risk groups. Merged by the person running the pass alone once CI is green. The body
  carries the pass summary: alerts before and after by severity, what was deferred for cooling
  and until when, links to the gated PRs.
- **One gated PR per decision**: `deps/<date>-bypass-<pkg>`, `deps/<date>-major-<pkg>`,
  `deps/<date>-<pkg>` for a high-risk choice. Each carries only its own rationale and asks for
  its own review. Gated: cooling-period bypasses; major bumps; high-risk no-clean-fix choices;
  any change to a package on the sensitive list below.

Gated PRs are branched from `main`, not stacked on the routine PR, and rebased after it merges.
A little duplicate lockfile churn between them is acceptable; a blocked routine PR is not.

**Sensitive packages** (auth, crypto, storage). A change to any of these, or to a transitive
dependency reached only through one of them, is gated even when it is a patch bump:

- auth: `openid-client`, `oidc-client-ts`, `passport`, `passport-openidconnect`,
  `passport-oauth2-refresh`, `jsonwebtoken`, `jose`, `cookie-parser`, `express-rate-limit`,
  `rate-limit-redis`, `helmet`, `cors`
- crypto: `@scure/bip39`, `get-random-values`, `bcryptjs`
- storage: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@tweedegolf/*`,
  `@prisma/client`, `prisma`, `ioredis`

Keep this list in step with the direct dependencies of `packages/send/backend`,
`packages/send/frontend` and `packages/addon`.

## 0. Preconditions

- Clean checkout of `main`. Work starts on `deps/<date>-routine` (date as `YYYY-MM-DD`); each
  gated change gets its own branch from `main` (step 6).
- `HUSKY=0` exported (the pre-commit hook needs `pnpm` and `bun` on PATH, which laptops may lack).
- pnpm 10.16 or newer (`npx -y pnpm@10 ...` works when pnpm is not installed globally); the
  7-day cooling period in `pnpm-workspace.yaml` needs it (see step 3).
- `gh auth status` succeeds; the token can read and dismiss Dependabot alerts.
- Fresh install so `node_modules/.pnpm` matches the lockfile: `pnpm install --frozen-lockfile`.
- `scripts/override-drift.js` runs `npm view` by absolute path, not via PATH. If it exits with
  "npm not found" (Nix and some other setups), `export NPM_BIN="$(command -v npm)"`.
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
or **dev/test only**. Also note whether any package in the group is on the sensitive list.

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
the option they choose, in its own gated PR, with the decision recorded in that PR's
"Decision" section (see step 6).

## 3. Decide, one group at a time

**Cooling period first.** `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (7 days,
strict), so pnpm will not resolve a version published less than a week ago and fails with a
resolution error instead of falling back. Check the fix version's age before deciding:

```sh
npm view <pkg>@<version> time.<version>
```

If it is younger than 7 days and the group is **normal** risk, defer the group to the next
pass: leave the alert open and list it under "Deferred for cooling period" in the routine PR.
If the group is **high** risk, surface it for a human decision (step 2): wait for the cooling
period, or bypass it. A bypass goes in its own gated PR (`deps/<date>-bypass-<pkg>`) and covers
that one version only, by adding `name@version` to `minimumReleaseAgeExclude` (never a bare
package name, which exempts every future release); justify it in that PR and note the date it
ages out. On every pass, delete exclusions whose version is now at least 7 days old (routine
PR).

Walk this list in order and stop at the first rule that applies. Then assign the result to a
PR: a major bump, a high-risk choice from rule 5, or anything touching a sensitive package goes
in its own gated PR; everything else goes in the routine PR.

1. **In range.** The fixed version satisfies every parent's declared range. Re-resolve it (see
   step 4) and remove any override for it.
2. **Parent upgrade reaches the fix.** A newer release of the direct dependency pins or allows
   the fixed version. Bump the direct dependency's range in the owning `package.json`. Patch or
   minor freely; a major bump needs the changelog step and the coverage check, and goes in its
   own gated PR (`deps/<date>-major-<pkg>`). Remove overrides the bump makes redundant.
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
   never loads, and the condition that would make us revisit. Repeat the rationale in the
   routine PR's "Dismissed alerts" section:

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
     re-check condition in the routine PR's "Accepted / no upstream fix" section. If a
     Dependabot alert exists for it, leave the alert open; it is the reminder to re-check.

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

Do steps 4 and 5 on the routine branch first, then on each gated branch (`git switch -c
deps/<date>-<...> main`), so every branch stands on its own against `main`. Pruning (items 4
and 5) belongs to the routine branch; a gated branch touches only what its decision needs.


0. Check that `pnpm` >= 12.
1. `pnpm update <pkg> --lockfile-only`, then `git diff pnpm-lock.yaml` and confirm every changed line names `<pkg>`, then `pnpm install --frozen-lockfile` and the suites. If the version does not move, a parent pins it exactly — that is the parent-upgrade or override step, not a reason to delete entries from pnpm-lock.yaml.
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
   list it under "Deferred for cooling period" in the routine PR. Repeat until every remaining
   override is `needed`, or `forcing` with a justification in the PR.
6. `pnpm install --frozen-lockfile` must succeed on the result.
7. `node scripts/bump-versions.js` (repo convention: dependency changes bump the patch version in
   the six version files so CI validates them). Run it on every branch; the version files and
   lockfile will conflict between branches, which is expected (see step 6).
8. Before committing, revert files touched only by formatters: `ci:validate` runs `eslint --fix`
   and `prettier --write` and reformats committed files, and the frontend build writes into
   `packages/send/backend/public/`.

## 5. Verify

Verify each branch separately; each PR's QA Log covers only its own branch.

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

## 6. Commit and open the PRs

**Commits are concise.** Subject under 72 characters, body of a few lines at most naming the
direct bumps, override count change, and alert numbers fixed. Commit the dependency changes and
their supporting tests separately from any tooling or documentation changes. Do not put the
verification narrative in the commit.

Open every PR against `main` so integration and e2e run. Open the gated PRs first so the
routine PR can link to them. Link alerts by number so merging closes them.

**The PR is where the detail goes.** Routine PR body:

```markdown
## Summary
Pass summary: open alerts before -> after by severity (critical/high/medium/low), direct
bumps, overrides before -> after.

## Gated PRs
Link and one line per gated PR opened in this pass (omit if none).

## Changes by alert
| Alert | Package | Parent declares | Fix | Decision |
one row per group in this PR, decisions in the words of step 3

## Overrides
Added (with justification) / removed (with drift-script status).

## Dismissed alerts
Alert numbers, package, one-line rationale each (the 280-char API comment points here).

## Accepted / no upstream fix
Package, why it is low risk, re-check condition.

## Deferred for cooling period
Package, fix version, publish date, eligible date.

## QA Log
- bulleted list of every verification step actually run, with the command and the result
  (counts of test files/tests, build status, frozen-install result, audit before/after)
- what was NOT run locally and is left to PR CI (integration, e2e)
- lockfile duplicate check result
- drift-script summary after
```

Gated PR body, one per decision:

```markdown
## Decision
What needs review and why it is gated (bypass, major, high-risk choice, sensitive package).
For a high-risk group: what was reachable and how, the options presented with their risks and
benefits, who decided, what they chose and why, and the re-check condition if accepted or
deferred. For a major: breaking changes handled and where our code changed. For a bypass: the
`minimumReleaseAgeExclude` entry, why it could not wait, the date to remove it.

## Changes by alert
| Alert | Package | Parent declares | Fix | Decision |

## QA Log
Same as the routine PR, plus for each new test: file, what it drives, result against the old
and new versions.
```

**After the routine PR merges**, rebase each open gated branch onto `main`. Do not hand-merge
conflicts in `pnpm-lock.yaml` or the version files: take `main`'s copies, re-apply the branch's
`package.json` / `pnpm-workspace.yaml` edits, then run `pnpm install`,
`node scripts/bump-versions.js`, and `pnpm install --frozen-lockfile`. Force-push with
`--force-with-lease`.
