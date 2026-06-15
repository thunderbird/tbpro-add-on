import { test } from '@playwright/test';

import {
  PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
  TB_SEND_DASHBOARD_URL,
} from '../../const/const';
import { DashboardPage } from '../../pages/dashboard-page';

test.describe('dashboard on desktop', () => {
  test('verifies dashboard visibility, values, and basic controls', {
    tag: [PLAYWRIGHT_TAG_DESKTOP_NIGHTLY],
  }, async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await page.goto(TB_SEND_DASHBOARD_URL);
    await dashboardPage.expectUnlockedDashboardVisible();
    await dashboardPage.expectSupportLinks();

    await dashboardPage.goToEncryptedFilesFromDashboard();

    await dashboardPage.goToDashboardFromHeader();
    await dashboardPage.goToSecurityAndPrivacyFromDashboard();

    await dashboardPage.goToDashboardFromHeader();
    await dashboardPage.expectDeleteSendDataCardThenCancel();
  });
});
