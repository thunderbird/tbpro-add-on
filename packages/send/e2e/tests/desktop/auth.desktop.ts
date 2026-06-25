import { test as setup } from '@playwright/test';
import path from 'path';

import { signInAndRestoreSendKey } from '../../utils/utils';

const fs = require('fs');
const directoryPath = path.join(__dirname, '../../test-results/.auth');

// when use storageState in browserstack yml, browserstack requires the file to exist already even on the
// first time the auth-setup step is run; so must create an empty user.json file here
const filepath = path.join(directoryPath, 'user.json');
const emptyJsonObject = {};
const jsonString = JSON.stringify(emptyJsonObject, null, 2); // The '2' adds indentation for readability
try {
  fs.mkdirSync(directoryPath, { recursive: true });
  fs.writeFileSync(filepath, jsonString);
} catch (error) {
  throw new Error(`Failed to initialize auth storage file at ${filepath}`, { cause: error });
}

// We write it here so it is blown away and re-created at the start of every test run; and is in .gitignore
const authFile = path.join(__dirname, '../../test-results/.auth/user.json');

setup('desktop browser authenticate', async ({ page }) => {
  console.log('inside desktop authenticate, about to sign-in and restore send key');
  await signInAndRestoreSendKey(page);
  // Now we are signed in and have the send key restored, so save the auth
  await page.context().storageState({ path: authFile });
});
