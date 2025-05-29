/*
Facilitate using Pinia inside of an extension or in a regular browser.
Update this file to use `browser.storage.sync` if we need to
sync settings across devices.
*/

import {
  DEFAULT_ENCRYPTED_EMAILS,
  DEFAULT_REMOTE_HANDOFF,
  DEFAULT_REPLY_PROMPT,
  DEFAULT_SUMMARY_PROMPT,
  ENABLED_ACCOUNTS_CACHE_KEY,
  ENCRYPTED_SUMMARY_CACHE_KEY,
  REMOTE_HANDOFF_CACHE_KEY,
  REPLY_CACHE_KEY,
  STORE_NAME_SETTINGS,
  STORE_NAME_SUMMARY_CACHE,
  SUMMARY_PROMPT_CACHE_KEY,
} from '@/const';

type StorageLike = {
  get(): Promise<Record<string, any>>;
  set(data: Record<string, any>): Promise<void>;
  print(key: string): Promise<void>;
  init(defaultVals: Record<string, any>): Promise<void>;
};

/**
 * Returns a StorageLike object that can be used as a specific store for data.
 * e.g. UserSettings, ApplicationCache, etc...
 * Regardless of the storage backend, this data is not shared with another StorageLike.
 *
 * The exact storage backend used depends on whether we're
 * running in an extension or in a browser.
 *
 * (Uses `browser.storage.local` if running in an extension,
 * otherwise uses `localStorage.)
 */
export function createStorage(key: string): StorageLike {
  let isExtensionStorage;

  try {
    isExtensionStorage = !!(typeof browser !== 'undefined' && browser.storage?.local);
  } catch {
    isExtensionStorage = false;
  }

  return isExtensionStorage ? makeExtensionStorage(key) : makeBrowserStorage(key);
}

// Export for use by pinia store, even though we initialize here as well.
export const settingsInitialState = {
  [REPLY_CACHE_KEY]: DEFAULT_REPLY_PROMPT,
  [SUMMARY_PROMPT_CACHE_KEY]: DEFAULT_SUMMARY_PROMPT,
  [REMOTE_HANDOFF_CACHE_KEY]: DEFAULT_REMOTE_HANDOFF,
  [ENABLED_ACCOUNTS_CACHE_KEY]: [] as string[],
  [ENCRYPTED_SUMMARY_CACHE_KEY]: DEFAULT_ENCRYPTED_EMAILS,
};
export const settingsStorage = createStorage(STORE_NAME_SETTINGS);
(async () => await settingsStorage.init(settingsInitialState))().catch(console.error);

export const summaryCacheStorage = createStorage(STORE_NAME_SUMMARY_CACHE);

function makeExtensionStorage(key: string): StorageLike {
  return {
    async get() {
      const result = await browser.storage.local.get(key);
      // When you do a `browser.storage.local.get(key)`, it returns an object that contains that key:
      // {
      //   [key]: { /* the data you actually want */ }
      // }
      // So, to get the same behavior as localStorage, you have to index again.
      // That's the reason we return `result[key]` from this function.
      return result[key] || {};
    },
    async set(data) {
      await browser.storage.local.set({
        [key]: {
          ...data,
        },
      });
    },
    async init(data) {
      const saved = await browser.storage.local.get(key);
      const isEmpty = !saved || Object.keys(saved).length === 0;
      if (isEmpty) {
        await this.set(data);
      }
    },
    async print(key: string) {
      const data = await browser.storage.local.get(key);
      console.log(`📦 browser.storage[${key}]:`, JSON.stringify(data[key], null, 2));
    },
  };
}

function makeBrowserStorage(key: string): StorageLike {
  return {
    async get() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    },
    async set(data) {
      // Patch what's currently in storage.
      // Then store the patched version.
      const current = await this.get();
      Object.keys(data).forEach((k) => {
        current[k] = data[k];
      });
      localStorage.setItem(key, JSON.stringify(current));
    },
    async init(data) {
      const saved = await this.get();
      const isEmpty = !saved || Object.keys(saved).length === 0;
      if (isEmpty) {
        await this.set(data);
      }
    },
    async print(key: string) {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      console.log(`📦 localStorage[${key}]:`, JSON.stringify(parsed, null, 2));
    },
  };
}
