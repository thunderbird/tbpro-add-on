// Unit-level regression tests for the share-link state guards added for #930.
// These exercise pure helpers (no browser/stack required) so they run fast in CI
// alongside the dev-desktop suite and document the intended guard behaviour.

import { expect, test } from "@playwright/test";

import { PLAYWRIGHT_TAG_DEV_DESKTOP } from "../../../const/const";
import {
  playwrightConfig,
  requireShareLink,
  resetShareLinks,
} from "../../../utils/dev/testUtils";

test.describe("share-link guards (#930)", { tag: [PLAYWRIGHT_TAG_DEV_DESKTOP] }, () => {
  test("resetShareLinks clears every entry back to null", () => {
    // Simulate a prior run that populated some links.
    playwrightConfig.shareLinks["file-no-password"] = "https://example/share/abc";
    playwrightConfig.shareLinks["folder-with-password"] = "https://example/share/def";

    resetShareLinks();

    for (const value of Object.values(playwrightConfig.shareLinks)) {
      expect(value).toBeNull();
    }
  });

  test("requireShareLink throws an actionable error when a link is missing", () => {
    resetShareLinks();

    expect(() => requireShareLink("folder-no-password")).toThrow(
      /Missing share link for "folder-no-password"/
    );
    // Must NOT let a null reach page.goto (the cryptic "expected string, got object").
    expect(() => requireShareLink("folder-no-password")).not.toThrow(
      /expected string/
    );
  });

  test("requireShareLink returns the populated link", () => {
    resetShareLinks();
    const link = "https://example/share/xyz";
    playwrightConfig.shareLinks["file-with-password"] = link;

    expect(requireShareLink("file-with-password")).toBe(link);
  });
});
