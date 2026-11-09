import {
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';

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

type ShareLinkScenario = {
  /**
   * Runs with the recipient on the unlocked link, before revocation. Receives
   * the recipient page and the fixture it can download.
   */
  whileLinkWorks?: (
    recipient: ShareFilePage,
    fixture: ReturnType<typeof createUniquePngUploadFixture>
  ) => Promise<void>;
  /** Attempt the link once more before unlocking it (e.g. a wrong password). */
  beforeUnlock?: (recipient: ShareFilePage) => Promise<void>;
  /** The operation under test. Afterwards the link must be denied. */
  revoke: (
    encryptedFiles: EncryptedFilesPage,
    shareUrl: string,
    fileName: string,
    isMobile: boolean
  ) => Promise<void>;
};

/**
 * Uploads a file, shares it with a password, proves the link resolves, runs
 * `revoke`, and expects the recipient to be denied afterwards. The file is
 * deleted in `finally` only: deletion itself revokes the link (#1393) and
 * would hide a broken revoke operation if it ran earlier.
 */
async function expectLinkRevokedAfter(
  { page, context }: { page: Page; context: BrowserContext },
  testInfo: TestInfo,
  scenario: ShareLinkScenario
) {
  const isMobile = isMobileProject(testInfo.project.name);
  if (isMobile) {
    test.setTimeout(FIVE_MINUTES);
    await signInAndRestoreSendKey(page);
  }

  const dashboard = new DashboardPage(page);
  const encryptedFiles = new EncryptedFilesPage(page);
  const fixture = createUniquePngUploadFixture(testInfo, 'file-picker');
  const password = Date.now().toString();
  const recipientTabs: Page[] = [];

  async function openAsRecipient(shareUrl: string) {
    const tab = await context.newPage();
    recipientTabs.push(tab);
    await tab.bringToFront();
    await tab.goto(shareUrl);
    const recipient = new ShareFilePage(tab);
    await recipient.expectPasswordFormVisible();
    return { tab, recipient };
  }

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

    const { tab, recipient } = await openAsRecipient(shareUrl);
    await scenario.beforeUnlock?.(recipient);
    await recipient.submitPassword(password);
    await recipient.expectFileInformationVisible(fixture.fileName);
    await scenario.whileLinkWorks?.(recipient, fixture);
    await tab.close();

    await page.bringToFront();
    await scenario.revoke(encryptedFiles, shareUrl, fixture.fileName, isMobile);

    const revoked = await openAsRecipient(shareUrl);
    await revoked.recipient.submitPassword(password);
    await revoked.recipient.expectAccessDenied('Access Link is no longer valid');
  } finally {
    try {
      for (const tab of recipientTabs) {
        if (!tab.isClosed()) await tab.close();
      }
    } finally {
      // A no-op when the scenario already deleted the file.
      await page.bringToFront();
      await encryptedFiles.closeFileInfoPanelIfOpen();
      await encryptedFiles.deleteUploadedFiles([fixture.fileName], isMobile);
    }
  }
}

test('share file: create share link, incorrect password, download, and revoke', {
  tag: [
    PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
    PLAYWRIGHT_TAG_MOBILE_NIGHTLY,
  ],
}, async ({ page, context }, testInfo) => {
  const isBrowserStackAndroid = testInfo.project.name === 'android-chrome';
  await expectLinkRevokedAfter({ page, context }, testInfo, {
    beforeUnlock: async (recipient) => {
      await recipient.submitPassword(`incorrect-${Date.now()}`);
      await recipient.expectAccessDenied('This password is incorrect');
    },
    whileLinkWorks: (recipient, fixture) =>
      recipient.downloadAndExpectDownload(fixture, isBrowserStackAndroid),
    revoke: (encryptedFiles, shareUrl) => encryptedFiles.deleteShareLink(shareUrl),
  });
});

test('share file: deleting the file revokes its share link (#1393)', {
  tag: [
    PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
    PLAYWRIGHT_TAG_MOBILE_NIGHTLY,
  ],
}, async ({ page, context }, testInfo) => {
  await expectLinkRevokedAfter({ page, context }, testInfo, {
    // Delete the file itself and leave its share link in place.
    revoke: async (encryptedFiles, _shareUrl, fileName, isMobile) => {
      await encryptedFiles.closeFileInfoPanelIfOpen();
      await encryptedFiles.deleteUploadedFiles([fileName], isMobile);
    },
  });
});
