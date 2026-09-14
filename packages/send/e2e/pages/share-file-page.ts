import { expect, type Page } from '@playwright/test';

import { TIMEOUT_30_SECONDS, TIMEOUT_60_SECONDS } from '../const/const';
import {
  expectDownloadMatchesFixture,
  expectGeneratedDownloadIsTriggered,
} from '../utils/download-files';
import { type UploadFixture } from '../utils/upload-files';

export class ShareFilePage {
  constructor(readonly page: Page) {}

  async expectPasswordFormVisible() {
    await expect(
      this.page.getByRole('heading', {
        name: 'Your file is ready to download securely',
        exact: true,
      })
    ).toBeVisible({ timeout: TIMEOUT_30_SECONDS });
    await expect(this.page.getByTestId('password-input')).toBeVisible();
    await expect(this.page.getByTestId('submit-button')).toBeVisible();
  }

  async submitPassword(password: string) {
    await this.page.getByTestId('password-input').fill(password);
    await this.page.getByTestId('submit-button').click();
  }

  async expectAccessDenied(message: string) {
    await expect(this.page.getByText(message, { exact: true })).toBeVisible({
      timeout: TIMEOUT_30_SECONDS,
    });
    await this.expectPasswordFormVisible();
    await expect(
      this.page.getByRole('heading', {
        name: 'FILE INFORMATION',
        exact: true,
      })
    ).toHaveCount(0);
    await expect(
      this.page.getByRole('button', { name: 'Download', exact: true })
    ).toHaveCount(0);
  }

  async expectFileInformationVisible(fileName: string) {
    await expect(
      this.page.getByRole('heading', {
        name: 'FILE INFORMATION',
        exact: true,
      })
    ).toBeVisible({ timeout: TIMEOUT_30_SECONDS });
    await expect(
      this.page.getByText('This password is incorrect', { exact: true })
    ).toHaveCount(0);
    await expect(this.page.getByTestId('password-input')).toHaveCount(0);
    await expect(this.page.getByText(fileName, { exact: true })).toBeVisible();
    await expect(this.page.getByTestId('download-button-0')).toBeVisible();
  }

  async downloadAndExpectDownload(
    fixture: UploadFixture,
    isBrowserStackAndroid: boolean
  ) {
    await this.page.getByTestId('download-button-0').click();
    await expect(
      this.page.getByRole('heading', {
        name: 'Before you download',
        exact: true,
      })
    ).toBeVisible();
    const confirm = this.page.getByTestId('confirm-download');
    if (isBrowserStackAndroid) {
      await expectGeneratedDownloadIsTriggered(this.page, confirm);
    } else {
      const [download] = await Promise.all([
        this.page.waitForEvent('download', { timeout: TIMEOUT_60_SECONDS }),
        confirm.click(),
      ]);
      await expectDownloadMatchesFixture(download, fixture);
    }
  }
}
