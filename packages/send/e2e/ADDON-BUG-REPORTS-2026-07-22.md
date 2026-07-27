# Add-on Bug Reports — For Ticket Filing

**Source:** Distilled from `ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md` (full
evidence/repro detail) and `TICKET-TRIAGE-TABLE-2026-07-21.md` (priority
rationale). This file is the **concise, agent-consumable version** — enough
to verify and file a ticket without reading the full findings doc, but link
back to it for deep evidence if needed.

**Verification method for all 17:** confirmed via direct source-code
re-reading + existing/new vitest unit test runs. **None involved live
Thunderbird testing** — see the "Needs Live Test" column; treat those as
"structural gap 100% confirmed, exact runtime outcome unconfirmed."

**Scope:** add-on client only (background script / popup / hamburger menu /
web-app token-bridge sync). Backend bugs (BUG-1..8) are tracked separately
and are NOT in this file. **Total: 17 add-on findings** (1 High client bug
was previously grouped only in the priority-table pass and is restored here
as C1 alongside B5).

**All repro/evidence file paths are relative to** `~/.openclaw/workspace/projects/tbpro-add-on/`.

---

## How to use this file (for the filing agent)

For each item below:
1. Open the cited file(s)/line(s) and confirm the code still matches the
   quoted snippet (repo may have moved since 2026-07-21).
2. If confirmed unchanged: file a ticket using Title + Priority + Summary +
   Repro/Evidence + Fix as the ticket body.
3. If code has changed: re-check whether the fix already landed before
   filing — note it in the ticket as "verify still open."
4. Full technical writeup for any ID is in
   `ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md` (search by ID, e.g. "### B5").

---

## HIGH Priority

### B5 — Background script restart mid-upload loses upload bookkeeping; share link still gets created server-side with zero user notification
- **Files:** `packages/addon/src/background.ts` (upload queue state ~L187-190, `ALL_UPLOADS_COMPLETE` handler ~L528-556)
- **Issue:** `uploadInfoQueue`, `uploadPromiseMap`, `popupWindowId` are plain in-memory module vars with no persistence to `browser.storage.*`. If the WebExtension background page restarts mid-upload, `uploadPromiseMap` is empty on the next `ALL_UPLOADS_COMPLETE` — the `forEach` resolving promises silently no-ops, but the `add-password` API call still runs unconditionally afterward. Net effect: a live, real, shareable link gets created and persisted server-side that the user is never told about and never gets to manage/revoke.
- **Needs live test:** Whether TB's WebExtensions platform actually recycles background pages while `cloudFile.onFileUpload` promises are unresolved (platform behavior, not code-confirmable).
- **Fix:** Persist pending upload IDs to `browser.storage.session`/`.local` so a restarted background can detect an orphaned completion and surface a notification instead of silently succeeding invisibly.

### C1 — Add-on disabled mid-upload orphans popup window + in-flight promises
- **Files:** grep for `onSuspend`/`onDisabled`/`onEnabled` across `packages/addon/src`, `packages/send/frontend/src` → zero matches
- **Issue:** No lifecycle hook reacts to the add-on being disabled. If disabled mid-upload, the popup window and any pending `uploadPromiseMap` entries are orphaned with no cleanup — nothing resolves/rejects the waiting promises, nothing closes the popup.
- **Needs live test:** Whether TB's platform-level window management auto-closes extension-created windows on disable (Gecko/TB platform behavior, not code-confirmable).
- **Fix:** Register `browser.runtime.onSuspend` (where supported), or persist queue state via `browser.storage.session` so the next startup can detect and clean up an interrupted session.

---

## MEDIUM Priority

### A1 — Web-tab logout doesn't abort an in-flight popup upload
- **Files:** `packages/addon/src/background.ts` SIGN_OUT handler (~L352-361); `packages/send/frontend/src/apps/send/views/PopupView.vue` (~L139-146, only listens for `FILE_LIST`)
- **Issue:** `SIGN_OUT` handler never touches `uploadInfoQueue`/`uploadPromiseMap`/`popupWindowId` and never messages an open popup. Popup's `onMessage` has no `SIGN_OUT` case. An upload started before logout can silently finish and get shared using the still-valid in-memory popup session.
- **Partial mitigation exists:** `x-logout` header handling in `auth-store.ts` will eventually reject an in-flight request post-401, but this is reactive per-request, not a proactive abort.
- **Fix:** Add `SIGN_OUT` case to popup's message listener (flip local "session ended" flag checked before each upload); forward `SIGN_OUT` from background to the popup window if open.

### A2 — Hamburger-menu logout doesn't reach add-on background on non-matching origins (staging/localhost)
- **Files:** `packages/addon/public/manifest.json` content_scripts matches (~L143-153, only `send.tb.pro`/`send-stage.tb.pro`/`http://localhost`); `packages/send/frontend/src/apps/send/stores/config-store.ts` `isThunderbirdHost` (~L11-14, plain User-Agent sniff); `UserMenu.vue` (~L35-46)
- **Issue:** `isRunningInsideThunderbird` is a UA-string check totally independent of whether `token-bridge.js` is actually injected on the current origin. Any deployed host not matching the manifest's glob (e.g. `https://localhost` w/ https, `127.0.0.1`, any other staging domain) has the UA true but no bridge listener — the logout `postMessage` goes nowhere and the add-on silently stays logged in.
- **Fix:** Broaden content-script `matches` to cover configured `VITE_SEND_CLIENT_URL` deployment hosts, or add an explicit content-script ping handshake before trusting `isRunningInsideThunderbird` for messaging.

### A3 — `x-logout` forced logout can race concurrent multipart upload parts
- **Files:** `packages/send/frontend/src/stores/auth-store.ts` `forcedLogoutInProgress` latch (~L277-289); `lib/const.ts` `MAX_CONCURRENT_PARTS = 4`
- **Issue:** No `AbortController` wiring ties `handleForcedLogout()` to in-flight multipart upload parts (`useUploadAndShare.ts`/`folder-store.ts`). A forced logout mid-multipart-upload leaves already-issued parallel part-requests uncancelled.
- **Needs live test:** Whether this actually produces a corrupt upload reported as `ALL_UPLOADS_COMPLETE` vs `ALL_UPLOADS_ABORTED` requires a live, timed server-side revocation — structural gap confirmed, exact outcome not.
- **Fix:** Thread an `AbortController` through `uploadItem()` that aborts on `handleForcedLogout()`, mirroring background.ts's existing (but disconnected — see B2) abort wiring.

### A4 — Cross-context `signinSilent()` refresh-token-rotation race → possible false logout
- **Files:** `packages/send/frontend/src/stores/auth-store.ts` module-scope `inFlightRefresh`/`lastRefreshFailedGenuinely` (~L78-84); `lib/shared-pinia.ts` (per-context singleton, not cross-context)
- **Issue:** Each of background/popup/web-tab gets its own independent module instance, so refresh-dedup guards don't coordinate across contexts. If the OIDC provider rotates refresh tokens on `signinSilent()`, a losing concurrent caller in another context could get `invalid_grant`.
- **Needs live test:** Whether the OIDC provider (accounts.tb.pro) actually rotates tokens this way — provider behavior, not code-confirmable.
- **Fix:** Add a cross-context mutex via `browser.storage.local` (short-TTL lock key) around `signinSilent()` calls.

### A5 — `menuLogout()`'s blanket `storage.local.clear()` wipes unrelated in-flight data
- **Files:** `packages/addon/src/menu.ts` `menuLogout()` (~L104-135, unconditional `browser.storage.local.clear()`)
- **Issue:** Same `browser.storage.local` namespace also holds `PENDING_ADDON_TOKEN` (staged AccountHub login) and `SEND_MESSAGE_TO_BRIDGE` (staged passphrase) and per-account cloud-file server config. A logout racing either of those flows silently destroys them with no error surfaced.
- **Fix:** Scope the clear to an explicit allow-list (at minimum `STORAGE_KEY_AUTH`) instead of a blanket `.clear()`.

### A6 — Hamburger/web menu shows stale login state; no push refresh on `SIGN_OUT`/`OIDC_USER`
- **Files:** `packages/send/frontend/src/lib/auth.ts` (~L38-42, `refetchOnMount`/`refetchOnWindowFocus` computed once at setup, not reactive); `UserMenu.vue` (sends `SIGN_OUT` but never listens for inbound); `menu.ts` `checkLoginStateOnInterval()` (60s poller only updates the add-on's own TBProMenu, not the web-app's `UserMenu.vue`)
- **Issue:** No code path pushes a re-check of `isLoggedIn` into `UserMenu.vue` when another context signs out. UI can keep showing logged-in after a background-initiated sign-out.
- **Fix:** Add a `browser.runtime.onMessage`/window-message listener in `useAuth()`/`UserMenu.vue` that triggers `refetchAuth()` on `SIGN_OUT`/`OIDC_USER`.

### A7 — AccountHub-driven add-on login races a concurrent hamburger-menu web login for the same account
- **Files:** `packages/addon/src/background.ts` `initAccountHubListener()`/`triggerAddonLogin()` (~L769-791, ~L636-644); `menu.ts` `menuLogin()` (~L31-36)
- **Issue:** No mutual-exclusion guard between the two login flows. Both write to the same `STORAGE_KEY_AUTH` — last `OIDC_USER` message wins, silently overwriting the other's session data.
- **Fix:** Add a shared "login in progress for this account" guard (e.g. `browser.storage.local` flag keyed by email) checked by both flows before opening a new tab.

### B1 — Rapid `onFileUpload` bursts can drop a second batch's popup delivery
- **Files:** `packages/addon/src/background.ts` `POPUP_READY` handler (~L493-500, sends entire queue then unconditionally clears it); `openUnifiedPopup()` guard (~L238-243)
- **Issue:** Once a popup is open, subsequent `onFileUpload` bursts hit the "popup already open" guard and exit — nothing re-sends `FILE_LIST` or notifies the open popup. Files silently vanish into a queue nobody reads again, later surfacing as a misleading "popup closed prematurely" rejection.
- **Note:** Zero existing unit test coverage for this queue/popup logic at all.
- **Fix:** Add a batch ID/timestamp; require ack from popup before queue clear, or explicitly queue for the *next* popup rather than silently folding into the current one.

### B2 — Popup closed mid-upload doesn't actually cancel the in-flight network request
- **Files:** `packages/addon/src/background.ts` `windows.onRemoved` → `rejectAllInQueue()` (~L585-663); `folder-store.ts`/`useUploadAndShare.ts` (no `AbortController`/`signal` usage found)
- **Issue:** The `AbortController` created in background.ts's `onFileUpload` listener is entirely disconnected from the popup's actual `fetch()`/upload calls — `rejectAllInQueue()`'s `.abort()` call aborts nothing on the network side; it only rejects background's own bookkeeping promise. Closing the popup does not stop the server-side upload — it can complete and become an orphaned, unrecorded item.
- **Needs live test:** Whether the backend actually completes/persists the item after client window destruction (browser/OS fetch-keepalive + backend behavior).
- **Fix:** Pass the `AbortController`'s `signal` into the popup's actual upload call via the message protocol; add a `beforeunload` handler in the popup to best-effort notify background before closing.

### B3 — Check-then-act race in `openUnifiedPopup()`'s `popupWindowId` guard (no mutex around the `await`)
- **Files:** `packages/addon/src/background.ts` `openUnifiedPopup()` (~L159-181); `popupTimer` debounce (~L148-150)
- **Issue:** Guard reads `popupWindowId` synchronously but only sets it after `await browser.windows.create()` resolves. A second `onFileUpload` firing while that await is pending reads `popupWindowId` as still null and opens a second popup. The 250ms `popupTimer` debounce only gates *when* `openUnifiedPopup` is first called, not concurrent execution once called.
- **Needs live test:** Real-world timing of how close together two `cloudFile.onFileUpload` events can fire, and `browser.windows.create()` latency.
- **Fix:** Set a synchronous "opening" sentinel (e.g. `popupWindowId = 'pending'`) *before* the `await`, not only after.

### B4 — Files attached while a popup is already open are dropped, not merged
- **Files:** Same as B1/B3 — `openUnifiedPopup()` guard (~L238-243); `PopupView.vue` `files.value = message.files` (~L139-146, plain overwrite, no append)
- **Issue:** Once popup is open, later-attached files never trigger a second `FILE_LIST` send; even if they did, the popup overwrites rather than merges. Combined with B2's window-close handling, these files end up rejected via `rejectAllInQueue()` when the first batch's popup eventually closes.
- **Fix:** Same as B1 — merge into open popup via a new message type it listens for, or explicitly defer to next popup.

### C2 — Add-on re-enable trusts stale `STORAGE_KEY_AUTH` without re-validating against backend
- **Files:** `packages/addon/src/background.ts` `main()` (~L833-859); `menu.ts` `getLoginState()` (~L161-181, pure local-storage read, no network call); `cloudFileGate.ts` `shouldInitCloudFileOnStartup` (pure passthrough)
- **Issue:** Re-enable re-runs `main()` identical to cold start. `getLoginState()` trusts mere presence of `refresh_token` in local storage with zero backend validation. A previously-revoked session stays "active" until an unrelated action happens to 401.
- **Fix:** After `getLoginState()` returns true, fire a non-blocking backend validation call (e.g. `auth/oidc/me`) and run forced-logout cleanup if it fails.

### D2 — `pullBridgedPassphrase()`'s one-shot consume can race two concurrent restorers
- **Files:** `packages/send/frontend/src/lib/bridgePassphrase.ts` `pullBridgedPassphrase()` (~L20-38, plain get-then-remove, no lock); `lib/keychain.ts` `restoreKeysUsingLocalStorage()` (~L720-733, called independently by both background startup and `PopupView.vue#initialize()`)
- **Issue:** No lock around the bridge-to-keychain handoff. Narrow window: if context B's read happens strictly between context A's get() and its store-write, both could end up empty-handed, requiring the user to re-enter their passphrase.
- **Assessment:** Likely benign in the common case (both read the same shared moz-extension-origin localStorage value), but the narrow race is real and unguarded.
- **Fix:** Add compare-and-swap-style lock around the handoff, or make restore tolerant of "already consumed" by re-checking after a short delay instead of treating empty as final.

### D3 — `init.ts`'s single-flight guard is per-context only; cross-context race can reintroduce issue #930 (duplicate default folders)
- **Files:** `packages/send/frontend/src/lib/init.ts` `inFlight` (~L71-85, plain module-scope `let`)
- **Issue:** Guard only prevents duplicate delete/recreate races *within* one JS context. Background, popup, and web-tab each have independent `inFlight` state — nothing stops all three from being `null` simultaneously and each performing the delete+recreate for the same account, exactly reintroducing the bug the guard was meant to fix.
- **Fix:** Add a `browser.storage.local`-based mutex (short-TTL lock keyed by account id) around the default-folder-recreate branch.

---

## Summary Table

| ID | Title | Priority | Confidence |
|----|-------|----------|------------|
| B5 | Background restart mid-upload loses bookkeeping, link still created silently | High | High |
| C1 | Add-on disabled mid-upload orphans popup + promises | High | High (cleanup absence confirmed; TB auto-close behavior needs live test) |
| A1 | Logout doesn't abort in-flight popup upload | Medium | High |
| A2 | Hamburger-menu logout doesn't reach add-on on non-matching origin | Medium | High |
| A3 | Forced logout races concurrent multipart upload parts | Medium | Medium (needs live test for exact outcome) |
| A4 | Cross-context refresh-token race → false logout | Medium | Medium (OIDC provider behavior unconfirmed) |
| A5 | `menuLogout()` blanket storage clear wipes unrelated data | Medium | High |
| A6 | Menu/UI shows stale login state, no push refresh | Medium | High |
| A7 | AccountHub login races concurrent web login | Medium | High |
| B1 | Rapid upload bursts drop second batch | Medium | High (zero test coverage) |
| B2 | Popup close doesn't cancel in-flight network upload | Medium | Medium (server-side outcome needs live test) |
| B3 | `popupWindowId` check-then-act race can open two popups | Medium | Medium (needs live timing test) |
| B4 | Files attached while popup open are dropped, not merged | Medium | High |
| C2 | Add-on re-enable trusts stale auth without revalidation | Medium | High |
| D2 | Bridged-passphrase one-shot consume race | Medium | Medium (likely benign in common case) |
| D3 | `init.ts` single-flight guard is per-context only | Medium | High |

**Not included here (separate, backend-only):** BUG-1, BUG-2, BUG-3, BUG-4, BUG-5, BUG-6, BUG-7, BUG-8 — see `TICKET-TRIAGE-TABLE-2026-07-21.md`.
