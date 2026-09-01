// All of the tests in this file are made to run against a localhost dev stack only, on a local
// machine's dev stack or in CI on a stack built in a Github Actions worker against a branch

import fs from "fs";

import {
  PLAYWRIGHT_TAG_DEV_DESKTOP,
 } from "../../../const/const"

import {
  log_out_restore_keys,
  register_and_login,
  reset_keys,
} from "../../../pages/dev/dashboard"

import {
  delete_file,
  download_workflow,
  mobile_info_panel_modal,
  share_links,
  upload_workflow,
} from "../../../pages/dev/myFiles"

import { emptyState, storageStatePath } from "../../../utils/dev/paths"
import { test } from "../../../utils/dev/fixtures"
import { resetShareLinks } from "../../../utils/dev/testUtils"

// Every test in this file works on the one account "Register and log in" creates,
// in order: share, upload, download, mobile panel, delete, reset. Serial mode makes that
// explicit — the first failure is reported and the rest are skipped instead of
// each failing on state the failed test never produced, and a retry re-runs the
// whole chain from registration, which is the only way a retry can pass.
test.describe.configure({ mode: "serial" });

// Cleanup storage state after all tests. On a retry this is also what leaves the
// first context an empty session to register into again.
test.afterAll(async () => {
  fs.writeFileSync(storageStatePath, JSON.stringify(emptyState));
});

// Authentication-related tests
const authTests = [
  {
    title: "Register and log in",
    path: "/send",
    usesEmptyStorage: false,
    action: register_and_login,
  },
  {
    // Restoring keys is the point of this one, so it starts from a session that
    // has none.
    title: "Restores keys",
    path: "/send/profile",
    usesEmptyStorage: true,
    action: log_out_restore_keys,
  },
];

test.describe("Authentication", {
  tag: [PLAYWRIGHT_TAG_DEV_DESKTOP],
}, () => {
  authTests.forEach(({ title, path, usesEmptyStorage, action }) => {
    test(title, async ({ openSendContext }) => {
      const session = await openSendContext({ usesEmptyStorage });
      await session.page.goto(path);
      await action(session);
    });
  });
});

// File workflow tests with shared setup
test.describe("File workflows", {
  tag: [PLAYWRIGHT_TAG_DEV_DESKTOP],
}, () => {
  // Start from a clean share-link map so a prior (possibly failed) run can't
  // leak stale/null links into the download + delete steps below (#930).
  test.beforeAll(() => {
    resetShareLinks();
  });

  const workflows = [
    { title: "Share links", action: share_links },
    { title: "Upload workflow", action: upload_workflow },
    { title: "Download workflow", action: download_workflow },
    { title: "Mobile info panel modal", action: mobile_info_panel_modal },
    { title: "Delete files", action: delete_file },
  ];

  workflows.forEach(({ title, action }) => {
    test(title, async ({ sendHome }) => {
      await action(sendHome);
    });
  });
});

test.describe("Key restore", {
  tag: [PLAYWRIGHT_TAG_DEV_DESKTOP],
}, () => {
  test("Reset keys", async ({ sendHome }) => {
    await reset_keys(sendHome);
  });
});
