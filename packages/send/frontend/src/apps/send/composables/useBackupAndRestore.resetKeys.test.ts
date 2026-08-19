import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

/**
 * Regression test for the "Reset keys" e2e (issue #1116).
 *
 * The safe reset performs a server-side write-new-then-swap (it never nulls the
 * recovery blob), so after a reset the account DOES have a valid server backup.
 * That means the old signal that used to render the BackupKeys overlay
 * ("server has no backup" => SHOULD_ENCRYPT_AND_BACKUP) no longer fires.
 *
 * To keep prompting the user to SAVE their freshly generated recovery key, the
 * reset flow must instead:
 *   - generate the new keypair INTO the live keychain (so local keys match the
 *     new server blob),
 *   - swap it in on the server via trpc.resetKeys,
 *   - adopt the new passphrase locally,
 *   - flip `justReset` and surface the new passphrase in `words`,
 *   - stay in-session (NO logout / reload) and land on /send so the overlay
 *     shows.
 *
 * These tests pin that behavior so the overlay-based e2e can't silently regress
 * again.
 */

const { state } = vi.hoisted(() => ({
  state: {
    locked: false,
    routerPush: vi.fn(),
    // backup-store spies
    setWords: vi.fn(),
    setJustReset: vi.fn(),
    setShouldReset: vi.fn(),
    words: [] as string[],
    // keychain spies
    storePassPhrase: vi.fn(),
    keychainStore: vi.fn(),
    storedPassphrase: null as string | null,
    // keychain lib
    generateResetKeyBlob: vi.fn(),
    // trpc
    resetKeysMutate: vi.fn(),
    // refetch
    refetch: vi.fn(),
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: state.routerPush }),
}));

vi.mock('@send-frontend/apps/send/stores/extension-store', () => ({
  useExtensionStore: () => ({
    sendMessageToBridge: vi.fn(),
    configureExtension: vi.fn(),
  }),
}));

vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({
    keychain: {
      locked: state.locked,
      getPassphraseValue: () => state.storedPassphrase,
      storePassPhrase: (p: string) => {
        state.storedPassphrase = p;
        return state.storePassPhrase(p);
      },
      store: state.keychainStore,
    },
  }),
}));

vi.mock('@send-frontend/stores/backup-store', () => ({
  default: () => ({
    setWords: state.setWords,
    setBackupCompleted: vi.fn(),
    setErrorMessage: vi.fn(),
    setJustReset: state.setJustReset,
    setShouldReset: state.setShouldReset,
    words: ref(state.words),
    errorMessage: ref(''),
    shouldUnlock: ref(false),
    shouldReset: ref(false),
    justReset: ref(false),
    passphraseString: ref(''),
  }),
}));

vi.mock('@send-frontend/stores/user-store', () => ({
  default: () => ({
    getBackup: vi.fn(),
    user: { email: 'a@b.co' },
    clearUserFromStorage: vi.fn(),
    populateFromBackend: vi.fn(),
  }),
}));

vi.mock('@send-frontend/apps/send/stores/folder-store', () => ({
  default: () => ({}),
}));

vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({ api: {} }),
}));

vi.mock('@send-frontend/stores/metrics', () => ({
  default: () => ({ metrics: { capture: vi.fn() } }),
}));

vi.mock('@send-frontend/lib/passphrase', () => ({
  generatePassphrase: () => ['new', 'reset', 'phrase'],
}));

vi.mock('@send-frontend/lib/helpers', () => ({ dbUserSetup: vi.fn() }));

vi.mock('@send-frontend/lib/keychain', () => ({
  backupKeys: vi.fn(),
  restoreKeys: vi.fn(),
  generateResetKeyBlob: (...args: unknown[]) =>
    state.generateResetKeyBlob(...args),
}));

vi.mock('@send-frontend/lib/passphraseUtils', () => ({
  downloadPassPhrase: vi.fn(),
  parsePassphrase: (s: string) => s,
}));

vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: {
    resetKeys: { mutate: (...a: unknown[]) => state.resetKeysMutate(...a) },
    deleteFiles: { mutate: vi.fn() },
  },
}));

// Use a light but REAL useMutation so we exercise the actual mutationFn +
// onSuccess wiring (that's the code under test). useQuery is stubbed.
vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({
    isLoading: ref(false),
    data: ref('KEYS_IN_LOCAL_STORAGE'),
    refetch: state.refetch,
  }),
  useMutation: (opts: {
    mutationFn: (v?: unknown) => Promise<unknown>;
    onSuccess?: (d: unknown) => Promise<void> | void;
  }) => ({
    mutate: async (vars?: unknown) => {
      const data = await opts.mutationFn(vars);
      if (opts.onSuccess) await opts.onSuccess(data);
    },
    isSuccess: ref(false),
    isError: ref(false),
    reset: vi.fn(),
  }),
}));

import { useBackupAndRestore } from './useBackupAndRestore';

let composable: ReturnType<typeof useBackupAndRestore>;

const Host = defineComponent({
  setup() {
    composable = useBackupAndRestore();
    return () => h('div');
  },
});

describe('useBackupAndRestore -> safe reset shows the backup overlay (#1116)', () => {
  beforeEach(() => {
    state.locked = false;
    state.words = [];
    state.storedPassphrase = null;
    state.generateResetKeyBlob.mockResolvedValue({
      publicKey: 'pk',
      backupKeypair: 'kp',
      backupKeystring: 'ks',
      backupSalt: 'salt',
      backupContainerKeys: '{}',
    });
    state.resetKeysMutate.mockResolvedValue({ success: true });
    mount(Host);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('generates the new keypair into the LIVE keychain (not a scratch one)', async () => {
    await composable.resetKeys();
    // Called with (passphrase, keychain) — the second arg must be the live
    // keychain so local keys match the new server blob.
    expect(state.generateResetKeyBlob).toHaveBeenCalledTimes(1);
    expect(state.generateResetKeyBlob.mock.calls[0].length).toBe(2);
    expect(state.generateResetKeyBlob.mock.calls[0][1]).toBeTruthy();
  });

  it('swaps the new blob in on the server before touching local state', async () => {
    await composable.resetKeys();
    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
    expect(state.resetKeysMutate.mock.calls[0][0]).toMatchObject({
      publicKey: 'pk',
      backupKeypair: 'kp',
      backupKeystring: 'ks',
      backupSalt: 'salt',
    });
  });

  it('adopts the new passphrase locally and persists the keychain', async () => {
    await composable.resetKeys();
    expect(state.storePassPhrase).toHaveBeenCalledWith('new reset phrase');
    expect(state.keychainStore).toHaveBeenCalledTimes(1);
  });

  it('flips justReset and surfaces the new passphrase so the overlay appears', async () => {
    await composable.resetKeys();
    expect(state.setJustReset).toHaveBeenCalledWith(true);
    expect(state.setWords).toHaveBeenLastCalledWith(['new', 'reset', 'phrase']);
  });

  it('stays in-session and lands on /send (no logout / reload)', async () => {
    await composable.resetKeys();
    expect(state.routerPush).toHaveBeenCalledWith('/send');
    // The safe reset must NOT bounce the user through a login round-trip.
    expect(state.routerPush).not.toHaveBeenCalledWith('/login');
    expect(state.routerPush).not.toHaveBeenCalledWith('/send/profile');
  });
});
