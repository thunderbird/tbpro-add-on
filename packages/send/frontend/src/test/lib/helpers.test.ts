import { INIT_ERRORS } from '@send-frontend/apps/send/const';
import { dbUserSetup } from '@send-frontend/lib/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock init so we can control the error code it returns without exercising
// the full init() logic (which has its own test file).
vi.mock('@send-frontend/lib/init', () => ({
  default: vi.fn().mockResolvedValue(INIT_ERRORS.NONE),
}));

// Import after the mock so vi.mocked() resolves correctly.
import init from '@send-frontend/lib/init';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeUserStore({ publicKey = 'existing-jwk' as string | null } = {}) {
  return {
    populateFromBackend: vi.fn().mockResolvedValue(true),
    store: vi.fn().mockResolvedValue(undefined),
    getPublicKey: vi.fn().mockResolvedValue(publicKey),
    updatePublicKey: vi.fn().mockResolvedValue(true),
  };
}

function makeKeychain() {
  return {
    rsa: {
      generateKeyPair: vi.fn().mockResolvedValue({}),
      getPublicKeyJwk: vi.fn().mockResolvedValue('generated-jwk-string'),
    },
    store: vi.fn().mockResolvedValue(undefined),
  };
}

const stubFolderStore = {} as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dbUserSetup()', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(init).mockResolvedValue(INIT_ERRORS.NONE);
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // --- Early exit ---

  it('returns early without calling init when populateFromBackend fails', async () => {
    const userStore = makeUserStore();
    userStore.populateFromBackend.mockResolvedValue(false);
    const keychain = makeKeychain();

    await dbUserSetup(userStore as any, keychain as any, stubFolderStore);

    expect(vi.mocked(init)).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  // --- Existing user (public key already on backend) ---

  it('skips keypair generation for an existing user that already has a public key', async () => {
    const userStore = makeUserStore({ publicKey: 'already-stored-key' });
    const keychain = makeKeychain();

    await dbUserSetup(userStore as any, keychain as any, stubFolderStore);

    expect(keychain.rsa.generateKeyPair).not.toHaveBeenCalled();
    expect(keychain.store).not.toHaveBeenCalled();
  });

  // --- New user (no public key on backend yet) ---

  it('generates and stores an RSA keypair for a new user with no public key', async () => {
    const userStore = makeUserStore({ publicKey: null });
    const keychain = makeKeychain();

    await dbUserSetup(userStore as any, keychain as any, stubFolderStore);

    expect(keychain.rsa.generateKeyPair).toHaveBeenCalledOnce();
    expect(keychain.store).toHaveBeenCalledOnce();
    expect(userStore.updatePublicKey).toHaveBeenCalledWith(
      'generated-jwk-string'
    );
  });

  // --- init() return value handling (new behaviour) ---

  it('does not log an error when init() returns NONE', async () => {
    vi.mocked(init).mockResolvedValue(INIT_ERRORS.NONE);
    const userStore = makeUserStore();

    await dbUserSetup(userStore as any, makeKeychain() as any, stubFolderStore);

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('logs an error when init() returns NO_KEYCHAIN', async () => {
    vi.mocked(init).mockResolvedValue(INIT_ERRORS.NO_KEYCHAIN);
    const userStore = makeUserStore();

    await dbUserSetup(userStore as any, makeKeychain() as any, stubFolderStore);

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('NO_KEYCHAIN')
    );
  });

  it('logs an error when init() returns COULD_NOT_CREATE_DEFAULT_FOLDER', async () => {
    vi.mocked(init).mockResolvedValue(
      INIT_ERRORS.COULD_NOT_CREATE_DEFAULT_FOLDER
    );
    const userStore = makeUserStore();

    await dbUserSetup(userStore as any, makeKeychain() as any, stubFolderStore);

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('COULD_NOT_CREATE_DEFAULT_FOLDER')
    );
  });

  it('passes the correct arguments to init()', async () => {
    const userStore = makeUserStore();
    const keychain = makeKeychain();

    await dbUserSetup(userStore as any, keychain as any, stubFolderStore);

    expect(vi.mocked(init)).toHaveBeenCalledWith(
      userStore,
      keychain,
      stubFolderStore
    );
  });
});
