import { expect, type Page } from "@playwright/test";
import { dashboardLocators, fileLocators } from "./locators";
import { PlaywrightProps } from "../../utils/dev/fixtures";
import { playwrightConfig, saveStorage } from "../../utils/dev/testUtils";
import { emptystatePath } from "../../utils/dev/paths";

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
  const profileButton = page.getByTestId("navlink-manage-files");
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
    resetKeyPassphrase,
    showReset,
    understandCheckbox,
    dangerButton,
  } = dashboardLocators(page);

  const { folderRowSelector, dropZone, uploadButton } = fileLocators(page);

  const profileButton = page.getByTestId("navlink-manage-files");
  // Create a new folder
  await page.getByTestId("new-folder-button").click();

  await profileButton.click();
  // Check that the created folder exists
  await page.waitForSelector(folderRowSelector);

  // The reset deletes this default folder; the Files link must not keep it (#1354).
  await expect(page).toHaveURL(/\/send\/folder\/[^/?]+/);
  const oldFolderId = new URL(page.url()).pathname.split("/").pop()!;

  await page.goto("/send/security-and-privacy");

  page.on("dialog", (dialog) => dialog.accept());

  // Reset Encryption Key: one modal shows the new key and swaps it in on
  // "Download key and reset" (write-new-then-swap, #1116), in-session (#1355).
  await showReset.click();
  const passPhrase = await resetKeyPassphrase.inputValue();
  if (!passPhrase) throw new Error("Passphrase not found");
  playwrightConfig.recoveredPassphrase = passPhrase;
  await understandCheckbox.click();
  await dangerButton.click();
  await expect(dangerButton).toBeHidden({ timeout: 30_000 });

  // Follow the in-app link (no reload) to the new default folder (#1354).
  await expect(profileButton).not.toHaveAttribute("href", new RegExp(oldFolderId));
  await profileButton.click();
  await expect(page).toHaveURL(/\/send\/folder\/[^/?]+/);
  await expect(page).not.toHaveURL(new RegExp(oldFolderId));
  await expect(dropZone).toBeVisible();

  // The Upload button only renders once the folder loaded.
  await page.locator('input[type="file"]').setInputFiles({
    name: "after-reset.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("after reset"),
  });
  await expect(uploadButton).toBeVisible();
}

/**
 * #1355: leaving the reset modal before "Download key and reset" must keep the
 * old key working everywhere; completing it swaps the key exactly once.
 * Uses its own account so it does not depend on what `reset_keys` installed.
 */
export async function reset_keys_abandoned_then_completed({ page }: PlaywrightProps) {
  const { resetKeyPassphrase, backupKeysButtonOverlay, showReset, understandCheckbox, dangerButton } =
    dashboardLocators(page);
  const account = { email: `reset-abandon${Date.now()}@tb.pro`, password };

  let swaps = 0;
  page.on("request", (req) => {
    if (req.url().includes("resetKeys")) swaps++;
  });
  page.on("dialog", (dialog) => dialog.accept());

  // First-time setup: the overlay's phrase becomes the account's key.
  const oldPhrase = await register_account(page, account);
  await backupKeysButtonOverlay.click();
  await expect(backupKeysButtonOverlay).toBeHidden({ timeout: 30_000 });

  const startReset = async () => {
    await page.goto("/send/security-and-privacy");
    await showReset.click();
    const phrase = await resetKeyPassphrase.inputValue();
    if (!phrase) throw new Error("Passphrase not found");
    return phrase;
  };

  // Abandon: open the reset modal, then reload instead of confirming.
  await startReset();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(resetKeyPassphrase).toBeHidden();
  expect(swaps).toBe(0);
  await in_fresh_context(page, (fresh) => login_and_restore(fresh, account, oldPhrase));

  // Complete: the modal closes only once the swap and backup have finished.
  const newPhrase = await startReset();
  await understandCheckbox.click();
  await dangerButton.click();
  await expect(dangerButton).toBeHidden({ timeout: 30_000 });
  expect(swaps).toBe(1);

  await in_fresh_context(page, (fresh) => login_and_restore(fresh, account, newPhrase, oldPhrase));
}

type Account = { email: string; password: string };

/** Register `account` and return the phrase shown in the first-time overlay. */
async function register_account(page: Page, account: Account) {
  const { registerButton, emailField, passwordField, confirmPasswordField, submitButton, passphraseInputOverlay } =
    dashboardLocators(page);
  await page.goto("/login");
  await registerButton.click();
  await emailField.fill(account.email);
  await passwordField.fill(account.password);
  await confirmPasswordField.fill(account.password);
  await submitButton.click();
  const phrase = await passphraseInputOverlay.inputValue();
  if (!phrase) throw new Error("Passphrase not found");
  return phrase;
}

/** Run `action` in a new, empty browser context (another device). */
async function in_fresh_context(page: Page, action: (fresh: Page) => Promise<void>) {
  const context = await page.context().browser()!.newContext({
    storageState: emptystatePath,
  });
  try {
    await action(await context.newPage());
  } finally {
    await context.close();
  }
}

/** Log in on an empty session and restore with `phrase` (after `rejected` fails). */
async function login_and_restore(page: Page, account: Account, phrase: string, rejected?: string) {
  const { emailField, passwordField, submitLogin, recoverAccessButton, restorekeyInput, restoreKeysButton } =
    dashboardLocators(page);
  const restoreError = page.getByText(/Could not restore keys/);
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/login");
  await emailField.fill(account.email);
  await passwordField.fill(account.password);
  await submitLogin.click();
  await page.waitForLoadState("networkidle");
  await recoverAccessButton.click();

  if (rejected) {
    await restorekeyInput.fill(rejected);
    await restoreKeysButton.click();
    await expect(restoreError).toBeVisible();
  }
  await restorekeyInput.fill(phrase);
  await restoreKeysButton.click();
  // The form only goes away once the keys are restored and stored locally.
  await expect(restorekeyInput).toBeHidden();

  await page.goto("/send");
  await expect(fileLocators(page).dropZone).toBeVisible();
}
