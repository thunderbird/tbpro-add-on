/**
 * D3 — `init.ts`'s single-flight guard is per-context only; cross-context
 * default-folder race can reintroduce issue #930 (duplicate default
 * folders).
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #D3 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §D3.
 *
 * Mechanism under test (send-frontend/src/lib/init.ts):
 *   let inFlight: Promise<INIT_ERRORS> | null = null;
 *   function init(...) {
 *     if (inFlight) return inFlight;
 *     inFlight = _init(...).finally(() => { inFlight = null; });
 *     return inFlight;
 *   }
 *
 * `inFlight` is a plain module-scope `let`. Background, popup, and any
 * web-app tab each load their own independent copy of this module (see
 * shared-pinia.ts's per-context-singleton comment, and A4/D1's identical
 * reasoning) -- so this guard only ever prevents duplicate concurrent runs
 * WITHIN one JS execution context. On its own it provides zero protection
 * if two different contexts both decide, at the same moment, that the
 * default folder's key is missing and both proceed to delete+recreate it.
 *
 * FIX (see issue #1032): init.ts now also acquires a short-TTL lock in
 * `browser.storage.local`, keyed by account id, around the delete+recreate
 * branch specifically. That storage is the one thing every context
 * genuinely shares, so it's what lets one context's in-flight decision be
 * visible to the others. This test drives the REAL `init.ts` module (not a
 * reimplementation) via two separate module instances stubbed onto two
 * separate fake-host contexts (the same technique used in the B5 spec to
 * simulate a background restart), and proves that with the fix in place,
 * only ONE of the two contexts performs the delete+recreate for a given
 * account's default folder -- the other observes the lock and defers
 * instead of independently recreating it.
 */
import { INIT_ERRORS } from '@send-frontend/apps/send/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred, setupHost, stubContext, teardownHost } from './testHelpers';
import type { FakeHost } from './fakeThunderbirdHost';

describe('D3: init.ts single-flight guard does not coordinate across contexts (fixed via storage lock)', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('FIXED: the lock does not deadlock -- a second context can still acquire it and run its own init after the first releases it', async () => {
    const sharedAccountId = 'shared-account-id';

    // --- "Context 1" (e.g. background) ---
    stubContext(host, 'background');
    const initModule1 = await import('@send-frontend/lib/init');
    const init1 = initModule1.default;

    const sync1Deferred = createDeferred<void>();
    let context1SyncCalled = false;
    const userStore1 = {
      user: { id: sharedAccountId },
      loadFromLocalStorage: vi.fn().mockResolvedValue(true),
    };
    const keychain1 = {
      load: vi.fn().mockResolvedValue(true),
      keys: {}, // no key for the default folder -> triggers delete+recreate branch
    };
    const folderStore1 = {
      sync: vi.fn().mockImplementation(async () => {
        context1SyncCalled = true;
        return sync1Deferred.promise;
      }),
      defaultFolder: { id: 'shared-account-default-folder' },
      deleteFolder: vi.fn().mockResolvedValue(undefined),
      createFolder: vi.fn().mockResolvedValue({ id: 'new-folder-id' }),
    };

    // Start context 1's init() -- it will block inside folderStore.sync()
    // until we resolve sync1Deferred below, simulating "context 1 is
    // mid-init, hasn't yet decided to delete+recreate the folder."
    const context1InitPromise = init1(
      userStore1 as any,
      keychain1 as any,
      folderStore1 as any
    );

    // Let context 1 actually enter _init() and reach folderStore.sync().
    await vi.waitFor(() => expect(context1SyncCalled).toBe(true));

    // Let context 1 finish sync and go on to acquire the lock and run
    // deleteFolder/createFolder, before context 2 gets a chance to try.
    sync1Deferred.resolve();
    await vi.waitFor(() => expect(folderStore1.createFolder).toHaveBeenCalled());

    // --- "Context 2" (e.g. popup), a totally separate module instance,
    // stubbed onto a SEPARATE fake-host context that shares the same
    // underlying browser.storage.local backing store as context 1. ---
    vi.resetModules();
    stubContext(host, 'popup');
    const initModule2 = await import('@send-frontend/lib/init');
    const init2 = initModule2.default;

    expect(init2).not.toBe(init1); // confirms genuinely separate module instances

    const userStore2 = {
      user: { id: sharedAccountId }, // SAME account
      loadFromLocalStorage: vi.fn().mockResolvedValue(true),
    };
    const keychain2 = {
      load: vi.fn().mockResolvedValue(true),
      keys: {},
    };
    const folderStore2 = {
      sync: vi.fn().mockResolvedValue(undefined),
      defaultFolder: { id: 'shared-account-default-folder' }, // SAME folder
      deleteFolder: vi.fn().mockResolvedValue(undefined),
      createFolder: vi.fn().mockResolvedValue({ id: 'another-new-folder-id' }),
    };

    // By the time context 2 runs, context 1 has already released its lock
    // (its delete+recreate finished above), so context 2 must be free to
    // acquire it fresh and run its own decision -- the lock must not get
    // stuck held forever after a clean release. (The actual overlap-
    // prevention claim is covered by the next test, where the two contexts
    // genuinely race.)
    const context2Result = await init2(
      userStore2 as any,
      keychain2 as any,
      folderStore2 as any
    );

    expect(context2Result).toBe(INIT_ERRORS.NONE);
    expect(folderStore2.createFolder).toHaveBeenCalled();

    const context1Result = await context1InitPromise;
    expect(context1Result).toBe(INIT_ERRORS.NONE);
    expect(folderStore1.createFolder).toHaveBeenCalled();
  });

  it('FIXED: a context racing an in-progress delete+recreate defers instead of running its own', async () => {
    const sharedAccountId = 'another-shared-account-id';

    // --- "Context 1" holds the lock and is mid delete+recreate ---
    stubContext(host, 'background');
    const initModule1 = await import('@send-frontend/lib/init');
    const init1 = initModule1.default;

    const deleteDeferred = createDeferred<void>();
    let deleteFolderCalled = false;
    const userStore1 = {
      user: { id: sharedAccountId },
      loadFromLocalStorage: vi.fn().mockResolvedValue(true),
    };
    const keychain1 = {
      load: vi.fn().mockResolvedValue(true),
      keys: {},
    };
    const folderStore1 = {
      sync: vi.fn().mockResolvedValue(undefined),
      defaultFolder: { id: 'another-shared-default-folder' },
      deleteFolder: vi.fn().mockImplementation(async () => {
        deleteFolderCalled = true;
        return deleteDeferred.promise;
      }),
      createFolder: vi.fn().mockResolvedValue({ id: 'new-folder-id' }),
    };

    const context1InitPromise = init1(
      userStore1 as any,
      keychain1 as any,
      folderStore1 as any
    );

    // Let context 1 reach deleteFolder -- it now holds the lock and is
    // blocked inside the guarded section.
    await vi.waitFor(() => expect(deleteFolderCalled).toBe(true));

    // --- "Context 2" tries to init() for the SAME account while context 1
    // still holds the lock. ---
    vi.resetModules();
    stubContext(host, 'popup');
    const initModule2 = await import('@send-frontend/lib/init');
    const init2 = initModule2.default;

    const userStore2 = {
      user: { id: sharedAccountId },
      loadFromLocalStorage: vi.fn().mockResolvedValue(true),
    };
    const keychain2 = {
      load: vi.fn().mockResolvedValue(true),
      keys: {},
    };
    const folderStore2 = {
      // After deferring to the lock, init() re-syncs and reports whatever
      // context 1 leaves behind. Simulate that context 1's new folder is
      // now visible.
      sync: vi.fn().mockResolvedValue(undefined),
      defaultFolder: { id: 'context-1s-recreated-folder' },
      deleteFolder: vi.fn().mockResolvedValue(undefined),
      createFolder: vi.fn().mockResolvedValue({ id: 'should-not-be-used' }),
    };

    const context2Result = await init2(
      userStore2 as any,
      keychain2 as any,
      folderStore2 as any
    );

    // THE FIX: context 2 must NOT run its own delete+recreate while
    // context 1's is still in flight for the same account.
    expect(folderStore2.deleteFolder).not.toHaveBeenCalled();
    expect(folderStore2.createFolder).not.toHaveBeenCalled();
    expect(context2Result).toBe(INIT_ERRORS.NONE);

    // Let context 1 finish.
    deleteDeferred.resolve();
    const context1Result = await context1InitPromise;
    expect(context1Result).toBe(INIT_ERRORS.NONE);
    expect(folderStore1.createFolder).toHaveBeenCalled();
  });
});
