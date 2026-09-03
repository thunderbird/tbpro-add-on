import { expect, type Download, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buffer } from 'node:stream/consumers';

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
    // The username is the header's direct-child span. Restricting this to a
    // direct child avoids matching implementation-detail spans inside adjacent
    // header controls, which causes Playwright strict-mode failures.
    this.signedInUsername = this.page.locator('#send-page main > header > span');
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

  async downloadFileAndExpectDownload(uploadFixture: UploadFixture) {
    const fileRow = this.fileRow(uploadFixture.fileName);

    await expect(fileRow).toBeVisible();
    await fileRow.scrollIntoViewIfNeeded();
    await fileRow.click({ force: true });
    await fileRow.getByRole('button').first().click({ force: true });

    await this.page.waitForTimeout(TIMEOUT_1_SECOND); // mostly so captured on browserstack video
    await expect(this.page.getByRole('heading', { name: 'Before you download' })).toBeVisible();

    const downloadPromise = this.page.waitForEvent('download');
    await this.page.getByTestId('confirm-download').click();

    await this.expectDownloadMatchesFixture(await downloadPromise, uploadFixture);
  }

  /**
   * The bytes are the point. Checking only the file name passes on a download
   * that came back short, reordered, or still encrypted.
   *
   * The fixture is 1.3 MB and the frontend's split size is 500 MB, so this is a
   * single-part round trip. Multipart reassembly is not covered anywhere in the
   * e2e suite -- see the follow-up on the bucket job's split-size override.
   */
  private async expectDownloadMatchesFixture(download: Download, uploadFixture: UploadFixture) {
    expect(download.suggestedFilename()).toBe(uploadFixture.fileName);

    // `path()` throws when the browser is remote, which every nightly run is
    // ("Path is not available when connecting remotely"). `createReadStream()`
    // streams the bytes back to the runner instead and works either way.
    const downloaded = await buffer(await download.createReadStream());
    const expected = readFileSync(uploadFixture.filePath);
    // Length first, then digest: "expected 1331200 to be 1391309" says truncated,
    // where a bare buffer comparison only ever says "expected false to be true".
    expect(downloaded.byteLength).toBe(expected.byteLength);
    expect(createHash('sha256').update(downloaded).digest('hex')).toBe(
      createHash('sha256').update(expected).digest('hex')
    );
  }

  async downloadFileFromInfoPanelAndExpectDownload(
    uploadFixture: UploadFixture,
    useBrowserStackAndroidSignal = false
  ) {
    const { fileName } = uploadFixture;
    const fileRow = this.fileRow(fileName);

    await expect(fileRow).toBeVisible();
    // MOBILE PATH: the upload area is fixed to the bottom of narrow viewports.
    // Playwright's scrollIntoViewIfNeeded() treats a row behind that overlay as
    // visible, so always move it to the unobscured center before tapping it.
    await this.scrollFileRowClearOfUploadBar(fileRow);
    // Do not force this click. If the upload area still covers the row, a normal
    // click reports the overlap instead of opening the native file chooser.
    await fileRow.click();

    const fileInfoPanel = this.fileInfoPanel();
    await expect(fileInfoPanel.getByText(fileName, { exact: true })).toBeVisible({
      timeout: TIMEOUT_30_SECONDS,
    });

    // The deployed app does not expose a test ID or accessible name for this
    // control. Download is the first footer icon and Delete is the last, so
    // target the first SVG; its click handler starts the download directly.
    const downloadButton = fileInfoPanel.locator('footer button svg').first();
    await expect(downloadButton).toBeVisible();

    if (useBrowserStackAndroidSignal) {
      // BROWSERSTACK ANDROID PATH: real Android Chrome downloads the file, but
      // BrowserStack does not forward that device download as Playwright's
      // `download` event. Android's native "File downloaded" notification is
      // outside the web page and cannot be located by Playwright, so observe
      // Send clicking its generated <a download> link instead. That is the
      // page-side action which immediately hands the file to Android Chrome.
      await this.expectGeneratedDownloadIsTriggered(downloadButton);
    } else {
      // PIXEL VIEWPORT PATH: the emulated browser reports Playwright download
      // events normally. Send must first fetch and decrypt the complete file,
      // so allow longer than the suite's 10-second action timeout.
      // Register the listener before the single click; clicking twice would
      // start duplicate downloads and hide a real application failure.
      const [download] = await Promise.all([
        this.page.waitForEvent('download', { timeout: TIMEOUT_60_SECONDS }),
        downloadButton.click(),
      ]);

      await this.expectDownloadMatchesFixture(download, uploadFixture);
    }

    // The mobile info panel is a full-screen overlay. Close it after the
    // download so the file list is available to the cleanup path below.
    await fileInfoPanel.getByTestId('close-file-info').click();
    await expect(fileInfoPanel).not.toBeVisible();
  }

  async deleteUploadedFiles(fileNames: string[], useInfoPanel = false) {
    for (const fileName of fileNames) {
      if (useInfoPanel) {
        // MOBILE PATH: row action buttons are intentionally not rendered on
        // narrow viewports, so delete from the full-screen file info panel.
        await this.deleteUploadedFileFromInfoPanelIfVisible(fileName);
      } else {
        // DESKTOP PATH: retain the existing direct row-action workflow.
        await this.deleteUploadedFileIfVisible(fileName);
      }
    }
  }

  async deleteUploadedFileIfVisible(fileName: string) {
    const fileRow = this.fileRow(fileName);

    if (!(await fileRow.isVisible())) {
      return;
    }

    await fileRow.scrollIntoViewIfNeeded();
    await fileRow.getByTestId('delete-file').click({ force: true });

    await this.confirmFileDeletion(fileRow);
  }

  async deleteUploadedFileFromInfoPanelIfVisible(fileName: string) {
    const fileRow = this.fileRow(fileName);

    // Cleanup may begin after a failed assertion left another file's mobile
    // info panel open. Dismiss it first so it cannot intercept the row click.
    const openFileInfoPanel = this.fileInfoPanel();
    if (await openFileInfoPanel.isVisible()) {
      await openFileInfoPanel.getByTestId('close-file-info').click();
      await expect(openFileInfoPanel).not.toBeVisible();
    }

    if (!(await fileRow.isVisible())) {
      return;
    }

    // MOBILE PATH: explicitly position the row above the fixed upload area,
    // then open the info panel where mobile file actions are exposed.
    await this.scrollFileRowClearOfUploadBar(fileRow);
    await fileRow.click();

    const fileInfoPanel = this.fileInfoPanel();
    await expect(fileInfoPanel.getByText(fileName, { exact: true })).toBeVisible({
      timeout: TIMEOUT_30_SECONDS,
    });
    await fileInfoPanel.getByTestId('delete-file-info').click();

    await this.confirmFileDeletion(fileRow);
  }

  private async confirmFileDeletion(fileRow: Locator) {
    await this.page.waitForTimeout(TIMEOUT_1_SECOND); // mostly so captured on browserstack video
    const deleteModal = this.page.getByTestId('delete-modal');
    await expect(deleteModal).toBeVisible();
    const confirmDeleteButton = deleteModal.getByRole('button', { name: 'Yes, Delete' });
    await expect(confirmDeleteButton).toBeVisible();
    await expect(confirmDeleteButton).toBeEnabled();
    await confirmDeleteButton.click();

    await expect(fileRow).not.toBeVisible({ timeout: TIMEOUT_60_SECONDS });
  }

  private async scrollFileRowClearOfUploadBar(fileRow: Locator) {
    // The mobile upload bar is fixed and therefore does not affect whether
    // Playwright considers the row in the viewport. scrollIntoViewIfNeeded()
    // can consequently do nothing while the bar still intercepts the click.
    // The page reserves bottom padding equal to the bar's measured height, so
    // explicitly centering the row moves it into the usable part of the screen.
    await fileRow.evaluate((element) => {
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    await expect(fileRow).toBeVisible();
  }

  private async expectGeneratedDownloadIsTriggered(downloadButton: Locator) {
    // Send downloads and decrypts the file before creating a blob URL and
    // programmatically clicking a temporary <a download> element. Install this
    // test-only hook before the user-facing click so the BrowserStack Android
    // path can observe that final handoff even though the native browser message
    // and Playwright Download object are unavailable to the page. The original
    // anchor click still runs, so Android downloads the file normally.
    await this.page.evaluate(() => {
      const captureWindow = window as typeof window & {
        __tbSendE2EDownloadTriggered?: boolean;
      };
      const originalClick = HTMLAnchorElement.prototype.click;
      captureWindow.__tbSendE2EDownloadTriggered = false;

      HTMLAnchorElement.prototype.click = function () {
        if (this.download && this.href.startsWith('blob:')) {
          captureWindow.__tbSendE2EDownloadTriggered = true;

          // Restore immediately after intercepting Send's generated link so the
          // hook cannot affect any later anchor interactions in this test.
          HTMLAnchorElement.prototype.click = originalClick;
        }

        return originalClick.call(this);
      };
    });

    await downloadButton.click();

    await expect
      .poll(
        () =>
          this.page.evaluate(() => {
            const captureWindow = window as typeof window & {
              __tbSendE2EDownloadTriggered?: boolean;
            };
            return captureWindow.__tbSendE2EDownloadTriggered;
          }),
        { timeout: TIMEOUT_60_SECONDS }
      )
      .toBe(true);
  }

  private fileInfoPanel() {
    // Select by panel content instead of using `#send-page > aside:last-child`.
    // Once the mobile panel closes, the upload bar becomes the last aside and a
    // dynamic `.last()` locator would unexpectedly start pointing at that bar.
    return this.page.locator('#send-page > aside').filter({
      has: this.page.getByTestId('close-file-info'),
    });
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
