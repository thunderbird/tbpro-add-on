# Plan: Add-on ↔ Hamburger Menu ↔ Popup ↔ Web-Client Integration Test Environment

**Date:** 2026-07-22
**Author:** Munky (assistant), for Alejandro
**Motivation:** The 17 A/B/C/D sync-race findings in
`ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md` were all confirmed by source
reading + unit tests, but every one of them carries a caveat like *"needs
live Thunderbird testing"* because this repo has **no automated harness that
actually runs the four surfaces together** the way a real user's Thunderbird
does. This plan proposes building that harness.

---

## 1. The four surfaces, restated

| # | Surface | Where it lives | Runs inside real TB as |
|---|---|---|---|
| 1 | **Background script** | `packages/addon/src/background.ts` (system build, has experiment APIs) / `packages/send/frontend/src/background.ts` (plain/dev twin) | a non-persistent WebExtension background page |
| 2 | **Upload popup** | `packages/send/frontend/src/apps/send/views/PopupView.vue`, opened via `browser.windows.create(index.extension.html)` | a real OS popup window |
| 3 | **Hamburger/TBPro menu** | `packages/addon/src/menu.ts` + `public/api/TBProMenu/implementation.js` | **privileged chrome UI injected directly into `messenger.xhtml`** via `ChromeUtils`/`ExtensionCommon.ExtensionAPI` — this is not a webpage, not a popup, not reachable by web-ext/Playwright at all |
| 4 | **Web client** | `packages/send/frontend` (send.tb.pro), bridged via `public/token-bridge.js` content script | an ordinary tab, or the in-app `UserMenu.vue` |

**The key finding from source review:** surface #3 (hamburger menu) is built
with `ChromeUtils.importESModule('resource:///modules/cloudFileAccounts.sys.mjs')`
and `ExtensionCommon.ExtensionAPI` — these are Thunderbird-internal privileged
APIs that only exist inside an actual running Thunderbird process. **There is
no way to test the hamburger menu without a real Thunderbird binary.** Any
"integration environment" that wants to cover all four surfaces, including
the menu, must ultimately drive a real Thunderbird window. Everything else
(background, popup, web client, token-bridge) *can* be faked/simulated
outside Thunderbird, and should be, for speed — but the menu is the forcing
function for a real-Thunderbird tier.

This means the environment should be **three tiers**, not one — each tier
trading off speed/determinism against realism, matching what each of the 17
findings actually needs to be verified.

---

## 2. Tier 1 — Fake-host cross-context harness (fast, deterministic, CI-friendly)

**Goal:** Simulate the *3 JS-only* surfaces (background, popup, web-tab) as
separate execution contexts communicating only through the same primitives
they use in real Thunderbird — `browser.runtime.sendMessage`,
`browser.storage.local` (+ `onChanged`), `browser.windows`, `browser.tabs`,
and `window.postMessage`/content-script bridging — without needing Thunderbird
at all. This directly targets 13 of the 17 A/B/C/D findings (everything
except the ones that fundamentally need real platform timing/window
management: B3, B5, C1, and the live-account-effect halves of A3/B2).

### Why this is worth building first
- It's the **only tier that can deterministically control timing** — most of
  the 17 findings are races that are rare/unreproducible by hand. A fake host
  can force the exact interleaving (e.g. "fire `SIGN_OUT` exactly while an
  upload's `fetch()` is in flight") every single run.
- Runs in plain Node/Vitest, no Docker, no Thunderbird binary, no macOS-only
  tooling — can run in CI on every PR.
- Reuses infrastructure that already exists: `packages/addon/src/test/*`
  already mocks `browser.*`; `initSharedPinia()` already isolates state per
  context; the existing 41 addon unit tests are close to this shape already,
  just single-context.

### What to build
1. **`packages/addon/src/test/fakeThunderbirdHost.ts`** — a shared test
   utility that:
   - Creates 2–3 independent `browser.*` mock instances (one per simulated
     context: background, popup, web-tab), each with its own
     `runtime.onMessage` listener array, but sharing one **fake
     `browser.storage.local`** backing store with real `onChanged` firing
     (this is the actual cross-context sync primitive in production — a real
     shared store is important, not per-context mocks).
   - Wires `browser.runtime.sendMessage` calls from any context to fan out
     to every other context's `onMessage` listeners (mirrors real
     WebExtension messaging).
   - Provides a fake `browser.windows.create/onRemoved` that tracks
     "popup window" lifecycle so `popupWindowId` logic can be exercised
     (open/close/check-then-act races).
   - Provides fake `browser.tabs.create/query/sendMessage` for the
     token-bridge web-tab simulation.
   - Exposes a manual clock (vitest fake timers) so tests can pause
     execution mid-`await` and interleave two contexts' code deterministically.
   - Stubs `browser.TBProMenu`, `browser.CloudFileAccounts`,
     `browser.MailAccounts`, `browser.AccountHub`, `browser.cloudFile` as
     spies (Tier 1 does not need real chrome UI — it only needs to assert
     *that* `menuLoggedIn`/`menuLogout`/`registerProvider` etc. were called
     with the right args at the right time, which is what actually matters
     for the sync-race bugs).
2. **Load the *real* `background.ts`, `menu.ts`, `token-bridge.js`, and
   `PopupView.vue`/auth-store code into each simulated context** (not
   re-implementations) — import the actual modules and mount them against
   the fake `browser` global per context, the same way the current single-
   context unit tests already do, just three instances instead of one.
3. **Write one integration spec per confirmed finding**, in a new
   `packages/addon/src/test/integration/` dir, e.g.:
   - `a1-logout-during-upload.test.ts`
   - `a4-concurrent-token-refresh.test.ts`
   - `a5-logout-clears-unrelated-storage.test.ts`
   - `b1-rapid-attach-before-popup-ready.test.ts`
   - `b2-popup-close-mid-upload.test.ts`
   - `b4-attach-while-popup-busy.test.ts`
   - `c2-reenable-stale-token.test.ts`
   - `d2-passphrase-consume-race.test.ts`
   - `d3-cross-context-duplicate-folder.test.ts`
   - … etc. Each test drives the fake host into the exact race window
     described in the finding and asserts the *current* (buggy) behavior,
     so these specs double as **regression tests once each bug is fixed** —
     they should fail today (documenting the bug) and pass after a fix.
4. Add `pnpm --filter addon test:integration` script wired into
   `ci:validate` alongside the existing unit tests.

### Effort estimate
Medium — 1 fake-host utility (~1–2 days) + ~13 integration specs (~0.5–1 day
each depending on how deep the race is) ≈ **1.5–2.5 weeks** for full A/B/C/D
coverage. Can be delivered incrementally, ticket by ticket, in the same
order as the triage priority list (B5/B1/B2/B4 first as High/Medium client
bugs, then the A-series auth races, then C/D).

---

## 3. Tier 2 — Real Thunderbird, lightweight (manual + semi-scripted smoke)

**Goal:** Get the actual hamburger menu, actual popup window management, and
actual `cloudFile.onFileUpload` compose integration under test, without
paying for a full comm-central source build. Use this for the things Tier 1
*cannot* touch: B3 (real popup-window race timing), B5 (does TB's WebExtension
platform actually recycle a non-persistent background page mid-upload), C1
(does disabling the add-on actually close its windows).

### Environment
- **Thunderbird Daily/Nightly** build (not the release build already
  installed at `/Applications/Thunderbird.app`, currently 148.0.1 release).
  Daily builds ship with `xpinstall.signatures.required=false` and
  `extensions.experiments.enabled=true` by default, so the add-on's
  `experiment_apis` (TBProMenu, CloudFileAccounts, MailAccounts, AccountHub)
  load without needing a full source build or signing.
  - Download: https://www.thunderbird.net/en-US/download/daily/
  - Alternative: flip the two prefs above on the existing release install via
    a dedicated test profile (`./thunderbird -P tb-addon-test-profile`) if
    Daily is undesirable — needs verifying those prefs aren't locked in
    release builds on macOS; Daily is the documented, lower-friction path.
- **Local Send stack** — reuse the existing `docker compose` stack
  (`compose.yml`) exactly as-is: `pnpm dev:send` brings up postgres +
  backend + reverse-proxy (`https://localhost:8088`) + frontend
  (`http://localhost:5173`).
- **Add-on build** — `pnpm --filter addon build:dev:system:local` (the repo
  already has this exact "system add-on wired to localhost" build path
  documented in `packages/addon/README.md`). Handles the self-signed cert
  gotcha via the documented `security.enterprise_roots.enabled=true` +
  macOS keychain trust, so `wss://` uploads work end-to-end against the
  local backend.
- **Install** — for Daily, install the built `dist/` as a **temporary
  add-on** (Tools → Developer Tools → Debug Add-ons → Load Temporary
  Add-on → select `dist/manifest.json`). This is the closest to "real"
  without a comm-central build: real chrome hamburger menu, real popup
  windows, real cloudFile provider registration — just running under the
  standalone id instead of the system id (acceptable for everything except
  `installGate.ts`/`selfUninstall.ts`'s id-keyed guards, which are Tier 3's
  job).

### What to script vs. do by hand
- **By hand (exploratory, ad hoc):** clicking the hamburger menu, watching
  it update after login/logout, dragging attachments into compose to trigger
  multiple `onFileUpload` events close together (for B3), disabling the
  add-on mid-upload from the Add-ons Manager (for C1).
- **Semi-scripted via Marionette** (Thunderbird ships Marionette support —
  see `mach marionette-test`): write a small Python/JS Marionette script
  that drives the already-running Daily instance (connect over the
  Marionette port) to click hamburger menu items, open compose windows, and
  attach files programmatically with controlled timing — this gets you
  repeatable B3/C1 checks without needing the full comm-central mochitest
  environment. Marionette can attach to *any* running Thunderbird that was
  started with `--marionette`, it doesn't require building from source.

### Effort estimate
Low-to-medium — mostly reuses existing repo tooling (build:dev:system:local,
docker compose, the documented cert-trust steps). Main new work is a
Marionette driver script (~2-3 days) plus a written exploratory test
checklist for the manual parts. Good candidate for a fast follow after Tier 1.

---

## 4. Tier 3 — Full comm-central mochitest (authoritative, CI-grade, heavy)

**Goal:** The only environment that is bit-for-bit what a real Thunderbird
user runs: the add-on vendored at
`comm/mail/extensions/builtin-addons/thundermail/extension/`, built under the
**system add-on id**, loaded from `resource://builtin-addons/thundermail/`,
enabled by default, tested via Thunderbird's own mochitest browser-test
framework (`mach mochitest`) which mounts full `messenger.xhtml` windows and
uses `EventUtils`/`BrowserTestUtils` to script real UI — including the
hamburger menu — headlessly in CI.

This is the tier that fully retires every "needs live Thunderbird testing"
caveat in `ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md`, including the ones
Tier 2 can't reach cheaply (C2's exact downstream 401 surfacing, D1/D2's
sub-second multi-window timing, general "does the dashboard actually show an
orphaned item" questions).

### Environment
1. **comm-central checkout + build** — follow
   https://developer.thunderbird.net/thunderbird-development/setting-up-a-build-environment
   (macOS prerequisites doc referenced from that page). This is a multi-hour
   one-time build (`./mach bootstrap` + `./mach build`), needs its own disk
   budget (~30GB+) and is the heaviest part of this plan.
2. **Vendor the add-on** — the repo already has the tooling for this:
   ```sh
   export TB_COMM_SRC=/path/to/comm-central
   pnpm --filter addon sync:builtin:local   # or sync:builtin for prod/stage
   cd "$TB_COMM_SRC" && ./mach build faster
   ```
3. **Write mochitest browser tests** under a new
   `comm/mail/extensions/builtin-addons/thundermail/test/browser/` dir (or
   wherever Thunderbird's own extension mochitests for built-ins live —
   confirm exact convention against `mail/components/extensions/test/browser`
   as a template), scripting:
   - Hamburger menu state transitions (logged-out → logged-in →
     stale-after-external-logout, matching A6).
   - Real `cloudFile.onFileUpload` firing from an actual compose window with
     multiple attachments dropped in quick succession (B1/B3/B4 with real
     platform timing instead of simulated).
   - Disabling/re-enabling the add-on via `AddonManager` mid-upload (C1/C2)
     and asserting on real window lifecycle (does TB actually close the
     popup window it opened?).
   - A genuine background-page teardown/restart forced via
     `Extension.terminateBackground()` or profile idle-shutdown timers, to
     settle B5's core platform question.
   - Full `SIGN_OUT`/logout-tab race against the real menu using
     `BrowserTestUtils.openNewForegroundTab` + `EventUtils.synthesizeMouseAtCenter`
     on the actual injected `tbpro-menu-id-*` XUL elements from
     `public/api/TBProMenu/implementation.js`.
4. **Run with `mach mochitest --headless`** in CI via a new GitHub Actions
   job (separate from the existing `e2e-*` Playwright jobs, since this
   requires a full comm-central build environment/container — likely its
   own scheduled/nightly job rather than per-PR, given build time).

### Effort estimate
High — the comm-central build/bootstrap alone is a multi-hour one-time cost
and a non-trivial CI image to maintain (would need a persistent
prebuilt-object-directory cache akin to Mozilla's own CI, or accept slow
builds). Writing the actual mochitest specs is comparable effort to Tier 1's
integration specs, but each one requires learning Thunderbird's
mochitest/`BrowserTestUtils` idioms rather than reusing existing
Vitest/Playwright knowledge already in this repo. Estimate **3–5 weeks**
including the one-time environment setup, best treated as a follow-on
investment once Tier 1 has already caught the cheap wins and Tier 2 has
validated the riskier findings by hand.

---

## 5. Recommended sequencing

| Order | Tier | Covers | Effort | When |
|---|---|---|---|---|
| 1 | **Tier 1** (fake host) | A1,A2,A4,A5,A6,A7,B1,B2,B4,C2,D1,D2,D3 (13/17) | 1.5–2.5 wk | Now — highest bug-catching ROI, no infra needed, can start immediately, doubles as CI regression suite |
| 2 | **Tier 2** (real Daily + temp install) | B3,C1 fully; B5,A3,B2 partially (real timing/platform confirmation) | few days–1 wk | Right after Tier 1, or in parallel — mostly reuses existing repo tooling |
| 3 | **Tier 3** (comm-central mochitest) | Closes every remaining live-Thunderbird caveat, becomes permanent regression coverage for the real shipped built-in add-on | 3–5 wk | Later — biggest investment, best justified once Tier 1+2 have already fixed/confirmed the cheaper findings and the team wants durable CI coverage matching production exactly |

**Immediate next step recommendation:** Start Tier 1 with the `B5` and `B1`
specs first — both are already High/Medium priority in the triage table
(`TICKET-TRIAGE-TABLE-2026-07-21.md`) and are pure background/popup-queue
logic with no chrome-menu dependency, so they're the fastest path to a
working fake-host harness plus a first real regression test.

---

## 6. Open questions / things to confirm with the team before starting

1. **Daily vs. profile-pref-flip for Tier 2** — confirm whether
   `xpinstall.signatures.required` / `extensions.experiments.enabled` are
   actually user-settable (not policy-locked) on the release
   `/Applications/Thunderbird.app` 148.0.1 already installed, which would let
   Tier 2 skip downloading Daily entirely.
2. **Marionette script maintenance owner** — Tier 2's semi-scripted timing
   tests are the newest kind of test this team would maintain; confirm who
   owns Marionette-based scripts going forward (vs. Playwright, which the
   team already owns via `packages/send/e2e`).
3. **Tier 3 CI budget** — a full comm-central build is a large, ongoing CI
   cost (compute + cache storage). Confirm whether this is worth a dedicated
   nightly job vs. running it manually/quarterly as a spot-check before
   major releases.
4. **Mochitest test location convention** — confirm with a Thunderbird
   platform engineer where built-in-add-on-specific mochitests should live
   in the comm-central tree (this plan assumes alongside
   `mail/components/extensions/test/browser` but that needs verifying
   against current comm-central conventions, which may have changed).
