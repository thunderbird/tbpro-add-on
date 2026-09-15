import { test, type Page } from '@playwright/test';

import {
  PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
  PLAYWRIGHT_TAG_MOBILE_NIGHTLY,
  TB_SEND_DASHBOARD_URL,
} from '../const/const';
import { DashboardPage } from '../pages/dashboard-page';
import { EncryptedFilesPage } from '../pages/encrypted-files-page';
import { ShareFilePage } from '../pages/share-file-page';
import { createUniquePngUploadFixture } from '../utils/upload-files';
import { isMobileProject, signInAndRestoreSendKey } from '../utils/utils';

const FIVE_MINUTES = 5 * 60 * 1000;

test('share file: create share link, incorrect password, download, and revoke', {
  tag: [
    PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
    PLAYWRIGHT_TAG_MOBILE_NIGHTLY,
  ],
}, async ({ page, context }, testInfo) => {
  const isMobile = isMobileProject(testInfo.project.name);
  const isBrowserStackAndroid = testInfo.project.name === 'android-chrome';
  if (isMobile) {
    test.setTimeout(FIVE_MINUTES);
    await signInAndRestoreSendKey(page);
  }

  const dashboard = new DashboardPage(page);
  const encryptedFiles = new EncryptedFilesPage(page);
  const fixture = createUniquePngUploadFixture(testInfo, 'file-picker');
  const password = Date.now().toString();
  const recipientTabs: Page[] = [];

  await page.goto(TB_SEND_DASHBOARD_URL);
  await dashboard.expectUnlockedDashboardVisible({
    includeDesktopNav: !isMobile,
  });
  if (isMobile) {
    await dashboard.goToEncryptedFilesFromDashboard();
  } else {
    await dashboard.goToEncryptedFilesFromHeader();
  }
  await encryptedFiles.expectBasicUiVisible();

  try {
    await encryptedFiles.uploadFileWithFilePicker(fixture);
    const shareUrl = await encryptedFiles.createPasswordProtectedShareLink(
      fixture.fileName,
      password,
      isMobile
    );

    const recipientTab = await context.newPage();
    recipientTabs.push(recipientTab);
    await recipientTab.bringToFront();
    await recipientTab.goto(shareUrl);
    const recipient = new ShareFilePage(recipientTab);
    await recipient.expectPasswordFormVisible();
    await recipient.submitPassword(`incorrect-${password}`);
    await recipient.expectAccessDenied('This password is incorrect');
    await recipient.submitPassword(password);
    await recipient.expectFileInformationVisible(fixture.fileName);
    await recipient.downloadAndExpectDownload(fixture, isBrowserStackAndroid);

    await recipientTab.close();
    await page.bringToFront();
    await encryptedFiles.deleteShareLink(shareUrl);

    const revokedTab = await context.newPage();
    recipientTabs.push(revokedTab);
    await revokedTab.bringToFront();
    await revokedTab.goto(shareUrl);
    const revokedRecipient = new ShareFilePage(revokedTab);
    await revokedRecipient.expectPasswordFormVisible();
    await revokedRecipient.submitPassword(password);
    await revokedRecipient.expectAccessDenied('Access Link is no longer valid');
  } finally {
    // Do not delete the file until revocation has been checked: deletion itself
    // would make the link unusable and could hide a broken revoke operation.
    try {
      for (const tab of recipientTabs) {
        if (!tab.isClosed()) await tab.close();
      }
    } finally {
      await page.bringToFront();
      await encryptedFiles.closeFileInfoPanelIfOpen();
      await encryptedFiles.deleteUploadedFiles([fixture.fileName], isMobile);
    }
  }
});
