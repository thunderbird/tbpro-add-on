import { expect } from "@playwright/test";
import { credentials, PlaywrightProps } from "../send.spec";

export async function oidc_login({ page }: PlaywrightProps) {
  //  We can skip this test if we're not running in CI automation mode
  if (!process.env.IS_CI_AUTOMATION) {
    console.log("Skipping OIDC login test in non-CI environment.");
    return;
  }
  const username = credentials.TBPRO_USERNAME as string;
  const password = credentials.TBPRO_PASSWORD as string;

  await page.goto("/extension/management");
  await page.getByTestId("login-button-tbpro").click();

  // wait for navigation to auth-stage.tb.pro
  await page.waitForURL("**/auth-stage.tb.pro/**");
  await page.waitForLoadState("networkidle");

  // A new page will open for OIDC login, fill the form and submit
  await page.fill("#username", username, { force: true });
  await page.fill("#password", password, { force: true });
  await page.click('button[type="submit"]');

  // wait for navigation to go back to /send
  await page.waitForURL("**/profile");
  await expect(page).toHaveTitle(/Thunderbird Send/);
  expect(await page.getByTestId("big-message-display").textContent()).toContain(
    "Please write down your backup keys and click"
  );
}
