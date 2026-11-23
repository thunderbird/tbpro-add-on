# Add-on Integration Tests (Tier 1: Fake-Host Harness)

This directory is **Tier 1** of the add-on's integration testing: a fast,
deterministic, CI-friendly harness that loads the **real** production
modules (`background.ts`, `menu.ts`, `token-bridge.js`, `init.ts`,
`UserMenu.vue`, `PopupView.vue`) against a fake multi-context Thunderbird
host, and deterministically drives the exact race windows described in the
add-on's cross-context sync bug issues. It also has happy-path and startup
specs that use the same harness to pin down the behaviour that *should* keep
working.

Test-coverage work is tracked in #1034. Tier 2 (a pass against real
Thunderbird Daily) is #1084 and Tier 3 (a full source build) is #1085.

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
check-then-act interleavings (e.g. two upload popups opening at once, #1028)
that are effectively impossible to reproduce reliably against a real window
manager.

## What this harness deliberately does NOT do

The hamburger/TBPro menu (`menu.ts` +
`public/api/TBProMenu/implementation.js`) is built with
`ChromeUtils.importESModule` + `ExtensionCommon.ExtensionAPI` — privileged
Thunderbird-internal APIs that only exist inside a real running Thunderbird
process. This harness stubs `browser.TBProMenu`, `browser.CloudFileAccounts`,
`browser.MailAccounts`, and `browser.AccountHub` as plain spies — it does
**not** attempt to simulate real chrome UI behavior for them. Tests only
assert that the right calls happened with the right arguments at the right
time, which is what the confirmed sync-race findings actually depend on.

Anything requiring real platform timing/window-manager behavior (how likely
two popups really are to race in #1028, whether Thunderbird actually recycles
the background page mid-upload in #1017, whether disabling the add-on closes
its windows in #1018) is explicitly a **Tier 2/3** concern — see #1084 and
#1085 — and is called out with a "Needs live test" comment in the relevant
spec here.

The harness also doesn't yet mock `oidc-client-ts`/`UserManager` or wire a
real `Keychain` into multiple contexts, so races inside token refresh and
passphrase restore aren't covered here. Remaining coverage work is tracked in
#1034.

## Bug-reproduction specs

Some specs reproduce a specific bug. Each one:

1. Links the GitHub issue it reproduces in its doc comment.
2. Imports the **real** production module(s) under test (not
   reimplementations).
3. Drives the exact interleaving/race described in the issue.
4. Asserts either the **current (buggy) behavior**, with a `CONFIRMED BUG:`
   prefix in the test name, or — once the bug has been fixed — the
   **fixed behavior**, with a `FIXED:` prefix.

To see which reproduced bugs are still open, search this directory for
`CONFIRMED BUG:`.

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
