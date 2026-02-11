import { test, expect, type Page } from '@playwright/test';
import { TBAcctsPage } from "../pages/tb-accts-page";
import { DashboardPage } from '../pages/dashboard-page';

import { 
  TB_SEND_TARGET_ENV,
  TB_SEND_BASE_URL,
  TIMEOUT_5_SECONDS,
  TIMEOUT_60_SECONDS,
} from "../const/const";

/**
 * Navigate to TB Send (at the TB_SEND_BASE_URL in the test/e2e/.env file). If already signed in
 * then just exit; otherwise if not currently signed in then sign in using the credentials
 * provided in the .env file. When signing into Send on production or stage you provide
 * the TB Accounts username (email) and password; when signing in on the local dev environment
 * you provide a username (email) and password already created for your local dev stack. After
 * sign-in we expect to arrive on the TB Send dashboard.
 */
export const navigateToSendAndSignIn = async (page: Page, testProjectName: string = 'desktop') => {
  console.log(`navigating to send ${TB_SEND_TARGET_ENV} (${TB_SEND_BASE_URL})`);
  const tbAcctsSignInPage = new TBAcctsPage(page);
  const dashboardPage = new DashboardPage(page);

  await page.goto(`${TB_SEND_BASE_URL}`);
  await page.waitForTimeout(TIMEOUT_5_SECONDS);

  // local dev can use local 'password' auth only or tb accts
  if (TB_SEND_TARGET_ENV == 'dev') {
    if (await tbAcctsSignInPage.localDevEmailInput.isVisible()) {
      // sing-in using local password auth
      await tbAcctsSignInPage.localSendSignIn();
    }
  } else {
    // sign-in using tb accts; first we click the 'login with your tb pro account' button
    await tbAcctsSignInPage.signInUsingTBAcctsBtn.click();
    // then we sign-in to tb accounts itself
    await tbAcctsSignInPage.signIn(testProjectName);
  }
  
  // check for tbpro logo on dashboard, give lots of time for page to load as BrowserStack can be slow
  await expect(dashboardPage.tbProHdrLogo).toBeVisible({ timeout: TIMEOUT_60_SECONDS });
}
