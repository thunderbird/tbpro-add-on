import { BrowserContext, expect, Page, test as base } from "@playwright/test";

import { emptystatePath, storageStatePath } from "./paths";

/** A browser context and the tab the page objects drive. */
export type PlaywrightProps = { context: BrowserContext; page: Page };

type OpenSendContext = (options?: {
  usesEmptyStorage?: boolean;
}) => Promise<PlaywrightProps>;

/**
 * Fixtures for the dev-stack suite.
 *
 * These replace a `setup_browser()` helper that called `firefox.launch()` in every
 * `beforeEach` and never closed the result, so a full run finished with ten Firefox
 * processes still competing for the machine. Playwright's own `browser` fixture is
 * already one browser per worker, launched with the project's `launchOptions` and
 * closed for us; all this adds is a fresh context per test, tracked so it cannot
 * leak when a test throws.
 *
 * Only `storageState` is passed to `newContext()`. Everything else — `baseURL`,
 * viewport, `ignoreHTTPSErrors`, downloads — comes from the `use` block in
 * playwright.config.dev.ts, which Playwright also applies to contexts a test
 * creates by hand. That is why `page.goto("/send")` resolves against `baseURL`.
 */
export const test = base.extend<{
  openSendContext: OpenSendContext;
  sendHome: PlaywrightProps;
}>({
  openSendContext: async ({ browser }, use) => {
    const opened: BrowserContext[] = [];

    await use(async ({ usesEmptyStorage = false } = {}) => {
      const context = await browser.newContext({
        storageState: usesEmptyStorage ? emptystatePath : storageStatePath,
      });
      opened.push(context);
      return { context, page: await context.newPage() };
    });

    for (const context of opened) await context.close();
  },

  /** A signed-in tab sitting on the file list, which is where most tests start. */
  sendHome: async ({ openSendContext }, use) => {
    const session = await openSendContext();
    await session.page.goto("/send");
    await expect(session.page).toHaveTitle(/Thunderbird Send/);
    await use(session);
  },
});

export { expect } from "@playwright/test";
