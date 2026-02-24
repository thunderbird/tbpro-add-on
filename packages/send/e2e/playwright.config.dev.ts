import { defineConfig, devices } from "@playwright/test";

const THREE_MINUTES = 3 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  outputDir: './playwright-test-results',
  globalTimeout: TEN_MINUTES, // odds are the test will timeout at the locator level before that anyway
  timeout: THREE_MINUTES,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.IS_CI_AUTOMATION,
  /* Retries on CI only */
  retries: process.env.IS_CI_AUTOMATION ? 1 : 0,
  /* Run tests sequentially only */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { outputFolder: './playwright-report' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
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

  /* Configure projects for major browsers */
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

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.IS_CI_AUTOMATION,
  // },
});
