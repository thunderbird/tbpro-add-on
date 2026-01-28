import { test, expect } from '@playwright/test';
import { TBAcctsPage } from '../../pages/tb-accts-page';
import { navigateToSendAndSignIn } from '../../utils/utils';
import { DashboardPage } from '../../pages/dashboard-page';

import {
  PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
  TIMEOUT_1_SECOND,
  TIMEOUT_5_SECONDS,
  TIMEOUT_30_SECONDS,
 } from "../../const/const"

var tbAcctsPage: TBAcctsPage;
var dashboardPage: DashboardPage;

test.beforeEach(async ({ page }) => { 
  tbAcctsPage = new TBAcctsPage(page);
  dashboardPage = new DashboardPage(page);
});

/**
 * Test to ensure that we can sign into TB Send either via TB Accounts or local password auth.
 * After sign-in we expect to arrive on the TB Send dashboard; we expect that the test account
 * used used with the E2E tests was signed into at least once before these tests were ran, and
 * that the encryption keys already setup so that the main dashboard appears upon sign-in. The
 * encyption keys keys may need to be recovered because playwright runs tests in a new browser
 * each time but that's fine; we just don't want the very first setup encyption keys dialog which
 * will appear the very first time a new account is signed into send.
 */
test.describe('sign-in', () => {
  test('able to sign-in to tb send', {
    tag: [PLAYWRIGHT_TAG_DESKTOP_NIGHTLY],
  }, async ({ page }) => {
    await navigateToSendAndSignIn(page);

    // verify we're now on the tb send dashboard, give lots of time as BrowserStack can be slow
    await expect(dashboardPage.sendStorageHdr).toBeVisible();
    await expect(dashboardPage.logoutBtn).toBeVisible();

    // now that we're done, wait a second and sign out
    await page.waitForTimeout(TIMEOUT_1_SECOND);
    await dashboardPage.logoutBtn.click();
    await page.waitForTimeout(TIMEOUT_5_SECONDS);
  });
});
