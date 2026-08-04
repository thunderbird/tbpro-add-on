import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

/**
 * Coverage for the *trigger* that navigates the user to /passphrase-changed
 * from the composable side.
 *
 * useBackupAndRestore has an onMounted hook that, when the keychain is locked,
 * immediately pushes the user to /passphrase-changed (and skips the normal
 * extension configuration + passphrase generation). This is one of the two
 * runtime paths that land a user on PassphraseChanged.vue (the other being the
 * router guard for `requiresBackedUpKeys` routes).
 *
 * We drive the composable through a tiny host component so onMounted fires,
 * and flip `keychain.locked` to cover both the locked (redirect) and unlocked
 * (no redirect) branches plus the edge cases around them.
 */

const { state } = vi.hoisted(() => ({
  state: {
    locked: false,
    routerPush: vi.fn(),
    configureExtension: vi.fn(),
    setWords: vi.fn(),
    words: [] as string[],
    getPassphraseValue: null as string | null,
    generatePassphraseCalls: 0,
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: state.routerPush }),
}));

vi.mock('@send-frontend/apps/send/stores/extension-store', () => ({
  useExtensionStore: () => ({
    sendMessageToBridge: vi.fn(),
    configureExtension: state.configureExtension,
  }),
}));

vi.mock('@send-frontend/stores/keychain-store', () => ({
  // Real Keychain.locked is a plain assignable boolean field (keychain.ts:363,
  // set at :369/:797), so mirror that here rather than a getter — a getter-only
  // mock would throw if source ever did `keychain.locked = true`.
  default: () => ({
    keychain: {
      locked: state.locked,
      getPassphraseValue: () => state.getPassphraseValue,
    },
  }),
}));

vi.mock('@send-frontend/stores/backup-store', () => ({
  default: () => ({
    setWords: state.setWords,
    setBackupCompleted: vi.fn(),
    setErrorMessage: vi.fn(),
    // storeToRefs targets are read from this object.
    words: ref(state.words),
    errorMessage: ref(''),
    shouldUnlock: ref(false),
    shouldReset: ref(false),
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

vi.mock('@send-frontend/lib/auth', () => ({
  useAuth: () => ({ logOutAuth: vi.fn() }),
}));

vi.mock('@send-frontend/lib/passphrase', () => ({
  generatePassphrase: () => {
    state.generatePassphraseCalls += 1;
    return ['a', 'b', 'c'];
  },
}));

// The composable also imports these; stub to no-ops so import resolves.
vi.mock('@send-frontend/lib/helpers', () => ({ dbUserSetup: vi.fn() }));
vi.mock('@send-frontend/lib/keychain', () => ({
  backupKeys: vi.fn(),
  restoreKeys: vi.fn(),
}));
vi.mock('@send-frontend/lib/passphraseUtils', () => ({
  downloadPassPhrase: vi.fn(),
  parsePassphrase: (s: string) => s,
}));
vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: {
    resetKeys: { mutate: vi.fn() },
    deleteFiles: { mutate: vi.fn() },
  },
}));
vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({ isLoading: ref(false), data: ref(undefined), refetch: vi.fn() }),
  useMutation: () => ({
    mutate: vi.fn(),
    isSuccess: ref(false),
    isError: ref(false),
    reset: vi.fn(),
  }),
}));

import { useBackupAndRestore } from './useBackupAndRestore';

// Minimal host so onMounted actually runs.
const Host = defineComponent({
  setup() {
    useBackupAndRestore();
    return () => h('div');
  },
});

const mountHost = () => mount(Host);

describe('useBackupAndRestore -> /passphrase-changed trigger', () => {
  beforeEach(() => {
    state.locked = false;
    state.words = [];
    state.getPassphraseValue = null;
    state.generatePassphraseCalls = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /passphrase-changed when the keychain is locked on mount', () => {
    state.locked = true;

    mountHost();

    expect(state.routerPush).toHaveBeenCalledWith('/passphrase-changed');
  });

  it('does NOT configure the extension or generate a passphrase when locked', () => {
    state.locked = true;

    mountHost();

    // The early return must short-circuit the rest of onMounted.
    expect(state.configureExtension).not.toHaveBeenCalled();
    expect(state.generatePassphraseCalls).toBe(0);
  });

  it('does not redirect and proceeds with normal init when the keychain is unlocked', () => {
    state.locked = false;

    mountHost();

    expect(state.routerPush).not.toHaveBeenCalled();
    expect(state.configureExtension).toHaveBeenCalledTimes(1);
  });

  it('generates a fresh passphrase on unlocked mount only when none exist yet', () => {
    state.locked = false;
    state.words = []; // no words yet

    mountHost();

    expect(state.setWords).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(state.generatePassphraseCalls).toBe(1);
  });

  it('does NOT regenerate a passphrase on unlocked mount when words already exist', () => {
    state.locked = false;
    state.words = ['existing']; // a passphrase is already present

    mountHost();

    // onMounted must not overwrite an existing passphrase.
    // NOTE: the stored-passphrase sync side effect (useBackupAndRestore.ts:150)
    // is intentionally out of scope here — getPassphraseValue is null, so that
    // branch is skipped and setWords stays untouched.
    expect(state.setWords).not.toHaveBeenCalled();
    expect(state.generatePassphraseCalls).toBe(0);
  });

  it('redirect wins even if a passphrase would otherwise be missing (locked short-circuits)', () => {
    // Edge case: locked keychain with no words must still just redirect,
    // never fall through to passphrase generation.
    state.locked = true;
    state.words = [];

    mountHost();

    expect(state.routerPush).toHaveBeenCalledWith('/passphrase-changed');
    expect(state.setWords).not.toHaveBeenCalled();
  });
});
