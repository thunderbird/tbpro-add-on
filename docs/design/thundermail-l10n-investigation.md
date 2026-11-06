# Thundermail add-on localization — design & decisions

Status: design, pre-implementation. Last updated 2026-11-05.
Scope: Fluent-based localization for the Thundermail add-on and the send.tb.pro web app, translated via a dedicated Pontoon project, following the Mozilla VPN extension's repo/submodule model.

## Summary

All user-facing strings move into Fluent (`.ftl`) files. English (`en-US`) lives in this repo and is always bundled as the fallback; a bot syncs it to a `mozilla-l10n` translation repo that Pontoon reads and writes. Translations come back into the app through a git submodule pinned per release. The add-on's manifest strings (`_locales/*/messages.json`) are generated from the `.ftl` at build time, so translators only ever see Fluent. Launch locales: de, fr, it, ja, machine-pretranslated; anything missing falls back to English per message.

## Goals / non-goals

Goals (from the project brief):
- Add-on fully translated when shipped in Thunderbird Desktop; strings in Pontoon for community contribution.
- The same strings serve the web app (shared UI decision).
- Failure modes designed out: empty strings, broken English fallback, harder local development.

Non-goals / out of scope:
- Building a new translation mechanism, adopting a new translation tool beyond Fluent (leadership-mandated), or using a 3rd-party translation service (AI flow pending ASK-4).
- `@thunderbirdops/services-ui` strings (see Known gaps).
- Translating pages the add-on links to outside send-frontend (e.g. accounts dashboard).

## Decisions

| Topic | Decision |
|---|---|
| Format | **Fluent (`.ftl`)** for all translatable strings — hard requirement from leadership, confirmed by desktop (2026-11-04: "the general push is to move to Fluent"). WebExtension `messages.json` survives only as a build artifact for the manifest. |
| Scope | **Shared UI: add-on and the send.tb.pro web app.** All of send-frontend (~435 strings) plus the add-on shell. |
| English source | **Authored in this repo**, always bundled as fallback; bot-synced to the l10n repo. Pontoon doesn't care who commits English there; the l10n team may keep a review gate on sync PRs. (Pending explicit l10n-team OK.) |
| Translations in | Git **submodule**, **manually pinned per release** (desktop's model, 2026-11-04). No auto-bump bot — removes the VPN's silently-stalled-bot failure mode. |
| Missing translations | **Fall back to English per message.** Ship every locale regardless of completion. Empty strings must never render. |
| Machine translation | First pass for de, fr, ja, it via **Claude** (validated: placeholders, brand terms, native-speaker spot check). Lands as initial locale files; community refines in Pontoon afterward. |
| Existing epic | This replaces #1086 and children (#1088–#1092); #302 is a duplicate. #1087/PR #1093 (vue-i18n foundation) is superseded except as the services-ui footer shim. |
| services-ui strings | Out of scope; known gap. |

## Open items

| # | Item | Status |
|---|---|---|
| ASK-2 | Pontoon project + l10n repo creation | **Owned by desktop manager** (offered 2026-11-04, conditional fit confirmed: same structure as VPN, deviations = Fluent format + bot-synced English). Pontoon↔repo sync is automatic both ways; our manual step is the submodule pin. Needed by ~project midpoint. |
| ~~ASK-4~~ | Machine-translation approach | **Resolved (2026-11-05): AI-assisted flow using Claude**, with automated placeholder/brand-term validation and a native-speaker spot check. **Delivery: committed as initial locale files (import as approved); community reviews and refines in Pontoon afterward.** Launch locales ship complete from day one; the spot check is the quality gate before first ship. |
| — | English sync model sign-off (bot-authored English in the l10n repo, optional review gate) | With l10n team via desktop. |
| — | Taskcluster release checkout: does it init git submodules? | **Separate desktop item** (2026-11-04). If not: release XPI silently builds English-only; mitigated by a hard build guard either way. |
| — | Locale-coverage policy: is 4 locales + English acceptable for a built-in add-on (TB ships ~60 locales)? | Unanswered; could change scope. |
| ~~ASK-1~~ | Fluent hard requirement | Resolved: yes (leadership + desktop). |
| ~~ASK-3~~ | Where English is authored | Resolved as working assumption: this repo + sync (see above). |

## Architecture

### String flow, end to end

```
dev writes en-US .ftl in this repo ──(merge to main)──▶ sync bot PRs en-US ──▶ mozilla-l10n/thundermail-addon-l10n
                                                                                      ▲            │
                                                                            Pontoon reads en-US    │ Pontoon commits translations
                                                                                      └────────────┘
this repo ◀──(git submodule, manually pinned per release)── l10n repo
   │
   ├─ web build: .ftl bundled (en-US static, other locales lazy) ──▶ send.tb.pro
   └─ addon build: .ftl bundled + _locales/<locale>/messages.json GENERATED from .ftl
          ──▶ thundermail.xpi ──▶ vendored into comm-central (jar.mn packages extension/**) ──▶ messenger.jar ──▶ users
```

### File layout

- English source (this repo): `packages/send/frontend/src/locales/en-US/{addon,send}.ftl`
  - `addon.ftl`: add-on shell (app menu, experiment strings) + the manifest-source messages (name, description, cloud-file name) and brand terms.
  - `send.ftl`: shared Send UI. May split by area (`send-upload.ftl`, …) if parallel migration batches cause merge conflicts.
- Translations (submodule): `packages/send/frontend/src/l10n/<locale>/{addon,send}.ftl` — inside the frontend package so the web Docker image (`dockerfiles/Dockerfile-frontend` copies only `packages/send/frontend`) gets it with no change. Locale folders use hyphenated BCP-47 (`de`, `pt-BR`); Thunderbird's toolkit accepts hyphens in `_locales` too.
- The submodule's `.github/` is never copied into build output (VPN learned this the hard way: Firefox treats it as a broken locale).

### Runtime design

Library: `@fluent/bundle` + `@fluent/langneg` (Mozilla-maintained) behind a small composable, or `fluent-vue` — final pick during phase 1; the design below is library-agnostic.

- **Locale detection:** add-on surfaces use `browser.i18n.getUILanguage()` (Thunderbird's UI language, including quirks like `ja-JP-mac`); web uses `navigator.languages`. Both run through `negotiateLanguages(requested, available, { defaultLocale: 'en-US' })`, producing a fallback chain like `['de', 'en-US']`.
- **Loading:** `en-US` is statically imported (always in the bundle — the fallback can never be absent). Other locales load lazily via Vite dynamic import (`?raw`), keeping the web bundle small; in the add-on these resolve from the packaged extension files.
- **Resolution:** try bundles in chain order; a missing message, empty pattern, or format error falls through to the next bundle, ending at `en-US`. If even `en-US` lacks the ID: return the ID and report (console in dev, Sentry in prod). An empty string is treated as missing — it can never render.
- **Outside components:** the l10n module exports a plain `t(id, args)` not bound to Vue, used by `lib/messages.ts`, `lib/errorMessages.ts`, Pinia stores, and `packages/addon/src/background.ts`/`menu.ts` (which drops `browser.i18n.getMessage` in favor of the same module, so shell and UI share one system).
- **services-ui shim:** the footer (`StandardFooter`) resolves `footer.*` through the host's vue-i18n `$t`. Keep a minimal vue-i18n instance whose messages are *sourced from Fluent at init*, so there is still a single source of truth. Remove when services-ui drops the dependency.
- **Side effects of locale:** set `<html lang>` after negotiation; dynamically import the matching dayjs locale.
- **Brand terms:** `-thundermail-brand`, `-send-brand` Fluent terms; never translated.

### Build & release changes

- `packages/addon/scripts/build.sh`: new step generates `dist/_locales/<locale>/messages.json` (manifest keys only) from each locale's `addon.ftl`; excludes `.github/`. comm-central needs no change — `jar.mn` already globs `extension/**`.
- **Release guard:** production/system builds fail hard if the submodule is missing or empty ("silently English-only" becomes "loudly broken"). Dev builds run English-only without the submodule — local dev, unit tests, and e2e don't need it.
- **Sync bot:** GitHub Action on merges to `main` touching `en-US/*.ftl` opens a PR against the l10n repo. Needs write access from the l10n team.
- **Staleness check:** CI warns when the pinned submodule SHA is older than the l10n repo's `main`; pinning is a release-checklist item.
- CI linting (both repos' conventions): Fluent syntax, placeholder/term mismatches vs `en-US`, missing/unused/empty messages, typography rules the l10n team enforces (so their review doesn't bounce our syncs).

### Conventions

- Message IDs: Fluent kebab-case, prefixed by surface (`send-upload-expiration-never`, `addon-menu-sign-out`).
- Every message carries a translator comment (`#`) explaining context and placeholders; placeholders use meaningful names (`{ $fileName }`).
- Plurals and selects use Fluent selectors — this is the capability that justified Fluent over `messages.json`.

## Testing strategy

| Layer | What it covers |
|---|---|
| Unit | Negotiation (incl. `ja-JP-mac` → `ja`, `es-AR` → `es-ES`/`en-US`), full fallback chain, empty-equals-missing, outside-component `t()`, manifest `messages.json` generation. |
| CI lint | Syntax, placeholders, missing/unused/empty messages, typography. |
| Pseudo-locale | Accented/stretched English in dev builds to catch hardcoded strings and layout breakage before real translations exist. |
| e2e | Unchanged — runs in English; selectors are mostly test-ID based (116 vs 49 text selectors), so migration impact is low. 10 of 58 unit test files assert English text and need touch-ups. |
| Manual, per release | 4 locales × surfaces: app menu, compose popup, options/management page, manifest strings in TB preferences; plus the web app. German for length, Japanese for line-breaking and `ja-JP-mac`. Verified in a comm-central build (`sync-to-builtin.sh` → `mach run`) with language packs. |

A week-1 vertical slice (hand-made German locale through `.ftl` → generated `_locales/de` → XPI → comm-central → TB running in German) proves the pipeline and retires the packaging/negotiation unknowns before the migration starts.

## Plan

1. [release] Pontoon project + `mozilla-l10n/thundermail-addon-l10n` repo; agree English sync model (desktop-owned; needed by ~project midpoint).
2. [services] Fluent runtime + in-repo `en-US` fallback + locale detection + manifest generation + **week-1 German proof** (~1 week, M). Can start immediately.
3. [services] Submodule wiring, release guards, sync bot, staleness check, pin checklist (~1 week, M).
   3b. [desktop] Verify/enable submodule support in the Taskcluster release checkout (separate item).
4. [services] String migration in 8–10 batches by area: add-on shell + experiments; upload flow; dashboard/files; sharing/download; key recovery/backup; settings/deletion; errors/messages (2–3 weeks, L). Starts after 2; doesn't wait for the l10n repo.
5. [services] CI lint + contributor docs (S).
6. [services] Translation pass de/fr/ja/it — pre-translation or AI flow per ASK-4 (~2 days, S).
7. [desktop] Verify in Thunderbird after comm-central vendoring, language packs, `ja-JP-mac` (part of ~1 week QA, M).
8. [services] QA: layout, dates, `<html lang>`, English fallback, add-on + web (M).
9. (Follow-up, out of scope) services-ui locales and locale-source alignment.

## Estimates

**Engineering effort: 5–7 weeks** (26–36 working days) **+ up to 1 week contingency** (two named unknowns: Taskcluster submodule support; size of l10n review rework). AI-assisted, calibrated on this repo's delivery data (appendix).

| Work | Estimate |
|---|---|
| Fluent runtime, fallback, detection, manifest generation, pseudo-locale, outside-component strings | 4–6 days |
| String migration (~435 strings, 82 files, 8–10 batches) | 2–3 weeks |
| Lint + docs | 1–2 days |
| Submodule, release builds, guards, sync bot, pin checklist | 3–4 days |
| Pontoon intake + English corpus review rework + epic replacement | 3–5 days |
| Translation pass (4 locales) | 1–2 days |
| Desktop verification + QA | 4–5 days |

Elapsed time by staffing (3-person support-captain rotation takes 1 in 3 weeks off the table):

| Staffing | Elapsed |
|---|---|
| 1 engineer, in rotation | ~8–11 weeks (+ any holiday overlap) |
| 1 engineer, support weeks swapped onto external wait points | ~6–8 weeks |
| 2 engineers, staggered rotation (~1.3 FTE, never idles) | ~5–6 weeks; limited by review speed |

Assumptions: engineer knows the codebase; reviews turn around in ~1 day (~15–20 PRs — at p75 review latency (~4 days) add 1–2 weeks); not stacked on a full normal workload. Excluded: l10n team lead time beyond the midpoint gate, native-speaker review of machine translations, design/copy time, dedicated QA (add ~1 week if the engineer covers it), services-ui. Confidence ±25%. Users see translations in the first Thunderbird release containing the updated vendored add-on — cadence owned by desktop.

## Risks

1. **External gate:** the Pontoon project/repo must exist by the project midpoint; now owned by desktop, but l10n team responsiveness is unproven.
2. **Review throughput** is the biggest schedule lever we control (see assumptions).
3. **Taskcluster submodules** unverified — guarded by the hard release check; tracked with desktop (3b).
4. **Stale translations:** manual pinning means a forgotten pin ships old strings — release checklist + CI staleness warning.
5. **English leakage:** services-ui strings (en/de only) stay English in fr/ja/it; its locale choice (`localStorage`/`navigator.language`) may disagree with Thunderbird's UI language.
6. **Layout/locale edges:** German length, Japanese line-breaking, `ja-JP-mac` — covered by pseudo-locale + QA matrix.
7. **Translation freshness in Desktop:** strings freeze when `dist/` is vendored into comm-central; updates ride new landings/uplifts.
8. **Ramp-up:** Fluent is new to the team — short guide + careful review of early batches.

## Pontoon intake answers (sent via desktop; drafted 2026-11-04)

1. **Product:** Thundermail Add-on — built-in Thunderbird Desktop add-on for Thunderbird Pro (Thundermail address, appointments, Send file sharing). Same UI runs at send.tb.pro.
2. **Code & format:** github.com/thunderbird/tbpro-add-on. Fluent `.ftl` only; manifest `messages.json` generated at build time. `en-US` authored here, bot-synced.
3. **Repo structure:** `mozilla-l10n/thundermail-addon-l10n` (name TBC): `<locale>/{addon,send}.ftl`, hyphenated BCP-47 folders, consumed as a pinned submodule.
4. **Locales:** launch de, fr, it, ja + `en-US` (~435 messages). First MT pass supplied by us (Claude flow, validated), committed as initial locale files; community reviews/refines in Pontoon afterward. Community locales welcome; per-message English fallback makes partial locales safe.
5. **Testing:** see Testing strategy above.
6. **Cadence:** heavy source flow during migration, then feature-driven; translations snapshot per release; no hard string freeze initially, notice window before releases once stable. **ETA for `.ftl` in the l10n repo (kickoff-relative, assumed w/c Nov 9):** seed `en-US` ~2 weeks in (~Nov 20, ready for the Pontoon test sync); full ~435-message corpus by ~mid-Dec 2026 (incremental, staffing-sensitive); MT files for de/fr/it/ja pre-holidays best case, early–mid Jan realistic.
7. **Contacts:** engineering/project: **aaspinwall**; desktop manager as Pontoon liaison; backup to be named given the support rotation.

## Appendix A — current state (evidence, 2026-10-30)

- `packages/addon/public/_locales/en/messages.json`: 10 keys (1 unused), consumed by the manifest and `src/menu.ts` via `browser.i18n`. English only.
- send-frontend: vue-i18n scaffold from PR #1093 (`src/composables/i18n.ts`, 3 footer keys); no `$t()` callers. ~435 hardcoded strings: ~384 across 82 of 141 `.vue` files, ~38 in `.ts/.js` (`lib/messages.ts`, `errorMessages.ts`), ~15 in add-on shell/experiments (`TBProMenu` 'Back', `MailAccounts` errors, `THUNDERMAIL_DISPLAY_NAME`).
- The add-on bundles ~26 of those `.vue` files (compose popup + management page).
- `<html lang="en">` and English `<title>`s hardcoded in all three HTML entries; no dayjs locales loaded.
- Desktop packaging verified: comm-central `thundermail/jar.mn` globs `extension/**`; `sync-to-builtin.sh` rsyncs all of `dist/`. New locale folders ship without comm-central changes.
- `dockerfiles/Dockerfile-frontend` copies only `packages/send/frontend` — hence the submodule location.

## Appendix B — reference: Mozilla VPN extension

- WebExtension `messages.json` (not Fluent) behind a `tr()` wrapper; `mozilla-l10n/mozilla-vpn-extension-l10n` as submodule at `src/_locales`; English hand-authored there with l10n-PM CODEOWNERS review; Python linters for placeholders/typography; 32 locales, ~99% complete, pre-translation enabled.
- Its daily submodule auto-bump bot has produced nothing since 2026-01-21 — motivated our manual-pin decision.
- Ships on AMO, **not** built into Firefox; Firefox's built-in VPN feature uses in-tree Fluent. We deviate: Fluent format, English authored in-app-repo, manual pinning.

## Appendix C — estimate calibration (repo data, 2026-04-01 → 2026-10-30)

- 219 human merged PRs (~31/month); one engineer authored 76%; median PR 175 lines / 4 files.
- Review latency: median 23 h, p75 ~4 days, p90 ~8 days.
- AI co-authored commits rose from 1–4/month (Jan–May) to 14–21/month (Jun–Aug).
- Comparables: #934 rebrand (12-file string sweep, merged same day) → extraction is cheap; #1093 (8 files, 13 days open) → setup PRs are review-bound, not code-bound.
- Earlier, non-AI estimates for reference: Option A (WebExtension JSON everywhere) 7–9 weeks; Option B (Fluent) 8–10 weeks.
