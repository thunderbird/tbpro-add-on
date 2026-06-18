import { expect, type Page, type Locator } from '@playwright/test';

import { 
  TB_SEND_SECURITY_AND_PRIVACY_URL,
  TB_SEND_ENCRYPTION_KEY_CODE,
  TIMEOUT_30_SECONDS,
  TIMEOUT_1_SECOND,
} from "../const/const";

export class SecurityPrivacyPage {
  readonly page: Page;
  readonly recoverAccessHdr: Locator;
  readonly restoreKeyInput: Locator;
  readonly restoreKeyContinueBtn: Locator;
  readonly manageKeyHdr: Locator;
  readonly resetKeyHdr: Locator;
  readonly deleteSendDataCardHeading: Locator;
  readonly deleteSendDataWarning: Locator;
  readonly deleteUnderstandCheckbox: Locator;
  readonly deletePasswordInput: Locator;
  readonly deleteSendDataButton: Locator;
  readonly cancelDeleteSendDataButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.recoverAccessHdr = page.getByText('Recover Access with Your Encryption Key', { exact: true });
    this.restoreKeyInput = page.getByTestId('restore-key-input');
    this.restoreKeyContinueBtn = page.getByTestId('restore-keys-button');
    this.manageKeyHdr = page.getByText('Manage Encryption Key', { exact: true });
    this.resetKeyHdr = page.getByText('Reset Encryption Key', { exact: true });
    this.deleteSendDataCardHeading = this.page.getByRole('heading', { name: 'Delete Send Data' });
    this.deleteSendDataWarning = this.page.getByText(
      /This will permanently delete all encrypted files in your Thunderbird Pro\s+Send storage\./
    );
    this.deleteUnderstandCheckbox = this.page.getByTestId('delete-understand-checkbox');
    this.deletePasswordInput = this.page.getByTestId('delete-password');
    this.deleteSendDataButton = this.page.getByTestId('delete-send-data');
    this.cancelDeleteSendDataButton = this.page.getByRole('button', { name: 'Cancel' });
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
    await expect(this.manageKeyHdr).toBeVisible();
    await expect(this.resetKeyHdr).toBeVisible();
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
