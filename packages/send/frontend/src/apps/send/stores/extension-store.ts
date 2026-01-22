// stores/counter.js

import { SEND_MESSAGE_TO_BRIDGE } from '@send-frontend/lib/const';
import { defineStore } from 'pinia';
import { useConfigStore } from './config-store';

const DEBUG = true;
const SERVER = `server`;

export const useExtensionStore = defineStore('extension', () => {
  const { serverUrl, setServerUrl, getAddonId } = useConfigStore();

  // This specifies the id of the provider chosen in the
  // "Composition > Attachments" window.
  // This is necessary only for the management page.
  const accountId = new URL(location.href).searchParams.get('accountId');

  function setAccountConfigured(accountId) {
    // Let TB know that extension is ready for use with cloudFile API.
    try {
      //@ts-ignore
      browser.cloudFile.updateAccount(accountId, {
        configured: true,
      });
    } catch {
      console.log(
        `setAccountConfigured: You're probably running this outside of Thundebird`
      );
    }
  }

  async function configureExtension(id = accountId) {
    // Create cloud file account if it doesn't exist
    try {
      //@ts-ignore
      const result = await browser.CloudFileAccounts.createAccount(
        getAddonId(),
        true
      );

      if (!result.success) {
        console.error(
          `[extension-store] Failed to create cloud file account: ${result.error}`
        );
      } else if (result.alreadyExists) {
        console.log(
          `[extension-store] Cloud file account already exists: ${result.accountId}`
        );
      } else {
        console.log(
          `[extension-store] Cloud file account created: ${result.accountId}`
        );
      }
    } catch (error) {
      console.error(
        `[extension-store] Error creating cloud file account:`,
        error
      );
    }

    // This function only needs to run if we're in the TB addon.
    // Exit early if there's no account id.
    if (!id) {
      console.log(`[extension-store] No id provided to configureExtension()`);
      return;
    }
    //   console.log(`

    // Configuring extension with:

    // accountId: ${id}
    // SERVER: ${SERVER}
    // currentServerUrl.value: ${serverUrl.value}

    // `);

    return browser.storage.local
      .set({
        [id]: {
          [SERVER]: serverUrl.value,
        },
      })
      .catch((error) => {
        console.log(error);
      })
      .then(() => {
        setAccountConfigured(id);
        setServerUrl(serverUrl.value);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        DEBUG &&
          browser.storage.local.get(id).then((accountInfo) => {
            if (accountInfo[id] && SERVER in accountInfo[id]) {
              setServerUrl(accountInfo[id][SERVER]);
              setAccountConfigured(id);
            } else {
              console.log(`You probably need to wait longer`);
            }
          });
      });
  }

  // Send bridge message
  const sendMessageToBridge = (message: string) => {
    window.postMessage(
      { type: SEND_MESSAGE_TO_BRIDGE, value: message },
      window.location.origin
    );
  };

  return {
    configureExtension,
    sendMessageToBridge,
    serverUrl,
    setServerUrl,
  };
});
