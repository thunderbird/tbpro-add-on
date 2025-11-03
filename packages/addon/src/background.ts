/// <reference types="thunderbird-webext-browser" />
import { createPinia, setActivePinia } from 'pinia';

import { useExtensionStore } from '@send-frontend/apps/send/stores/extension-store';
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';

import { BASE_URL } from '@send-frontend/apps/common/constants';
import init from '@send-frontend/lib/init';
import { restoreKeysUsingLocalStorage } from '@send-frontend/lib/keychain';

// We have to create a Pinia instance in order to
// access the folder-store, user-store, etc.
const pinia = createPinia();
setActivePinia(pinia);

// Once we have an active Pinia instance, we can get references
// to our stores. We initialize everything in the anonymous
// function below.
const folderStore = useFolderStore();
const userStore = useUserStore();
const { keychain } = useKeychainStore();
const { api } = useApiStore();
const { configureExtension } = useExtensionStore();

console.log('hello from the background.js!', new Date().getTime());

// ==============================================
// Initialize the cloudFile accounts, keychain, and stores.
(async () => {
  try {
    const allAccounts = await browser.cloudFile.getAllAccounts();
    if (allAccounts.length > 0) {
      for (const { id } of allAccounts) {
        console.log(`[background.td] passing ${id} to configureExtension()`);
        await configureExtension(id);
      }
    } else {
      for (let i = 0; i < 100; i++) {
        await configureExtension(`account${i}`);
      }
    }
  } catch (error) {
    console.warn('Error configuring cloudFile:', error);
  }

  try {
    await restoreKeysUsingLocalStorage(keychain, api);
  } catch (error) {
    console.warn(
      'Error restoring keys from local storage on background.js:',
      error
    );
  }
  try {
    await init(userStore, keychain, folderStore);
  } catch (error) {
    console.warn(
      'Error during initialization of userStore, keychain, folderStore:',
      error
    );
  }
})().catch((error) => {
  console.error('Error initializing background.js', error);
});

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const origin = browser.runtime.getURL('').slice(0, -1);

    // Remove our origin header from requests to backblazeb2.
    const requestHeaders = details.requestHeaders.filter(
      ({ name, value }) =>
        !(name.toLowerCase() === 'origin' && value === origin)
    );

    const hostName = requestHeaders.find(({ name }) => name === 'Host')?.value;

    console.log(`altered a request for host ${hostName}`, {
      requestHeaders,
      origin,
    });

    return { requestHeaders };
  },
  { urls: ['https://*.backblazeb2.com/*'] },
  ['blocking', 'requestHeaders']
);

console.log('webRequest listeners have been set up.');

// ==============================================

// ==============================================
// Stores info for each file that need uploading.
let uploadInfoQueue = [];

// We'll store a promise for each file to upload.
const uploadPromiseMap = new Map();

// When the timer expires, we show the popup.
// This gives us a window for multiple uploads to queue.
let popupTimer = null;

// ID of the current popup window.
// Prevents multiple popups from opening.
let popupWindowId = null;

browser.cloudFile.onFileUpload.addListener(
  // We disregard the third (tab) arg, and aren't following the cb return type.
  //@ts-expect-error
  async (_, fileInfo) => {
    const { id, name, data } = fileInfo;
    console.log(`[onFileUpload] Received file: ${name} (ID: ${id})`);

    // Clear the timer
    if (popupTimer) {
      clearTimeout(popupTimer);
    }

    // If we need to, we can use this to tell TB
    // that the upload is aborted.
    const abortController = new AbortController();

    // Add the file info to the queue.
    uploadInfoQueue.push({
      id,
      name,
      data,
    });

    // Create a new Promise for this upload.
    // This is the one we'll return from this callback.
    // Store the resolve/reject functions as well
    // as a means to signal that the upload is aborted.
    // Later on, when the upload is either finished or has failed,
    // we'll either call:
    // - resolve()
    // - reject() and abortController.abort()
    const uploadPromise = new Promise((resolve, reject) => {
      uploadPromiseMap.set(id, {
        resolve,
        reject,
        abortController,
      });
    });

    // Since we just got a new upload, we need to start a new
    // popupTimer.
    popupTimer = setTimeout(openUnifiedPopup, 250);

    // Return the promise for this upload;
    return uploadPromise;
  }
);

/**
 * Opens a single popup window for all queued files.
 */
async function openUnifiedPopup() {
  // If there's nothing to upload or the popup is already open, exit early.
  if (uploadInfoQueue.length === 0 || popupWindowId) {
    console.log(`[openUnifiedPopup] Aborting: Queue is empty or popup exists.`);
    return;
  }

  console.log(
    `[openUnifiedPopup] Timer expired. Opening popup for ${uploadInfoQueue.length} files.`
  );

  try {
    const popup = await browser.windows.create({
      url: browser.runtime.getURL('index.extension.html'),
      type: 'popup',
      width: 400,
      height: 500,
      allowScriptsToClose: true,
    });

    popupWindowId = popup.id;
  } catch (error) {
    console.error(`[openUnifiedPopup] Error creating popup:`, error);

    // If popup creation fails, we must reject all waiting promises.
    rejectAllInQueue(new Error('Popup window could not be opened.'));
  }
}

// Handle all messages from popup.
browser.runtime.onMessage.addListener(async (message) => {
  switch (message.type) {
    case 'TB/PING':
      console.log('[background] got the ping from the bridge');
      console.log(message);
      break;

    case 'TB/OIDC_TOKEN':
      const { email, preferred_username, token } = message;

      if (!email && !token) {
        console.log(`Did not get info back from login`);
        return;
      }

      try {
        await createThundermailAccount(email, preferred_username)
      } catch (e) {
        console.log(e);
      }

      try {
        await addThundermailToken(token, email);
      } catch (e) {
        console.log(e);
      }

      break;

    case 'SIGN_IN':
      console.log(
        `[onMessage] sounds like you want to sign in from the typescript handler`
      );
      await browser.tabs.create({
        url: `${BASE_URL}/login?isExtension=true`,
      });

      break;

    // Popup is ready and is requesting the file list.
    case 'POPUP_READY':
      console.log(`[onMessage] Popup is ready. Sending file list.`);

      browser.runtime.sendMessage({
        type: 'FILE_LIST',
        files: uploadInfoQueue, // Send the entire queue
      });

      // Clear the queue now that we've sent it.
      uploadInfoQueue = [];
      break;

    // Popup reports that all uploads are complete.
    case 'ALL_UPLOADS_COMPLETE': {
      console.log(`[onMessage] Received message that files were uploaded.`);
      const { url } = message;

      message.results.forEach(({ originalId: id }) => {
        if (uploadPromiseMap.has(id)) {
          uploadPromiseMap.get(id).resolve({ aborted: false, url });
          uploadPromiseMap.delete(id);
        }
      });

      break;
    }

    // Popup reports that the user cancelled the entire process.
    case 'ALL_UPLOADS_ABORTED':
      console.log(`[onMessage] User aborted all uploads.`);
      rejectAllInQueue(new Error('User aborted the operation.'));
      break;
  }

  // Not returning a value or returning `true` causes this error to show:
  // Error: Promised response from onMessage listener went out of scope
  return new Promise((resolve) => {
    resolve(true);
  });
});

// Listen for when our popup window is closed.
browser.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) {
    console.log(`[onRemoved] Popup window closed.`);
    popupWindowId = null;
    // If the window is closed before uploads complete, we consider it an abort.
    rejectAllInQueue(new Error('Popup window was closed prematurely.'));
  }
});

// Listen for upload abort.
browser.cloudFile.onFileUploadAbort.addListener((_, id) => {
  const uploadInfo = uploadPromiseMap.get(id);
  if (uploadInfo && uploadInfo.abortController) {
    console.log(`aborting upload:`);
    console.log(uploadInfo);
    // TODO: investigate whether it should also do the following:
    // uploadPromiseMap.get(id).reject(reason);
    // uploadPromiseMap.delete(id);
    uploadInfo.abortController.abort();
  }
});

/**
 * Helper function to clean up pending uploads if something goes wrong.
 * Calls the reject() and abort() functions for each file id.
 * This is used for cleanup on errors or cancellations.
 * @param {Error} reason - The reason for the rejection.
 */
function rejectAllInQueue(reason: Error) {
  const remainingIds = Array.from(uploadPromiseMap.keys());
  if (remainingIds.length > 0) {
    console.log(
      `[rejectAllInQueue] Rejecting ${remainingIds.length} pending promises.`
    );
    remainingIds.forEach((id) => {
      uploadPromiseMap.get(id).abortController.abort();
      uploadPromiseMap.get(id).reject(reason);
      uploadPromiseMap.delete(id);
    });
  }
  // Also clear any remaining items in the queue.
  uploadInfoQueue = [];
}


async function createThundermailAccount(email, preferred_username) {

  const alreadyExists = await doesAccountExist(email);
  if (alreadyExists) {
    const message = `Account for ${email} already exists. Skipping creation.`
    return {
      success: false,
      message,
    }
  }

  const config = {
    incoming: {
      type: "imap",
      hostname: "mail.thundermail.com",
      port: 993,
      username: email,
      password: "",
      socketType: 3, // SSL
      auth: 10 // OAuth2 (or use 3 for plain text if using App Password)
    },
    outgoing: {
      type: "smtp",
      hostname: "mail.thundermail.com",
      port: 587,
      username: email,
      password: "",
      socketType: 2, // STARTTLS
      auth: 10, // OAuth2 (or use 3 for plain text if using App Password)
      addThisServer: true // Required: tells TB to create a new SMTP server
    },
    identity: {
      realname: preferred_username,
      emailAddress: email,
    },
    displayName: "Thundermail"
  };

  try {
    const result = await browser.MailAccounts.createAccount(config);

    if (result) {
      return {
        success: true,
        message: `Account created successfully`,
      }
    } else {
      return {
        success: false,
        message: `Creation failed (Experiment API returned false)`,
      }
    }

  } catch (e) {
    return {
      success: false,
      message: `Creation failed with error ${e.message}`,
    }
  }

}


async function addThundermailToken(token, email) {
  try {
    const result = await browser.MailAccounts.setToken(token, email);

    if (result) {
      return {
        success: true,
        message: `Token saved successfully`,
      }
    } else {
      return {
        success: false,
        message: `Saving token failed (Experiment API returned false)`,
      }
    }

  } catch (e) {
    return {
      success: false,
      message: `Saving token failed with error ${e.message}`,
    }
  }

  // Call experiment function that runs the following:

  /*
  Based on https://searchfox.org/comm-central/source/mailnews/base/src/OAuth2Module.sys.mjs#198-202

      const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
      Ci.nsILoginInfo
      );
      login.init(this._loginOrigin, null, scope, this._username, token, "", "");
      await Services.logins.addLoginAsync(login);

      but with arguments like
      "oauth://auth.tb.pro", null, "openid email offline_access profile", "geoff@thundermail.com", "abcde12345", "", ""
   */


}


async function doesAccountExist(email) {
  if (!email) {
    console.warn("accountExists: No email address provided for check.");
    return false;
  }

  const normalizedEmail = email.toLowerCase();

  try {
    const accounts = await messenger.accounts.list();

    // Check if an identity from any account already has this email address.
    for (const account of accounts) {
      if (account.identities && Array.isArray(account.identities)) {
        for (const identity of account.identities) {
          console.log(`...✔️ identity email ${identity.email}`);
          if (identity.email && identity.email.toLowerCase() === normalizedEmail) {
            console.log(`Found existing account for ${email} (Account: ${account.name}, ID: ${account.id})`);
            return true;
          }
        }
      }
    }
  } catch (e) {
    console.error("Error checking for existing accounts:", e);
    // You might want to "fail safe" and return true here to prevent
    // attempting to create a duplicate if the list() call fails.
    // For this example, we'll return false and let the creation attempt proceed.
    return false;
  }

  // If the loop completes without finding a match
  console.log(`No existing account found for ${email}.`);
  return false;
}
