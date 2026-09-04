import {
  Browser,
  BrowserContext,
  expect,
  Locator,
  Page,
} from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "fs";

import { fileLocators } from "../../pages/dev/locators";
import { credentialsPath, storageStatePath } from "./paths";
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
  shareLinks: sharelinks,
  passphrase: "" as string,
  recoveredPassphrase: "" as string,
};

/**
 * Every share link this run has read out of the clipboard. The clipboard keeps the
 * previous link until the app overwrites it, so "a link we have not seen" is how
 * `readNewShareLink` knows the copy for the click it just made has landed.
 */
const seenShareLinks = new Set<string>();

/**
 * Persist the registered account's identity so it survives worker restarts.
 * Playwright replaces the worker process after any test failure; the fresh
 * worker re-evaluates this module and would otherwise mint a NEW Date.now()
 * email — orphaning the account register_and_login created and cascading
 * "Incorrect email or password" failures through every remaining test.
 * Called by register_and_login; consumed by the hydration below. The file is
 * deleted by global setup at the start of every run (see global-setup.ts).
 */
export function saveCredentials() {
  writeFileSync(
    credentialsPath,
    JSON.stringify(
      {
        email: playwrightConfig.email,
        password: playwrightConfig.password,
        passphrase: playwrightConfig.passphrase,
      },
      null,
      2
    )
  );
}

// Rehydrate identity in a replacement worker (no-op in the first worker: the
// file only exists once register_and_login has run in this test run).
try {
  if (existsSync(credentialsPath)) {
    const saved = JSON.parse(readFileSync(credentialsPath, "utf8"));
    if (saved?.email) playwrightConfig.email = saved.email;
    if (saved?.password) playwrightConfig.password = saved.password;
    if (saved?.passphrase) playwrightConfig.passphrase = saved.passphrase;
  }
} catch {
  // Corrupt/partial file: fall back to a fresh identity.
}

/**
 * Reset the module-level `shareLinks` singleton back to its empty baseline.
 * Call this at suite start so a failed/aborted run can't leak stale (or null)
 * links into a later run and produce cryptic, misattributed failures (#930).
 */
export function resetShareLinks() {
  for (const key of Object.keys(playwrightConfig.shareLinks)) {
    playwrightConfig.shareLinks[key] = null;
  }
  seenShareLinks.clear();
}

/**
 * Read a share link that an earlier workflow step was supposed to populate.
 * Throws an actionable error instead of letting a `null` reach `page.goto()`,
 * where it surfaces as the opaque `goto: url: expected string, got object`.
 */
export function requireShareLink(key: string): string {
  const link = playwrightConfig.shareLinks[key];
  if (!link) {
    throw new Error(
      `Missing share link for "${key}" — an upstream test step did not populate it. ` +
        `This usually means an earlier workflow (share/upload) failed; check that failure first.`
    );
  }
  return link;
}

export async function downloadFirstFile(page: Page) {
  const { downloadButton, confirmDownload } = fileLocators(page);

  // `FolderTree.vue` renders `not_found` ("This link is no longer active") for any
  // shared container that comes back with no items -- a deleted link and a folder
  // that simply has nothing in it look identical. Assert it is gone rather than
  // clicking blind: same 10s budget, but a failure that names the page instead of
  // the bare `download-button-0` timeout the #930 reports are full of.
  await expect(
    page.getByTestId("not_found"),
    `the shared container rendered as empty: ${page.url()}`
  ).toHaveCount(0);

  // Listen before clicking: the download can start before the second click
  // resolves, and a listener attached afterwards would miss it.
  const downloadStarted = page.waitForEvent("download");
  await downloadButton.click();
  await confirmDownload.click();

  // `dragAndDropFile` hands the app a File with an empty MIME type, so `formatBlob`
  // wraps it in a whole-file zip on upload and stores it as "test.png.zip" -- the
  // name every download in this suite gets back. This assertion used to sit in a
  // `page.on("download")` handler registered *after* the event had already fired,
  // so it never ran, and it named the unzipped file.
  const download = await downloadStarted;
  expect(download.suggestedFilename()).toBe("test.png.zip");
}

const readClipboard = (page: Page) =>
  page.evaluate(() => navigator.clipboard.readText());

/** `https://host/share/<id>` or `.../share/<id>#<secret>` -> `<id>`. */
export const shareLinkId = (shareUrl: string) =>
  shareUrl.split("/share/")[1]?.split("#")[0];

/**
 * Read the share link the app just copied to the clipboard.
 *
 * `CreateAccessLink.vue` fires `clipboard.copy(url)` without awaiting it, so the
 * write lands a beat after the click and the clipboard still holds the previous
 * link until it does. Polling for a link this run has not seen yet is both
 * deterministic and quicker than the fixed one-second sleep it replaces.
 *
 * The clipboard is the source of truth rather than the rendered input: the input
 * can be a beat behind on the `#` fragment that carries the decryption secret for
 * links created without a password.
 */
export async function readNewShareLink(page: Page): Promise<string> {
  let link = "";

  await expect
    .poll(
      async () => {
        const clipboard = await readClipboard(page);
        const isNew =
          clipboard.includes("/share/") && !seenShareLinks.has(clipboard);
        if (isNew) link = clipboard;
        return isNew;
      },
      { message: "clipboard never received a new share link" }
    )
    .toBe(true);

  seenShareLinks.add(link);
  return link;
}

/** Record the link the app just copied so later tests can open it. */
export async function saveShareLink(page: Page, key: string) {
  playwrightConfig.shareLinks[key] = await readNewShareLink(page);
  console.log(`Saved share link for ${key}`);
}

/**
 * The `access-link-item-N` row that shows `shareUrl`.
 *
 * Both list endpoints (`getAccessLinksForContainer` and
 * `getAccessLinksByUploadIdAndWrappedKey`) query with no `orderBy`, so the
 * rendered order does not track creation order: index 2 is not reliably "the link
 * we just made" and index 1 is not reliably "the one created with a password".
 * Picking the row by the link it shows is what keeps the suite off the wrong one.
 *
 * Getting this wrong is the #930 flake, in two shapes: deleting a link a later
 * test still needed, which surfaced three tests later as a `download-button-0`
 * timeout against a dead link, and looking for the password badge on whichever
 * link happened to come back second.
 */
export async function accessLinkRow(page: Page, shareUrl: string) {
  const wanted = shareLinkId(shareUrl);
  const rows = page.locator('[data-testid^="access-link-item-"]');

  // The list refetch is debounced, so the row may not be rendered yet.
  let index = -1;
  await expect
    .poll(
      async () => {
        index = await rows.evaluateAll(
          (elements, id) =>
            elements.findIndex((element) => {
              const input = element.querySelector("input");
              return input?.value.split("/share/")[1]?.split("#")[0] === id;
            }),
          wanted
        );
        return index;
      },
      { message: `the access-link list never showed ${shareUrl}` }
    )
    .toBeGreaterThanOrEqual(0);

  const row = rows.nth(index);
  // The list can refetch between finding the index and using it. Fail here rather
  // than acting on whichever row slid into the slot -- picking the wrong row is
  // the bug this function exists to prevent.
  await expect(row.locator("input")).toHaveValue(new RegExp(wanted));
  return row;
}

/** Delete the access link `shareUrl` points at. */
export async function deleteAccessLink(page: Page, shareUrl: string) {
  const row = await accessLinkRow(page, shareUrl);
  await row.getByTestId(/^delete-link-button-\d+$/).click({ force: true });
}

/**
 * Open a folder row and wait for that folder's subtree to arrive.
 *
 * The dblclick only fires `router.push`. The upload and delete actions that follow
 * target `folderStore.rootFolder`, which becomes this folder only once the folder
 * page's subtree fetch resolves, so that response is the signal. The
 * `waitForLoadState("networkidle")` this replaces was not one: networkidle has
 * already fired for this document, so it returned immediately (see the latching
 * behaviour in playwright-core's frames.js).
 *
 * Getting this wait wrong is the other half of #930: without it the file lands in
 * the account root while the share link "Share links" created points at this
 * folder, and "Download workflow" reports an empty container three tests later.
 */
export async function openFolder(page: Page, folderRow: Locator) {
  const folderPath = await folderRow
    .locator('a[href^="/send/folder/"]')
    .getAttribute("href");
  const folderId = folderPath?.split("/").pop();

  const subtreeLoaded = page.waitForResponse((response) =>
    // `endsWith`, not `includes`: selecting the folder a moment ago also fired
    // `containers/<id>/links`, and that response would satisfy an `includes` check
    // before the subtree this function exists to wait for has arrived.
    new URL(response.url()).pathname.endsWith(`/containers/${folderId}/`)
  );
  await folderRow.dblclick();
  await subtreeLoaded;
}

// Note: the `networkidle` half of this is inert for a click that does not start a
// new document -- Playwright latches the event per document (see `openFolder`), so
// it returns immediately. The waits that do the work are the `waitForResponse`
// gates at the call sites.
async function clickAndWaitForIdle(page: Page, locator: Locator) {
  await Promise.all([locator.click(), page.waitForLoadState("networkidle")]);
}

export async function clickAndWaitForIdleBuilder(page: Page) {
  return async (locator: Locator) => clickAndWaitForIdle(page, locator);
}

/**
 * A context with no cookies and no keys, for opening a share link the way a
 * recipient would. As in utils/dev/fixtures.ts, everything except the storage
 * state comes from the `use` block in playwright.config.dev.ts.
 */
export async function create_incognito_context(browser: Browser) {
  return browser.newContext({ storageState: { cookies: [], origins: [] } });
}

export const dragAndDropFile = async (
  page: Page,
  selector: string,
  filePath: string,
  fileName: string,
  fileType = ""
) => {
  const testFile = path.resolve(__dirname, filePath);
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
  await context.storageState({ path: storageStatePath });
}
