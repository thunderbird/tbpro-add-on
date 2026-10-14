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
 *   - build the new keypair + blob on a scratch keychain (live keychain
 *     untouched until the server confirms),
 *   - swap it in on the server via trpc.resetKeys,
 *   - only then adopt the new keypair + passphrase into the live keychain,
 *   - flip `justReset` and surface the new passphrase in `words`,
 *   - stay in-session (NO logout / reload) and land on the dashboard so the
 *     overlay shows.
 *
 * These tests pin that behavior so the overlay-based e2e can't silently regress
 * again.
 */

const { state } = vi.hoisted(() => {
  const state = {
    routerPush: vi.fn(),
    // backup-store spies
    setWords: vi.fn(),
    setJustReset: vi.fn(),
    setShouldReset: vi.fn(),
    setErrorMessage: vi.fn(),
    words: [] as string[],
    // live keychain (shared instance so tests can inspect it afterwards)
    storePassPhrase: vi.fn(),
    keychainStore: vi.fn(),
    storedPassphrase: null as string | null,
    keychain: {
      locked: false,
      keys: {} as Record<string, string>,
      rsa: {
        setPrivateKeyFromJwk: vi.fn(),
        setPublicKeyFromJwk: vi.fn(),
      },
      getPassphraseValue: () => state.storedPassphrase,
      storePassPhrase: (p: string) => {
        state.storedPassphrase = p;
        return state.storePassPhrase(p);
      },
      store: () => state.keychainStore(),
    },
    // keychain lib
    generateResetKeyBlob: vi.fn(),
    // trpc
    resetKeysMutate: vi.fn(),
    // refetch
    refetch: vi.fn(),
  };
  return { state };
});

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
  default: () => ({ keychain: state.keychain }),
}));

vi.mock('@send-frontend/stores/backup-store', () => ({
  default: () => ({
    setWords: state.setWords,
    setBackupCompleted: vi.fn(),
    setErrorMessage: state.setErrorMessage,
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
// onSuccess/onError wiring (that's the code under test). useQuery is stubbed.
vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({
    isLoading: ref(false),
    data: ref('KEYS_IN_LOCAL_STORAGE'),
    refetch: state.refetch,
  }),
  useMutation: (opts: {
    mutationFn: (v?: unknown) => Promise<unknown>;
    onSuccess?: (d: unknown) => Promise<void> | void;
    onError?: (e: unknown) => Promise<void> | void;
  }) => ({
    mutate: async (vars?: unknown) => {
      try {
        const data = await opts.mutationFn(vars);
        if (opts.onSuccess) await opts.onSuccess(data);
      } catch (e) {
        if (opts.onError) await opts.onError(e);
        else throw e;
      }
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

const BLOB = {
  publicKey: 'pk',
  backupKeypair: 'kp',
  backupKeystring: 'ks',
  backupSalt: 'salt',
  backupContainerKeys: '{}',
};
const KEYPAIR = { publicKey: 'pk', privateKey: 'sk' };
const OLD_KEYS = { 'old-container': 'wrapped-with-old-key' };

describe('useBackupAndRestore -> safe reset shows the backup overlay (#1116)', () => {
  beforeEach(() => {
    state.words = [];
    state.storedPassphrase = null;
    state.keychain.locked = true; // a locked-out user is the common reset case
    state.keychain.keys = { ...OLD_KEYS };
    state.generateResetKeyBlob.mockResolvedValue({
      blob: BLOB,
      keypair: KEYPAIR,
    });
    state.resetKeysMutate.mockResolvedValue({ success: true });
    mount(Host);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('builds the replacement on a scratch keychain, not the live one', async () => {
    await composable.resetKeys();
    // Called with the passphrase only — no live keychain handed in to mutate.
    expect(state.generateResetKeyBlob).toHaveBeenCalledTimes(1);
    expect(state.generateResetKeyBlob.mock.calls[0]).toEqual([
      'new reset phrase',
    ]);
  });

  it('sends the server exactly the blob (not the keypair)', async () => {
    await composable.resetKeys();
    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
    expect(state.resetKeysMutate.mock.calls[0][0]).toEqual(BLOB);
  });

  it('adopts the new keypair + passphrase into the live keychain after the swap', async () => {
    await composable.resetKeys();
    expect(state.keychain.rsa.setPrivateKeyFromJwk).toHaveBeenCalledWith('sk');
    expect(state.keychain.rsa.setPublicKeyFromJwk).toHaveBeenCalledWith('pk');
    // Old wrapped container keys can't be opened by the new keypair.
    expect(state.keychain.keys).toEqual({});
    expect(state.keychain.locked).toBe(false);
    expect(state.storePassPhrase).toHaveBeenCalledWith('new reset phrase');
    expect(state.keychainStore).toHaveBeenCalledTimes(1);
  });

  it('leaves the live keychain untouched when the server rejects the swap', async () => {
    state.resetKeysMutate.mockRejectedValueOnce(new Error('422'));

    await composable.resetKeys();

    expect(state.keychain.rsa.setPrivateKeyFromJwk).not.toHaveBeenCalled();
    expect(state.keychain.rsa.setPublicKeyFromJwk).not.toHaveBeenCalled();
    expect(state.keychain.keys).toEqual(OLD_KEYS);
    expect(state.keychain.locked).toBe(true);
    expect(state.storePassPhrase).not.toHaveBeenCalled();
    expect(state.keychainStore).not.toHaveBeenCalled();
    expect(state.setJustReset).not.toHaveBeenCalled();
    // (A locked keychain redirects to /passphrase-changed on mount; that is
    // unrelated to reset. Only the post-reset dashboard route must be absent.)
    expect(state.routerPush).not.toHaveBeenCalledWith(
      '/send/profile?showDashboard=true'
    );
    // ...and the user is told, rather than failing silently.
    expect(state.setErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Could not reset')
    );
  });

  it('flips justReset and surfaces the new passphrase so the overlay appears', async () => {
    await composable.resetKeys();
    expect(state.setJustReset).toHaveBeenCalledWith(true);
    expect(state.setWords).toHaveBeenLastCalledWith(['new', 'reset', 'phrase']);
  });

  it('stays in-session and lands on the profile dashboard (no logout / reload)', async () => {
    await composable.resetKeys();
    // Must target the dashboard host of the BackupKeys overlay (ProfileView),
    // not the folder view at /send.
    expect(state.routerPush).toHaveBeenCalledWith(
      '/send/profile?showDashboard=true'
    );
    // The safe reset must NOT bounce the user through a login round-trip.
    expect(state.routerPush).not.toHaveBeenCalledWith('/login');
    expect(state.routerPush).not.toHaveBeenCalledWith('/send');
  });
});
