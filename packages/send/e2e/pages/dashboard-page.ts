import { type Page, type Locator } from '@playwright/test';

import { 
  TIMEOUT_1_SECOND,
  TIMEOUT_5_SECONDS
} from "../const/const";

export class DashboardPage {
  readonly page: Page;
  readonly sendHdrLogoLink: Locator;
  readonly sendHdrDashboardLink: Locator;
  readonly sendHdrEncryptedLink: Locator;
  readonly sendHdrSecurityLink: Locator;
  readonly userAvatarMenuBtn: Locator;
  readonly logoutMenuBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sendHdrLogoLink = this.page.getByRole('link', { name: 'Send' }).first();
    this.sendHdrDashboardLink = this.page.getByTestId('navlink-dashboard');
    this.sendHdrEncryptedLink = this.page.getByTestId('navlink-encrypted-files');
    this.sendHdrSecurityLink = this.page.getByTestId('navlink-security-&-privacy');
    this.userAvatarMenuBtn = this.page.locator('aside.avatar.regular');
    this.logoutMenuBtn = this.page.getByRole('button', { name: 'Logout', exact: true });
  }

  /**
   * Log out via the user avatar menu
   */
  async signOut(testProjectName: string = 'desktop') {
    console.log('signing out of tb send');
    await this.userAvatarMenuBtn.click();
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await this.logoutMenuBtn.click();
    await this.page.waitForTimeout(TIMEOUT_5_SECONDS);
  }
}
