import { test } from '@playwright/test';

import {
  PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
  PLAYWRIGHT_TAG_MOBILE_NIGHTLY,
  TB_SEND_DASHBOARD_URL,
} from '../const/const';
import { DashboardPage } from '../pages/dashboard-page';
import { isMobileProject, signInAndRestoreSendKey } from '../utils/utils';

const TEN_MINUTES = 10 * 60 * 1000;

test.describe('dashboard', () => {
  test('verifies dashboard visibility, values, and basic controls', {
    tag: [PLAYWRIGHT_TAG_DESKTOP_NIGHTLY, PLAYWRIGHT_TAG_MOBILE_NIGHTLY],
  }, async ({ page }, testInfo) => {
    const isMobile = isMobileProject(testInfo.project.name);
    if (isMobile) {
      test.setTimeout(TEN_MINUTES);
      await signInAndRestoreSendKey(page);
    }

    const dashboardPage = new DashboardPage(page);
    const returnToDashboard = async () => {
      if (isMobile) {
        await page.goto(TB_SEND_DASHBOARD_URL);
        await dashboardPage.expectUnlockedDashboardVisible({ includeDesktopNav: false });
        return;
      }

      await dashboardPage.goToDashboardFromHeader();
    };

    await page.goto(TB_SEND_DASHBOARD_URL);
    await dashboardPage.expectUnlockedDashboardVisible({ includeDesktopNav: !isMobile });
    await dashboardPage.expectSupportLinks();

    await dashboardPage.goToEncryptedFilesFromDashboard();

    await returnToDashboard();
    await dashboardPage.goToSecurityAndPrivacyFromDashboard();

    await returnToDashboard();
    await dashboardPage.expectDeleteSendDataCardThenCancel();
  });
});
