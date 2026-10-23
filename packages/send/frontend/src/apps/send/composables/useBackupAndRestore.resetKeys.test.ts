import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import useBackupStore from '@send-frontend/stores/backup-store';

/**
 * Reset Encryption Key swaps the key on the server only on "Download and
 * Continue" (#1355); confirming the reset just shows the overlay. Uses the real
 * backup store so `words` / overlay flags are what the components render.
 */

const { state } = vi.hoisted(() => {
  const calls: string[] = [];
  const state = {
    calls,
    routerPush: vi.fn(),
    storedPassphrase: 'old stored phrase' as string,
    keychain: {
      locked: false,
      keys: {} as Record<string, string>,
      rsa: {
        setPrivateKeyFromJwk: vi.fn(async () => {
          calls.push('adopt');
        }),
        setPublicKeyFromJwk: vi.fn(),
      },
      getPassphraseValue: () => state.storedPassphrase,
      storePassPhrase: vi.fn(async (p: string) => {
        state.storedPassphrase = p;
      }),
      store: vi.fn(),
    },
    generateResetKeyBlob: vi.fn(),
    resetKeysMutate: vi.fn(),
    backupKeys: vi.fn(),
    downloadPassPhrase: vi.fn(),
    sendMessageToBridge: vi.fn(),
    dbUserSetup: vi.fn(),
    refetch: vi.fn(),
    phraseCount: 0,
  };
  return { state };
});

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: state.routerPush }),
}));

vi.mock('@send-frontend/apps/send/stores/extension-store', () => ({
  useExtensionStore: () => ({
    sendMessageToBridge: state.sendMessageToBridge,
    configureExtension: vi.fn(),
  }),
}));

vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain: state.keychain }),
}));

vi.mock('@send-frontend/stores/user-store', () => ({
  default: () => ({ getBackup: vi.fn(), user: { email: 'a@b.co' } }),
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
  generatePassphrase: () => {
    state.phraseCount += 1;
    return ['new', 'phrase', String(state.phraseCount)];
  },
}));

vi.mock('@send-frontend/lib/helpers', () => ({
  dbUserSetup: (...a: unknown[]) => state.dbUserSetup(...a),
}));

vi.mock('@send-frontend/lib/keychain', () => ({
  backupKeys: (...a: unknown[]) => state.backupKeys(...a),
  restoreKeys: vi.fn(),
  generateResetKeyBlob: (...a: unknown[]) => state.generateResetKeyBlob(...a),
}));

vi.mock('@send-frontend/lib/passphraseUtils', () => ({
  downloadPassPhrase: (...a: unknown[]) => state.downloadPassPhrase(...a),
  parsePassphrase: (s: string) => s,
}));

vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: {
    resetKeys: { mutate: (...a: unknown[]) => state.resetKeysMutate(...a) },
    deleteFiles: { mutate: vi.fn() },
  },
}));

vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({
    isLoading: ref(false),
    data: ref('KEYS_IN_LOCAL_STORAGE'),
    refetch: state.refetch,
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    isSuccess: ref(false),
    isError: ref(false),
    reset: vi.fn(),
  }),
}));

import { useBackupAndRestore } from './useBackupAndRestore';

const BLOB = { publicKey: 'pk', backupKeypair: 'kp' };
const KEYPAIR = { publicKey: 'pk', privateKey: 'sk' };
const OLD_KEYS = { 'old-container': 'wrapped-with-old-key' };

let composable: ReturnType<typeof useBackupAndRestore>;
const mountComposable = () =>
  mount(
    defineComponent({
      setup() {
        composable = useBackupAndRestore();
        return () => h('div');
      },
    })
  );

describe('useBackupAndRestore -> reset swaps on "Download and Continue" (#1355)', () => {
  let store: ReturnType<typeof useBackupStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useBackupStore();
    state.calls.length = 0;
    state.phraseCount = 0;
    state.storedPassphrase = 'old stored phrase';
    state.keychain.locked = false;
    state.keychain.keys = { ...OLD_KEYS };
    state.generateResetKeyBlob.mockImplementation(async () => {
      state.calls.push('blob');
      return { blob: BLOB, keypair: KEYPAIR };
    });
    state.resetKeysMutate.mockImplementation(async () => {
      state.calls.push('swap');
      return { success: true };
    });
    state.backupKeys.mockImplementation(async () => {
      state.calls.push('backup');
    });
    state.downloadPassPhrase.mockImplementation(async () => {
      state.calls.push('download');
    });
    mountComposable();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('confirming the reset only shows the overlay: no network, keychain untouched', () => {
    composable.resetKeys();

    expect(state.generateResetKeyBlob).not.toHaveBeenCalled();
    expect(state.resetKeysMutate).not.toHaveBeenCalled();
    expect(state.keychain.storePassPhrase).not.toHaveBeenCalled();
    expect(state.keychain.keys).toEqual(OLD_KEYS);
    expect(store.justReset).toBe(true);
    expect(store.pendingReset).toBe(true);
    expect(store.words).toEqual(['new', 'phrase', '1']);
    expect(state.routerPush).toHaveBeenCalledWith(
      '/send/profile?showDashboard=true'
    );
  });

  it('a remount during the pending reset keeps the new phrase, not the stored old one', () => {
    composable.resetKeys();
    // The dashboard re-runs the composable after the route change.
    mountComposable();

    expect(store.passphraseString).toBe('new phrase 1');
  });

  it('Download and Continue swaps on the server, adopts locally, then backs up', async () => {
    composable.resetKeys();
    await composable.makeBackup();

    expect(state.calls).toEqual([
      'blob',
      'swap',
      'adopt',
      'backup',
      'download',
    ]);
    expect(state.generateResetKeyBlob).toHaveBeenCalledWith('new phrase 1');
    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
    expect(state.resetKeysMutate).toHaveBeenCalledWith(BLOB);
    expect(state.keychain.keys).toEqual({});
    expect(state.storedPassphrase).toBe('new phrase 1');
    expect(state.sendMessageToBridge).toHaveBeenCalledWith('new phrase 1');
    expect(store.justReset).toBe(false);
    expect(store.pendingReset).toBe(false);
  });

  it('Regenerate before Download and Continue swaps in the regenerated phrase', async () => {
    composable.resetKeys();
    composable.regeneratePassphrase();
    await composable.makeBackup();

    expect(state.generateResetKeyBlob).toHaveBeenCalledWith('new phrase 2');
    expect(state.storedPassphrase).toBe('new phrase 2');
  });

  it('a rejected swap changes nothing locally and keeps the overlay up with an error', async () => {
    state.resetKeysMutate.mockRejectedValueOnce(new Error('422'));
    composable.resetKeys();
    await composable.makeBackup();

    expect(state.keychain.rsa.setPrivateKeyFromJwk).not.toHaveBeenCalled();
    expect(state.keychain.keys).toEqual(OLD_KEYS);
    expect(state.storedPassphrase).toBe('old stored phrase');
    expect(state.backupKeys).not.toHaveBeenCalled();
    expect(store.justReset).toBe(true);
    expect(store.pendingReset).toBe(true);
    expect(store.errorMessage).toContain('Could not reset');
  });

  it('a local save failure after the swap keeps the overlay and phrase up', async () => {
    state.keychain.storePassPhrase.mockRejectedValueOnce(
      new Error('QuotaExceededError')
    );
    composable.resetKeys();
    await composable.makeBackup();

    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
    expect(store.justReset).toBe(true);
    expect(store.pendingReset).toBe(false);
    expect(store.passphraseString).toBe('new phrase 1');
    expect(store.errorMessage).toContain('could not be saved on this device');

    // Retrying must not swap a second key in, nor back up under the old
    // stored phrase while the new one still can't be saved.
    state.keychain.storePassPhrase.mockRejectedValueOnce(
      new Error('QuotaExceededError')
    );
    await composable.makeBackup();
    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
    expect(state.backupKeys).not.toHaveBeenCalled();
    expect(store.justReset).toBe(true);
  });

  it('a backup failure after the swap keeps the overlay and phrase up', async () => {
    state.backupKeys.mockRejectedValueOnce(new Error('500'));
    composable.resetKeys();
    await composable.makeBackup();

    expect(store.justReset).toBe(true);
    expect(store.passphraseString).toBe('new phrase 1');
    expect(store.errorMessage).toContain('Could not finish saving');
  });

  it('a double click swaps the key only once', async () => {
    composable.resetKeys();
    await Promise.all([composable.makeBackup(), composable.makeBackup()]);

    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
  });

  it('leaving the overlay before Download and Continue abandons the reset', () => {
    composable.resetKeys();
    composable.abandonPendingReset();

    expect(store.justReset).toBe(false);
    expect(store.pendingReset).toBe(false);
    expect(state.resetKeysMutate).not.toHaveBeenCalled();
  });

  it('leaving while Download and Continue runs keeps the overlay state', async () => {
    composable.resetKeys();
    const saving = composable.makeBackup();
    composable.abandonPendingReset();
    state.backupKeys.mockRejectedValueOnce(new Error('500'));
    await saving;

    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
    expect(store.justReset).toBe(true);
  });
});
