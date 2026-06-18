import { test } from '@playwright/test';

import {
  PLAYWRIGHT_TAG_MOBILE_NIGHTLY,
  TB_SEND_DASHBOARD_URL,
} from '../../const/const';
import { DashboardPage } from '../../pages/dashboard-page';
import { signInAndRestoreSendKey } from '../../utils/utils';

// tests take a lot longer to run on BrowserStack iOS vs android, so need more time
const TEN_MINUTES = 10 * 60 * 1000;

test.describe('dashboard on mobile', () => {
  test('verifies dashboard visibility, values, and basic controls', {
    tag: [PLAYWRIGHT_TAG_MOBILE_NIGHTLY],
  }, async ({ page }, testInfo) => {
    test.setTimeout(TEN_MINUTES);

    await signInAndRestoreSendKey(page, testInfo.project.name);

    const dashboardPage = new DashboardPage(page);

    await page.goto(TB_SEND_DASHBOARD_URL);
    await dashboardPage.expectUnlockedDashboardVisible({ includeDesktopNav: false });
    await dashboardPage.expectSupportLinks();

    await dashboardPage.goToEncryptedFilesFromDashboard();

    await page.goto(TB_SEND_DASHBOARD_URL);
    await dashboardPage.expectUnlockedDashboardVisible({ includeDesktopNav: false });
    await dashboardPage.goToSecurityAndPrivacyFromDashboard();

    await page.goto(TB_SEND_DASHBOARD_URL);
    await dashboardPage.expectUnlockedDashboardVisible({ includeDesktopNav: false });
    await dashboardPage.expectDeleteSendDataCardThenCancel();
  });
});
