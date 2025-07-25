import { expect } from "@playwright/test";
import { PlaywrightProps } from "../send.spec";
import { playwrightConfig } from "../testUtils";

export async function oidc_login({ page }: PlaywrightProps) {
  const username = playwrightConfig.tbprousername;
  const password = playwrightConfig.tbproPassword;

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
