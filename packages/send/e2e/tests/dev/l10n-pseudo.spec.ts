// Pseudo-locale smoke test (#1386): runs the web app in en-XA (accented,
// stretched, bracketed) and looks for English that never went through Fluent,
// plus horizontal overflow from the longer strings.
//
// Only "Log out" and "Sign out" are migrated today, so only they fail the test;
// the rest of the denylist is logged as an `untranslated` annotation. Move
// words into MIGRATED as #1088 migrates them, until the whole list is enforced.
//
// Lives in tests/dev because ?locale= is honoured only by dev-server builds,
// which is what the e2e stack runs. Registers its own account so it shares no
// state with the serial chain in send.spec.ts.

import { type Page } from "@playwright/test";

import { PLAYWRIGHT_TAG_DEV_DESKTOP } from "../../const/const";
import { dashboardLocators, fileLocators } from "../../pages/dev/locators";
import { expect, test } from "../../utils/dev/fixtures";
import { playwrightConfig } from "../../utils/dev/testUtils";

const ENGLISH_DENYLIST = [
  "Upload",
  "Download",
  "Delete",
  "Share",
  "Settings",
  "Sign out",
  "Log out",
  "Files",
  "Folder",
  "Create",
  "Cancel",
  "Save",
  "Copy",
  "Link",
  "Password",
  "Continue",
  "Back",
  "Close",
  "Send",
  "Thank you",
];
const MIGRATED = ["Log out", "Sign out"];

async function expectLocalized(page: Page, label: string) {
  const text = await page.locator("body").innerText();
  const english = ENGLISH_DENYLIST.filter((word) => new RegExp(`\\b${word}\\b`).test(text));
  if (english.length) {
    test.info().annotations.push({
      type: "untranslated",
      description: `${label}: ${english.join(", ")}`,
    });
  }
  expect(
    english.filter((word) => MIGRATED.includes(word)),
    `${label}: migrated strings rendered in English`,
  ).toEqual([]);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(0);
}

test.describe("Pseudo-locale", { tag: [PLAYWRIGHT_TAG_DEV_DESKTOP] }, () => {
  test("en-XA leaves no migrated English and no overflow", async ({ openSendContext }) => {
    const { page } = await openSendContext({ usesEmptyStorage: true });
    const {
      registerButton,
      emailField,
      passwordField,
      confirmPasswordField,
      submitButton,
      passphraseInputOverlay,
      backupKeysButtonOverlay,
    } = dashboardLocators(page);
    const { firstFolderRow, sharelinkButton } = fileLocators(page);
    const { password } = playwrightConfig;

    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/send?locale=en-XA");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");

    await registerButton.click();
    await emailField.fill(`l10n-pseudo${Date.now()}@tb.pro`);
    await passwordField.fill(password);
    await confirmPasswordField.fill(password);
    await submitButton.click();

    // Key backup overlay: carries the migrated "Log out" button.
    await expect(passphraseInputOverlay).not.toHaveValue("");
    await expectLocalized(page, "key backup");
    await backupKeysButtonOverlay.click();

    // Your Files, with the user menu open for the migrated "Sign out".
    await page.getByTestId("navlink-manage-files").click();
    await page.getByTestId("new-folder-button").click();
    await expect(firstFolderRow).toBeVisible();
    const avatar = page.locator(".user-menu .avatar");
    await avatar.click();
    await expectLocalized(page, "files + user menu");
    await avatar.click();

    // Share panel of the folder.
    await firstFolderRow.click();
    await expect(sharelinkButton).toBeVisible();
    await expectLocalized(page, "share panel");
  });
});
