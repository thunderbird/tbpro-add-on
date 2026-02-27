import { type Page, type Locator } from '@playwright/test';

import { 
  TIMEOUT_1_SECOND,
  TIMEOUT_5_SECONDS
} from "../const/const";

export class DashboardPage {
  readonly page: Page;
  readonly tbProHdrLogo: Locator;
  readonly sendStorageHdr: Locator;
  readonly userAvatarMenuBtn: Locator;
  readonly userAvatarMenuBtnIOS: Locator;
  readonly logoutMenuBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tbProHdrLogo = this.page.locator('.header-logo');
    this.sendStorageHdr = this.page.getByRole('heading', { name: 'Send Storage' });
    this.userAvatarMenuBtn = this.page.locator('button.user-menu');
    // the avatar menu btn locator works everywhere except on iOS Safari so needs it's own
    this.userAvatarMenuBtnIOS = this.page.locator('TODO FIX THIS FOR IOS');
    this.logoutMenuBtn = this.page.getByRole('button', { name: 'Logout', exact: true });
  }

  /**
   * Log out via the user avatar menu
   */
  async signOut(testProjectName: string = 'desktop') {
    // the user avatar menu btn locator works everywhere except iOS, so it has it's own
    if (testProjectName.includes('ios')) {
      await this.userAvatarMenuBtnIOS.click();
    } else {
      await this.userAvatarMenuBtn.click();
    }
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await this.logoutMenuBtn.click();
    await this.page.waitForTimeout(TIMEOUT_5_SECONDS);
  }
}
