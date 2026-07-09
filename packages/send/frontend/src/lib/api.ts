import { trpc } from './trpc';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type JsonResponse<T = { [key: string]: any }> = T | T[];

export type AsyncJsonResponse<T = { [key: string]: any }> = Promise<
  JsonResponse<T>
> | null;

export class ApiConnection {
  serverUrl: string;
  isBucketStorage: boolean;

  constructor(serverUrl: string) {
    if (!serverUrl) {
      throw Error('No Server URL provided.');
    }
    // using new URL() trims off excess whitespace and trailing '/'
    const u = new URL(serverUrl);
    this.serverUrl = u.origin;

    this.getStorageType().then((isBucketStorage) => {
      this.isBucketStorage = isBucketStorage;
    });
  }

  async getStorageType(): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }
    // In production, bucket storage is always assumed true — skip the network call.
    if (import.meta.env.MODE === 'production') {
      return true;
    } else {
      // Only in development do we query the backend,
      // which may be configured with filesystem storage instead.
      const { isBucketStorage } = await trpc.getStorageType.query();
      return isBucketStorage;
    }
  }

  toString(): string {
    return this.serverUrl;
  }

  async removeAuthToken() {
    await this.call('api/auth/oidc/logout');
  }

  /**
   * Makes a network call to the specified path.
   *
   * @template T - The expected shape of the response object. If not provided, defaults to any object shape.
   *
   * @param {string} path - The path of the API endpoint. (Should not include `/api/`.)
   * @param {Record<string, any>} body - Optional Request body to submit to the API.
   * @param {string} method - The HTTP Request method.
   * @param {Record<string, any>} headers - Optional Request headers to include.
   * @returns {AsyncJsonResponse<T>} Returns a Promise that resolves to the response data (or null).
   *
   */
  // `fullResponse: true` returns the raw Response (required, so an omitted
  // options object resolves to the T | null overload, not Response).
  public async call(
    path: string,
    body: Record<string, any>,
    method: string,
    headers: Record<string, any>,
    options: Options & { fullResponse: true }
  ): Promise<Response>;
  public async call<T = { [key: string]: any }>(
    path: string,
    body?: Record<string, any>,
    method?: string,
    headers?: Record<string, any>,
    options?: Options & { fullResponse?: false }
  ): Promise<T | null>;
  public async call<T = { [key: string]: any }>(
    path: string,
    body: Record<string, any> = {},
    method: string = 'GET',
    headers: Record<string, any> = {},
    options?: Options
  ): Promise<Response | T | null> {
    const url = `${this.serverUrl}/api/${path}`;
    const refreshTokenUrl = `${this.serverUrl}/api/auth/refresh`;

    // Try to get OIDC access token and add to headers if available
    const requestHeaders = { ...headers };
    if (!requestHeaders['Authorization']) {
      try {
        // Dynamically import to avoid circular dependency
        const { useAuthStore } =
          await import('@send-frontend/stores/auth-store');
        const authStore = useAuthStore();
        const accessToken = await authStore.getAccessToken();

        if (accessToken) {
          requestHeaders['Authorization'] = `Bearer ${accessToken}`;
        }
      } catch (error) {
        // If we can't get the auth store (e.g., during initialization), continue without token
        console.debug('Could not get OIDC token for request:', error);
      }
    }

    const opts: Record<string, any> = {
      mode: 'cors',
      credentials: 'include', // include cookies for legacy auth
      method,
      headers: {
        'content-type': 'application/json',
        ...requestHeaders,
      },
    };

    if (method.trim().toUpperCase() === 'POST') {
      opts.body = JSON.stringify({
        ...body,
      });
    }

    let resp: Response;
    try {
      resp = await fetch(url, opts);
    } catch (e) {
      console.log(e);
      options?.onFailure?.({ kind: 'network', status: null, error: e });
      return null;
    }

    // Handle authentication errors. x-logout always rides on a 401, so branch on
    // it first and keep the two paths mutually exclusive — a revoked session
    // gets exactly one recovery attempt, never a second refresh from the plain
    // 401 branch below.
    if (resp.headers?.get?.('x-logout')) {
      // The backend flags a revoked OIDC session (logout / password change /
      // admin force-logout). Try to recover with the refresh token before
      // tearing down; recoverOrForceLogout forces logout only if the refresh
      // token is also dead, and keeps the session on a transient error (#974).
      try {
        const { useAuthStore } =
          await import('@send-frontend/stores/auth-store');
        const authStore = useAuthStore();
        const recovered = await authStore.recoverOrForceLogout();

        if (recovered && requestHeaders['Authorization']) {
          // Session rolled forward — retry once with the freshly-rotated token.
          const newToken = await authStore.getAccessToken();
          if (newToken) {
            opts.headers['Authorization'] = `Bearer ${newToken}`;
            resp = await fetch(url, opts);
          }
        } else if (!recovered) {
          // Genuine logout (state already cleared) or a transient error (session
          // kept, fail open) — either way this request is done.
          return null;
        }
      } catch (error) {
        console.error('Forced-logout handling failed:', error);
        return null;
      }
    } else if (resp.status === 401) {
      // If we're using OIDC and get 401, try to refresh the token
      if (requestHeaders['Authorization']) {
        try {
          const { useAuthStore } =
            await import('@send-frontend/stores/auth-store');
          const authStore = useAuthStore();
          const newToken = await authStore.refreshToken();

          if (newToken) {
            // Retry with new token
            opts.headers['Authorization'] = `Bearer ${newToken}`;
            resp = await fetch(url, opts);
          }
        } catch (error) {
          console.error('Token refresh failed:', error);
          options?.onFailure?.({ kind: 'network', status: null, error });
          return null;
        }
      } else {
        // Legacy JWT refresh flow
        try {
          // Refresh token (including cookies)
          await fetch(refreshTokenUrl, {
            credentials: 'include',
            mode: 'cors',
          });
          resp = await fetch(url, opts);
        } catch (error) {
          console.log(error);
          options?.onFailure?.({ kind: 'network', status: null, error });
          return null;
        }
      }
    }

    if (!resp.ok) {
      // Surface the status/body for the caller's diagnostics before discarding
      // the response. Reading the body is safe here because we return null
      // (we never parse it as JSON on the error path).
      let body: string | undefined;
      try {
        body = (await resp.text()).slice(0, 500);
      } catch {
        body = undefined;
      }
      options?.onFailure?.({
        kind: 'http',
        status: resp.status,
        statusText: resp.statusText,
        body,
      });
      return null;
    }

    if (!!options?.fullResponse) {
      return resp;
    }

    return resp.json();
  }
}

/**
 * Why a {@link ApiConnection.call} failed. `call` returns `null` on every
 * failure, which loses the distinction between a network error and an API
 * 4xx/5xx (and the status code). Callers that need that for observability can
 * pass an `onFailure` hook to capture it.
 */
export type ApiCallFailure =
  | { kind: 'network'; status: null; error: unknown }
  | { kind: 'http'; status: number; statusText: string; body?: string };

type Options = {
  fullResponse?: boolean;
  /**
   * Optional diagnostics hook invoked when the call fails, just before `call`
   * returns null. Purely observational — it does not change the return value
   * or any control flow. Used to capture the HTTP status / network-vs-server
   * cause that would otherwise be discarded.
   */
  onFailure?: (failure: ApiCallFailure) => void;
};
