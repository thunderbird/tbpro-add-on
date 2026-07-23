import { expect, type Locator, type Page } from '@playwright/test';

import {
  TB_ACCTS_EMAIL,
  TIMEOUT_1_SECOND,
  TIMEOUT_30_SECONDS,
  TIMEOUT_5_SECONDS,
  TIMEOUT_60_SECONDS,
} from '../const/const';
import {
  dragAndDropUploadFile,
  type UploadFixture,
} from '../utils/upload-files';

export class EncryptedFilesPage {
  readonly page: Page;
  readonly sendHdrLogoLink: Locator;
  readonly signedInUsername: Locator;
  readonly yourFilesHeading: Locator;
  readonly userAvatar: Locator;
  readonly userAvatarMenuBtn: Locator;
  readonly userMenuButton: Locator;
  readonly uploadDropZone: Locator;
  readonly dropZone: Locator;
  readonly uploadButton: Locator;
  readonly noFilesMessage: Locator;
  readonly fileListRows: Locator;
  readonly fileListTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sendHdrLogoLink = this.page.locator('header img[alt="Send"]');
    this.signedInUsername = this.page.locator('#send-page main > header span');
    this.yourFilesHeading = this.page.getByRole('heading', { name: 'Your Files' });
    this.userAvatar = this.page.getByTestId('avatar-default');
    this.userAvatarMenuBtn = this.page.locator('aside.avatar.regular');
    this.userMenuButton = this.page.locator('button.user-menu');
    this.uploadDropZone = this.page.getByRole('button', {
      name: 'Drag and drop files here to upload, or click to select files',
    });
    this.dropZone = this.page.getByTestId('drop-zone');
    this.uploadButton = this.page.getByTestId('upload-button');
    this.noFilesMessage = this.page.getByText('No files', { exact: true });
    this.fileListRows = this.page.locator(
      '[data-testid="folder-row"], tr[data-testid^="file-"]'
    );
    this.fileListTable = this.page.locator('table');
  }

  async expectVisible() {
    await expect(this.yourFilesHeading).toBeVisible();
  }

  async expectBasicUiVisible() {
    await expect(this.sendHdrLogoLink).toBeVisible();
    await expect(this.signedInUsername).toHaveText(TB_ACCTS_EMAIL, {
      timeout: TIMEOUT_30_SECONDS,
    });
    await expect(this.yourFilesHeading).toBeVisible();
    await this.expectUserMenuVisible();
    await expect(this.uploadDropZone).toBeVisible();
    await this.expectEmptyOrPopulatedFileState();
  }

  async expectUserMenuVisible() {
    const avatarLocators = [
      this.userAvatar,
      this.userAvatarMenuBtn,
      this.userMenuButton,
    ];

    for (const avatarLocator of avatarLocators) {
      try {
        const locator = avatarLocator.first();
        if ((await locator.count()) === 0) {
          continue;
        }

        await expect(locator).toBeVisible({ timeout: TIMEOUT_5_SECONDS });
        return;
      } catch {
        // The avatar markup comes from services-ui and can differ by platform.
      }
    }

    throw new Error('Unable to find any known user menu avatar locator');
  }

  async expectEmptyOrPopulatedFileState() {
    await expect
      .poll(
        async () =>
          (await this.noFilesMessage.isVisible()) ||
          (await this.fileListRows.first().isVisible()),
        { timeout: TIMEOUT_30_SECONDS }
      )
      .toBe(true);

    if (await this.noFilesMessage.isVisible()) {
      return;
    }

    await expect(this.fileListTable).toBeVisible();
    await expect(this.fileListRows.first()).toBeVisible();
  }

  async uploadFileWithFilePicker(uploadFixture: UploadFixture) {
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await expect(this.dropZone).toBeVisible();
    await this.dropZone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(uploadFixture.filePath);

    await this.uploadSelectedFileAndExpectVisible(uploadFixture.fileName);
  }

  async uploadFileWithDragAndDrop(uploadFixture: UploadFixture) {
    await expect(this.dropZone).toBeVisible();
    await dragAndDropUploadFile(this.page, '[data-testid="drop-zone"]', uploadFixture);

    await this.uploadSelectedFileAndExpectVisible(uploadFixture.fileName);
  }

  async uploadSelectedFileAndExpectVisible(fileName: string) {
    await expect(this.page.getByText(fileName, { exact: true }).first()).toBeVisible();
    await expect(this.uploadButton).toBeVisible();
    await expect(this.uploadButton).toBeEnabled();
    await this.uploadButton.click();

    await expect(this.completedUploadListItem(fileName)).toBeVisible({
      timeout: TIMEOUT_60_SECONDS,
    });
    await expect(this.fileRow(fileName)).toBeVisible({
      timeout: TIMEOUT_60_SECONDS,
    });
  }

  async downloadFileAndExpectDownload(fileName: string) {
    const fileRow = this.fileRow(fileName);

    await expect(fileRow).toBeVisible();
    await fileRow.scrollIntoViewIfNeeded();
    await fileRow.click({ force: true });
    await fileRow.getByRole('button').first().click({ force: true });

    await this.page.waitForTimeout(TIMEOUT_1_SECOND); // mostly so captured on browserstack video
    await expect(this.page.getByRole('heading', { name: 'Before you download' })).toBeVisible();

    const downloadPromise = this.page.waitForEvent('download');
    await this.page.getByTestId('confirm-download').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(fileName);
  }

  async downloadFileFromInfoPanelAndExpectDownload(fileName: string) {
    const fileRow = this.fileRow(fileName);

    await expect(fileRow).toBeVisible();
    await fileRow.scrollIntoViewIfNeeded();
    await fileRow.click({ force: true });

    const fileInfoPanel = this.page.locator('#send-page > aside').last();
    await expect(fileInfoPanel.getByText(fileName, { exact: true })).toBeVisible({
      timeout: TIMEOUT_30_SECONDS,
    });

    const downloadPromise = this.page.waitForEvent('download');
    await fileInfoPanel.locator('footer button svg').last().click({ force: true });
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(fileName);
  }

  async deleteUploadedFiles(fileNames: string[]) {
    for (const fileName of fileNames) {
      await this.deleteUploadedFileIfVisible(fileName);
    }
  }

  async deleteUploadedFileIfVisible(fileName: string) {
    const fileRow = this.fileRow(fileName);

    if (!(await fileRow.isVisible())) {
      return;
    }

    await fileRow.scrollIntoViewIfNeeded();
    await fileRow.getByTestId('delete-file').click({ force: true });

    await this.page.waitForTimeout(TIMEOUT_1_SECOND); // mostly so captured on browserstack video
    const deleteModal = this.page.getByTestId('delete-modal');
    await expect(deleteModal).toBeVisible();
    const confirmDeleteButton = deleteModal.getByRole('button', { name: 'Yes, Delete' });
    await expect(confirmDeleteButton).toBeVisible();
    await expect(confirmDeleteButton).toBeEnabled();
    await confirmDeleteButton.click();

    await expect(fileRow).not.toBeVisible({ timeout: TIMEOUT_60_SECONDS });
  }

  completedUploadListItem(fileName: string) {
    return this.page.getByRole('listitem', {
      name: new RegExp(`^Completed upload: ${this.escapeRegExp(fileName)},`),
    });
  }

  fileRow(fileName: string) {
    return this.page.locator('tbody tr').filter({ hasText: fileName });
  }

  escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
