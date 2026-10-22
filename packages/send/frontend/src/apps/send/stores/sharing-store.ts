import {
  FolderResponse,
  Item,
} from '@send-frontend/apps/send/stores/folder-store.types';
import { getContainerKeyFromChallenge } from '@send-frontend/lib/challenge';
import { Keychain, Util } from '@send-frontend/lib/keychain';
import Sharer from '@send-frontend/lib/share';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';
import { UserType } from '@send-frontend/types';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

// Metadata only: the server never returns anything that could rebuild a
// shareable URL. The full URL is shown to the owner once, at creation time.
type AccessLinks = {
  id: string;
  expiryDate: Date | null;
  locked: boolean;
  hasPassword: boolean;
}[];

const useSharingStore = defineStore('sharingManager', () => {
  const { api } = useApiStore();
  const { user } = useUserStore();
  const { keychain } = useKeychainStore();

  const sharer = new Sharer(user as UserType, keychain as Keychain, api);

  const _links = ref<AccessLinks>([]);

  const links = computed(() => {
    return [..._links.value];
  });

  async function createAccessLink(
    folderId: string,
    password: string,
    expiration: string
  ): Promise<string | null> {
    let shouldAddPasswordAsHash = false;

    if (password.length === 0) {
      password = Util.generateRandomPassword();
      shouldAddPasswordAsHash = true;
    }

    let url = await sharer.requestAccessLink(folderId, password, expiration);

    if (!url) {
      return null;
    }

    if (shouldAddPasswordAsHash) {
      url = `${url}#${password}`;
    }

    return url;
  }

  async function acceptAccessLink(
    linkId: string,
    password: string
  ): Promise<boolean> {
    const containerKey = await getContainerKeyFromChallenge(
      linkId,
      password,
      api,
      keychain as Keychain
    );

    // Wrong password: the challenge endpoint has already counted the attempt.
    if (!containerKey?.unwrappedKey) {
      return false;
    }

    const { unwrappedKey, containerId } = containerKey;
    // keychain.add() needs an RSA keypair to wrap the container key.
    await keychain.rsa.generateKeyPair();

    await keychain.add(containerId, unwrappedKey);
    await keychain.store();
    return true;
  }

  async function isAccessLinkValid(linkId: string): Promise<{ id: string }> {
    return await api.call<{ id: string }>(`sharing/exists/${linkId}`);
  }

  async function fetchFolderAccessLinks(folderId: string): Promise<void> {
    _links.value = await api.call(`containers/${folderId}/links`);
  }

  async function fetchFileAccessLinks(uploadId: string): Promise<void> {
    _links.value = await api.call(`sharing/${uploadId}/links?type=file`);
  }

  async function shareItems(
    itemsArray: Item[],
    password: string,
    expiration?: string
  ): Promise<string | null> {
    let shouldAddPasswordAsHash = false;

    if (password.length === 0) {
      password = Util.generateRandomPassword();
      shouldAddPasswordAsHash = true;
    }

    let url = await sharer.shareItemsWithPassword(
      itemsArray,
      password,
      expiration
    );

    if (!url) {
      return null;
    }

    if (shouldAddPasswordAsHash) {
      url = `${url}#${password}`;
    }

    return url;
  }

  async function getSharedFolder(hash: string) {
    return await api.call<FolderResponse>(`sharing/${hash}/`);
  }

  return {
    // Getters ==================================
    links,

    // Actions ==================================
    createAccessLink,
    isAccessLinkValid,
    acceptAccessLink,
    fetchFolderAccessLinks,
    fetchFileAccessLinks,
    shareItems,
    getSharedFolder,
  };
});

export default useSharingStore;
