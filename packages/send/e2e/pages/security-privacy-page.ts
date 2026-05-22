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

  constructor(page: Page) {
    this.page = page;
    this.recoverAccessHdr = page.getByText('Recover Access with Your Encryption Key', { exact: true });
    this.restoreKeyInput = page.getByTestId('restore-key-input');
    this.restoreKeyContinueBtn = page.getByTestId('restore-keys-button');
    this.manageKeyHdr = page.getByText('Manage Encryption Key', { exact: true });
    this.resetKeyHdr = page.getByText('Reset Encryption Key', { exact: true });
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
}
