import { expect } from "@playwright/test";
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
  // await secondPage.goto("/send/profile");
  await secondPage.waitForLoadState("networkidle");
  await recoverAccessButton.click();
  await restorekeyInput.fill(passphrase!);
  await restoreKeysButton.click();

  // look for folder (only shows when keys are restored)
  await secondPage.goto("/send");

  // Create a new folder
  await secondPage.getByTestId("new-folder-button").click();

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
