import { test } from '@playwright/test';

import {
  PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
  PLAYWRIGHT_TAG_MOBILE_NIGHTLY,
  TB_SEND_SECURITY_AND_PRIVACY_URL,
} from '../const/const';
import { SettingsPage } from '../pages/settings-page';
import { isMobileProject, signInAndRestoreSendKey } from '../utils/utils';

const FIVE_MINUTES = 5 * 60 * 1000;

test.describe('settings', () => {
  test('verifies encryption key, reset, support, and user menu controls', {
    tag: [PLAYWRIGHT_TAG_DESKTOP_NIGHTLY, PLAYWRIGHT_TAG_MOBILE_NIGHTLY],
  }, async ({ page }, testInfo) => {
    if (isMobileProject(testInfo.project.name)) {
      test.setTimeout(FIVE_MINUTES);
      await signInAndRestoreSendKey(page);
    }

    const settingsPage = new SettingsPage(page);

    await page.goto(TB_SEND_SECURITY_AND_PRIVACY_URL);
    await settingsPage.expectManageKeysVisible();

    await settingsPage.expectKeyHiddenByDefault();
    const shownKey = await settingsPage.showKeyAndReturnValue();
    await settingsPage.hideKey();
    await settingsPage.expectCopyKeyCopiesToClipboard(shownKey);
    await settingsPage.expectPrintKeyPageOpens();

    await settingsPage.expectResetKeyDialogThenCancel();
    await settingsPage.expectSupportLinks();
    await settingsPage.expectUserMenuAndOpenSupport();
  });
});
