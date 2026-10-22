/**
 * This is the client-side code that uses the inferred types from the server
 */
import {
  type TRPCClient,
  createTRPCClient,
  httpBatchLink,
  retryLink,
} from '@trpc/client';

import config from '@send-frontend/config';

import { AppRouter } from '@send-backend/router';

// Single source for the Send backend host. The host application (Thunderbird)
// can override this at build/extraction time. An empty or unset value means
// "disabled — do not connect" (e.g. in CI/automation, where any non-local
// connection aborts the whole process).
const serverUrl = (config.sendServerUrl ?? '').trim();

const refreshUrl = `${serverUrl}/api/auth/refresh`;
const trpcUrl = `${serverUrl}/trpc`;

/**
 * We only import the `AppRouter` type from the server - this is not available at runtime
 */
// tRPC transport fetch that (a) attaches the OIDC access token so the backend
// can introspect it per request — the tRPC path was previously cookie-only, so
// revocation was never enforced there — and (b) honors the backend's x-logout
// header by clearing local auth (#960). Cookies are still sent for the legacy
// JWT fallback.
export async function fetchWithLogoutCheck(
  url: RequestInfo | URL,
  options: RequestInit
): Promise<Response> {
  // Dynamic import (not a top-level one) because auth-store transitively imports
  // this module — a static import would create a circular dependency.
  async function getAuthStore() {
    const { useAuthStore } = await import('@send-frontend/stores/auth-store');
    return useAuthStore();
  }

  // Attach the current OIDC access token (unless the caller already set one).
  // Rebuilt for the post-refresh retry so it picks up the freshly-rotated token.
  async function buildHeaders(): Promise<Headers> {
    const headers = new Headers(options.headers);
    try {
      if (!headers.has('Authorization')) {
        const authStore = await getAuthStore();
        const token = await authStore.getAccessToken();
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      }
    } catch {
      // No token available — fall back to cookie auth.
    }
    return headers;
  }

  const res = await fetch(url, {
    ...options,
    headers: await buildHeaders(),
    credentials: 'include',
  });

  if (res.headers?.get?.('x-logout')) {
    try {
      // A revoked access token may just need refreshing — recover and retry
      // rather than forcing logout when the refresh token is still alive (#974).
      const authStore = await getAuthStore();
      if (await authStore.recoverOrForceLogout()) {
        return await fetch(url, {
          ...options,
          headers: await buildHeaders(),
          credentials: 'include',
        });
      }
    } catch (error) {
      console.error('Forced-logout handling failed:', error);
    }
  }
  return res;
}

// HTTP only. The router has no subscriptions, so there is no WebSocket link:
// every procedure is a plain request/response over `/trpc`. This also means the
// module never opens a network connection as a side effect of being imported,
// which the built-in/system add-on's background page relies on (Bug 2036665).
export const trpc: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
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
});
