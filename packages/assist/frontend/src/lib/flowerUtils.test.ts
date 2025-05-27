/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { getCachedValue, fetchEmailBodyAndHash, getFlwrApiKey } from './flowerUtils';

// Declare globals for TS
declare let messenger: any;
declare let crypto: any;
declare let fetch: any;

describe('setup globals', () => {
  beforeAll(() => {
    // Mock messenger API
    globalThis.messenger = {
      // @ts-ignore
      storage: { local: { get: vi.fn(), set: vi.fn() } },
      // @ts-ignore
      messages: { getFull: vi.fn() },
      // @ts-ignore
      tabs: { sendMessage: vi.fn() },
    };

    // Mock browser API
    globalThis.browser = {
      // @ts-ignore
      storage: { local: { get: vi.fn() } },
      // @ts-ignore
      compose: { beginReply: vi.fn() },
    };

    // Mock fetch
    globalThis.fetch = vi.fn();

    // Mock crypto.subtle.digest
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          digest: vi.fn(),
        },
      },
    });

    // Mock DOMParser for HTML parsing
    globalThis.DOMParser = class {
      parseFromString(html: string) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return { body: { textContent: div.textContent } };
      }
    } as any;
  });

  it('globals are defined', () => {
    expect(globalThis.messenger).toBeDefined();
    expect(globalThis.browser).toBeDefined();
    expect(globalThis.fetch).toBeDefined();
    expect(globalThis.crypto).toBeDefined();
  });
});

describe('getCachedValue', () => {
  it('returns stored string value', async () => {
    (messenger.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ key: 'value' });
    await expect(getCachedValue('key')).resolves.toBe('value');
    expect(messenger.storage.local.get).toHaveBeenCalledWith('key');
  });

  it('returns null when no stored value', async () => {
    (messenger.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await expect(getCachedValue('missing')).resolves.toBeNull();
  });
});

describe('fetchEmailBodyAndHash', () => {
  it('returns body and hash for plaintext without long URLs', async () => {
    (messenger.messages.getFull as ReturnType<typeof vi.fn>).mockResolvedValue({
      parts: [{ contentType: 'text/plain', body: 'hello world' }],
    });
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    (crypto.subtle.digest as ReturnType<typeof vi.fn>).mockResolvedValue(buffer);

    const { emailBody, emailHash } = await fetchEmailBodyAndHash(123);
    expect(emailBody).toBe('hello world');
    expect(emailHash).toBe('01020304');
  });

  it('returns nulls when no parts available', async () => {
    (messenger.messages.getFull as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const result = await fetchEmailBodyAndHash(456);
    expect(result).toEqual({ emailBody: null, emailHash: null, encrypted: null });
  });
});

describe('getFlwrApiKey', () => {
  it('returns api key when response has proper fields', async () => {
    const fakeResponse = { json: async () => ({ uid: 'u', email: 'e', flwr_api_key: 'key123' }) };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fakeResponse);
    await expect(getFlwrApiKey()).resolves.toBe('key123');
    expect(fetch).toHaveBeenCalledWith(
      `${import.meta.env.VITE_API_URL}/auth/stat`,
      expect.objectContaining({ mode: 'cors' })
    );
  });

  it('returns undefined on fetch error or missing data', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
    await expect(getFlwrApiKey()).resolves.toBeUndefined();
  });
});
