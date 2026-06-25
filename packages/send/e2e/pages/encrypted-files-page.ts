import { expect, type Locator, type Page } from '@playwright/test';

export class EncryptedFilesPage {
  readonly page: Page;
  readonly yourFilesHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.yourFilesHeading = this.page.getByRole('heading', { name: 'Your Files' });
  }

  async expectVisible() {
    await expect(this.yourFilesHeading).toBeVisible();
  }
}
