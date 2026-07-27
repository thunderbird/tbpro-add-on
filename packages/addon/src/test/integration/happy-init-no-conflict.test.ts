/**
 * HAPPY PATH — init.ts's ordinary, single-context init: a user with a
 * healthy local user/keychain and an intact default folder resolves cleanly
 * with no delete/recreate churn. Correct-behavior counterpart to D3 (which
 * proves what happens when two independent contexts both decide the
 * default folder is orphaned at the same time). Here there's only one
 * context and nothing is orphaned, so init() should just succeed quietly.
 */
import { INIT_ERRORS } from '@send-frontend/apps/send/const';
import { describe, expect, it, vi } from 'vitest';

describe('Happy path: init() with an intact default folder, single context', () => {
  it('resolves INIT_ERRORS.NONE without touching deleteFolder/createFolder when the default folder already has a key', async () => {
    vi.resetModules();
    const { default: init } = await import('@send-frontend/lib/init');

    const userStore = { loadFromLocalStorage: vi.fn().mockResolvedValue(true) };
    const keychain = {
      load: vi.fn().mockResolvedValue(true),
      keys: { 'healthy-default-folder': 'a-real-key' },
    };
    const folderStore = {
      sync: vi.fn().mockResolvedValue(undefined),
      defaultFolder: { id: 'healthy-default-folder' },
      deleteFolder: vi.fn(),
      createFolder: vi.fn(),
    };

    const result = await init(userStore as any, keychain as any, folderStore as any);

    expect(result).toBe(INIT_ERRORS.NONE);
    expect(folderStore.deleteFolder).not.toHaveBeenCalled();
    expect(folderStore.createFolder).not.toHaveBeenCalled();
  });

  it('single-flight guard correctly coalesces two concurrent calls WITHIN one context into one _init() run', async () => {
    vi.resetModules();
    const { default: init } = await import('@send-frontend/lib/init');

    const userStore = { loadFromLocalStorage: vi.fn().mockResolvedValue(true) };
    const keychain = {
      load: vi.fn().mockResolvedValue(true),
      keys: { 'healthy-default-folder': 'a-real-key' },
    };
    let syncCallCount = 0;
    const folderStore = {
      sync: vi.fn().mockImplementation(async () => {
        syncCallCount++;
      }),
      defaultFolder: { id: 'healthy-default-folder' },
      deleteFolder: vi.fn(),
      createFolder: vi.fn(),
    };

    // Two callers within the SAME module instance/context (e.g. the login
    // flow and dbUserSetup firing during the same rapid navigation, per
    // init.ts's own single-flight comment) fire at the same time.
    const [result1, result2] = await Promise.all([
      init(userStore as any, keychain as any, folderStore as any),
      init(userStore as any, keychain as any, folderStore as any),
    ]);

    expect(result1).toBe(INIT_ERRORS.NONE);
    expect(result2).toBe(INIT_ERRORS.NONE);
    // This is the guard working as intended: one shared run, not two.
    expect(syncCallCount).toBe(1);
  });

  it('returns NO_USER cleanly when there is no local user, without touching the keychain or folder store', async () => {
    vi.resetModules();
    const { default: init } = await import('@send-frontend/lib/init');

    const userStore = { loadFromLocalStorage: vi.fn().mockResolvedValue(false) };
    const keychain = { load: vi.fn(), keys: {} };
    const folderStore = { sync: vi.fn(), deleteFolder: vi.fn(), createFolder: vi.fn() };

    const result = await init(userStore as any, keychain as any, folderStore as any);

    expect(result).toBe(INIT_ERRORS.NO_USER);
    expect(folderStore.sync).not.toHaveBeenCalled();
  });
});
