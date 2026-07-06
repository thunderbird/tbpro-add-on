import { type Page, type TestInfo } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const TEST_PNG_FILE = path.resolve(__dirname, '../test-files/test.png');

export type UploadFixture = {
  fileName: string;
  filePath: string;
};

export function createUniquePngUploadFixture(
  testInfo: TestInfo,
  uploadMethod: 'file-picker' | 'drag-drop'
): UploadFixture {
  // Keep the tracked test.png fixture immutable. Each upload uses a runtime
  // copy with a unique name so assertions never depend on pre-existing files.
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const randomId = Math.random().toString(36).slice(2, 8);
  const fileName = `e2e-test-${uploadMethod}-${timestamp}-${randomId}.png`;
  const filePath = testInfo.outputPath('upload-fixtures', fileName);

  mkdirSync(path.dirname(filePath), { recursive: true });
  copyFileSync(TEST_PNG_FILE, filePath);

  return { fileName, filePath };
}

export async function dragAndDropUploadFile(
  page: Page,
  selector: string,
  uploadFixture: UploadFixture
) {
  // Playwright cannot use the native file chooser for drag/drop, so build the
  // same DataTransfer payload that the browser would provide during a drop.
  const buffer = readFileSync(uploadFixture.filePath).toString('base64');
  const dataTransfer = await page.evaluateHandle(
    ({ bufferData, fileName }) => {
      const dt = new DataTransfer();
      const binary = window.atob(bufferData);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
      }

      const file = new File([bytes], fileName, { type: 'image/png' });

      dt.items.add(file);
      return dt;
    },
    {
      bufferData: buffer,
      fileName: uploadFixture.fileName,
    }
  );

  await page.dispatchEvent(selector, 'drop', { dataTransfer });
  await dataTransfer.dispose();
}
