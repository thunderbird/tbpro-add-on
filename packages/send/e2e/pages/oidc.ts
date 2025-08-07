import { expect } from "@playwright/test";
import { credentials, PlaywrightProps } from "../send.spec";
import { create_incognito_context } from "../testUtils";

export async function oidc_login({ page, context }: PlaywrightProps) {
  //  We can skip this test if we're not running in CI automation mode
  if (!process.env.IS_CI_AUTOMATION) {
    console.log("Skipping OIDC login test in non-CI environment.");
    return;
  }

  const browser = context.browser();
  if (!browser) {
    throw new Error("Browser context is not available");
  }
  const incognitoContext = await create_incognito_context(browser);
  const otherPage = await incognitoContext.newPage();

  const username = credentials.TBPRO_USERNAME as string;
  const password = credentials.TBPRO_PASSWORD as string;

  // Navigate to the management page (that simulates extension management)
  await otherPage.goto("/extension/management");
  await otherPage.getByTestId("login-button-tbpro").click();

  // wait for navigation to auth-stage.tb.pro
  await otherPage.waitForURL("**/auth-stage.tb.pro/**");
  await otherPage.waitForLoadState("networkidle");

  // A new otherPage will open for OIDC login, fill the form and submit
  await otherPage.fill("#username", username, { force: true });
  await otherPage.fill("#password", password, { force: true });
  await otherPage.click('button[type="submit"]');

  // Log out
  await otherPage.getByTestId("log-out-button").click();
  await otherPage.waitForLoadState("networkidle");

  // Expect the logout page to be visible
  await expect(otherPage.getByTestId("redirecting-p")).toBeVisible();
}
