import { ApiConnection } from '@send-frontend/lib/api';
import { MAX_ACCESS_LINK_RETRIES } from '@send-frontend/lib/const';
import {
  Keychain,
  restoreKeysUsingLocalStorage,
} from '@send-frontend/lib/keychain';
import { trpc } from '@send-frontend/lib/trpc';
// Import the module itself for spying
// Keep direct imports for convenience and direct testing
import {
  validateToken as actualValidateToken,
  getCanRetry,
  validateBackedUpKeys,
  validateEmail,
  validateLocalStorageSession,
  validatePassword,
} from '@send-frontend/lib/validations';
import type { UserStoreType as UserStore } from '@send-frontend/stores/user-store';
import { Backup, UserTier, UserType } from '@send-frontend/types'; // Import Backup and User types
import { MockedFunction, beforeEach, describe, expect, it, vi } from 'vitest'; // Import SpyInstance

// --- Mock Setup ---

vi.mock('@send-frontend/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: {
    getPasswordRetryCount: {
      query: vi.fn(),
    },
  },
}));

vi.mock('@send-frontend/lib/keychain', () => ({
  restoreKeysUsingLocalStorage: vi.fn(),
}));

// Helper to create a valid mock Backup object (adjust fields based on actual type)
const createMockBackup = (data: Partial<Backup> = {}): Backup => ({
  backupContainerKeys: 'encrypted-container-keys',
  backupKeypair: 'encrypted-keypair',
  backupKeystring: 'encrypted-keystring',
  backupSalt: 'backup-salt',
  // Add other required fields from the actual Backup type if necessary
  ...data,
});

// Helper to create a mock User object
const createMockUser = (id: string | undefined): UserType | null => {
  if (id === undefined) return null; // Or handle undefined ID case as needed
  return {
    id: id,
    email: 'test@example.com',
    tier: UserTier.FREE,
    // Add other required fields from the actual User type if necessary
  };
};

// --- Test Suites ---

describe('validateToken (direct test)', () => {
  // Use vi.Mocked for typed mocks
  const mockApi: { call: MockedFunction<ApiConnection['call']> } = {
    call: vi.fn(),
  };

  beforeEach(() => {
    mockApi.call.mockClear();
  });

  it('should return true if the token is valid', async () => {
    // Mock the specific call made by actualValidateToken
    mockApi.call.mockResolvedValueOnce(true); // Mock the response for 'auth/me'
    const result = await actualValidateToken(
      mockApi as unknown as ApiConnection
    );
    expect(mockApi.call).toHaveBeenCalledWith(
      'auth/me', // Endpoint called by actualValidateToken
      {},
      'GET',
      {},
      { fullResponse: true }
    );
    expect(result).toBe(true);
  });

  it('should return false if the token is invalid', async () => {
    mockApi.call.mockResolvedValueOnce(null); // Mock the response for 'auth/me'
    const result = await actualValidateToken(
      mockApi as unknown as ApiConnection
    );
    expect(mockApi.call).toHaveBeenCalledWith(
      'auth/me',
      {},
      'GET',
      {},
      { fullResponse: true }
    );
    expect(result).toBe(false);
  });

  it('should return false if an error occurs', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockApi.call.mockRejectedValueOnce(new Error('Network error')); // Mock the response for 'auth/me'
    const result = await actualValidateToken(
      mockApi as unknown as ApiConnection
    );
    expect(mockApi.call).toHaveBeenCalledWith(
      'auth/me',
      {},
      'GET',
      {},
      { fullResponse: true }
    );
    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error validating session',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});

describe('validateBackedUpKeys', () => {
  const mockKeychain: {
    getPassphraseValue: MockedFunction<Keychain['getPassphraseValue']>;
  } = {
    getPassphraseValue: vi.fn(),
  };
  const mockGetBackup = vi.fn();

  beforeEach(() => {
    mockKeychain.getPassphraseValue.mockClear();
    mockGetBackup.mockClear();
  });

  it('should return true when both backup and passphrase exist', async () => {
    mockGetBackup.mockResolvedValueOnce(createMockBackup());
    mockKeychain.getPassphraseValue.mockReturnValueOnce('passphrase');
    const result = await validateBackedUpKeys(
      mockGetBackup,
      mockKeychain as unknown as Keychain
    );
    expect(result).toBe(true);
  });

  it('should return false when backup does not exist', async () => {
    mockGetBackup.mockResolvedValueOnce(null);
    mockKeychain.getPassphraseValue.mockReturnValueOnce('passphrase');
    const result = await validateBackedUpKeys(
      mockGetBackup,
      mockKeychain as unknown as Keychain
    );
    expect(result).toBe(false);
  });

  it('should return false when passphrase does not exist', async () => {
    mockGetBackup.mockResolvedValueOnce(createMockBackup());
    mockKeychain.getPassphraseValue.mockReturnValueOnce('');
    const result = await validateBackedUpKeys(
      mockGetBackup,
      mockKeychain as unknown as Keychain
    );
    expect(result).toBe(false);
  });
});

describe('validateLocalStorageSession', () => {
  it('should return true when user ID exists', () => {
    const userStore = { user: createMockUser('123') } as UserStore;
    const result = validateLocalStorageSession(userStore);
    expect(result).toBe(true);
  });

  it('should return false when user ID is undefined', () => {
    const userStore = {
      user: { id: undefined, email: '', tier: UserTier.FREE },
    } as UserStore;
    const result = validateLocalStorageSession(userStore);
    expect(result).toBe(false);
  });
});

describe('getCanRetry', () => {
  const mockQuery = vi.fn();
  beforeEach(() => {
    // Need to mock the specific query function from the mocked trpc object
    vi.mocked(trpc.getPasswordRetryCount.query).mockClear();
    vi.mocked(trpc.getPasswordRetryCount.query).mockImplementation(mockQuery);
  });

  it('should return true when retry count is less than maximum', async () => {
    mockQuery.mockResolvedValueOnce({
      retryCount: MAX_ACCESS_LINK_RETRIES - 1,
    });
    const result = await getCanRetry('link123');
    expect(mockQuery).toHaveBeenCalledWith({ linkId: 'link123' });
    expect(result).toBe(true);
  });

  it('should return false when retry count reaches maximum', async () => {
    mockQuery.mockResolvedValueOnce({ retryCount: MAX_ACCESS_LINK_RETRIES });
    const result = await getCanRetry('link123');
    expect(mockQuery).toHaveBeenCalledWith({ linkId: 'link123' });
    expect(result).toBe(false);
  });
});

describe('validatePassword', () => {
  // Tests remain the same
  it('should return true for valid passwords', () => {
    expect(validatePassword('SecurePassword123!')).toBe(true);
  });
  it('should return false when password is too short', () => {
    expect(validatePassword('Short12!')).toBe(false);
  });
  it('should return false when password has no special characters', () => {
    expect(validatePassword('SecurePassword123')).toBe(false);
  });
  it('should return false when password has no numbers', () => {
    expect(validatePassword('SecurePassword!')).toBe(false);
  });
});

describe('validateEmail', () => {
  // Tests remain the same
  it('should return true for valid email addresses', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('hello.world@domain.co.uk')).toBe(true);
  });
  it('should return false for invalid email addresses', () => {
    expect(validateEmail('test@')).toBe(false);
    expect(validateEmail('test@domain')).toBe(false);
    expect(validateEmail('test.domain.com')).toBe(false);
    expect(validateEmail('test@domain.')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
    expect(validateEmail('test@.com')).toBe(false);
    expect(validateEmail('test@ domain.com')).toBe(false);
  });
});

describe('validator', () => {
  let mockApi: { call: MockedFunction<ApiConnection['call']> };
  let mockUserStore: Partial<UserStore>;
  let mockKeychain: Partial<Keychain>;

  beforeEach(() => {
    mockApi = { call: vi.fn() };
    mockUserStore = {
      user: { id: '123', email: 'test@example.com', tier: UserTier.FREE },
      getBackup: vi.fn().mockResolvedValue('backup'),
      clearUserFromStorage: vi.fn().mockResolvedValue(undefined),
    };
    mockKeychain = {
      getPassphraseValue: vi.fn().mockReturnValue('passphrase'),
    };

    // Mock restoreKeysUsingLocalStorage to succeed by default
    vi.mocked(restoreKeysUsingLocalStorage).mockResolvedValue();
  });

  it('returns all true when everything is valid', async () => {
    mockApi.call = vi
      .fn()
      .mockResolvedValueOnce({ user: { id: '123' } }) // users/me
      .mockResolvedValueOnce(true); // auth/me
    const result = await (
      await import('@send-frontend/lib/validations')
    ).validator({
      api: mockApi as unknown as ApiConnection,
      userStore: mockUserStore as UserStore,
      keychain: mockKeychain as unknown as Keychain,
    });
    expect(result).toEqual({
      hasBackedUpKeys: true,
      hasLocalStorageSession: true,
      isTokenValid: true,
      hasCorrectKeys: true,
      hasForcedLogin: false,
    });
  });

  it('returns early if no local session', async () => {
    mockUserStore.user = { id: undefined, email: '', tier: UserTier.FREE };
    const result = await (
      await import('@send-frontend/lib/validations')
    ).validator({
      api: mockApi as unknown as ApiConnection,
      userStore: mockUserStore as UserStore,
      keychain: mockKeychain as unknown as Keychain,
    });
    expect(result).toMatchObject({
      hasLocalStorageSession: false,
      hasBackedUpKeys: true,
      isTokenValid: false,
      hasCorrectKeys: true,
      hasForcedLogin: false,
    });
  });

  it('handles user ID mismatch and triggers forced login', async () => {
    mockApi.call = vi
      .fn()
      .mockResolvedValueOnce({ user: { id: 'backend-id' } });
    mockUserStore.user = { id: 'store-id', email: '', tier: UserTier.FREE };
    const reloadSpy = vi
      .spyOn(globalThis.location, 'reload')
      .mockImplementation(() => {});
    const result = await (
      await import('@send-frontend/lib/validations')
    ).validator({
      api: mockApi as unknown as ApiConnection,
      userStore: mockUserStore as UserStore,
      keychain: mockKeychain as unknown as Keychain,
    });
    expect(result.hasForcedLogin).toBe(true);
    reloadSpy.mockRestore();
  });

  it('handles incorrect keys and triggers forced login', async () => {
    mockApi.call = vi.fn().mockResolvedValueOnce({ user: { id: '123' } }); // users/me matches

    // Mock restoreKeysUsingLocalStorage to fail
    vi.mocked(restoreKeysUsingLocalStorage).mockRejectedValueOnce(
      new Error('Invalid passphrase')
    );

    const reloadSpy = vi
      .spyOn(globalThis.location, 'reload')
      .mockImplementation(() => {});

    const result = await (
      await import('@send-frontend/lib/validations')
    ).validator({
      api: mockApi as unknown as ApiConnection,
      userStore: mockUserStore as UserStore,
      keychain: mockKeychain as unknown as Keychain,
    });

    expect(result).toEqual({
      hasBackedUpKeys: true, // This gets validated in the else block
      hasLocalStorageSession: true, // User is still in storage
      isTokenValid: false, // No auth validation done when keys are invalid
      hasCorrectKeys: false,
      hasForcedLogin: true,
    });

    reloadSpy.mockRestore();
  });

  // This tests the case where the user ID is not found in the backend.
  // This should not trigger a forced login and it should continue with the validations.
  it('handles error fetching user ID. Finishes validation', async () => {
    mockApi.call = vi.fn().mockRejectedValueOnce(new Error('fail'));
    await expect(
      (await import('@send-frontend/lib/validations')).validator({
        api: mockApi as unknown as ApiConnection,
        userStore: mockUserStore as UserStore,
        keychain: mockKeychain as unknown as Keychain,
      })
    ).resolves.toStrictEqual({
      hasBackedUpKeys: true,
      hasLocalStorageSession: true,
      isTokenValid: false,
      hasCorrectKeys: true,
      hasForcedLogin: false,
    });
  });
});
