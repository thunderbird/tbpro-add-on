import { test, expect } from '@playwright/test';
import { signInAndRestoreSendKey } from '../../utils/utils';

import {
  PLAYWRIGHT_TAG_MOBILE_NIGHTLY,
  TB_SEND_DASHBOARD_URL,
 } from "../../const/const"


/**
 * Temporary test to exercise the new mobile auth (sign in and restore key). For
 * mobile we cannot save the browser context/sign in so each test must sign in at
 * the beginning, but use the new sign in util. Once auth is proven write new tests
 * for the dashboard and use the new auth method.
 */
test.describe('fake test to exercise auth on mobile', () => {
  test('fake test just so auth runs', {
    tag: [PLAYWRIGHT_TAG_MOBILE_NIGHTLY],
  }, async ({ page }) => {
    await signInAndRestoreSendKey(page, 'mobile');
    await page.goto(TB_SEND_DASHBOARD_URL);
    expect(true);
  });
});
