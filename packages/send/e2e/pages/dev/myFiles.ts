import { expect } from "@playwright/test";
import { fileLocators } from "./locators";
import { PlaywrightProps } from "../../tests/desktop/dev/send.spec";
import {
  clickAndWaitForIdleBuilder,
  create_incognito_context,
  downloadFirstFile,
  dragAndDropFile,
  playwrightConfig,
  requireShareLink,
  saveClipboardItem,
} from "../../utils/dev/testUtils";

const { password, timeout, fileLinks } = playwrightConfig;

export async function upload_workflow({ page }: PlaywrightProps) {
  const { folderRowSelector, folderRowTestID, fileCountID, uploadButton, dropZone, tableCellID, passwordInput } =
    fileLocators(page);

  const clickAndWait = await clickAndWaitForIdleBuilder(page);

  const profileButton = page.getByTestId("navlink-encrypted-files");
  await page.waitForSelector(folderRowSelector);
  await profileButton.click();

  // Select folder
  let folder = page.getByTestId(folderRowTestID);
  await folder.click();

  // Open folder page
  folder = page.getByTestId(folderRowTestID);
  await folder.dblclick();
  await page.waitForLoadState("networkidle");

  // Find upload box and upload the file
  expect(await dropZone.textContent({ timeout })).toContain("files here or tap to upload");
  await dragAndDropFile(page, "#drop-zone", "../../test-files/test.png", "test.png");
  await uploadButton.click();
  // wait for network idle
  await page.waitForLoadState("networkidle");
  await page.waitForSelector(tableCellID);

  // Check if the file count has updated
  expect(await page.getByTestId(fileCountID).textContent()).toBe("1");

  // FILE SHARE LINKS

  // Click on the file to generate a share link
  const fileCell = page.getByTestId("file-0");
  await clickAndWait(fileCell);

  // Generate a share link for the file
  const shareLinkButton = page.getByTestId("create-share-link");
  await shareLinkButton.click();
  // await clickAndWait(shareLinkButton);

  expect(await page.getByTestId("link-0").inputValue()).toContain("/share/");
  await saveClipboardItem(page, "file-no-password");
  // let handle = await page.evaluateHandle(() => navigator.clipboard.readText());
  // let clipboardContent = await handle.jsonValue();
  // fileLinks.push(clipboardContent);

  // Create a share link with password
  await passwordInput.fill(password);
  await clickAndWait(shareLinkButton);
  expect(await page.getByTestId("link-1").inputValue()).toContain("/share/");
  await saveClipboardItem(page, "file-with-password");
  // handle = await page.evaluateHandle(() => navigator.clipboard.readText());
  // clipboardContent = await handle.jsonValue();
  // fileLinks.push(clipboardContent);

  // Create a third share link without password
  await clickAndWait(shareLinkButton);
  expect(await page.getByTestId("link-2").inputValue()).toContain("/share/");

  // Remove the newly created link
  await page.getByTestId("delete-link-button-2").click({ force: true });
  await page.waitForLoadState("networkidle");

  // Wait for the link to be removed and the api is called to update the links
  let linksResponse = page.waitForResponse((response) => response.request().url().includes("/links?type=file"));
  await linksResponse;
}

export async function share_links({ page, context }: PlaywrightProps) {
  const {
    folderRowSelector,
    folderRowTestID,
    createdShareLinkWithPassword,
    sharelinkButton,
    linkWithPasswordID,
    passwordInput,
    firstLink,
  } = fileLocators(page);
  const clickAndWait = await clickAndWaitForIdleBuilder(page);

  const profileButton = page.getByTestId("navlink-encrypted-files");
  await page.waitForSelector(folderRowSelector);
  await clickAndWait(profileButton);

  // Select folder
  let folder = page.getByTestId(folderRowTestID);
  await clickAndWait(folder);

  let linksResponse = page.waitForResponse((response) => response.request().url().includes("/links"));

  // Create share link without password
  await clickAndWait(sharelinkButton);
  await linksResponse;
  await page.waitForLoadState("networkidle");

  expect(await firstLink.inputValue()).toContain("/share/");
  await saveClipboardItem(page, "folder-no-password");

  linksResponse = page.waitForResponse((response) => response.request().url().includes("/links"));

  // Create share link with password
  await passwordInput.fill(password);
  await clickAndWait(sharelinkButton);
  await linksResponse;
  await page.waitForLoadState("networkidle");
  await saveClipboardItem(page, "folder-with-password");

  // Wait for the password badge to be visible and check its content
  await createdShareLinkWithPassword.waitFor({ state: "visible" });
  const passwordBadge = createdShareLinkWithPassword.getByTestId(linkWithPasswordID);
  await passwordBadge.waitFor({ state: "visible" });
  expect(await passwordBadge.textContent()).toContain("Password");

  // Create a third share link without password
  await clickAndWait(sharelinkButton);
  expect(await page.getByTestId("link-2").inputValue()).toContain("/share/");

  // Remove the newly created link
  await page.getByTestId("delete-link-button-2").click({ force: true });
  await page.waitForLoadState("networkidle");

  // Wait for the link to be removed and the api is called to update the links
  linksResponse = page.waitForResponse((response) => response.request().url().includes("/links"));
  await linksResponse;
}

// Pixel-class viewport, below Tailwind's `md` breakpoint — the width the #986
// review used to find the bug this guards.
const MOBILE_VIEWPORT = { width: 412, height: 915 };

// Below `md` the info panel is a full-screen overlay (#977). vue-final-modal
// teleports its modals to <body> with an inline z-index of its own, which used
// to land *under* that overlay: the panel's delete button opened a confirmation
// painted behind the opaque panel, so on a phone it looked completely inert
// while working fine on desktop. Note that asserting visibility is not enough —
// `toBeVisible()` passes for a modal that is painted behind something else — so
// this drives the confirmation by actually clicking it. Cancelling rather than
// confirming keeps the uploaded file around for the delete step that follows.
export async function mobile_info_panel_modal({ page }: PlaywrightProps) {
  const { folderRowTestID } = fileLocators(page);

  // Enter the folder while still at desktop width: below `md` a single click
  // opens the info panel over the table, so the row's dblclick-to-open doesn't
  // survive the reflow.
  await page.getByTestId(folderRowTestID).dblclick();
  await page.waitForLoadState("networkidle");

  await page.setViewportSize(MOBILE_VIEWPORT);

  await page.getByTestId("file-0").click();
  const panelDelete = page.getByTestId("delete-file-info");
  await expect(panelDelete).toBeVisible();
  await panelDelete.click();

  // If the confirmation regresses behind the panel, this click times out
  // because the panel intercepts pointer events at that position.
  const modal = page.getByTestId("delete-modal");
  await modal.getByText("Cancel").click();

  await expect(modal).toHaveCount(0);
  await expect(page.getByTestId("file-0")).toBeVisible();
}

export async function download_workflow({ page, context }: PlaywrightProps) {
  const { submitButtonID, passwordInputID } = fileLocators(page);

  // // Store URLs before using them
  // const [regularUrl, passwordUrl] = [shareLinks[0], shareLinks[1]];

  // // Store URLs before using them
  // const [noPasswordFileUrl, filePasswordUrl] = [fileLinks[0], fileLinks[1]];

  // Regular window downloads
  let otherPage = await context.newPage();
  await otherPage.goto(requireShareLink("folder-no-password"));
  await otherPage.waitForLoadState("networkidle");
  await downloadFirstFile(otherPage);
  await otherPage.close();

  otherPage = await context.newPage();
  await otherPage.goto(requireShareLink("folder-with-password"));
  await otherPage.waitForLoadState("networkidle");
  await otherPage.getByTestId(passwordInputID).fill(password);
  await otherPage.getByTestId(submitButtonID).click();
  await otherPage.waitForLoadState("networkidle");
  await downloadFirstFile(otherPage);
  await otherPage.close();

  // Incognito window downloads
  const browser = context.browser();
  if (!browser) {
    throw new Error("Browser context is not available");
  }

  try {
    // Create a new incognito context
    const incognitoContext = await create_incognito_context(browser);

    // Download share link (folder) without password
    otherPage = await incognitoContext.newPage();
    await otherPage.goto(requireShareLink("folder-no-password"));
    await otherPage.waitForLoadState("networkidle");
    await downloadFirstFile(otherPage);
    await otherPage.close();

    // Download share link (folder) with password
    otherPage = await incognitoContext.newPage();
    await otherPage.goto(requireShareLink("folder-with-password"));
    await otherPage.waitForLoadState("networkidle");
    await otherPage.getByTestId(passwordInputID).fill(password);
    await otherPage.getByTestId(submitButtonID).click();
    await otherPage.waitForLoadState("networkidle");
    await downloadFirstFile(otherPage);
    await otherPage.close();

    // Download individual file without password
    otherPage = await incognitoContext.newPage();
    await otherPage.goto(requireShareLink("file-no-password"));
    await otherPage.waitForLoadState("networkidle");
    await downloadFirstFile(otherPage);
    await otherPage.close();

    // Download individual file with password
    otherPage = await incognitoContext.newPage();
    await otherPage.goto(requireShareLink("file-with-password"));
    await otherPage.waitForLoadState("networkidle");
    await otherPage.getByTestId(passwordInputID).fill(password);
    await otherPage.getByTestId(submitButtonID).click();
    await otherPage.waitForLoadState("networkidle");
    await downloadFirstFile(otherPage);
    await otherPage.close();

    await incognitoContext.close();
  } catch (error) {
    console.error("Error in incognito testing:", error);
    throw error;
  }
}

export async function delete_file({ page }: PlaywrightProps) {
  const { folderRowTestID, fileCountID, deleteFileButton, homeButton } = fileLocators(page);
  const { shareLinks } = playwrightConfig;
  const clickAndWait = await clickAndWaitForIdleBuilder(page);
  const { submitButtonID, passwordInputID } = fileLocators(page);
  let folder = page.getByTestId(folderRowTestID);
  // Select folder
  await folder.dblclick();

  // Delete file
  const responsePromise = page.waitForResponse((response) => response.request().method() === "DELETE");
  await deleteFileButton.click({ force: true });

  // Click the confirmation button in the modal
  await page.getByText("Yes, Delete").click();

  // Wait for DELETE request to complete
  await responsePromise;

  expect((await responsePromise).status()).toBe(202);
  expect(await page.getByTestId(fileCountID).isVisible()).toBeFalsy();

  // Check that the share links are no longer accessible
  // Folder no password link
  await page.goto(requireShareLink("folder-no-password"));
  await page.waitForLoadState("networkidle");
  expect(await page.getByTestId("not_found").textContent()).toContain("This link is no longer active");

  // Folder with password link
  await page.goto(requireShareLink("folder-with-password"));
  await page.waitForLoadState("networkidle");
  await page.getByTestId(passwordInputID).fill(password);
  await page.getByTestId(submitButtonID).click();
  await page.waitForLoadState("networkidle");
  expect(await page.getByTestId("not_found").textContent()).toContain("This link is no longer active");
}
