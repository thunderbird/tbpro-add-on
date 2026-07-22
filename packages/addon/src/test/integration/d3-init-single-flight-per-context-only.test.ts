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
 * WITHIN one JS execution context. It provides zero protection if two
 * different contexts both decide, at the same moment, that the default
 * folder's key is missing and both proceed to delete+recreate it.
 *
 * This test drives the REAL `init.ts` module (not a reimplementation) via
 * two separate module instances (simulating two execution contexts, the
 * same technique used in the B5 spec to simulate a background restart) and
 * proves BOTH contexts' `inFlight` guards independently allow `_init()` to
 * run concurrently for the same "orphaned default folder" scenario -- i.e.
 * neither context's guard has any awareness of the other.
 */
import { INIT_ERRORS } from '@send-frontend/apps/send/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred } from './testHelpers';

describe('D3: init.ts single-flight guard does not coordinate across contexts', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CONFIRMED BUG: two independent module instances (contexts) both run _init() concurrently for the same account with no shared lock', async () => {
    // --- "Context 1" (e.g. background) ---
    const initModule1 = await import('@send-frontend/lib/init');
    const init1 = initModule1.default;

    const sync1Deferred = createDeferred<void>();
    let context1SyncCalled = false;
    const userStore1 = { loadFromLocalStorage: vi.fn().mockResolvedValue(true) };
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

    // --- "Context 2" (e.g. popup), a totally separate module instance ---
    vi.resetModules();
    const initModule2 = await import('@send-frontend/lib/init');
    const init2 = initModule2.default;

    expect(init2).not.toBe(init1); // confirms genuinely separate module instances

    const userStore2 = { loadFromLocalStorage: vi.fn().mockResolvedValue(true) };
    const keychain2 = {
      load: vi.fn().mockResolvedValue(true),
      keys: {},
    };
    const folderStore2 = {
      sync: vi.fn().mockResolvedValue(undefined), // resolves immediately
      defaultFolder: { id: 'shared-account-default-folder' }, // SAME account/folder
      deleteFolder: vi.fn().mockResolvedValue(undefined),
      createFolder: vi.fn().mockResolvedValue({ id: 'another-new-folder-id' }),
    };

    // THE BUG: context 2's `inFlight` is `null` (it's a fresh module
    // instance -- it has never heard of context 1's in-progress run), so
    // its single-flight guard does NOT block this call. Context 2 proceeds
    // straight through to its own delete+recreate decision for the exact
    // same account's default folder that context 1 is still deciding on.
    const context2Result = await init2(
      userStore2 as any,
      keychain2 as any,
      folderStore2 as any
    );

    // Context 2 completed its own independent delete+recreate cycle,
    // completely unaware of context 1's still-pending run.
    expect(context2Result).toBe(INIT_ERRORS.NONE);
    expect(folderStore2.deleteFolder).toHaveBeenCalledWith(
      'shared-account-default-folder'
    );
    expect(folderStore2.createFolder).toHaveBeenCalled();

    // Now let context 1 finish too.
    sync1Deferred.resolve();
    const context1Result = await context1InitPromise;
    expect(context1Result).toBe(INIT_ERRORS.NONE);

    // THE BUG's endpoint: BOTH contexts independently ran delete+recreate
    // for the SAME account's default folder, with no coordination of any
    // kind between them -- exactly reintroducing the duplicate-default-
    // folder race that issue #930's single-flight guard was meant to fix,
    // just moved from "within one context" to "across contexts."
    expect(folderStore1.deleteFolder).toHaveBeenCalledWith(
      'shared-account-default-folder'
    );
    expect(folderStore1.createFolder).toHaveBeenCalled();
  });
});
