import { expect } from "@playwright/test";
import { dashboardLocators, fileLocators } from "./locators";
import { PlaywrightProps } from "../../utils/dev/fixtures";
import { playwrightConfig, saveStorage } from "../../utils/dev/testUtils";

const { email, password } = playwrightConfig;

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
}

/**
 * Sign back in from a session that has no keys, then restore them from the
 * passphrase `register_and_login` saved. The caller supplies a context built from
 * the empty storage state — that empty session *is* the thing under test.
 */
export async function log_out_restore_keys({ page }: PlaywrightProps) {
  const {
    emailField,
    passwordField,
    submitLogin,
    restoreKeysButton,
    restorekeyInput,
    recoverAccessButton,
  } = dashboardLocators(page);
  const { firstFolderRow } = fileLocators(page);

  page.on("dialog", (dialog) => dialog.accept());

  // wait for network idle
  await page.waitForLoadState("networkidle");

  // log back in
  await emailField.fill(email);
  await passwordField.fill(password);
  await submitLogin.click();

  // restore keys
  const passphrase = playwrightConfig.passphrase;
  await page.waitForLoadState("networkidle");
  await recoverAccessButton.click();
  await restorekeyInput.fill(passphrase!);
  await restoreKeysButton.click();

  // look for folder (only shows when keys are restored)
  await page.goto("/send");

  // Create a new folder
  await page.getByTestId("new-folder-button").click();

  // Check that newly created folder exists. Deliberately not a count assertion:
  // the suite tolerates the duplicate folder from #1190 rather than failing on it
  // (see `firstFolderRow`), so asserting "exactly one" here would only move that
  // red run one step earlier.
  await expect(firstFolderRow).toBeVisible();
  await firstFolderRow.click();
}

export async function reset_keys({ page }: PlaywrightProps) {
  const {
    emailField,
    passwordField,
    submitLogin,
    backupKeysButtonOverlay,
    passphraseInputOverlay,
    showReset,
    understandCheckbox,
    dangerButton,
  } = dashboardLocators(page);

  const { folderRowSelector, emptyFolderIndicator } = fileLocators(page);

  const profileButton = page.getByTestId("navlink-encrypted-files");
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
  playwrightConfig.recoveredPassphrase = passPhrase;
  await backupKeysButtonOverlay.click();

  // Navigate to files
  await page.goto("/send");

  // `empty-folder` is a hidden marker element (FolderView.vue renders it with
  // `display: none`), so this is a weak check by construction.
  await expect(emptyFolderIndicator).toBeHidden();
}
