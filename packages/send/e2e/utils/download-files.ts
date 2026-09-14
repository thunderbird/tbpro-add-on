import { expect, type Download, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buffer } from 'node:stream/consumers';

import { TIMEOUT_60_SECONDS } from '../const/const';
import { type UploadFixture } from './upload-files';

/**
 * The bytes are the point. Checking only the file name passes on a download
 * that came back short, reordered, or still encrypted.
 *
 * The fixture is 1.3 MB and the frontend's split size is 500 MB, so this is a
 * single-part round trip. Multipart reassembly is not covered anywhere in the
 * e2e suite -- see the follow-up on the bucket job's split-size override.
 */
export async function expectDownloadMatchesFixture(
  download: Download,
  uploadFixture: UploadFixture
) {
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

export async function expectGeneratedDownloadIsTriggered(
  page: Page,
  downloadButton: Locator
) {
  // Send downloads and decrypts the file before creating a blob URL and
  // programmatically clicking a temporary <a download> element. Install this
  // test-only hook before the user-facing click so the BrowserStack Android
  // path can observe that final handoff even though the native browser message
  // and Playwright Download object are unavailable to the page. The original
  // anchor click still runs, so Android downloads the file normally.
  await page.evaluate(() => {
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
        page.evaluate(() => {
          const captureWindow = window as typeof window & {
            __tbSendE2EDownloadTriggered?: boolean;
          };
          return captureWindow.__tbSendE2EDownloadTriggered;
        }),
      { timeout: TIMEOUT_60_SECONDS }
    )
    .toBe(true);
}
