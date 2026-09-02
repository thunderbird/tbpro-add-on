import { defineConfig, devices } from "@playwright/test";

const THREE_MINUTES = 3 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

/**
 * Config for the @dev-desktop suite, which runs against a localhost dev stack.
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  // Only the dev suite uses this config; the nightly and deployment-analysis
  // projects live in playwright.config.ts. Pointing at the one directory keeps
  // the runner from loading (and reporting on) specs it will never run.
  testDir: "./tests/dev",
  outputDir: './playwright-test-results',
  globalTimeout: TEN_MINUTES, // odds are the test will timeout at the locator level before that anyway
  timeout: THREE_MINUTES,
  /* The dev suite is one ordered chain against a single account -- see the
     serial-mode note in tests/desktop/dev/send.spec.ts -- so it cannot be
     parallelised. */
  fullyParallel: false,
  workers: 1,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.IS_CI_AUTOMATION,
  /* Retries on CI only */
  retries: process.env.IS_CI_AUTOMATION ? 1 : 0,
  /* Web-first assertions (`expect(locator).toHaveValue(...)`) default to 5s. The
     reads they replaced were locator calls on the 10s `actionTimeout` below, so
     match it: several of them wait out a 1s debounce plus a round trip, and CI is
     slower than a laptop. */
  expect: { timeout: 10_000 },
  /* `line` prints tests in execution order, which is what tells you which failure
     came first when a run goes red; the html report's list does not. */
  reporter: [['line'], ['html', { outputFolder: './playwright-report' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions.
     Playwright applies these to contexts a test opens by hand too, which is how
     utils/dev/fixtures.ts gets away with passing only `storageState`. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    actionTimeout: 10_000,
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    /* Context settings */
    contextOptions: {
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 720 },
      acceptDownloads: true,
      // Default permissions that should work across browsers
      permissions: ["geolocation"],
      // Recommended defaults for better stability
      serviceWorkers: "block",
      bypassCSP: true,
    },
  },

  projects: [
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        // Firefox-specific settings
        launchOptions: {
          firefoxUserPrefs: {
            "dom.push.enabled": false,
            "dom.webnotifications.enabled": false,
            "privacy.trackingprotection.enabled": false,
          },
        },
      },
    },
  ],
});
