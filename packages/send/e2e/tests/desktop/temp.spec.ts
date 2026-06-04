import { test, expect } from '@playwright/test';

import {
  PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
  TB_SEND_DASHBOARD_URL,
 } from "../../const/const"


/**
 * Temporary test to exercise the new desktop auth (sign in and restore key). The auth
 * will be ran automatically for desktop tests and browser context saved so all tests
 * will already be signed in. Once auth is proven write new tests for the dashboard and
 * use the new auth method.
 */
test.describe('fake test to exercise auth on desktop', () => {
  test('fake test just so auth runs', {
    tag: [PLAYWRIGHT_TAG_DESKTOP_NIGHTLY],
  }, async ({ page }) => {
    await page.goto(TB_SEND_DASHBOARD_URL);
    await page.waitForTimeout(1_000);
    expect(true);
  });
});
