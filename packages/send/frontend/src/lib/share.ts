import {
  FolderResponse,
  Item,
} from '@send-frontend/apps/send/stores/folder-store.types';
import { ApiConnection } from '@send-frontend/lib/api';
import { CONTAINER_TYPE } from '@send-frontend/lib/const';
import { Keychain, Util } from '@send-frontend/lib/keychain';
import { UserType } from '@send-frontend/types';

export default class Sharer {
  user: UserType;
  keychain: Keychain;
  api: ApiConnection;
  constructor(user: UserType, keychain: Keychain, api: ApiConnection) {
    this.user = user;
    this.keychain = keychain;
    this.api = api;
  }

  async handleMultipartItems(item: Item): Promise<Item[]> {
    const _uploads = await this.api.call<{ id: string; part: number }[]>(
      `uploads/parts`,
      {
        wrappedKey: item.wrappedKey,
      },
      'POST'
    );
    const ids = _uploads.map((u) => u.id);
    console.log(`ids:`, ids);
    const _items = await this.api.call<Item[]>(
      `uploads/items`,
      {
        ids,
        wrappedKey: item.wrappedKey,
      },
      'POST'
    );
    console.log(`_items:`, _items);
    return _items;
  }

  // Creates AccessLink
  async shareItemsWithPassword(
    items: Item[],
    password: string,
    expiration?: string
  ) {
    const __items: Item[] = [];
    // Loop through the items
    // Multipart items should be handled by `handleMultipartItems`
    for (const item of items) {
      if (item.multipart) {
        const _items = await this.handleMultipartItems(item);
        __items.push(..._items);
      } else {
        __items.push(item);
      }
    }

    const containerId = await this.createShareOnlyContainer(__items, null);
    return await this.requestAccessLink(containerId, password, expiration);
  }

  // Creates Invitation
  async shareContainerWithInvitation(containerId: string, email: string) {
    const user = await this.api.call(`users/lookup/${email}/`);

    if (user) {
      let publicKey = user.publicKey;
      const recipientId = user.id;
      if (!publicKey) {
        console.log(`Could not find public key for user ${email}`);
      }

      console.warn('SOMETHING WEIRD IS HAPPENING WITH PUBLIC KEYS ON SERVER');

      // TODO: make sure we're not double-escaping before storing on server
      while (typeof publicKey !== 'object') {
        publicKey = JSON.parse(publicKey);
      }

      const importedPublicKey = await crypto.subtle.importKey(
        'jwk',
        publicKey,
        {
          name: 'RSA-OAEP',
          hash: { name: 'SHA-256' },
        },
        true,
        ['wrapKey']
      );

      const key = await this.keychain.get(containerId);
      const wrappedKey = await this.keychain.rsa.wrapContainerKey(
        key,
        importedPublicKey
      );

      if (!wrappedKey) {
        console.log(`no wrapped key for the invitation`);
        return null;
      }

      const resp = await this.api.call(
        `containers/${containerId}/member/invite`,
        {
          wrappedKey,
          recipientId,
          senderId: this.user.id,
        },
        'POST'
      );
      console.log(`Invitation creation response:`);
      console.log(resp);
      return resp;
    }
  }

  async createShareOnlyContainer(
    items = [],
    containerId = null
  ): Promise<string | null> {
    if (items.length === 0 && !containerId) {
      return null;
    }

    // Arbitrarily picked keychain.value.store to
    // confirm presence of keychain
    if (!this.api?.call || !this.keychain?.store) {
      return null;
    }

    const itemsToShare = [...items];

    let currentContainer = { name: 'default' };
    if (containerId) {
      currentContainer = await this.api.call(`containers/${containerId}/info`);
      // TODO: future enhancement
      // If there are no itemsToShare, get the items from the `currentContainer`
      // if (itemsToShare.length > 0) {
      // const { items } = await api.getContainerWithItems(containerId);
      // itemsToShare = items;
      // }
    }

    // A share-only Folder shouldn't have a parentId
    const parentId = 0;
    const shareOnly = true;

    const response = await this.api.call<{ container: FolderResponse }>(
      `containers`,
      {
        name: currentContainer.name,
        type: CONTAINER_TYPE.FOLDER,
        parentId,
        shareOnly,
      },
      'POST'
    );
    if (!response.container?.id) {
      return null;
    }
    const { id: newContainerId } = response.container;

    await this.keychain.newKeyForContainer(newContainerId);
    await this.keychain.store();

    await Promise.all(
      itemsToShare.map(async (item) => {
        // TODO: locate source of "folderId" property
        // rename to more generic "containerId"
        const containerId = item.containerId ?? item.folderId;
        // TODO: locate source of "filename" property
        // rename to more generic "name"
        const filename = item.name ?? item.filename;
        const currentWrappingKey = await this.keychain.get(containerId);
        const { uploadId, wrappedKey, type } = item;
        const contentKey = await this.keychain.container.unwrapContentKey(
          wrappedKey,
          currentWrappingKey
        );

        // wrap the content key with the new container key
        const newWrappingKey = await this.keychain.get(newContainerId);

        const wrappedKeyStr = await this.keychain.container.wrapContentKey(
          contentKey,
          newWrappingKey
        );

        // create the new item with the existing uploadId
        // in the newContainer

        const itemResp = await this.api.call(
          `containers/${newContainerId}/item`,
          {
            uploadId,
            name: filename,
            type,
            wrappedKey: wrappedKeyStr,
            multipart: item.multipart ?? false,
            totalSize: item.totalSize ?? undefined,
          },
          'POST'
        );

        return itemResp;
      })
    );

    return newContainerId;
  }

  async requestAccessLink(
    containerId: string,
    password?: string,
    expiration?: string
  ): Promise<string | null> {
    // check if the container doesn't have reported items first
    const canCreateLink = await this.api.call<{ canCreateLink: boolean }>(
      `sharing/${containerId}/canCreateAccessLink`
    );

    if (!canCreateLink?.canCreateLink) {
      throw new Error(
        'Cannot create access link for this container because it contains files that have been reported for abuse.'
      );
    }

    // get the key (which unwraps it),
    const unwrappedKey = await this.keychain.get(containerId);

    // and password protect it
    const salt = Util.generateSalt();
    const passwordWrappedKeyStr = await this.keychain.password.wrapContainerKey(
      unwrappedKey,
      password,
      //@ts-ignore
      salt
    );

    const challengeKey = await this.keychain.challenge.generateKey();
    const challengeSalt = Util.generateSalt();

    const passwordWrappedChallengeKeyStr =
      await this.keychain.password.wrapContentKey(
        challengeKey,
        password,
        //@ts-ignore
        challengeSalt
      );

    const challengePlaintext = this.keychain.challenge.createChallenge();

    const challengeCiphertext = await this.keychain.challenge.encryptChallenge(
      challengePlaintext,
      challengeKey,
      //@ts-ignore
      challengeSalt
    );

    // convert salts to base64 strings
    const saltStr = Util.arrayBufferToBase64(salt);
    const challengeSaltStr = Util.arrayBufferToBase64(challengeSalt);

    const resp = await this.api.call<{ id: string; expiryDate: string | null }>(
      `sharing`,
      {
        containerId,
        wrappedKey: passwordWrappedKeyStr,
        salt: saltStr,
        challengeKey: passwordWrappedChallengeKeyStr,
        challengeSalt: challengeSaltStr,
        senderId: this.user.id,
        challengePlaintext,
        challengeCiphertext,
        expiration,
      },
      'POST'
    );

    if (!resp?.id) {
      return null;
    }

    const accessLink = resp.id;
    // const url = `${origin}/share/${accessLink}`;
    // TODO: need the server url from...elsewhere
    // Using `origin` works fine for web application, but not for extension
    const url = `${import.meta.env.VITE_SEND_CLIENT_URL}/share/${accessLink}`;
    return url;
  }
}
