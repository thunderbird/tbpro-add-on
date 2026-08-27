import { expect, type Page } from "@playwright/test";
import { dashboardLocators, fileLocators } from "./locators";
import type { PlaywrightProps } from "../../utils/dev/fixtures";
import {
  playwrightConfig,
  saveCredentials,
  saveStorage,
} from "../../utils/dev/testUtils";

/**
 * Wait until a key restore / backup has actually PERSISTED before navigating.
 *
 * Restoring keys (and backing them up) runs asynchronously after the button
 * click: a server round-trip, WebCrypto unwrapping, localStorage writes for the
 * keys, and — now that the passphrase is encrypted at rest — an IndexedDB-backed
 * AES-GCM write for the passphrase. A page.goto() issued right after the click
 * destroys the page mid-flight and nothing lands in storage, so the next page
 * loads without a keychain and the keychain-gated UI never renders. Wait for
 * the persisted end state the next page actually depends on.
 */
async function waitForKeysPersisted(page: Page) {
  await page.waitForFunction(
    () =>
      !!localStorage.getItem("lb/keys") &&
      !!localStorage.getItem("lb/passphrase"),
    undefined,
    { timeout: 20000 }
  );
}

/**
 * Wait until the SERVER-side key backup contains at least one container key.
 *
 * The register flow backs up twice: once right after the passphrase overlay
 * (before the default folder exists) and once more after init() creates the
 * default folder and adds its key. A later session that restores from the
 * backup between those two POSTs gets a keychain WITHOUT the default folder's
 * key — and init() then "self-heals" by deleting and recreating the perfectly
 * good folder (the orphaned-container path), 403-looping the folder view that
 * already navigated to the deleted id. Blocking here until the backup covers
 * the folder closes that window for every later test.
 *
 * The dev e2e stack always serves the backend at https://localhost:8088 (see
 * the header comment in send.spec.ts).
 */
async function waitForBackupContainsKeys(page: Page) {
  await page.waitForFunction(
    async () => {
      try {
        const res = await fetch("https://localhost:8088/api/users/backup", {
          credentials: "include",
        });
        if (!res.ok) return false;
        const data = await res.json();
        const keys = JSON.parse(data?.backupContainerKeys ?? "null");
        return !!keys && Object.keys(keys).length > 0;
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 30000 }
  );
}

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
  // Persist the account identity for replacement workers (see testUtils).
  saveCredentials();

  await backupKeysButtonOverlay.click();
  // The backup writes keys + the encrypted passphrase asynchronously; make sure
  // they are on disk before we snapshot this context's storageState below.
  await waitForKeysPersisted(page);

  // look for folder
  const profileButton = page.getByTestId("navlink-encrypted-files");
  await profileButton.click();
  // The file UI being ready means init() finished (default folder + its key).
  await page
    .getByTestId("new-folder-button")
    .waitFor({ state: "visible", timeout: 30000 });
  // And the post-folder auto-backup must be on the server before any later
  // session restores from it (see waitForBackupContainsKeys).
  await waitForBackupContainsKeys(page);

  await saveStorage(context);
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
  if (
    passphrase &&
    (await recoverAccessButton.isVisible().catch(() => false))
  ) {
    await recoverAccessButton.click();
    await restorekeyInput.fill(passphrase);
    await restoreKeysButton.click();
    // Don't navigate away until the restored keys + passphrase are persisted.
    await waitForKeysPersisted(page);
  }

  // (c) Must end on the unlocked file UI. States (a)/(b) play out on
  // /send/profile (the requiresBackedUpKeys guard bounces /send there while no
  // passphrase is readable), and the new-folder button only exists on /send —
  // so navigate back if it isn't already visible.
  if (!(await newFolderButton.isVisible().catch(() => false))) {
    await page.goto("/send");
  }
  await expect(newFolderButton).toBeVisible({ timeout: 20000 });
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
  // Wait for the locked/recover state to render before clicking (post-login the
  // backup check is async, so the button may appear after networkidle).
  await recoverAccessButton.waitFor({ state: "visible", timeout: 20000 });
  await recoverAccessButton.click();
  await restorekeyInput.fill(passphrase!);
  await restoreKeysButton.click();
  // Don't navigate away until the restore has persisted; a goto() here used to
  // race the async restore and reproducibly killed it mid-flight (see
  // waitForKeysPersisted).
  await waitForKeysPersisted(page);

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
  // The backup persists asynchronously; don't navigate until it has landed.
  await waitForKeysPersisted(page);

  // Navigate to files
  await page.goto("/send");

  // `empty-folder` is a hidden marker element (FolderView.vue renders it with
  // `display: none`), so this is a weak check by construction.
  await expect(emptyFolderIndicator).toBeHidden();
}
