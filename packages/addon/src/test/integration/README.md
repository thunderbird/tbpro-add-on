# Add-on Integration Tests (Tier 1: Fake-Host Harness)

This directory implements **Tier 1** of
`packages/send/e2e/ADDON-INTEGRATION-TEST-ENV-PLAN-2026-07-22.md`: a fast,
deterministic, CI-friendly harness that loads the **real** production
modules (`background.ts`, `menu.ts`, `token-bridge.js`, `init.ts`,
`UserMenu.vue`, `PopupView.vue`) against a fake multi-context Thunderbird
host, and drives the exact race windows described in
`packages/send/e2e/ADDON-BUG-REPORTS-2026-07-22.md` deterministically. It has
since grown a set of happy-path and startup specs that use the same harness
to pin down the behaviour that *should* keep working.

## Running

```sh
pnpm --filter addon test:integration
```

(equivalent to `VITE_TESTING=true VITE_SEND_CLIENT_URL=https://send.tb.pro
VITE_SEND_SERVER_URL=https://localhost:8088 vitest run src/test/integration`)

## What this harness is

`fakeThunderbirdHost.ts` simulates the 3 JS-only WebExtension execution
contexts this add-on has in a real running Thunderbird. `testHelpers.ts`
holds the shared per-spec setup/teardown boilerplate (`setupHost()` /
`teardownHost()` / `stubContext()` / `ADDON_ROOT` / `createDeferred()`) so
individual spec files stay focused on the race they're proving instead of
repeating harness wiring.

The three execution contexts:

- **background** — the non-persistent background page (`background.ts`)
- **popup** — the upload popup window (`PopupView.vue`)
- **web** — a plain browser tab running send.tb.pro, bridged via
  `token-bridge.js`

Each context gets its own independent `browser` mock object (mirroring the
real platform, where each JS realm has its own `browser.*` binding), but all
contexts share **one** fake `browser.storage.local` backing store with real
`storage.onChanged` firing — this is the actual cross-context sync primitive
in production (see `shared-pinia.ts`'s per-context-singleton comment), so a
real shared store (not per-context stubs) is essential for these tests to be
meaningful.

`browser.runtime.sendMessage` calls from any context fan out to every OTHER
context's registered `onMessage` listeners, exactly like real WebExtension
messaging. `browser.windows.create()` returns a deliberately controllable,
unresolved Promise (see `resolveNextWindowCreate()`) so tests can force exact
check-then-act interleavings (e.g. B3) that are effectively impossible to
reproduce reliably against a real window manager.

## What this harness deliberately does NOT do

Per the integration-environment plan's key finding: the hamburger/TBPro menu
(`menu.ts` + `public/api/TBProMenu/implementation.js`) is built with
`ChromeUtils.importESModule` + `ExtensionCommon.ExtensionAPI` — privileged
Thunderbird-internal APIs that only exist inside a real running Thunderbird
process. This harness stubs `browser.TBProMenu`, `browser.CloudFileAccounts`,
`browser.MailAccounts`, and `browser.AccountHub` as plain spies — it does
**not** attempt to simulate real chrome UI behavior for them. Tests only
assert that the right calls happened with the right arguments at the right
time, which is what the confirmed sync-race findings actually depend on.

Anything requiring real platform timing/window-manager behavior (B3's
magnitude-of-likelihood question, B5's background-page-recycle trigger
condition, C1's window auto-close-on-disable behavior) is explicitly a
**Tier 2/3** concern — see the environment plan doc — and is called out with
a "Needs live test" comment in the relevant spec here.

## Regression-test contract

Every spec in this directory is named after and directly traces to a finding
ID in `ADDON-BUG-REPORTS-2026-07-22.md` (e.g. `b1-*.test.ts` → finding B1).
Each spec:

1. Imports the **real** production module(s) under test (not
   reimplementations).
2. Drives the exact interleaving/race described in the finding.
3. Asserts either the **current (buggy) behavior**, with a `CONFIRMED BUG:`
   prefix in the test name, or — once the finding has been addressed — the
   **fixed behavior**, with a `FIXED:` prefix.

**A `CONFIRMED BUG:` spec is expected to FAIL once the underlying bug is
fixed.** That is the point — a failing spec here is the CI signal that a fix
landed. When that happens:

- Do not just delete the spec.
- Update it to assert the new, correct behavior instead (turn the
  `CONFIRMED BUG:` assertion into a `FIXED:` assertion of the desired
  outcome), so the fix gets permanent regression coverage.
- Remove the `Needs live test` caveat from the doc comment only if the fix
  addresses the client-side structural gap; live-test-only sub-questions
  (server-side outcomes, platform timing) still need Tier 2/3 verification
  even after a client-side fix lands.

## Coverage status

| ID | Spec file | Priority | State |
|----|-----------|----------|-------|
| A1 | `a1-logout-does-not-abort-popup-upload.test.ts` | Medium | `FIXED:` — SIGN_OUT rejects in-flight uploads and reaches the popup |
| A2 | `a2-origin-mismatch-logout-not-delivered.test.ts` | Medium | Resolved — asserts the bridge is injected on every shipped Send origin and nowhere else |
| A5 | `a5-logout-clears-unrelated-storage.test.ts` | Medium | Documents the current full wipe on logout |
| A6 | `a6-menu-stale-login-no-push-refresh.test.ts` | Medium | `FIXED:` — the bridge forwards session changes to the page |
| A7 | `a7-accounthub-login-races-web-login.test.ts` | Medium | `FIXED:` — first OIDC_USER write wins |
| B1 | `b1-rapid-attach-before-popup-ready.test.ts` | Medium | `CONFIRMED BUG:` |
| B2 | `b2-popup-close-mid-upload.test.ts` | Medium | `CONFIRMED BUG:` |
| B3 | `b3-popup-check-then-act-race.test.ts` | Medium | `CONFIRMED BUG:` |
| B4 | `b4-attach-while-popup-open.test.ts` | Medium | `CONFIRMED BUG:` |
| B5 | `b5-background-restart-loses-bookkeeping.test.ts` | **High** | `CONFIRMED BUG:` |
| C1 | `c1-disable-mid-upload-orphans-popup.test.ts` | **High** | `CONFIRMED BUG:` |
| C2 | `c2-reenable-trusts-stale-auth.test.ts` | Medium | `CONFIRMED BUG:` |
| D3 | `d3-init-single-flight-per-context-only.test.ts` | Medium | `FIXED:` — the init lock no longer deadlocks across contexts |

The state column is read off the test names; when you flip a spec from
`CONFIRMED BUG:` to `FIXED:`, update it here too.

**Happy-path and startup specs** (not tied to a finding ID) use the same
harness to lock in behaviour that must keep working:

- `happy-full-upload-golden-path.test.ts`, `happy-sequential-multi-file-reuse.test.ts`
  — attach → popup → upload → link, once and across popup sessions
- `happy-login-sync-across-contexts.test.ts`, `happy-clean-logout-no-inflight-work.test.ts`
  — login/logout propagate across background, popup and web contexts
- `happy-init-no-conflict.test.ts` — `init()` with an intact default folder
- `startup-missing-accounthub.test.ts`, `startup-storage-unreadable.test.ts`
  — the background survives a missing experiment API / unreadable storage
- `startup-sentry-gate.test.ts` — Sentry in the background page follows the
  Thunderbird telemetry pref (see `packages/send/docs/TelemetryOptOut.md`)

**Not yet covered** (deferred — see reasoning below):

- **A3** (forced-logout races concurrent multipart parts) and **A4**
  (cross-context refresh-token race) — both live in `auth-store.ts`'s OIDC
  client internals (`signinSilent()`, `MAX_CONCURRENT_PARTS` fan-out),
  which need deeper mocking of `oidc-client-ts`/`UserManager` than this
  harness currently provides. Left for a follow-up harness extension.
- **D2** (bridged-passphrase one-shot consume race) — needs the real
  `Keychain`/`bridgePassphrase.ts` wired into two contexts sharing storage;
  doable with this harness's shared-storage primitive, just not yet written.

Extend this harness's mocks (particularly around `oidc-client-ts` and
`Keychain`) to close the remaining three before considering Tier 1 complete
per the original environment plan's effort estimate.
