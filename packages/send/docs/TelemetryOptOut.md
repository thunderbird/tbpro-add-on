# Telemetry Opt-Out (Sentry & PostHog)

Tracking issue: [thunderbird/tbpro-add-on#892](https://github.com/thunderbird/tbpro-add-on/issues/892)

How the TB Pro add-on honors Thunderbird's telemetry opt-out for Sentry and
PostHog.

## Behavior

When Thunderbird telemetry is disabled, the add-on sends **zero** events to
Sentry or PostHog (no errors, traces, session replays, console capture,
analytics, `/decide`, `$pageview`, or `identify`). The gate:

- Considers telemetry enabled only when **both** Thunderbird prefs are on —
  `datareporting.policy.dataSubmissionEnabled` (master switch) and
  `datareporting.healthreport.uploadEnabled` (upload opt-in).
- Reacts to those prefs changing at runtime (no reload required).
- **Fails closed**: sends nothing if the state cannot be read.

The public website (outside Thunderbird, detected via `navigator.userAgent`)
keeps its existing telemetry behavior. Backend telemetry is out of scope — the
server can't read a per-user TB pref (tracked as a #892 follow-up, alongside
privacy-policy and subprocessor disclosure).

## How it works

The Send frontend runs in two kinds of context inside Thunderbird:

- **Add-on (moz-extension) pages** (`extension.js`, `management.js`) can call
  experiment APIs directly, so they read the state from
  `browser.thundermailTelemetry`.
- **The hosted Send dashboard** (`send.js`) opens as a regular web tab and has
  no experiment API, so it asks the background script over the existing
  `token-bridge.js` content-script relay (issue #952).

### Experiment API — `browser.thundermailTelemetry`

`packages/addon/public/api/Telemetry/` (registered in `manifest.json`, typed in
`packages/addon/src/env.d.ts`):

- `isTelemetryEnabled(): Promise<boolean>` — true only when both data-reporting
  prefs are on; fails closed to `false`.
- `onChanged` — fires the new effective state when either pref changes.

### Frontend consent gate

`packages/send/frontend/src/lib/telemetryConsent.ts`:

- `isTelemetryAllowed()` — outside TB → `true`; on an add-on page → reads
  `browser.thundermailTelemetry`; on the dashboard → asks over the token-bridge
  with a 2s fail-closed timeout.
- `onTelemetryChanged(cb)` — subscribes to runtime changes (direct API or
  bridged messages); no-op on the public website.

### Telemetry bridge (hosted dashboard — issue #952)

`background.ts` answers `GET_TELEMETRY_STATE` (only for our own Send tabs) with
the state as the `sendMessage` response, and broadcasts `TELEMETRY_STATE_CHANGED`
to Send tabs when the prefs change. `token-bridge.js` relays both between
`window.postMessage` and `browser.runtime.sendMessage`. Message types live in
`packages/send/frontend/src/lib/const.ts`.

> Related: #953 tracks hardening the `token-bridge.js` relay (validate
> `event.origin`/`event.source`).

### Sentry & PostHog

- `sentry.ts` — `initSentry(app)` runs only with consent; session replay removed,
  `sendDefaultPii: false`, `beforeSend` scrubs identity and request payloads.
  `closeSentry()` tears down on runtime opt-out.
- `posthog.js` — `init()` is deferred until first opt-in; `setPosthogConsent()`
  opts in/out at runtime.

## Verification

### Automated
`tsc --noEmit`, ESLint (touched files), and `vitest` (`telemetryConsent.test.ts`
covers website-allowed, pref on/off, bridge on/off, and fail-closed) are green.

> Running tests in a fresh worktree: copy the gitignored `.env` and `.env.secret`
> into `packages/send/frontend/` first (and ensure `node_modules` is available),
> or unrelated tests fail on undefined env vars.

### Manual (required — cannot run headless)

Temp-load the add-on in Thunderbird Daily (see the repo's local debug workflow)
and use DevTools → Network, for **both** the popup and the dashboard tab:

1. **Pref ON** (both prefs true): exercise the Send UI → requests to
   `*.ingest.sentry.io` and PostHog occur.
2. **Pref OFF:** reload → **zero** requests to those hosts.
3. **Runtime toggle:** with the page open, flip a pref → telemetry stops/resumes
   without reload.
4. **Fail-closed:** API/bridge unavailable inside TB → no telemetry.
5. **Website unaffected:** load outside TB → telemetry as before.
