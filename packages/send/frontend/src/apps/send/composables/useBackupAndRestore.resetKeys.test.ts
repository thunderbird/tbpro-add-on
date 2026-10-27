import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import useBackupStore from '@send-frontend/stores/backup-store';

/**
 * The Reset Encryption Key modal swaps the key on the server only on "Download
 * key and reset" (#1355); opening it just prepares a new phrase. Uses the real
 * backup store so `words` / modal flags are what the components render.
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

const DASHBOARD = '/send/profile?showDashboard=true';

describe('useBackupAndRestore -> single-step reset modal (#1355)', () => {
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

  it('opening the modal only prepares a phrase: no network, no route, keychain untouched', () => {
    composable.beginReset();

    expect(state.generateResetKeyBlob).not.toHaveBeenCalled();
    expect(state.resetKeysMutate).not.toHaveBeenCalled();
    expect(state.keychain.storePassPhrase).not.toHaveBeenCalled();
    expect(state.keychain.keys).toEqual(OLD_KEYS);
    expect(state.routerPush).not.toHaveBeenCalled();
    expect(store.shouldReset).toBe(true);
    expect(store.pendingReset).toBe(true);
    expect(store.justReset).toBe(false);
    expect(store.words).toEqual(['new', 'phrase', '1']);
  });

  it('a remount during the pending reset keeps the new phrase, not the stored old one', () => {
    composable.beginReset();
    mountComposable();

    expect(store.passphraseString).toBe('new phrase 1');
  });

  it('Cancel closes the modal and keeps the old key', () => {
    composable.beginReset();
    composable.cancelReset();

    expect(store.shouldReset).toBe(false);
    expect(store.pendingReset).toBe(false);
    expect(store.justReset).toBe(false);
    expect(state.resetKeysMutate).not.toHaveBeenCalled();
    expect(state.keychain.keys).toEqual(OLD_KEYS);
    expect(state.routerPush).not.toHaveBeenCalled();
  });

  it('Download key and reset swaps, adopts, backs up, downloads, then routes', async () => {
    composable.beginReset();
    await composable.confirmReset();

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
    expect(store.shouldReset).toBe(false);
    expect(store.pendingReset).toBe(false);
    expect(store.justReset).toBe(false);
    expect(state.routerPush).toHaveBeenCalledWith(DASHBOARD);
  });

  it('Regenerate before confirming swaps in the regenerated phrase', async () => {
    composable.beginReset();
    composable.regeneratePassphrase();
    await composable.confirmReset();

    expect(state.generateResetKeyBlob).toHaveBeenCalledWith('new phrase 2');
    expect(state.storedPassphrase).toBe('new phrase 2');
  });

  it('Regenerate is locked while saving and once the reset key is installed', async () => {
    state.keychain.storePassPhrase.mockRejectedValueOnce(new Error('quota'));
    composable.beginReset();
    const saving = composable.confirmReset();
    expect(composable.savingBackup.value).toBe(true);
    expect(composable.canRegenerate.value).toBe(false);
    composable.regeneratePassphrase();
    await saving;

    // Swap done, local save failed: the installed phrase must stay on screen.
    expect(store.passphraseString).toBe('new phrase 1');
    expect(composable.canRegenerate.value).toBe(false);
    composable.regeneratePassphrase();
    expect(store.passphraseString).toBe('new phrase 1');
  });

  it('Cancel is ignored while the swap runs', async () => {
    composable.beginReset();
    const saving = composable.confirmReset();
    composable.cancelReset();
    expect(store.shouldReset).toBe(true);
    await saving;

    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
    expect(state.routerPush).toHaveBeenCalledWith(DASHBOARD);
  });

  it('a remounted view cannot start a second swap while one is running', async () => {
    composable.beginReset();
    const first = composable;
    const saving = first.confirmReset();
    mountComposable();
    await composable.confirmReset();
    await saving;

    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
  });

  it('a double click swaps the key only once', async () => {
    composable.beginReset();
    await Promise.all([composable.confirmReset(), composable.confirmReset()]);

    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
  });

  it('a rejected swap keeps the modal up with an error and the old key intact', async () => {
    state.resetKeysMutate.mockRejectedValueOnce(new Error('422'));
    composable.beginReset();
    await composable.confirmReset();

    expect(state.keychain.rsa.setPrivateKeyFromJwk).not.toHaveBeenCalled();
    expect(state.keychain.keys).toEqual(OLD_KEYS);
    expect(state.storedPassphrase).toBe('old stored phrase');
    expect(state.backupKeys).not.toHaveBeenCalled();
    expect(store.shouldReset).toBe(true);
    expect(store.pendingReset).toBe(true);
    expect(store.justReset).toBe(false);
    expect(store.errorMessage).toContain('Could not reset');
    expect(state.routerPush).not.toHaveBeenCalled();
    expect(composable.canRegenerate.value).toBe(true);
  });

  it('a local save failure after the swap hands over to the BackupKeys overlay', async () => {
    state.keychain.storePassPhrase.mockRejectedValueOnce(
      new Error('QuotaExceededError')
    );
    composable.beginReset();
    await composable.confirmReset();

    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
    expect(store.shouldReset).toBe(false);
    expect(store.pendingReset).toBe(false);
    expect(store.justReset).toBe(true);
    expect(store.passphraseString).toBe('new phrase 1');
    expect(store.errorMessage).toContain('could not be saved on this device');
    expect(state.routerPush).toHaveBeenCalledWith(DASHBOARD);

    // Retrying from the overlay must not swap a second key in, nor back up
    // under the old stored phrase while the new one still can't be saved.
    state.keychain.storePassPhrase.mockRejectedValueOnce(
      new Error('QuotaExceededError')
    );
    await composable.makeBackup();
    expect(state.resetKeysMutate).toHaveBeenCalledTimes(1);
    expect(state.backupKeys).not.toHaveBeenCalled();
    expect(store.justReset).toBe(true);
  });

  it('a backup failure after the swap hands over to the BackupKeys overlay', async () => {
    state.backupKeys.mockRejectedValueOnce(new Error('500'));
    composable.beginReset();
    await composable.confirmReset();

    expect(store.shouldReset).toBe(false);
    expect(store.justReset).toBe(true);
    expect(store.passphraseString).toBe('new phrase 1');
    expect(store.errorMessage).toContain('Could not finish saving');
    expect(state.routerPush).toHaveBeenCalledWith(DASHBOARD);
  });

  it('cannot start a new reset over a swapped-in key that is not saved yet', async () => {
    state.backupKeys.mockRejectedValueOnce(new Error('500'));
    composable.beginReset();
    await composable.confirmReset();
    composable.beginReset();

    expect(store.shouldReset).toBe(false);
    expect(store.pendingReset).toBe(false);
    expect(store.passphraseString).toBe('new phrase 1');
  });

  it('first-time Download and Continue backs up without a swap', async () => {
    store.setWords(['first', 'time']);
    const saved = await composable.makeBackup();

    expect(saved).toBe(true);
    expect(state.resetKeysMutate).not.toHaveBeenCalled();
    expect(state.calls).toEqual(['backup', 'download']);
    expect(state.storedPassphrase).toBe('first time');
    expect(state.routerPush).not.toHaveBeenCalled();
  });
});
