// All of the tests in this file are made to run against a localhost dev stack only, on a local
// machine's dev stack or in CI on a stack built in a Github Actions worker against a branch

import config from "dotenv";
import fs from "fs";
import path from "path";

import { BrowserContext, expect, Page, test } from "@playwright/test";

import {
  PLAYWRIGHT_TAG_DEV_DESKTOP,
 } from "../../../const/const"

import {
  ensureReady,
  log_out_restore_keys,
  register_and_login,
  reset_keys,
} from "../../../pages/dev/dashboard"

import {
  delete_file,
  download_workflow,
  share_links,
  upload_workflow,
} from "../../../pages/dev/myFiles"

import { oidc_login } from "../../../pages/dev/oidc"
import {
  emptyState,
  emptystatePath,
  storageStatePath,
} from "../../../utils/dev/paths"
import { resetShareLinks, setup_browser } from "../../../utils/dev/testUtils"

// Re-export for backwards compatibility with anything importing these from the spec.
export { emptystatePath, storageStatePath }

config.config({ path: path.resolve(__dirname, "./.env") });

export type PlaywrightProps = {
  context: BrowserContext;
  page: Page;
};

export const credentials = {
  TBPRO_USERNAME: process.env.TBPRO_USERNAME,
  TBPRO_PASSWORD: process.env.TBPRO_PASSWORD,
};

// Cleanup storage state after all tests
test.afterAll(async () => {
  fs.writeFileSync(storageStatePath, JSON.stringify(emptyState));
});

test.describe("OIDC flow", {
  tag: [PLAYWRIGHT_TAG_DEV_DESKTOP],
}, async () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeEach(async () => {
    ({ page, context } = await setup_browser());
    await page.goto("/send");
    await expect(page).toHaveTitle(/Thunderbird Send/);
  });

  const workflows = [{ title: "Login using OIDC", action: oidc_login }];

  workflows.forEach(({ title, action }) => {
    test(title, async () => await action({ page, context }));
  });
});

// Authentication-related tests
const authTests = [
  { title: "Register and log in", path: "/send", action: register_and_login },
  {
    title: "Restores keys",
    path: "/send/profile",
    action: log_out_restore_keys,
  },
];

test.describe("Authentication", {
  tag: [PLAYWRIGHT_TAG_DEV_DESKTOP],
}, () => {
  authTests.forEach(({ title, path, action }) => {
    test(title, async () => {
      const { context, page } = await setup_browser();
      await page.goto(path);
      await action({ context, page });
      await context.close();
    });
  });
});

// File workflow tests with shared setup
test.describe("File workflows", {
  tag: [PLAYWRIGHT_TAG_DEV_DESKTOP],
}, () => {
  let page: Page;
  let context: BrowserContext;

  // Start from a clean share-link map so a prior (possibly failed) run can't
  // leak stale/null links into the download + delete steps below (#930).
  test.beforeAll(() => {
    resetShareLinks();
  });

  test.beforeEach(async () => {
    ({ page, context } = await setup_browser());
    await page.goto("/send");
    await expect(page).toHaveTitle(/Thunderbird Send/);
    // A restored session may land logged-out or keychain-locked (see ensureReady).
    await ensureReady(page);
  });

  const workflows = [
    { title: "Share links", action: share_links },
    { title: "Upload workflow", action: upload_workflow },
    { title: "Download workflow", action: download_workflow },
    { title: "Delete files", action: delete_file },
  ];

  workflows.forEach(({ title, action }) => {
    test(title, async () => {
      await action({ page, context });
      await context.close();
    });
  });
});

test.describe("Key restore", {
  tag: [PLAYWRIGHT_TAG_DEV_DESKTOP],
}, async () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeEach(async () => {
    ({ page, context } = await setup_browser());
    await page.goto("/send");
    await expect(page).toHaveTitle(/Thunderbird Send/);
    // A restored session may land logged-out or keychain-locked (see ensureReady).
    await ensureReady(page);
  });

  const workflows = [{ title: "Reset keys", action: reset_keys }];

  workflows.forEach(({ title, action }) => {
    test(title, async () => await action({ page, context }));
  });
});
