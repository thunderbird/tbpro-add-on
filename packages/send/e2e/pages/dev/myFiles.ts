import { expect } from "@playwright/test";
import { fileLocators } from "./locators";
import { PlaywrightProps } from "../../utils/dev/fixtures";
import {
  accessLinkRow,
  clickAndWaitForIdleBuilder,
  create_incognito_context,
  deleteAccessLink,
  downloadFirstFile,
  dragAndDropFile,
  openFolder,
  playwrightConfig,
  readNewShareLink,
  requireShareLink,
  saveShareLink,
} from "../../utils/dev/testUtils";

const { password } = playwrightConfig;

export async function upload_workflow({ page }: PlaywrightProps) {
  const {
    folderRowSelector,
    folderRowTestID,
    fileCountID,
    uploadButton,
    dropZone,
    tableCellID,
    passwordInput,
  } = fileLocators(page);

  const clickAndWait = await clickAndWaitForIdleBuilder(page);

  const profileButton = page.getByTestId("navlink-encrypted-files");
  await page.waitForSelector(folderRowSelector);
  await profileButton.click();

  // Select the folder, then open its page
  const folder = page.getByTestId(folderRowTestID);
  await folder.click();
  await openFolder(page, folder);

  // Find upload box and upload the file
  await expect(dropZone).toContainText("files here or tap to upload");
  await dragAndDropFile(page, "#drop-zone", "../../test-files/test.png", "test.png");
  await uploadButton.click();
  // wait for network idle
  await page.waitForLoadState("networkidle");
  await page.waitForSelector(tableCellID);

  // Check if the file count has updated
  await expect(page.getByTestId(fileCountID)).toHaveText("1");

  // FILE SHARE LINKS

  // Click on the file to generate a share link
  const fileCell = page.getByTestId("file-0");
  await clickAndWait(fileCell);

  // Generate a share link for the file
  const shareLinkButton = page.getByTestId("create-share-link");
  await shareLinkButton.click();

  await expect(page.getByTestId("link-0")).toHaveValue(/\/share\//);
  await saveShareLink(page, "file-no-password");

  // Create a share link with password
  await passwordInput.fill(password);
  await clickAndWait(shareLinkButton);

  await expect(page.getByTestId("link-1")).toHaveValue(/\/share\//);
  await saveShareLink(page, "file-with-password");

  // Create a third share link without password
  await clickAndWait(shareLinkButton);
  const throwawayLink = await readNewShareLink(page);

  // Remove the link we just created. Listen before clicking: deleting a link
  // refetches the list immediately, so a promise created after the click waits
  // for the *next* refetch instead of this one.
  const linksRefreshed = page.waitForResponse((response) =>
    response.request().url().includes("/links?type=file")
  );
  await deleteAccessLink(page, throwawayLink);
  await linksRefreshed;
}

export async function share_links({ page }: PlaywrightProps) {
  const {
    folderRowSelector,
    folderRowTestID,
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
  const folder = page.getByTestId(folderRowTestID);
  await clickAndWait(folder);

  let linksResponse = page.waitForResponse((response) => response.request().url().includes("/links"));

  // Create share link without password
  await clickAndWait(sharelinkButton);
  await linksResponse;
  await page.waitForLoadState("networkidle");

  await expect(firstLink).toHaveValue(/\/share\//);
  await saveShareLink(page, "folder-no-password");

  linksResponse = page.waitForResponse((response) => response.request().url().includes("/links"));

  // Create share link with password
  await passwordInput.fill(password);
  await clickAndWait(sharelinkButton);
  await linksResponse;
  await page.waitForLoadState("networkidle");
  await saveShareLink(page, "folder-with-password");

  // Wait for the password badge to be visible and check its content. The row is
  // found by the link it shows rather than by index -- see accessLinkRow.
  const passwordLinkRow = await accessLinkRow(
    page,
    requireShareLink("folder-with-password")
  );
  const passwordBadge = passwordLinkRow.getByTestId(linkWithPasswordID);
  await expect(passwordBadge).toBeVisible();
  await expect(passwordBadge).toContainText("Password");

  // Create a third share link without password
  await clickAndWait(sharelinkButton);
  const throwawayLink = await readNewShareLink(page);

  // Remove the link we just created. Listen before clicking: deleting a link
  // refetches the list immediately, so a promise created after the click waits
  // for the *next* refetch instead of this one.
  linksResponse = page.waitForResponse((response) => response.request().url().includes("/links"));
  await deleteAccessLink(page, throwawayLink);
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
  await openFolder(page, page.getByTestId(folderRowTestID));

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
  const {
    folderRowTestID,
    fileCountID,
    deleteFileButton,
    submitButtonID,
    passwordInputID,
  } = fileLocators(page);

  // Select folder
  await openFolder(page, page.getByTestId(folderRowTestID));

  // Delete file
  const deleteResponse = page.waitForResponse((response) => response.request().method() === "DELETE");
  await deleteFileButton.click({ force: true });

  // Click the confirmation button in the modal
  await page.getByText("Yes, Delete").click();

  // Wait for DELETE request to complete
  expect((await deleteResponse).status()).toBe(202);

  // `file-count` is a hidden marker element (FolderView.vue renders it with
  // `display: none`), so this is a weak check by construction.
  await expect(page.getByTestId(fileCountID)).toBeHidden();

  // Check that the share links are no longer accessible
  // Folder no password link
  await page.goto(requireShareLink("folder-no-password"));
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("not_found")).toContainText("This link is no longer active");

  // Folder with password link
  await page.goto(requireShareLink("folder-with-password"));
  await page.waitForLoadState("networkidle");
  await page.getByTestId(passwordInputID).fill(password);
  await page.getByTestId(submitButtonID).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("not_found")).toContainText("This link is no longer active");
}
