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
    await this.call('lockbox/fxa/logout');
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
    const opts: Record<string, any> = {
      mode: 'cors',
      credentials: 'include', // include cookies
      method,
      headers: {
        'content-type': 'application/json',
        ...headers,
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

    // 403 means the user is not authenticated or has an expired session
    // we retry the request once if that is the case
    // save opts
    const originalOpts = { ...opts };
    if (resp.status === 401) {
      try {
        // Refresh token
        await fetch(refreshTokenUrl);
        resp = await fetch(url, originalOpts);
      } catch (error) {
        console.log(error);
        return null;
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
