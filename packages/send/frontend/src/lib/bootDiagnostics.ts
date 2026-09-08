import { buildApiUrl } from './api';
import { probeCookiesEnabled, type CookieProbeTransport } from './cookieProbe';

/**
 * Boot-time diagnostics for the Send web app (Bugzilla 2064458).
 *
 * When Thunderbird is set to block all cookies, Firefox denies every kind of
 * storage access for the page: the `window.localStorage` and
 * `window.sessionStorage` getters THROW a SecurityError ("The operation is
 * insecure") instead of returning a store. Several modules in the app graph
 * touch storage while they are being *evaluated* — oidc-client-ts builds its
 * default stores inside `new UserManager()` at the top of stores/auth-store.ts,
 * and @thunderbirdops/services-ui reads localStorage on load — so the bundle
 * dies before a single Vue component mounts and the user sees a blank page: no
 * banner, no message, only a console warning.
 *
 * These checks therefore run from a tiny bootstrap (apps/send/send.js) that
 * imports nothing store-related, shows a spinner while they run
 * (apps/send/BootDiagnostics.vue), and only then dynamically imports the real
 * app. A healthy boot shows nothing else; when a step blocks, the panel shows
 * the checklist with the failing step's detail. Each check is a plain function
 * returning a {@link BootStepResult} so it can be unit-tested and so the panel
 * can say *which* step failed.
 */

export type BootStepId =
  | 'storage'
  | 'firstPartyCookie'
  | 'backend'
  | 'crossSiteCookie';

/** The only steps whose failure stops the app from starting. */
export type BootBlocker = Extract<BootStepId, 'storage' | 'crossSiteCookie'>;

export type BootStepOutcome = 'passed' | 'warning' | 'failed';

export type BootStepResult = {
  id: BootStepId;
  outcome: BootStepOutcome;
  /** User-visible one-liner: what was verified, or why it failed. */
  detail: string;
};

export type BootProgress =
  | { id: BootStepId; status: 'running' }
  | { id: BootStepId; status: 'done'; result: BootStepResult };

/**
 * The checklist as the panel shows it, in the order the steps run. `app` is
 * the final hand-off step (loading the real bundle), owned by the panel.
 */
export const BOOT_STEPS: ReadonlyArray<{
  id: BootStepId | 'app';
  label: string;
}> = [
  { id: 'storage', label: 'Browser storage is available' },
  { id: 'firstPartyCookie', label: 'This site can set cookies' },
  { id: 'backend', label: 'Send server is reachable' },
  { id: 'crossSiteCookie', label: 'Send server cookies are accepted' },
  { id: 'app', label: 'Application loaded' },
];

/**
 * Upper bound for each network *call*, so a hung backend cannot stall boot
 * indefinitely. The cross-site probe makes two sequential calls, so that step
 * can spend twice this before it gives up.
 */
const NETWORK_TIMEOUT_MS = 5_000;

const PROBE_KEY = 'send_boot_probe';

/** `SecurityError: The operation is insecure.` rather than `[object DOMException]`. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name && error.name !== 'Error'
      ? `${error.name}: ${error.message}`
      : error.message;
  }
  return String(error);
}

/**
 * Blocking. With "block all cookies" the storage getters throw, and the app
 * bundle cannot even be evaluated in that state (see module header), so this
 * must run first and stop everything on failure.
 */
export function checkStorage(): BootStepResult {
  const id = 'storage';
  try {
    for (const store of [window.localStorage, window.sessionStorage]) {
      store.setItem(PROBE_KEY, '1');
      const roundTrip = store.getItem(PROBE_KEY);
      store.removeItem(PROBE_KEY);
      if (roundTrip !== '1') {
        throw new Error('a stored value did not read back');
      }
    }
    return {
      id,
      outcome: 'passed',
      detail: 'localStorage and sessionStorage are readable and writable',
    };
  } catch (error) {
    return { id, outcome: 'failed', detail: describeError(error) };
  }
}

/**
 * Informational. Send sets no cookie on its own origin — the session cookie
 * belongs to the backend origin — but whether a plain first-party cookie sticks
 * tells "all cookies blocked" apart from "only cross-site cookies blocked" when
 * reading the panel.
 */
export function checkFirstPartyCookie(): BootStepResult {
  const id = 'firstPartyCookie';
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${PROBE_KEY}=1; path=/; SameSite=Lax${secure}`;
    const stored = document.cookie
      .split(';')
      .some((cookie) => cookie.trim() === `${PROBE_KEY}=1`);
    document.cookie = `${PROBE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
    return stored
      ? { id, outcome: 'passed', detail: 'A first-party cookie was stored' }
      : {
          id,
          outcome: 'warning',
          detail: 'The browser silently dropped a first-party cookie',
        };
  } catch (error) {
    return { id, outcome: 'warning', detail: describeError(error) };
  }
}

/**
 * Runs `task` with an abort signal that fires after {@link NETWORK_TIMEOUT_MS}.
 * The whole task — reading the body included — has to finish inside the
 * window; a timer cleared as soon as headers arrive would let a stalled body
 * hang boot without bound.
 */
async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Informational. Unreachable is a warning, not a block: the app's own
 * CompatibilityBoundary already explains a dead backend (including the
 * self-signed-certificate hint for local dev), so blocking here would only
 * duplicate that with a worse message.
 */
export async function checkBackendReachable(
  serverUrl: string
): Promise<BootStepResult> {
  const id = 'backend';
  try {
    const origin = new URL(serverUrl).origin;
    const response = await withTimeout((signal) =>
      fetch(buildApiUrl(serverUrl, 'health'), { cache: 'no-store', signal })
    );
    return response.ok
      ? { id, outcome: 'passed', detail: `Reached ${origin}` }
      : {
          id,
          outcome: 'warning',
          detail: `${origin} answered HTTP ${response.status}`,
        };
  } catch (error) {
    return { id, outcome: 'warning', detail: describeError(error) };
  }
}

/**
 * A bare-`fetch` transport for {@link probeCookiesEnabled}. `credentials:
 * 'include'` is what makes the probe cookie ride along, exactly as it does for
 * the real session cookie in `ApiConnection`. `cache: 'no-store'` because a
 * replayed `set` answer without its Set-Cookie would make `verify` report a
 * block that never happened — and a false block here stops the app.
 */
export function createProbeTransport(serverUrl: string): CookieProbeTransport {
  return {
    call<T>(path: string): Promise<T | null> {
      return withTimeout(async (signal) => {
        const response = await fetch(buildApiUrl(serverUrl, path), {
          credentials: 'include',
          mode: 'cors',
          cache: 'no-store',
          signal,
        });
        return response.ok ? ((await response.json()) as T) : null;
      });
    },
  };
}

/**
 * Blocking on a positive 'blocked' answer only. 'unknown' (offline, older
 * backend, timeout) is a warning: the app must not be held back on a guess.
 */
export async function checkCrossSiteCookie(
  serverUrl: string
): Promise<BootStepResult> {
  const id = 'crossSiteCookie';
  const result = await probeCookiesEnabled(createProbeTransport(serverUrl));
  switch (result) {
    case 'enabled':
      return {
        id,
        outcome: 'passed',
        detail: 'A cookie set by the Send server came back on the next request',
      };
    case 'blocked':
      return {
        id,
        outcome: 'failed',
        detail:
          'The Send server set a cookie, but the browser did not send it back',
      };
    default:
      return {
        id,
        outcome: 'warning',
        detail: 'Could not tell: the Send server did not answer the probe',
      };
  }
}

/**
 * Runs every check in order, reporting progress as it goes.
 *
 * @returns the step that blocks the app from starting, or null when it may
 * start. Stops at the first blocker: with storage denied the later steps would
 * only add noise under the one line that matters.
 */
export async function runBootChecks(
  serverUrl: string,
  onProgress: (progress: BootProgress) => void
): Promise<BootBlocker | null> {
  const report = (result: BootStepResult): BootStepResult => {
    onProgress({ id: result.id, status: 'done', result });
    return result;
  };

  onProgress({ id: 'storage', status: 'running' });
  const storage = report(checkStorage());
  if (storage.outcome === 'failed') {
    return 'storage';
  }

  onProgress({ id: 'firstPartyCookie', status: 'running' });
  report(checkFirstPartyCookie());

  onProgress({ id: 'backend', status: 'running' });
  onProgress({ id: 'crossSiteCookie', status: 'running' });
  // Informational: report it whenever it lands, but never hold the app behind
  // it — a slow /api/health cannot block, so it must not delay either.
  void checkBackendReachable(serverUrl).then(report);
  const crossSite = report(await checkCrossSiteCookie(serverUrl));

  return crossSite.outcome === 'failed' ? 'crossSiteCookie' : null;
}
