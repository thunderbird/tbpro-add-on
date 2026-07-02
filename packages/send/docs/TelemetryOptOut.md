# Telemetry Opt-Out (Sentry & PostHog)

Status: **Implemented (frontend) — pending manual in-Thunderbird verification**
Tracking issue: [thunderbird/tbpro-add-on#892](https://github.com/thunderbird/tbpro-add-on/issues/892)
Branch: `worktree-telemetry-optout-892`

This note documents how the TB Pro add-on honors Thunderbird's telemetry
opt-out setting for Sentry and PostHog, so follow-up work (backend, privacy
policy, subprocessor disclosure) can build on it.

## Objective

When the Thunderbird telemetry preference is disabled, the add-on must send
**zero** events to Sentry or PostHog — no errors, traces, session replays,
console capture, analytics, feature-flag (`/decide`) calls, `$pageview`, or
`identify`. The gate must:

- Read the Thunderbird pref `datareporting.healthreport.uploadEnabled` via the
  existing experiment-API pattern (`Services.prefs`).
- React to the pref changing at runtime (no reinstall/reload required).
- **Fail closed**: send nothing if the pref cannot be read.

## Scope (decided on #892)

- **Contexts:** Gate telemetry whenever running *inside Thunderbird*
  (`navigator.userAgent` contains `Thunderbird`). The public website (outside
  Thunderbird) keeps its existing telemetry behavior.
- **Backend:** Out of scope here — the server cannot read a per-user TB pref.
  Tracked as follow-up.
- **Privacy:** This change ships the gate **and** hardens Sentry (drops session
  replay, scrubs PII). Privacy-policy text and the subprocessor list are
  separate documentation follow-ups.

## How it works

### Runtime contexts

The Send Vue frontend (`packages/send/frontend`) builds three HTML entry points
that run in different contexts:

| Entry | Context | `browser.*` / experiment APIs |
|---|---|---|
| `index.extension.html` → `extension.js` | moz-extension page in the add-on | **Yes** (direct) |
| `index.management.html` → `management.js` | moz-extension page in the add-on | **Yes** (direct) |
| `index.html` → `send.js` | public website / web-app-inside-TB | No — uses the token-bridge inside TB (issue #952) |

Add-on (moz-extension) pages can call experiment APIs directly — proven by
`extension-store.ts` already calling `browser.CloudFileAccounts.*`. So on those
pages the frontend reads the pref straight from the API.

The **hosted Send dashboard** (`send.js`) is opened inside Thunderbird as a
regular web tab (`menuManageSend()` → `${BASE_URL}/send/profile`), so it has no
experiment API. It obtains the pref from the background script over the existing
`token-bridge.js` content-script relay (issue #952) — see "Telemetry pref
bridge" below.

### 1. Experiment API — `browser.Telemetry`

`packages/addon/public/api/Telemetry/`
- `getUploadEnabled(): Promise<boolean>` — `Services.prefs.getBoolPref('datareporting.healthreport.uploadEnabled', false)`, wrapped in try/catch returning `false` (fail closed).
- `onChanged` — `ExtensionCommon.EventManager` registering a `Services.prefs.addObserver` on the pref; fires the new boolean; cleanup removes the observer.

Registered in `packages/addon/public/manifest.json` (`experiment_apis.Telemetry`,
scope `addon_parent`); typed in `packages/addon/src/env.d.ts`
(`declare namespace browser { namespace Telemetry { … } }`).

### 2. Frontend consent gate

`packages/send/frontend/src/lib/telemetryConsent.ts`
- `isTelemetryAllowed(): Promise<boolean>` — outside TB → `true` (website
  unchanged); inside TB → reads the pref via `browser.Telemetry`; inside TB but
  API unavailable or throwing → `false` (fail closed).
- `onTelemetryChanged(cb)` — subscribes to `browser.Telemetry.onChanged`;
  returns an unsubscribe fn (no-op when the API is absent).

`browser.Telemetry` is a custom experiment API unknown to
`@types/firefox-webext-browser`, so the helper accesses it via `// @ts-ignore`
(same as `extension-store.ts`).

On the hosted dashboard (no direct API), `isTelemetryAllowed()` falls back to
the token-bridge and `onTelemetryChanged()` subscribes to bridged pref-change
messages — both fail closed / no-op when the bridge is absent.

### 2a. Telemetry pref bridge (hosted dashboard — issue #952)

The dashboard (`send.js`) can't call `browser.Telemetry`, so it asks the
background script over the existing `token-bridge.js` content-script relay
(the same pattern as `GET_LOGIN_STATE` / `LOGIN_STATE_RESPONSE`). Message types
(defined in `packages/send/frontend/src/lib/const.ts`):

- `GET_TELEMETRY_STATE` — web page → bridge → background ("what's the pref?")
- `TELEMETRY_STATE_RESPONSE` — background → bridge → web page (`{ enabled }`)
- `TELEMETRY_STATE_CHANGED` — background → bridge → web page (runtime change)

Flow:
- `packages/addon/src/background.ts` handles `GET_TELEMETRY_STATE` by calling
  `browser.Telemetry.getUploadEnabled()` and replying `TELEMETRY_STATE_RESPONSE`
  to the requesting tab; `initTelemetryListener()` registers
  `browser.Telemetry.onChanged` and broadcasts `TELEMETRY_STATE_CHANGED` to all
  tabs so telemetry starts/stops without a reload.
- `packages/addon/public/token-bridge.js` relays these three types between
  `window.postMessage` and `browser.runtime.sendMessage`.
- `telemetryConsent.ts` posts `GET_TELEMETRY_STATE` and awaits the response with
  a 2s timeout (fail closed), and listens for `TELEMETRY_STATE_CHANGED`.

> Related: #953 tracks hardening the `token-bridge.js` relay (validate
> `event.origin`/`event.source`); it touches the same file.

### 3. Sentry gating + hardening

`packages/send/frontend/src/lib/sentry.ts`
- `initSentry(app)` only runs when consent is granted; idempotent via an
  `initialized` flag + `Sentry.getClient()` check.
- **Hardening:** session replay integration removed (biggest PII risk);
  `sendDefaultPii: false`; `beforeSend` strips `event.user` and request
  cookies/headers/query/data.
- `closeSentry()` tears down the client on runtime opt-out (safe if not init).

### 4. PostHog gating

`packages/send/frontend/src/plugins/posthog.js`
- `posthog.init()` is **deferred** until first opt-in (`setPosthogConsent(true)`),
  so while opted out PostHog is never initialized and makes zero network
  requests. `capture()`/`identify()` on the shared instance before init are
  no-ops, so the many `useMetricsStore` callers remain safe.
- `setPosthogConsent(enabled)` — opt-in (init + `opt_in_capturing`) / opt-out
  (`opt_out_capturing` + `reset`) at runtime.
- The default export still exposes `.rest` (the posthog singleton) — unchanged
  for existing importers like `stores/metrics.ts`.

### 5. Entry wiring

`apps/send/{extension,send,management}.js` — each wraps bootstrap in an async
IIFE (top-level `await` is avoided because Vite's default build target predates
TLA support):

```js
const telemetryAllowed = await isTelemetryAllowed();
if (telemetryAllowed) initSentry(app);
app.use(router);
setupApp(app, telemetryAllowed); // installs posthog plugin + setPosthogConsent
mountApp(app, '#…');
onTelemetryChanged((enabled) => {
  setPosthogConsent(enabled);
  enabled ? initSentry(app) : closeSentry();
});
```

`setupApp(app, telemetryAllowed)` (in `apps/send/setup.js`) applies the initial
PostHog consent.

## Files touched

- New: `packages/addon/public/api/Telemetry/{schema.json,implementation.js}`
- New: `packages/send/frontend/src/lib/telemetryConsent.ts` (+ `.test.ts`)
- Edit: `packages/addon/public/manifest.json`, `packages/addon/src/env.d.ts`
- Edit: `packages/send/frontend/src/lib/sentry.ts`
- Edit: `packages/send/frontend/src/plugins/posthog.js`
- Edit: `packages/send/frontend/src/apps/send/{setup.js,extension.js,send.js,management.js}`

## Verification

### Automated (done)
- `npx tsc --noEmit` — clean
- ESLint on touched files — clean
- `vite build --config vite.config.extension.js` — succeeds
- `vitest run` — full suite green; `telemetryConsent.test.ts` covers
  website-allowed, pref-on, pref-off, API-missing (fail closed), and
  read-throws (fail closed).

> Note for agents running tests in a fresh worktree: copy the gitignored
> `.env` and `.env.secret` into `packages/send/frontend/` first (and ensure
> `node_modules` is available), or many unrelated tests fail on undefined env
> vars.

### Manual (still required — cannot run headless)

Temp-load the built add-on in Thunderbird Daily (see the repo's local debug
workflow) and use DevTools → Network:

1. **Pref ON** (`datareporting.healthreport.uploadEnabled = true` via
   `about:config` or Settings → Privacy): exercise the Send UI → confirm
   requests to Sentry (`*.ingest.sentry.io`) and PostHog
   (`*.i.posthog.com` / configured host) occur.
2. **Pref OFF:** reload the add-on page → confirm **zero** requests to those
   hosts (no events, traces, replay, console capture, `/decide`, `$pageview`,
   `identify`).
3. **Runtime change:** with the page open, toggle the pref → telemetry stops
   (opt-out) / resumes (opt-in) without reload (exercises `onChanged` +
   `closeSentry()` / `posthog.opt_out_capturing()`).
4. **Fail-closed:** simulate the experiment API being unavailable inside TB →
   no telemetry.
5. **Website unaffected:** load `index.html` outside TB → telemetry as before.

## Follow-up work (separate issues)

- **Backend opt-out** — server-side Sentry/PostHog cannot read a per-user TB
  pref. Options: forward an opt-out signal from the frontend (e.g. a request
  header) so backend PostHog `identify`/`capture` honors it, and decide on
  backend Sentry. Backend telemetry init lives in `packages/send/backend/src/sentry.ts`
  and `packages/send/backend/src/metrics/posthog.ts`.
- **Privacy policy** — update to reflect Sentry + PostHog usage.
- **Subprocessor list** — document/disclose Sentry and PostHog.
- **Fallback** — if this could not have shipped by ~2026-07-17, the interim
  measure was to disable Sentry outright (a single guard in `initSentry`). Not
  needed once this lands.
