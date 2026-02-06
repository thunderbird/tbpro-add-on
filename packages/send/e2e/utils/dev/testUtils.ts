import {
  Browser,
  BrowserContext,
  expect,
  firefox,
  Locator,
  Page,
} from "@playwright/test";
import { readFileSync } from "fs";

import { fileLocators } from "../../pages/dev/locators";
import { emptystatePath, storageStatePath } from "../../tests/desktop/dev/send.spec";
import path from "path";

const sharelinks = {
  "file-no-password": null,
  "file-with-password": null,
  "folder-no-password": null,
  "folder-with-password": null,
} as Record<string, string | null>;

export const playwrightConfig = {
  password: `qghp392784rq3rgqp329r@$`,
  email: `myemail${Date.now()}@tb.pro`,
  timeout: 3_000,
  shareLinks: sharelinks,
  passphrase: "" as string,
  recoveredPassphrase: "" as string,
  fileLinks: [] as string[],
};

export async function downloadFirstFile(page: Page) {
  const { downloadButton, confirmDownload } = fileLocators(page);
  await downloadButton.click();
  await confirmDownload.click();
  await page.waitForEvent("download");
  page.on("download", async (download) => {
    expect(download.suggestedFilename()).toBe("test.png");
  });
}

export async function saveClipboardItem(page: Page, key: string) {
  // wait a second to avoid a copy clipboard read operation err
  await page.waitForTimeout(1000);
  const handle = await page.evaluateHandle(() =>
    navigator.clipboard.readText()
  );
  const clipboardContent = await handle.jsonValue();
  playwrightConfig.shareLinks[key] = clipboardContent;
  console.log(
    `Saved clipboard content for ${key}: `,
    playwrightConfig.shareLinks
  );
  console.log("data:", playwrightConfig.password);
  // playwrightConfig.shareLinks;
}

async function clickAndWaitForIdle(page: Page, locator: Locator) {
  await Promise.all([locator.click(), page.waitForLoadState("networkidle")]);
}

export async function clickAndWaitForIdleBuilder(page: Page) {
  return async (locator: Locator) => clickAndWaitForIdle(page, locator);
}

export async function setup_browser({
  usesEmptyStorage = false,
}: {
  usesEmptyStorage?: boolean;
} = {}) {
  const browser = await firefox.launch();

  // Base context options
  const contextOptions = {
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
    serviceWorkers: "block" as const,
    bypassCSP: true,
  };

  // Create main context with storage state
  const context = await browser.newContext({
    ...contextOptions,
    storageState: usesEmptyStorage ? emptystatePath : storageStatePath,
  });

  const page = await context.newPage();

  return { context, page };
}

export async function create_incognito_context(browser: Browser) {
  // Create incognito context with clean state
  const incognitoContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
    serviceWorkers: "block" as const,
    bypassCSP: true,
    // Start with a clean state
    storageState: {
      cookies: [],
      origins: [],
    },
  });

  return incognitoContext;
}

export const dragAndDropFile = async (
  page: Page,
  selector: string,
  filePath: string,
  fileName: string,
  fileType = ""
) => {
  // print current path
  console.log("current path: ", __dirname);
  const testFile = path.resolve(__dirname, filePath);
  console.log("test file path: ", testFile);

  const buffer = readFileSync(testFile).toString("base64");

  const dataTransfer = await page.evaluateHandle(
    async ({ bufferData, localFileName, localFileType }) => {
      const dt = new DataTransfer();

      const blobData = await fetch(bufferData).then((res) => res.blob());

      const file = new File([blobData], localFileName, { type: localFileType });
      dt.items.add(file);
      return dt;
    },
    {
      bufferData: `data:application/octet-stream;base64,${buffer}`,
      localFileName: fileName,
      localFileType: fileType,
    }
  );

  await page.dispatchEvent(selector, "drop", { dataTransfer });
};

export async function saveStorage(context: BrowserContext) {
  const storageStatePath = path.resolve(
    __dirname,
    "../../data/lockboxstate.json"
  );

  await context.storageState({
    path: storageStatePath,
  });
}
