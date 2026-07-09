// Mobile repro + visual suite for issue #977:
// "File info panel covers delete button on mobile".
//
// Runs the whole flow in one continuous Firefox session at a Pixel-sized
// (412px) viewport (see playwright.config.mobile977.ts): register a fresh
// local-auth user, create a folder, upload a file, then open the file info
// panel and verify that on a narrow/mobile viewport the panel:
//   1. renders as an overlay that can be dismissed (has a close button),
//   2. exposes a delete control (previously absent), and
//   3. lets the user actually delete the file.
// Screenshots land in ./screenshots977 so the UI can be eyeballed.

import path from "path";
import { expect, test } from "@playwright/test";

import { dashboardLocators, fileLocators } from "../../../pages/dev/locators";
import { playwrightConfig } from "../../../utils/dev/testUtils";

const SHOTS = path.resolve(__dirname, "../../../screenshots977");

test.describe("mobile file info panel (#977)", () => {
  test("can delete a file and close the panel from a mobile viewport", async ({
    page,
  }) => {
    const { email, password } = playwrightConfig;
    const {
      registerButton,
      emailField,
      passwordField,
      confirmPasswordField,
      submitButton,
      passphraseInputOverlay,
      backupKeysButtonOverlay,
    } = dashboardLocators(page);
    const { folderRowSelector, folderRowTestID, uploadButton, fileCountID } =
      fileLocators(page);

    page.on("dialog", (dialog) => dialog.accept());

    // --- Register a fresh local-auth user + back up keys ---
    await page.goto("/send");
    await expect(page).toHaveTitle(/Thunderbird Send/);
    await registerButton.click();
    await emailField.fill(email);
    await passwordField.fill(password);
    await confirmPasswordField.fill(password);
    await submitButton.click();

    const passphrase = await passphraseInputOverlay.inputValue();
    expect(passphrase, "expected a generated passphrase").toBeTruthy();
    await backupKeysButtonOverlay.click();

    // --- Go to Your Files via the mobile footer nav ---
    await page.getByRole("link", { name: "Encrypted Files" }).last().click();
    await expect(
      page.getByRole("heading", { name: "Your Files" })
    ).toBeVisible();
    await page.waitForLoadState("networkidle");

    // --- Create a folder and open it (root can't receive uploads) ---
    await page.getByTestId("new-folder-button").click();
    await page.waitForSelector(folderRowSelector);
    await page.getByTestId(folderRowTestID).first().dblclick();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: "Your Files" })
    ).toBeVisible();

    // --- Upload a file (feed the hidden file input directly) ---
    await page.waitForSelector("#drop-zone", { state: "attached" });
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(path.resolve(__dirname, "../../../test-files/test.png"));
    await uploadButton.click();
    await page.waitForSelector('[data-testid="file-0"]', { timeout: 90_000 });
    await expect(page.getByTestId(fileCountID)).toHaveText("1");
    await page.screenshot({ path: `${SHOTS}/01-your-files.png`, fullPage: true });

    // --- Open the file info panel ---
    // Click the left (icon/name) side of the row, not the right side where the
    // row's own download/delete buttons now live (visible on mobile after the
    // fix), so we open the info panel rather than triggering a row action.
    await page.getByTestId("file-0").click({ position: { x: 12, y: 20 } });
    const panelDelete = page.getByTestId("delete-file-info");
    const panelClose = page.getByTestId("close-file-info");
    await expect(panelClose).toBeVisible();
    await expect(panelDelete).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/02-info-panel-open.png`,
      fullPage: true,
    });

    // --- Close button dismisses the panel (previously no way to close it) ---
    await panelClose.click();
    await expect(page.getByTestId("delete-file-info")).toHaveCount(0);
    await page.screenshot({
      path: `${SHOTS}/03-panel-closed.png`,
      fullPage: true,
    });

    // --- Re-open and delete the file from the panel (was covered / absent) ---
    await page.getByTestId("file-0").click({ position: { x: 12, y: 20 } });
    await expect(panelDelete).toBeVisible();
    await panelDelete.click();
    await page.screenshot({
      path: `${SHOTS}/04-delete-confirm.png`,
      fullPage: true,
    });
    const deleteResponse = page.waitForResponse(
      (r) => r.request().method() === "DELETE"
    );
    await page.getByText("Yes, Delete").click();
    expect((await deleteResponse).status()).toBe(202);
    await page.waitForLoadState("networkidle");

    // File is gone and the panel closed itself.
    await expect(page.getByTestId(fileCountID)).toHaveCount(0);
    await expect(page.getByTestId("delete-file-info")).toHaveCount(0);
    await page.screenshot({
      path: `${SHOTS}/05-after-delete.png`,
      fullPage: true,
    });
  });
});
