/**
 * Fake Thunderbird multi-context host for integration tests.
 *
 * Simulates the 3 JS-only WebExtension execution contexts that exist in a
 * real running Thunderbird instance for this add-on:
 *   - "background": the non-persistent background page (background.ts)
 *   - "popup": the upload popup window (PopupView.vue / useUploadAndShare.ts)
 *   - "web": a plain browser tab running the hosted send.tb.pro web app,
 *     bridged into the extension via token-bridge.js content script
 *
 * Each context gets its OWN independent `browser` mock object (mirroring the
 * real platform, where each JS realm has its own `browser.*` binding), but
 * they all share ONE fake `browser.storage.local` backing store with real
 * `storage.onChanged` event firing — this is the actual cross-context sync
 * primitive in production (see shared-pinia.ts's per-context-singleton
 * comment), so a real shared store (not per-context stubs) is essential for
 * these tests to be meaningful.
 *
 * `browser.runtime.sendMessage` calls from any context fan out to every
 * OTHER context's registered `onMessage` listeners, exactly like real
 * WebExtension messaging (a message sent from a page context is delivered to
 * the background and all other extension pages, not back to the sender).
 *
 * This harness deliberately does NOT implement `browser.TBProMenu`,
 * `browser.CloudFileAccounts`, `browser.MailAccounts`, or `browser.AccountHub`
 * with real behavior — those are privileged chrome UI/experiment APIs that
 * only exist inside a real Thunderbird process (see
 * ADDON-INTEGRATION-TEST-ENV-PLAN-2026-07-22.md, Tier 2/3). Here they are
 * spies: we only assert that the right calls happened with the right args at
 * the right time, which is what the sync-race findings actually depend on.
 */
import { vi } from 'vitest';

type Listener = (message: any, sender?: any) => any;
type StorageChangeListener = (
  changes: Record<string, { oldValue?: any; newValue?: any }>
) => void;
type WindowRemovedListener = (windowId: number) => void;

export interface FakeStorageBacking {
  data: Record<string, any>;
  changeListeners: StorageChangeListener[];
}

/** Creates one shared storage.local backing store used by ALL contexts. */
function createSharedStorage(): FakeStorageBacking {
  return { data: {}, changeListeners: [] };
}

function fireStorageChange(
  backing: FakeStorageBacking,
  changes: Record<string, { oldValue?: any; newValue?: any }>
) {
  for (const listener of backing.changeListeners) {
    listener(changes);
  }
}

/** Applies `apply` per key, collecting an onChanged-shaped diff, and fires it if non-empty. */
function mutateAndFireChange(
  backing: FakeStorageBacking,
  keys: string[],
  apply: (key: string) => { oldValue: any; newValue: any } | undefined
) {
  const changes: Record<string, { oldValue?: any; newValue?: any }> = {};
  for (const key of keys) {
    const change = apply(key);
    if (change) changes[key] = change;
  }
  if (Object.keys(changes).length > 0) fireStorageChange(backing, changes);
}

export interface FakeWindow {
  id: number;
  url: string;
  type: string;
}

export interface SharedWindowState {
  windows: Map<number, FakeWindow>;
  nextId: number;
  removedListeners: WindowRemovedListener[];
  /** Resolvers for windows.create() calls that are being held open by a test. */
  pendingCreates: Array<{ resolve: (w: FakeWindow) => void }>;
}

function createSharedWindowState(): SharedWindowState {
  return {
    windows: new Map(),
    nextId: 1,
    removedListeners: [],
    pendingCreates: [],
  };
}

export interface FakeTab {
  id: number;
  url?: string;
}

export interface SharedTabState {
  tabs: Map<number, FakeTab>;
  nextId: number;
}

function createSharedTabState(): SharedTabState {
  return { tabs: new Map(), nextId: 1 };
}

export interface FakeBrowserContext {
  name: string;
  browser: any;
  /** Manually invoke this context's registered runtime.onMessage listeners. */
  deliverMessage: (message: any, sender?: any) => Promise<any[]>;
  onMessageListeners: Listener[];
  /** Listeners registered via browser.cloudFile.onFileUpload.addListener(). */
  onFileUploadListeners: Array<(tab: any, fileInfo: any) => any>;
  /** Listeners registered via browser.cloudFile.onFileUploadAbort.addListener(). */
  onFileUploadAbortListeners: Array<(tab: any, id: number) => any>;
  /** Listeners registered via browser.windows.onRemoved.addListener(). */
  onWindowRemovedListeners: WindowRemovedListener[];
  /** Listeners registered via browser.storage.onChanged.addListener() for this context. */
  onStorageChangedListeners: StorageChangeListener[];
  /** Helper: fire this context's onFileUpload listeners as Thunderbird would. */
  triggerFileUpload: (fileInfo: {
    id: number;
    name: string;
    data: any;
  }) => Promise<any>;
}

export interface FakeHost {
  storage: FakeStorageBacking;
  windowState: SharedWindowState;
  tabState: SharedTabState;
  contexts: Map<string, FakeBrowserContext>;
  /** Create a new simulated context (e.g. 'background', 'popup', 'web'). */
  createContext: (name: string) => FakeBrowserContext;
  /** Fan a runtime.sendMessage call from `fromContext` out to all others. */
  broadcast: (fromContext: string, message: any, sender?: any) => Promise<any>;
}

/**
 * Builds a new fake host with a shared storage/window/tab backing.
 * Call `createContext(name)` for each simulated execution context.
 */
export function createFakeThunderbirdHost(): FakeHost {
  const storage = createSharedStorage();
  const windowState = createSharedWindowState();
  const tabState = createSharedTabState();
  const contexts = new Map<string, FakeBrowserContext>();

  function broadcast(fromContext: string, message: any, sender?: any) {
    const results: any[] = [];
    for (const [name, ctx] of contexts) {
      if (name === fromContext) continue;
      for (const listener of ctx.onMessageListeners) {
        try {
          const result = listener(message, sender);
          results.push(result);
        } catch (e) {
          // Mirror real WebExtension behavior: a throwing listener doesn't
          // block delivery to other listeners/contexts.
          console.warn(`[fakeHost] listener in ${name} threw:`, e);
        }
      }
    }
    // Real sendMessage resolves with the first defined response, or
    // undefined if no listener responded.
    return Promise.resolve(results.find((r) => r !== undefined));
  }

  function createContext(name: string): FakeBrowserContext {
    const onMessageListeners: Listener[] = [];
    const onFileUploadListeners: Array<(tab: any, fileInfo: any) => any> = [];
    const onFileUploadAbortListeners: Array<(tab: any, id: number) => any> = [];
    const onWindowRemovedListeners: WindowRemovedListener[] = [];
    const onStorageChangedListeners: StorageChangeListener[] = [];

    const browserMock: any = {
      storage: {
        local: {
          get: vi.fn(async (keys?: string | string[] | null) => {
            if (keys === undefined || keys === null) {
              return { ...storage.data };
            }
            const keyList = Array.isArray(keys) ? keys : [keys];
            const result: Record<string, any> = {};
            for (const k of keyList) {
              if (k in storage.data) result[k] = storage.data[k];
            }
            return result;
          }),
          set: vi.fn(async (items: Record<string, any>) => {
            mutateAndFireChange(storage, Object.keys(items), (k) => {
              const change = { oldValue: storage.data[k], newValue: items[k] };
              storage.data[k] = items[k];
              return change;
            });
          }),
          remove: vi.fn(async (keys: string | string[]) => {
            const keyList = Array.isArray(keys) ? keys : [keys];
            mutateAndFireChange(storage, keyList, (k) => {
              if (!(k in storage.data)) return undefined;
              const change = { oldValue: storage.data[k], newValue: undefined };
              delete storage.data[k];
              return change;
            });
          }),
          clear: vi.fn(async () => {
            const keys = Object.keys(storage.data);
            mutateAndFireChange(storage, keys, (k) => ({
              oldValue: storage.data[k],
              newValue: undefined,
            }));
            storage.data = {};
          }),
        },
        onChanged: {
          addListener: vi.fn((fn: StorageChangeListener) => {
            storage.changeListeners.push(fn);
            onStorageChangedListeners.push(fn);
          }),
        },
      },
      runtime: {
        id: 'fake-addon-id',
        onMessage: {
          addListener: vi.fn((fn: Listener) => {
            onMessageListeners.push(fn);
          }),
        },
        onInstalled: {
          addListener: vi.fn(),
        },
        sendMessage: vi.fn((message: any) => broadcast(name, message)),
        getURL: vi.fn((path: string) => `moz-extension://fake-id/${path}`),
        getBrowserInfo: vi.fn(async () => ({ version: '145.0' })),
      },
      windows: {
        // The `{url, type}` argument isn't inspected here -- the fake
        // deliberately never auto-resolves windows.create() so tests can
        // control exactly when it settles via resolveNextWindowCreate(),
        // to exercise check-then-act races (B3).
        create: vi.fn(async (_opts: { url: string; type: string }) => {
          return new Promise<FakeWindow>((resolve) => {
            windowState.pendingCreates.push({
              resolve: (w) => resolve(w),
            });
          });
        }),
        onRemoved: {
          addListener: vi.fn((fn: WindowRemovedListener) => {
            windowState.removedListeners.push(fn);
            onWindowRemovedListeners.push(fn);
          }),
        },
        getAll: vi.fn(async () => Array.from(windowState.windows.values())),
      },
      tabs: {
        create: vi.fn(async (opts: { url: string }) => {
          const id = tabState.nextId++;
          const tab: FakeTab = { id, url: opts.url };
          tabState.tabs.set(id, tab);
          return tab;
        }),
        query: vi.fn(async () => Array.from(tabState.tabs.values())),
        remove: vi.fn(async (id: number) => {
          tabState.tabs.delete(id);
        }),
        get: vi.fn(async (id: number) => {
          const tab = tabState.tabs.get(id);
          if (!tab) throw new Error('No tab with id ' + id);
          return tab;
        }),
        sendMessage: vi.fn(async () => undefined),
      },
      cloudFile: {
        onFileUpload: {
          addListener: vi.fn((fn: (tab: any, fileInfo: any) => any) => {
            onFileUploadListeners.push(fn);
          }),
        },
        onFileUploadAbort: {
          addListener: vi.fn((fn: (tab: any, id: number) => any) => {
            onFileUploadAbortListeners.push(fn);
          }),
        },
        getAllAccounts: vi.fn(async () => []),
      },
      CloudFileAccounts: {
        registerProvider: vi.fn(async () => {}),
        unregisterProvider: vi.fn(async () => {}),
        createAccount: vi.fn(async () => ({ accountId: 'acct-1' })),
      },
      TBProMenu: {
        create: vi.fn(async () => {}),
        update: vi.fn(async () => {}),
        clear: vi.fn(async () => {}),
        onClicked: { addListener: vi.fn() },
      },
      MailAccounts: {
        createAccount: vi.fn(async () => ({ success: true })),
        setToken: vi.fn(async () => ({ success: true })),
      },
      AccountHub: {
        onAccountAdded: { addListener: vi.fn() },
      },
      thundermailTelemetry: {
        isTelemetryEnabled: vi.fn(async () => false),
        onChanged: { addListener: vi.fn() },
      },
      webRequest: {
        onBeforeSendHeaders: { addListener: vi.fn() },
      },
      i18n: {
        getMessage: vi.fn((key: string) => key),
      },
      management: {
        uninstallSelf: vi.fn(async () => {}),
      },
    };

    const ctx: FakeBrowserContext = {
      name,
      browser: browserMock,
      onMessageListeners,
      onFileUploadListeners,
      onFileUploadAbortListeners,
      onWindowRemovedListeners,
      onStorageChangedListeners,
      deliverMessage: async (message: any, sender?: any) => {
        return Promise.all(
          onMessageListeners.map((fn) => fn(message, sender))
        );
      },
      triggerFileUpload: async (fileInfo) => {
        const results = onFileUploadListeners.map((fn) =>
          fn({ id: 1 }, fileInfo)
        );
        return results[0];
      },
    };
    contexts.set(name, ctx);
    return ctx;
  }

  return {
    storage,
    windowState,
    tabState,
    contexts,
    createContext,
    broadcast,
  };
}

/**
 * Resolves the next pending `windows.create()` call for the given host,
 * assigning it a window id and adding it to the shared window registry.
 * Lets tests control exactly when a popup's `browser.windows.create()`
 * await settles, e.g. to force two `openUnifiedPopup()` calls to race.
 */
export function resolveNextWindowCreate(
  host: FakeHost,
  url = 'moz-extension://fake-id/index.extension.html'
): FakeWindow | null {
  const pending = host.windowState.pendingCreates.shift();
  if (!pending) return null;
  const id = host.windowState.nextId++;
  const win: FakeWindow = { id, url, type: 'popup' };
  host.windowState.windows.set(id, win);
  pending.resolve(win);
  return win;
}

/** Simulates the popup window being closed (fires windows.onRemoved). */
export function closeWindow(host: FakeHost, windowId: number) {
  host.windowState.windows.delete(windowId);
  for (const listener of host.windowState.removedListeners) {
    listener(windowId);
  }
}
