import {
  FolderResponse,
  Item,
} from '@send-frontend/apps/send/stores/folder-store.types';
import { getContainerKeyFromChallenge } from '@send-frontend/lib/challenge';
import { Keychain, Util } from '@send-frontend/lib/keychain';
import Sharer from '@send-frontend/lib/share';
import { trpc } from '@send-frontend/lib/trpc';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';
import { UserType } from '@send-frontend/types';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

type AccessLinks = {
  id: string;
  expiryDate: Date | null;
  passwordHash: string;
  locked: boolean;
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

    // If the password is incorrect, increment the password retry count.
    if (!containerKey?.unwrappedKey) {
      await trpc.incrementPasswordRetryCount.mutate({
        linkId,
      });

      return false;
    }

    // Check for existence of link.
    const { unwrappedKey, containerId } = containerKey;

    if (user.id) {
      // // Use the AccessLink to make the User a member of the shared folder.
      // const acceptAccessLinkResp = await api.call(
      //   `sharing/${linkId}/member/accept`,
      //   {},
      //   'POST'
      // );
      // if (!acceptAccessLinkResp) {
      //   return false;
      // }
    } else {
      // TODO: consider switching to sessionStorage.
      // Generate a temporary keypair for encrypting containerKey in keychain.
      await keychain.rsa.generateKeyPair();
    }
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
    password: string
  ): Promise<string | null> {
    let shouldAddPasswordAsHash = false;

    if (password.length === 0) {
      password = Util.generateRandomPassword();
      shouldAddPasswordAsHash = true;
    }

    let url = await sharer.shareItemsWithPassword(itemsArray, password);

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

  async function getInvitations(userId: number) {
    // TODO: shift the userId from frontend argument to backend session
    return await api.call(`users/${userId}/invitations/`);
  }

  async function getFoldersSharedWithUser(userId: string) {
    // TODO: shift the userId from frontend argument to backend session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await api.call<{ [key: string]: any }[]>(
      `users/${userId}/folders/sharedWithUser`
    );
  }

  async function getFoldersSharedByUser(userId: string) {
    // TODO: shift the userId from frontend argument to backend session
    return await api.call(`users/${userId}/folders/sharedByUser`);
  }

  async function getSharesForFolder(containerId: number, userId: number) {
    // TODO: shift the userId from frontend argument to backend session
    return await api.call(`containers/${containerId}/shares`, {
      userId,
    });
  }

  async function acceptInvitation(invitationId: number, containerId: number) {
    return await api.call(
      `containers/${containerId}/member/accept/${invitationId}`,
      {},
      'POST'
    );
  }

  async function updateInvitationPermissions(
    containerId: number,
    userId: number,
    invitationId: number,
    permission: number
  ) {
    return await api.call(
      `containers/${containerId}/shares/invitation/update`,
      { userId, invitationId, permission },
      'POST'
    );
  }

  async function updateAccessLinkPermissions(
    containerId: number,
    userId: number,
    accessLinkId: string,
    permission: number
  ) {
    return await api.call(
      `containers/${containerId}/shares/accessLink/update`,
      { userId, accessLinkId, permission },
      'POST'
    );
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
    getInvitations,
    getFoldersSharedWithUser,
    getFoldersSharedByUser,
    getSharesForFolder,
    acceptInvitation,
    updateInvitationPermissions,
    updateAccessLinkPermissions,
  };
});

export default useSharingStore;
