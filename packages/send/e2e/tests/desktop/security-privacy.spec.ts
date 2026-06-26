import { test } from '@playwright/test';

import {
  PLAYWRIGHT_TAG_DESKTOP_NIGHTLY,
  TB_SEND_SECURITY_AND_PRIVACY_URL,
} from '../../const/const';
import { SecurityPrivacyPage } from '../../pages/security-privacy-page';

test.describe('security and privacy on desktop', () => {
  test('verifies encryption key, reset, support, and user menu controls', {
    tag: [PLAYWRIGHT_TAG_DESKTOP_NIGHTLY],
  }, async ({ page }) => {
    const securityPrivacyPage = new SecurityPrivacyPage(page);

    await page.goto(TB_SEND_SECURITY_AND_PRIVACY_URL);
    await securityPrivacyPage.expectManageKeysVisible();

    await securityPrivacyPage.expectKeyHiddenByDefault();
    const shownKey = await securityPrivacyPage.showKeyAndReturnValue();
    await securityPrivacyPage.hideKey();
    await securityPrivacyPage.expectCopyKeyCopiesToClipboard(shownKey);
    await securityPrivacyPage.expectPrintKeyPageOpens();

    await securityPrivacyPage.expectResetKeyDialogThenCancel();
    await securityPrivacyPage.expectSupportLinks();
    await securityPrivacyPage.expectUserMenuAndOpenSupport();
  });
});
