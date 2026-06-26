import { expect, type Page } from '@playwright/test';

import { TB_SEND_SUPPORT_URL } from '../const/const';

const SUPPORT_LINK_LABELS = [
  /^Need help with your account\?/,
  /^Troubleshooting for desktop/,
  /^Learn more about encryption/,
  /^Export your data/,
];

export async function expectSupportLinks(page: Page) {
  for (const label of SUPPORT_LINK_LABELS) {
    const supportLink = page.getByRole('link', { name: label });

    await expect(supportLink).toBeVisible();

    // Some browser/device combinations include a trailing slash.
    const expLinkRegex = new RegExp(`^${TB_SEND_SUPPORT_URL}/?$`);
    await expect(supportLink).toHaveAttribute('href', expLinkRegex);
    await expect(supportLink).toHaveAttribute('target', '_blank');
    await expect(supportLink).toHaveAttribute('rel', /noopener/);
    await expect(supportLink).toHaveAttribute('rel', /noreferrer/);
  }
}
