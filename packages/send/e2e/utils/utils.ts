import { expect, type Page } from '@playwright/test';
import { TBAcctsPage } from "../pages/tb-accts-page";
import { DashboardPage } from '../pages/dashboard-page';
import { SecurityPrivacyPage } from '../pages/security-privacy-page';

import { 
  TB_SEND_TARGET_ENV,
  TB_SEND_BASE_URL,
  TIMEOUT_5_SECONDS,
  TIMEOUT_30_SECONDS,
} from "../const/const";

/**
 * Navigate to TB Send (at the TB_SEND_BASE_URL in the test/e2e/.env file). If already signed in
 * then just exit; otherwise if not currently signed in then sign in using the credentials
 * provided in the .env file. When signing into Send on production or stage you provide
 * the TB Accounts username (email) and password; when signing in on the local dev environment
 * you provide a username (email) and password already created for your local dev stack. After
 * sign-in we expect to arrive on the TB Send dashboard. After we are signed in, restore the send
 * encryption key using the values provided in the e2e/.env file. 
 */
export const signInAndRestoreSendKey = async (page: Page, testProjectName: string = 'desktop') => {
  console.log(`navigating to send ${TB_SEND_TARGET_ENV} (${TB_SEND_BASE_URL})`);
  const tbAcctsSignInPage = new TBAcctsPage(page);

  await page.goto(`${TB_SEND_BASE_URL}`);
  await page.waitForTimeout(TIMEOUT_5_SECONDS);

  // local dev can use local 'password' auth only or tb accts
  if (TB_SEND_TARGET_ENV == 'dev') {
    if (await tbAcctsSignInPage.localDevEmailInput.isVisible()) {
      // sing-in using local password auth
      await tbAcctsSignInPage.localSendSignIn();
    }
  } else {
    // when navigate to TB Send it now automatically goes directly to TB Pro sign-in dialog
    await tbAcctsSignInPage.signIn(testProjectName);
  }

  const dashboardPage = new DashboardPage(page);
  const securityPrivacyPage = new SecurityPrivacyPage(page);

  // verify we're now on the tb send dashboard, give lots of time as BrowserStack can be slow
  await expect(dashboardPage.sendHdrLogoLink).toBeVisible({ timeout: TIMEOUT_30_SECONDS });

  if (testProjectName == 'desktop') {
    await expect(dashboardPage.sendHdrEncryptedLink).toBeVisible();
    await expect(dashboardPage.sendHdrSecurityLink).toBeVisible();
  }

  // restore the access key
  await securityPrivacyPage.restoreAccessKey();
}
