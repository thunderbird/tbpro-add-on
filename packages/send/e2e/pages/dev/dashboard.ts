import { expect, type Page } from "@playwright/test";
import { dashboardLocators, fileLocators } from "./locators";
import { PlaywrightProps } from "../../tests/desktop/dev/send.spec";
import { playwrightConfig, saveStorage, setup_browser } from "../../utils/dev/testUtils";

const { email, password, shareLinks } = playwrightConfig;

export async function register_and_login({ page, context }: PlaywrightProps) {
  const {
    registerButton,
    emailField,
    passwordField,
    confirmPasswordField,
    submitButton,
    passphraseInputOverlay,
    backupKeysButtonOverlay,
  } = dashboardLocators(page);

  await registerButton.click();

  await emailField.fill(email);
  await passwordField.fill(password);
  await confirmPasswordField.fill(password);
  await submitButton.click();

  page.on("dialog", (dialog) => dialog.accept());

  const passPhrase = await passphraseInputOverlay.inputValue();
  if (!passPhrase) throw new Error("Passphrase not found");
  playwrightConfig.passphrase = passPhrase;

  await backupKeysButtonOverlay.click();

  // look for folder
  const profileButton = page.getByTestId("navlink-encrypted-files");
  await profileButton.click();

  await saveStorage(context);
  // context.close();
}

/**
 * Bring a session restored from storageState to the unlocked file UI.
 *
 * Because the passphrase is encrypted at rest with a non-extractable AES key in
 * IndexedDB, and Playwright's storageState carries localStorage + cookies but
 * NOT IndexedDB, a restored context can't decrypt its passphrase. The app's
 * validator then clears the session and forces re-login (see validations.ts),
 * so a restored context lands in one of three states: (a) logged out at the
 * login form, (b) logged in but keychain-locked ("Recover Access"), or (c)
 * already on the file UI. Normalize all three to (c): log in if needed, then
 * restore keys with the captured passphrase if needed — the same steps a real
 * user takes on a new device.
 */
export async function ensureReady(page: Page) {
  const {
    emailField,
    passwordField,
    submitLogin,
    recoverAccessButton,
    restorekeyInput,
    restoreKeysButton,
  } = dashboardLocators(page);
  const newFolderButton = page.getByTestId("new-folder-button");
  const passphrase = playwrightConfig.passphrase;

  const settle = () =>
    emailField
      .or(recoverAccessButton)
      .or(newFolderButton)
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => {});

  await settle();

  // (a) Forced back to login → sign in with the account register_and_login made.
  if (await emailField.isVisible().catch(() => false)) {
    await emailField.fill(email);
    await passwordField.fill(password);
    await submitLogin.click();
    await settle();
  }

  // (b) Locked → restore keys from the server backup with the captured phrase.
  if (passphrase && (await recoverAccessButton.isVisible().catch(() => false))) {
    await recoverAccessButton.click();
    await restorekeyInput.fill(passphrase);
    await restoreKeysButton.click();
  }

  // (c) Must end on the unlocked file UI.
  await expect(newFolderButton).toBeVisible({ timeout: 20000 });
}

export async function log_out_restore_keys() {
  // Log in with a new page to simulate a new session
  const { page } = await setup_browser({ usesEmptyStorage: true });
  const secondPage = page;
  const { emailField, passwordField, submitLogin, restoreKeysButton, restorekeyInput, recoverAccessButton } =
    dashboardLocators(page);
  const { folderRowSelector, folderRowTestID } = fileLocators(page);

  secondPage.on("dialog", (dialog) => dialog.accept());

  await secondPage.goto("/send/profile");

  // wait for network idle
  await secondPage.waitForLoadState("networkidle");

  // log back in
  await emailField.fill(email);
  await passwordField.fill(password);
  await submitLogin.click();

  // restore keys
  const passphrase = playwrightConfig.passphrase;
  await secondPage.waitForLoadState("networkidle");
  // Wait for the locked/recover state to render before clicking (post-login the
  // backup check is async, so the button may appear after networkidle).
  await recoverAccessButton.waitFor({ state: "visible", timeout: 20000 });
  await recoverAccessButton.click();
  await restorekeyInput.fill(passphrase!);
  await restoreKeysButton.click();

  // look for folder (only shows when keys are restored)
  await secondPage.goto("/send");

  // Create a new folder
  const newFolderButton = secondPage.getByTestId("new-folder-button");
  await newFolderButton.waitFor({ state: "visible", timeout: 20000 });
  await newFolderButton.click();

  // Check that newly created folder exists
  await secondPage.waitForSelector(folderRowSelector);
  let folder = secondPage.getByTestId(folderRowTestID);
  await folder.click();
}

export async function reset_keys({ page }: PlaywrightProps) {
  const {
    emailField,
    passwordField,
    submitLogin,
    backupKeysButtonOverlay,
    passphraseInputOverlay,
    securityButton,
    showReset,
    understandCheckbox,
    dangerButton,
  } = dashboardLocators(page);

  const { folderRowSelector, emptyFolderIndicator } = fileLocators(page);

  let profileButton = page.getByTestId("navlink-encrypted-files");
  // Create a new folder
  await page.getByTestId("new-folder-button").click();

  await profileButton.click();
  // Check that the created folder exists
  await page.waitForSelector(folderRowSelector);

  await page.goto("/send/security-and-privacy");

  // Restore passphrase (account included)
  await showReset.click();
  await understandCheckbox.click();
  await dangerButton.click();

  await page.waitForLoadState("networkidle");
  await page.goto("/send/profile");

  // Log back in
  await emailField.fill(email);
  await passwordField.fill(password);
  await submitLogin.click();

  page.on("dialog", (dialog) => dialog.accept());

  // wait for network idle
  await page.waitForLoadState("networkidle");

  // Back up keys
  const passPhrase = await passphraseInputOverlay.inputValue();
  if (!passPhrase) throw new Error("Passphrase not found");
  playwrightConfig.recoveredPassphrase = passPhrase!;
  await backupKeysButtonOverlay.click();

  // Navigate to files
  await page.goto("/send");

  // Check that the folder is empty
  expect(await emptyFolderIndicator.isVisible()).toBe(false);
}
