import { test, expect } from '@playwright/test';

import { PLAYWRIGHT_TAG_DEPLOYMENT_ANALYSIS } from '../../const/const';
import { signInOnly } from '../../utils/utils';

/**
 * Kargo freight-verification gate for TB Send.
 *
 * A stock Playwright container (run by the send-e2e AnalysisTemplate on mzla-eks-shared01)
 * clones this repo and runs this single spec against the freshly-promoted deploy. It is a
 * NON-DESTRUCTIVE, login-only OIDC smoke: it does not upload, share, download, or restore a
 * key, so it needs no encryption-key code and no key-provisioned test user -- any TB Pro OIDC
 * user works. A red run leaves the freight unverified and blocks promotion.
 *
 * Requires TB_SEND_BASE_URL (deployed host, trailing slash), TB_SEND_TARGET_ENV (non-`dev` so
 * the OIDC path is taken), and TBPRO_USERNAME / TBPRO_PASSWORD (read via const/const.js).
 */
test.describe('deployment analysis on desktop', () => {
  test('signs in via OIDC and reaches the authenticated Send app', {
    tag: [PLAYWRIGHT_TAG_DEPLOYMENT_ANALYSIS],
  }, async ({ page }) => {
    for (const key of ['TB_SEND_BASE_URL', 'TBPRO_USERNAME', 'TBPRO_PASSWORD']) {
      expect(process.env[key], `${key} must be set for the deployment-analysis gate`).toBeTruthy();
    }

    await signInOnly(page);
  });
});
