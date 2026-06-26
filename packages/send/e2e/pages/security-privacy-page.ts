import { expect, type Page, type Locator } from '@playwright/test';

import {
  TB_SEND_SECURITY_AND_PRIVACY_URL,
  TB_SEND_ENCRYPTION_KEY_CODE,
  TIMEOUT_30_SECONDS,
  TIMEOUT_5_SECONDS,
  TIMEOUT_1_SECOND,
} from '../const/const';
import { expectSupportLinks } from './support-links';

declare global {
  interface Window {
    __copiedText: string;
  }
}

export class SecurityPrivacyPage {
  readonly page: Page;
  readonly recoverAccessHdr: Locator;
  readonly restoreKeyInput: Locator;
  readonly restoreKeyContinueBtn: Locator;
  readonly pageHeading: Locator;
  readonly manageKeyHdr: Locator;
  readonly resetKeyHdr: Locator;
  readonly keyInput: Locator;
  readonly showKeyButton: Locator;
  readonly hideKeyButton: Locator;
  readonly copyKeyButton: Locator;
  readonly downloadKeyButton: Locator;
  readonly resetKeyButton: Locator;
  readonly resetKeyDialogHeading: Locator;
  readonly resetKeyWarning: Locator;
  readonly resetKeyUnderstandCheckbox: Locator;
  readonly resetKeyCancelButton: Locator;
  readonly deleteSendDataCardHeading: Locator;
  readonly deleteSendDataWarning: Locator;
  readonly deleteUnderstandCheckbox: Locator;
  readonly deletePasswordInput: Locator;
  readonly deleteSendDataButton: Locator;
  readonly cancelDeleteSendDataButton: Locator;
  readonly userAvatar: Locator;
  readonly userAvatarMenuBtn: Locator;
  readonly userMenuButton: Locator;
  readonly accountMenuLink: Locator;
  readonly supportMenuLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.recoverAccessHdr = page.getByText('Recover Access with Your Encryption Key', { exact: true });
    this.restoreKeyInput = page.getByTestId('restore-key-input');
    this.restoreKeyContinueBtn = page.getByTestId('restore-keys-button');
    this.pageHeading = page.getByRole('heading', { name: 'Security & Privacy' }).first();
    this.manageKeyHdr = page.getByText('Manage Encryption Key', { exact: true });
    this.resetKeyHdr = page.getByText('Reset Encryption Key', { exact: true });
    this.keyInput = page.locator('.key-input');
    this.showKeyButton = page.getByRole('button', { name: 'Show key' });
    this.hideKeyButton = page.getByRole('button', { name: 'Hide key' });
    this.copyKeyButton = page.getByRole('button', { name: 'Copy to clipboard' });
    this.downloadKeyButton = page.getByRole('button', { name: 'Download key' });
    this.resetKeyButton = page.getByTestId('show-reset');
    this.resetKeyDialogHeading = page.getByRole('heading', { name: 'Reset Encryption Key' }).last();
    this.resetKeyWarning = page.getByText(
      /Creating a new key will replace your existing one\.[\s\S]*files encrypted with your previous key will no longer be accessible\./
    );
    this.resetKeyUnderstandCheckbox = page.getByTestId('understand-checkbox');
    this.resetKeyCancelButton = page.getByRole('button', { name: 'Cancel' });
    this.deleteSendDataCardHeading = this.page.getByRole('heading', { name: 'Delete Send Data' });
    this.deleteSendDataWarning = this.page.getByText(
      /This will permanently delete all encrypted files in your Thundermail\s+Send storage\./
    );
    this.deleteUnderstandCheckbox = this.page.getByTestId('delete-understand-checkbox');
    this.deletePasswordInput = this.page.getByTestId('delete-password');
    this.deleteSendDataButton = this.page.getByTestId('delete-send-data');
    this.cancelDeleteSendDataButton = this.page.getByRole('button', { name: 'Cancel' });
    this.userAvatar = page.getByTestId('avatar-default');
    this.userAvatarMenuBtn = page.locator('aside.avatar.regular');
    this.userMenuButton = page.locator('button.user-menu');
    this.accountMenuLink = page.getByRole('link', { name: 'Account' });
    this.supportMenuLink = page.getByRole('link', { name: 'Support' });
  }

  /**
   * Restore existing access key using the encrypton key code provided in the env.
   */
  async restoreAccessKey(testProjectName: string = 'desktop') {
    console.log('restoring tb send access key');

    // navigate to the security & privacy page
    await this.page.goto(TB_SEND_SECURITY_AND_PRIVACY_URL);
    await expect(this.recoverAccessHdr).toBeVisible({ timeout: TIMEOUT_30_SECONDS });

    // restore access key
    await expect(this.restoreKeyInput).toBeVisible();
    await this.restoreKeyInput.fill(TB_SEND_ENCRYPTION_KEY_CODE);
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await expect(this.restoreKeyContinueBtn).toBeEnabled();
    await this.restoreKeyContinueBtn.click();

    // now after keys are restored there should now be a manage key section
    await expect(this.restoreKeyInput).not.toBeVisible({ timeout: TIMEOUT_30_SECONDS });
    await expect(this.restoreKeyContinueBtn).not.toBeVisible();
    await expect(this.manageKeyHdr).toBeVisible();
    await expect(this.resetKeyHdr).toBeVisible();
  }

  async expectManageKeysVisible() {
    await expect(this.pageHeading).toBeVisible();
    await expect(this.manageKeyHdr).toBeVisible();
    await expect(this.resetKeyHdr).toBeVisible();
  }

  async expectKeyHiddenByDefault() {
    await expect(this.keyInput).toBeVisible();
    await expect(this.keyInput).toHaveAttribute('type', 'password');
    const hiddenKey = await this.keyInput.inputValue();
    expect(hiddenKey.length).toBeGreaterThan(0);
  }

  async showKeyAndReturnValue() {
    await this.showKeyButton.click();
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await expect(this.keyInput).toHaveAttribute('type', 'text');
    const shownKey = await this.keyInput.inputValue();
    expect(shownKey.length).toBeGreaterThan(0);

    return shownKey;
  }

  async hideKey() {
    await this.hideKeyButton.click();
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await expect(this.keyInput).toHaveAttribute('type', 'password');
  }

  async installClipboardShim() {
    await this.page.evaluate(() => {
      window.__copiedText = '';
      // BrowserStack devices can be inconsistent with real clipboard access,
      // so the test captures writes through the app's normal copy path.
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            window.__copiedText = value;
          },
        },
      });
    });
  }

  async expectCopyKeyCopiesToClipboard(expectedKey: string) {
    await this.installClipboardShim();
    await this.copyKeyButton.click();
    await expect.poll(() => this.page.evaluate(() => window.__copiedText)).toBe(expectedKey);
  }

  async expectPrintKeyPageOpens() {
    // BrowserStack Android can show a native print-preview error for
    // window.print(), which hides the app while Playwright continues.
    await this.page.context().addInitScript(() => {
      window.print = () => {};
    });

    const printPagePromise = this.page.context().waitForEvent('page');
    await this.downloadKeyButton.click();
    const printPage = await printPagePromise;

    await printPage.waitForLoadState('domcontentloaded');
    await expect.poll(() => printPage.url()).toContain('/passphrase?print=true');

    await printPage.close();
    await this.page.bringToFront();
    await this.expectManageKeysVisible();
  }

  async expectResetKeyDialogThenCancel() {
    await this.resetKeyButton.click();
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await expect(this.resetKeyDialogHeading).toBeVisible();
    await expect(this.resetKeyWarning).toBeVisible();
    await expect(this.resetKeyUnderstandCheckbox).toBeVisible();
    await this.resetKeyCancelButton.click();
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await expect(this.resetKeyUnderstandCheckbox).not.toBeVisible();
    await this.expectManageKeysVisible();
  }

  async expectSupportLinks() {
    await expectSupportLinks(this.page);
  }

  async expectUserMenuAndOpenSupport() {
    await this.openUserMenu();
    await expect(this.accountMenuLink).toBeVisible();
    await expect(this.supportMenuLink).toBeVisible();

    await this.supportMenuLink.click();
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.page.getByText(/Submit a request/i)).toBeVisible({
      timeout: TIMEOUT_30_SECONDS,
    });
  }

  async openUserMenu() {
    const avatarLocators = [
      this.userAvatar,
      this.userAvatarMenuBtn,
      this.userMenuButton,
    ];

    for (const avatarLocator of avatarLocators) {
      try {
        const locator = avatarLocator.first();
        if ((await locator.count()) === 0) {
          continue;
        }

        await expect(locator).toBeVisible({ timeout: TIMEOUT_5_SECONDS });
        await locator.click();
        await expect(this.supportMenuLink).toBeVisible({ timeout: TIMEOUT_5_SECONDS });
        return;
      } catch {
        // The avatar markup comes from services-ui and differs by environment;
        // try the next known wrapper/rendered shape before failing the test.
      }
    }

    throw new Error('Unable to open the user menu from any known avatar locator');
  }

  async expectDeleteSendDataCardVisible() {
    await expect(this.deleteSendDataCardHeading).toBeVisible();
    await expect(this.deleteSendDataWarning).toBeVisible();
    await expect(this.deleteUnderstandCheckbox).toBeVisible();
    await expect(this.deletePasswordInput).toBeVisible();
    await expect(this.deleteSendDataButton).toBeDisabled();
  }

  async cancelDeleteSendData() {
    await this.cancelDeleteSendDataButton.click();
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await expect(this.deletePasswordInput).not.toBeVisible();
    await this.expectManageKeysVisible();
  }
}
