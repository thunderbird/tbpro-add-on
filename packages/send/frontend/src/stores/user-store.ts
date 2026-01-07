import { Storage } from '@send-frontend/lib/storage';
import useApiStore from '@send-frontend/stores/api-store';
import { Backup } from '@send-frontend/stores/user-store.types';
import { UserTier, UserType } from '@send-frontend/types';
import { defineStore } from 'pinia';

export const EMPTY_USER: UserType = {
  id: undefined,
  tier: UserTier.FREE,
  email: '',
  thundermailEmail: '',
};

const useUserStore = defineStore('user', () => {
  const { api } = useApiStore();
  const storage = new Storage();

  const user = { ...EMPTY_USER };

  function populateUser(userData: UserType) {
    user.id = userData.id;
    user.tier = userData.tier;
    user.email = userData.email;
    user.thundermailEmail = userData.thundermailEmail;

    if (userData.uniqueHash) {
      user.uniqueHash = userData.uniqueHash;
    }
    if (userData.thundermailEmail) {
      user.thundermailEmail = userData.thundermailEmail;
    }
  }

  async function createUser(
    email: string,
    jwkPublicKey: string,
    isEphemeral = false
  ): Promise<UserType> {
    const resp = await api.call<{ user: UserType | null }>(
      `users`,
      {
        email,
        publicKey: jwkPublicKey,
        tier: isEphemeral ? UserTier.EPHEMERAL : UserTier.PRO,
      },
      'POST'
    );
    if (!resp) {
      return null;
    }

    return {
      id: resp.user.id,
      tier: resp.user.tier,
      email,
      thundermailEmail: resp.user.thundermailEmail,
      uniqueHash: resp.user.uniqueHash,
    };
  }

  // TODO: delete this in favor of using the user store's populate()
  // which retrieves the user from the backend session.
  async function login(loginEmail = user.email): Promise<UserType> {
    console.log(`logging in as ${loginEmail}`);
    const resp = await api.call<UserType | null>(
      `users/login`,
      { email: loginEmail },
      'POST'
    );
    if (!resp) {
      return null;
    }

    populateUser(resp);

    return resp;
  }

  async function loadFromLocalStorage(): Promise<boolean> {
    try {
      const userFromStorage = await storage.getUserFromLocalStorage();
      if (!userFromStorage) {
        return false;
      }
      const { id, tier, email, thundermailEmail } = userFromStorage;

      populateUser({ id, email, tier, thundermailEmail });

      return true;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return false;
    }
  }

  async function store(
    newId?: string,
    newTier?: UserTier,
    newEmail?: string,
    newThundermailEmail?: string
  ): Promise<void> {
    let { id, tier, email, thundermailEmail } = user;
    id = newId ?? id;
    tier = newTier ?? tier;
    email = newEmail ?? email;
    thundermailEmail = newThundermailEmail ?? thundermailEmail;
    // TODO: this is confusing.
    // we could be storing new values, but we're not setting them
    // on the current/active object.
    // Confirm whether we need to update the current/active object.
    if (!id) {
      return;
    }
    await storage.storeUser({ id, tier, email, thundermailEmail });
  }

  // After login, get user from backend and save it locally.
  // Returns a boolean signaling whether successfully populated the user.
  async function populateFromBackend() {
    // Stop the execution if the user is already populated
    if (user.id) {
      return true;
    }

    const userResp = await api.call<{ user: UserType }>(`users/me`);
    if (!userResp?.user) {
      // Either we didn't get a response or it doesn't have a .user
      return false;
    }

    populateUser(userResp.user);

    return true;
  }

  async function getPublicKey(): Promise<string> {
    // Explicitly passing user id; this route is for retrieving
    // any user's public key, not just the currently logged in user
    const resp = await api.call<{ publicKey: string }>(
      `users/publickey/${user.id}`
    );
    return resp.publicKey;
  }

  async function updatePublicKey(jwkPublicKey): Promise<string> {
    const resp = await api.call<{ update: { publicKey: string } }>(
      `users/publickey`,
      {
        publicKey: jwkPublicKey,
      },
      'POST'
    );
    return resp.update?.publicKey;
  }

  // TODO: shift the userId from frontend argument to backend session
  async function createBackup(userId, keys, keypair, keystring, salt) {
    return await api.call(
      `users/${userId}/backup`,
      {
        keys,
        keypair,
        keystring,
        salt,
      },
      'POST'
    );
  }

  // TODO: shift the userId from frontend argument to backend session
  async function getBackup() {
    return await api.call<Backup>(`users/backup`);
  }

  async function setUserToDefault() {
    Object.entries(EMPTY_USER).forEach(([key, value]) => {
      user[key] = value;
    });
  }

  // This function clears local storage and resets the user state to default.
  // Note: API token removal is not handled here. It is delegated to logOutAuth in the auth composable.
  async function clearUserFromStorage() {
    storage.clear();
    setUserToDefault();
  }

  return {
    user,
    createUser,
    login,
    store,
    loadFromLocalStorage,
    populateFromBackend,
    getPublicKey,
    updatePublicKey,
    createBackup,
    getBackup,
    clearUserFromStorage,
  };
});

// Create a type derived from the store
export type UserStoreType = ReturnType<typeof useUserStore>;

export default useUserStore;
