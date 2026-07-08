/**
 * This is the client-side code that uses the inferred types from the server
 */
import {
  type TRPCClient,
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  retryLink,
  splitLink,
  wsLink,
} from '@trpc/client';

import { AppRouter } from '@send-backend/router';
import { TRPC_WS_PATH } from './config';

// Single source for the Send backend host. The host application (Thunderbird)
// can override this at build/extraction time. An empty or unset value means
// "disabled — do not connect" (e.g. in CI/automation, where any non-local
// connection aborts the whole process).
const serverUrl = (import.meta.env.VITE_SEND_SERVER_URL ?? '').trim();

const refreshUrl = `${serverUrl}/api/auth/refresh`;
const trpcUrl = `${serverUrl}/trpc`;

/**
 * Detect whether we're running in a test/automation context, where the
 * WebSocket must stay closed.
 *
 * Unit tests inject `import.meta.env.VITE_TESTING`. When that build-time flag is
 * unavailable — as in the shipped background bundle — fall back to the presence
 * of the WebExtension `browser.test` API, which the Thunderbird/Firefox test
 * harness only exposes when the add-on is loaded under automation. This keeps a
 * logged-out automation profile from ever opening the socket at startup.
 */
export function detectTesting(): boolean {
  if (import.meta.env.VITE_TESTING !== undefined) {
    return import.meta.env.VITE_TESTING === 'true';
  }

  return (
    typeof browser !== 'undefined' &&
    Boolean((browser as { test?: unknown }).test)
  );
}

const isTesting = detectTesting();

type WSClientConfig = NonNullable<Parameters<typeof createWSClient>[0]>;

/**
 * Decide how (and whether) to build the WebSocket client.
 *
 * Returns `null` — meaning "do not connect" — when running under unit tests or
 * when no backend host is configured (empty `serverUrl`). Otherwise returns the
 * client config with **lazy mode** enabled.
 *
 * Lazy mode is critical: the background page of the built-in/system add-on
 * imports this module on every Thunderbird launch, including fresh,
 * never-signed-in profiles. A non-lazy client opens the socket as a side effect
 * of construction (at module load), which under automation triggers a fatal
 * "non-local network connections are disabled" abort and crashes the process
 * before any feature is used. With lazy mode the connection is deferred until
 * the first subscription actually runs (i.e. an authenticated user is using a
 * feature) and is closed again after inactivity, so a logged-out profile makes
 * zero outbound connections at startup.
 */
export function getWsClientConfig(
  url: string,
  testing: boolean
): WSClientConfig | null {
  const normalizedUrl = url.trim();
  if (testing || normalizedUrl.length === 0) {
    return null;
  }

  return {
    url: `${normalizedUrl}${TRPC_WS_PATH}`,
    lazy: {
      enabled: true,
      closeMs: 1000,
    },
  };
}

const wsClientConfig = getWsClientConfig(serverUrl, isTesting);
const wsClient = wsClientConfig ? createWSClient(wsClientConfig) : null;

/**
 * We only import the `AppRouter` type from the server - this is not available at runtime
 */
// tRPC transport fetch that (a) attaches the OIDC access token so the backend
// can introspect it per request — the tRPC path was previously cookie-only, so
// revocation was never enforced there — and (b) honors the backend's x-logout
// header by clearing local auth (#960). Cookies are still sent for the legacy
// JWT fallback.
async function fetchWithLogoutCheck(
  url: RequestInfo | URL,
  options: RequestInit
): Promise<Response> {
  const headers = new Headers(options.headers);
  try {
    const { useAuthStore } = await import('@send-frontend/stores/auth-store');
    if (!headers.has('Authorization')) {
      const token = await useAuthStore().getAccessToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }
  } catch {
    // No token available — fall back to cookie auth.
  }

  const res = await fetch(url, { ...options, headers, credentials: 'include' });

  if (res.headers?.get?.('x-logout')) {
    try {
      const { useAuthStore } = await import('@send-frontend/stores/auth-store');
      await useAuthStore().handleForcedLogout();
    } catch (error) {
      console.error('Forced-logout handling failed:', error);
    }
  }
  return res;
}

export const trpc: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      // Handle non subscription requests with HTTP
      false: [
        retryLink({
          /**
           * Retry strategy for failed requests:
           * - For 401 unauthorized errors: Attempts to refresh the token and retries up to 3 times
           * - For queries (not mutations): Retries up to 3 times
           * - For all other cases: No retry
           */
          retry(opts) {
            // Retry unauthorized requests (401) to refresh token
            if (opts.error.data?.code === 'UNAUTHORIZED') {
              // Only retry queries
              if (opts.op.type !== 'query') {
                return false;
              }

              // Retry up to 3 times
              fetch(refreshUrl, {
                credentials: 'include',
              })
                .then(() => {
                  console.info('revalidated token');
                })
                .catch((err) => {
                  console.info('could not revalidate token', err);
                });
              return opts.attempts <= 3;
            }
          },
        }),
        httpBatchLink({
          url: trpcUrl,
          fetch: fetchWithLogoutCheck,
        }),
      ],
      // Handle subscriptions with WebSocket
      true: wsClient
        ? [
            wsLink({
              client: wsClient,
            }),
          ]
        : [
            // Fallback to HTTP for subscriptions in testing
            httpBatchLink({
              url: trpcUrl,
              fetch: fetchWithLogoutCheck,
            }),
          ],
    }),
  ],
});
