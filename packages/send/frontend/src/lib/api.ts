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
    const { isBucketStorage } = await trpc.getStorageType.query();
    return isBucketStorage;
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
  public async call<
    T = { [key: string]: any },
    O extends Options = { fullResponse: false },
  >(
    path: string,
    body: Record<string, any> = {},
    method: string = 'GET',
    headers: Record<string, any> = {},
    options?: O
  ): Promise<O extends { fullResponse: true } ? Response : T | null> {
    const url = `${this.serverUrl}/api/${path}`;
    const refreshTokenUrl = `${this.serverUrl}/api/auth/refresh`;

    // Try to get OIDC access token and add to headers if available
    const requestHeaders = { ...headers };
    if (!requestHeaders['Authorization']) {
      try {
        // Dynamically import to avoid circular dependency
        const { useAuthStore } = await import(
          '@send-frontend/stores/auth-store'
        );
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
      return null;
    }

    // Handle authentication errors
    if (resp.status === 401) {
      // If we're using OIDC and get 401, try to refresh the token
      if (requestHeaders['Authorization']) {
        try {
          const { useAuthStore } = await import(
            '@send-frontend/stores/auth-store'
          );
          const authStore = useAuthStore();
          const newToken = await authStore.refreshToken();

          if (newToken) {
            // Retry with new token
            opts.headers['Authorization'] = `Bearer ${newToken}`;
            resp = await fetch(url, opts);
          }
        } catch (error) {
          console.error('Token refresh failed:', error);
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
          return null;
        }
      }
    }

    if (!resp.ok) {
      return null;
    }

    if (!!options?.fullResponse) {
      //@ts-ignore
      return resp;
    }

    return resp.json();
  }
}

type Options = {
  fullResponse?: boolean;
};
