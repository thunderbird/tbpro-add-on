import { expect, type Page, type Locator } from '@playwright/test';

import { TIMEOUT_1_SECOND } from '../const/const';
import { EncryptedFilesPage } from './encrypted-files-page';
import { SecurityPrivacyPage } from './security-privacy-page';
import { expectSupportLinks } from './support-links';

export class DashboardPage {
  readonly page: Page;
  readonly sendHdrLogoLink: Locator;
  readonly sendHdrDashboardLink: Locator;
  readonly sendHdrEncryptedLink: Locator;
  readonly sendHdrSecurityLink: Locator;
  readonly userAvatar: Locator;
  readonly userAvatarMenuBtn: Locator;
  readonly logoutMenuBtn: Locator;
  readonly welcomeText: Locator;
  readonly userName: Locator;
  readonly userEmail: Locator;
  readonly sendStorageHeading: Locator;
  readonly encryptedFilesHeading: Locator;
  readonly accessYourFilesButton: Locator;
  readonly securityPrivacyHeading: Locator;
  readonly encryptionKeyButton: Locator;
  readonly lockedAccessMessage: Locator;
  readonly needSupportHeading: Locator;
  readonly getAddonButton: Locator;
  readonly deleteSendDataSection: Locator;
  readonly deleteSendDataLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sendHdrLogoLink = this.page.locator('header img[alt="Send"]');
    this.sendHdrDashboardLink = this.page.getByTestId('navlink-dashboard');
    this.sendHdrEncryptedLink = this.page.getByTestId('navlink-encrypted-files');
    this.sendHdrSecurityLink = this.page.getByTestId('navlink-security-&-privacy');
    this.userAvatar = this.page.getByTestId('avatar-default');
    this.userAvatarMenuBtn = this.page.locator('aside.avatar.regular');
    this.logoutMenuBtn = this.page.getByRole('button', { name: 'Logout', exact: true });
    this.welcomeText = this.page.getByText('Welcome,', { exact: true });
    this.userName = this.page.locator('.content-layout .name');
    this.userEmail = this.page.locator('.content-layout .email');
    this.sendStorageHeading = this.page.getByRole('heading', { name: 'Send Storage' });
    this.encryptedFilesHeading = this.page.getByRole('heading', { name: 'Encrypted Files' });
    this.accessYourFilesButton = this.page.getByRole('button', { name: 'Access Your Files' });
    this.securityPrivacyHeading = this.page
      .getByRole('heading', { name: 'Security & Privacy' })
      .first();
    this.encryptionKeyButton = this.page.getByTestId('recover-access-button');
    this.lockedAccessMessage = this.page.getByText(
      'Files access is locked. Restore or reset your encryption key to access file storage.'
    );
    this.needSupportHeading = this.page.getByRole('heading', { name: 'Need Support?' });
    this.getAddonButton = this.page.getByRole('button', { name: 'Get add-on' });
    this.deleteSendDataSection = this.page.getByText('Delete Send Data', { exact: true });
    this.deleteSendDataLink = this.page.getByRole('link', { name: 'Delete Send data' });
  }

  async expectDashboardNavigationVisible({
    includeDesktopNav = true,
  }: {
    includeDesktopNav?: boolean;
  } = {}) {
    await expect(this.sendHdrLogoLink).toBeVisible();

    if (!includeDesktopNav) {
      return;
    }

    await expect(this.sendHdrDashboardLink).toBeVisible();
    await expect(this.sendHdrEncryptedLink).toBeVisible();
    await expect(this.sendHdrSecurityLink).toBeVisible();
  }

  async expectUnlockedDashboardVisible({
    includeDesktopNav = true,
  }: {
    includeDesktopNav?: boolean;
  } = {}) {
    await this.expectDashboardNavigationVisible({ includeDesktopNav });

    await expect(this.welcomeText).toBeVisible();
    await expect(this.userName).toBeVisible();
    await expect(this.userEmail).toBeVisible();
    await expect(this.sendStorageHeading).toBeVisible();
    await expect(this.encryptedFilesHeading).toBeVisible();
    await expect(this.accessYourFilesButton).toBeVisible();
    await expect(this.accessYourFilesButton).toBeEnabled();
    await expect(this.securityPrivacyHeading).toBeVisible();
    await expect(this.encryptionKeyButton).toBeVisible();
    await expect(this.needSupportHeading).toBeVisible();
    await expect(this.getAddonButton).toBeVisible();
    await expect(this.deleteSendDataSection).toBeVisible();
    await expect(this.deleteSendDataLink).toBeVisible();
    await expect(this.lockedAccessMessage).not.toBeVisible();
  }

  async expectSupportLinks() {
    await expectSupportLinks(this.page);
  }

  async goToEncryptedFilesFromDashboard() {
    await this.accessYourFilesButton.click();
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await new EncryptedFilesPage(this.page).expectVisible();
  }

  async goToEncryptedFilesFromHeader() {
    await this.sendHdrEncryptedLink.click();
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await new EncryptedFilesPage(this.page).expectVisible();
  }

  async goToSecurityAndPrivacyFromDashboard() {
    await this.encryptionKeyButton.click();
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await new SecurityPrivacyPage(this.page).expectManageKeysVisible();
  }

  async goToDashboardFromHeader() {
    await this.sendHdrDashboardLink.click();
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await this.expectUnlockedDashboardVisible();
  }

  async expectDeleteSendDataCardThenCancel() {
    await expect(this.deleteSendDataSection).toBeVisible();
    await this.deleteSendDataLink.click();
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);

    const securityPrivacyPage = new SecurityPrivacyPage(this.page);
    await securityPrivacyPage.expectDeleteSendDataCardVisible();
    await securityPrivacyPage.cancelDeleteSendData();
  }
}
