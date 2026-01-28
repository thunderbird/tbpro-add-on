import config from "dotenv";
import fs from "fs";
import path from "path";

import { BrowserContext, expect, Page, test } from "@playwright/test";

import {
  PLAYWRIGHT_TAG_PROD_DESKTOP_NIGHTLY,
 } from "../../const"

import {
  log_out_restore_keys,
  register_and_login,
  reset_keys,
} from "../../pages/dashboard"

import {
  delete_file,
  download_workflow,
  share_links,
  upload_workflow,
} from "../../pages/myFiles"

import { oidc_login } from "../../pages/oidc"
import { setup_browser } from "../../testUtils"

config.config({ path: path.resolve(__dirname, "./.env") });

export type PlaywrightProps = {
  context: BrowserContext;
  page: Page;
};

export const credentials = {
  TBPRO_USERNAME: process.env.TBPRO_USERNAME,
  TBPRO_PASSWORD: process.env.TBPRO_PASSWORD,
};

export const storageStatePath = path.resolve(
  __dirname,
  "../data/lockboxstate.json"
);

export const emptystatePath = path.resolve(
  __dirname,
  "../data/emptystate.json"
);
const emptyState = {
  cookies: [],
  origins: [],
};

// Configure tests to run serially with retries
test.describe.configure({ mode: "serial", retries: 3 });

// Cleanup storage state after all tests
test.afterAll(async () => {
  fs.writeFileSync(storageStatePath, JSON.stringify(emptyState));
});

test.describe("OIDC flow", {
  tag: [PLAYWRIGHT_TAG_PROD_DESKTOP_NIGHTLY],
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
  tag: [PLAYWRIGHT_TAG_PROD_DESKTOP_NIGHTLY],
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
  tag: [PLAYWRIGHT_TAG_PROD_DESKTOP_NIGHTLY],
}, () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeEach(async () => {
    ({ page, context } = await setup_browser());
    await page.goto("/send");
    await expect(page).toHaveTitle(/Thunderbird Send/);
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
  tag: [PLAYWRIGHT_TAG_PROD_DESKTOP_NIGHTLY],
}, async () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeEach(async () => {
    ({ page, context } = await setup_browser());
    await page.goto("/send");
    await expect(page).toHaveTitle(/Thunderbird Send/);
  });

  const workflows = [{ title: "Reset keys", action: reset_keys }];

  workflows.forEach(({ title, action }) => {
    test(title, async () => await action({ page, context }));
  });
});
