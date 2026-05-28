import { test, expect } from '@playwright/test';
import { TBAcctsPage } from '../../pages/tb-accts-page';
import { navigateToSendAndSignIn } from '../../utils/utils';
import { DashboardPage } from '../../pages/dashboard-page';
import { SecurityPrivacyPage } from '../../pages/security-privacy-page';

import {
  PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
  TIMEOUT_1_SECOND,
  TIMEOUT_30_SECONDS,
 } from "../../const/const"

var tbAcctsPage: TBAcctsPage;
var dashboardPage: DashboardPage;
var securityPrivacyPage: SecurityPrivacyPage;

test.beforeEach(async ({ page }) => { 
  tbAcctsPage = new TBAcctsPage(page);
  dashboardPage = new DashboardPage(page);
  securityPrivacyPage = new SecurityPrivacyPage(page);
});

/**
 * Test to ensure that we can sign into TB Send either via TB Accounts or local password auth.
 * After sign-in we expect to arrive on the TB Send dashboard; we expect that the test account
 * used with the E2E tests was signed into at least once before manually before these tests were
 * ran (and the encryption keys already setup once) so that the main dashboard appears upon sign-in.
 * The encyption keys (even though were setup on the test account intially manually before) will
 * need to be recovered because playwright runs tests in a new browser each time.
 */
test.describe('sign-in and restore access key (desktop)', () => {
  test('able to sign-in to tb send and restore keys on desktop browser', {
    tag: [PLAYWRIGHT_TAG_DESKTOP_NIGHTLY],
  }, async ({ page }) => {
    await navigateToSendAndSignIn(page);

    // verify we're now on the tb send dashboard, give lots of time as BrowserStack can be slow
    await expect(dashboardPage.sendHdrLogoLink).toBeVisible({ timeout: TIMEOUT_30_SECONDS });
    await expect(dashboardPage.sendHdrEncryptedLink).toBeVisible();
    await expect(dashboardPage.sendHdrSecurityLink).toBeVisible();

    // restore the access key
    await securityPrivacyPage.restoreAccessKey();

    // now that we're done, wait a second and sign out via user avatar menu
    await page.waitForTimeout(TIMEOUT_1_SECOND);
    await dashboardPage.signOut();
  });
});
