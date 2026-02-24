import { expect } from "@playwright/test";
import { credentials, PlaywrightProps } from "../../tests/desktop/dev/send.spec";
import { create_incognito_context } from "../../utils/dev/testUtils";

export async function oidc_login({ page, context }: PlaywrightProps) {
  //  We can skip this test if we're not running in CI automation mode
  if (!process.env.IS_CI_AUTOMATION) {
    console.log("Skipping OIDC login test in non-CI environment.");
    await context.close();
    return;
  }

  // Skip if OIDC credentials are not configured
  if (!credentials.TBPRO_USERNAME || !credentials.TBPRO_PASSWORD) {
    console.log("Skipping OIDC login test: TBPRO_USERNAME/TBPRO_PASSWORD not set.");
    await context.close();
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

  await otherPage.getByTestId("username-input").fill(username, { force: true });
  await otherPage.getByTestId("password-input").fill(password, { force: true });
  await otherPage.getByTestId("submit-btn").click();

  // Wait for OIDC redirect chain to complete:
  // auth-stage.tb.pro → /post-login (handleOIDCCallback + backend auth) → /send/profile (BackupKeys renders)
  await otherPage.waitForURL("**/send/profile**", { timeout: 30000 });
  await otherPage.waitForLoadState("networkidle", { timeout: 30000 });

  // Log out - handleLogout fires location.reload() which redirects to /login via router guard
  await otherPage.getByTestId("log-out-button-overlay").click();
  await otherPage.waitForURL("**/login**", { timeout: 15000 });
  await otherPage.waitForLoadState("networkidle", { timeout: 15000 });

  await otherPage.goto("/send");
  // Expect the logout page to be visible
  await expect(otherPage.getByTestId("email")).toBeVisible();
  await context.close();
}
