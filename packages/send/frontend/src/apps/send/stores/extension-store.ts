// stores/counter.js

import { defineStore } from 'pinia';
import { useConfigStore } from './config-store';

const DEBUG = true;
const SERVER = `server`;

export const useExtensionStore = defineStore('extension', () => {
  const { serverUrl, setServerUrl } = useConfigStore();

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

  async function configureExtension(id: string) {
    id = id || accountId;

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

  return {
    configureExtension,
    serverUrl,
    setServerUrl,
  };
});
