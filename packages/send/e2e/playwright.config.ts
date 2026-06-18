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
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    actionTimeout: 10_000,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [

    // Setup browsers - signs into Appointment once for all the tests and saves auth
    { 
      name: 'desktop-auth',
      testMatch: /.*\auth.desktop\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        screenshot: 'only-on-failure',
       },
    },

    // Main tests; each browser runs the setup above and saves auth state which is loaded for each test in the suite
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        screenshot: 'only-on-failure',
        // Use prepared auth state
        storageState: 'test-results/.auth/user.json',
       },
      dependencies: ['desktop-auth'],
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        screenshot: 'only-on-failure',
        // Use prepared auth state
        storageState: 'test-results/.auth/user.json',
        // Firefox-specific settings
        launchOptions: {
          firefoxUserPrefs: {
            "dom.push.enabled": false,
            "dom.webnotifications.enabled": false,
            "privacy.trackingprotection.enabled": false,
          },
        },
       },
      dependencies: ['desktop-auth'],
    },

    {
      name: 'safari',
      use: {
        ...devices['Desktop Safari'],
        screenshot: 'only-on-failure',
        // Use prepared auth state
        storageState: 'test-results/.auth/user.json',
      },
      dependencies: ['desktop-auth'],
    },

    /* Test against mobile viewports. */
    {
      name: 'Google-Pixel-7-View',
      use: {
        ...devices['Pixel 7'],
        screenshot: 'only-on-failure',
       },
    },
    // no dependency as mobile browsers don't support loading auth state so must sign-in for each test
  ],
});
