import { test } from '@playwright/test';

import {
  PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
  PLAYWRIGHT_TAG_MOBILE_NIGHTLY,
  TB_SEND_DASHBOARD_URL,
} from '../const/const';
import { DashboardPage } from '../pages/dashboard-page';
import { EncryptedFilesPage } from '../pages/encrypted-files-page';
import { createUniquePngUploadFixture } from '../utils/upload-files';
import { isMobileProject, signInAndRestoreSendKey } from '../utils/utils';

const FIVE_MINUTES = 5 * 60 * 1000;

test.describe('encrypted files', () => {
  test('your files page: upload, download, and delete', {
    tag: [PLAYWRIGHT_TAG_DESKTOP_NIGHTLY, PLAYWRIGHT_TAG_MOBILE_NIGHTLY],
  }, async ({ page }, testInfo) => {
    const isMobile = isMobileProject(testInfo.project.name);
    test.skip(isMobile, 'Skipping on mobile until issue 977 (file info panel covers delete button on mobile) is resolved');

    if (isMobile) {
      test.setTimeout(FIVE_MINUTES);
      await signInAndRestoreSendKey(page);
    }

    const dashboardPage = new DashboardPage(page);
    const encryptedFilesPage = new EncryptedFilesPage(page);
    // Use unique runtime copies so this test can run against accounts that
    // already contain files with the original test fixture name.
    const filePickerFixture = createUniquePngUploadFixture(testInfo, 'file-picker');
    const dragDropFixture = createUniquePngUploadFixture(testInfo, 'drag-drop');
    const uploadedFileNames = [
      filePickerFixture.fileName,
      dragDropFixture.fileName,
    ];

    await page.goto(TB_SEND_DASHBOARD_URL);
    await dashboardPage.expectUnlockedDashboardVisible({ includeDesktopNav: !isMobile });
    if (isMobile) {
      await dashboardPage.goToEncryptedFilesFromDashboard();
    } else {
      await dashboardPage.goToEncryptedFilesFromHeader();
    }

    await encryptedFilesPage.expectBasicUiVisible();

    try {
      // Cover both upload entry points: native file chooser and drag/drop.
      await encryptedFilesPage.uploadFileWithFilePicker(filePickerFixture);
      await encryptedFilesPage.uploadFileWithDragAndDrop(dragDropFixture);
      if (isMobile) {
        await encryptedFilesPage.downloadFileFromInfoPanelAndExpectDownload(filePickerFixture);
      } else {
        await encryptedFilesPage.downloadFileAndExpectDownload(filePickerFixture);
      }
    } finally {
      // Keep the shared test account tidy even if a later upload assertion fails.
      await encryptedFilesPage.deleteUploadedFiles(uploadedFileNames);
    }
  });
});
