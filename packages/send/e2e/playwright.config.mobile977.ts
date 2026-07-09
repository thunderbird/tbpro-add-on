import { defineConfig, devices } from "@playwright/test";

const THREE_MINUTES = 3 * 60 * 1000;

/**
 * Dedicated config for the mobile "file info panel" repro/visual suite (issue #977).
 * Runs against a local dev stack (default the #977 worktree stack on :5573).
 *
 * Uses Firefox at a Pixel-sized (412x915) viewport. #977 is a width-breakpoint
 * layout bug (the info panel column overlaps the file list below Tailwind's `md`
 * breakpoint), so a narrow viewport reproduces it. Firefox is used because it
 * restores the (encrypted-at-rest) keychain from storage reliably, whereas
 * chromium's emulated device could not, blocking the upload step.
 *
 * Screenshots are written to ./screenshots977 so you can eyeball the UI.
 */
export default defineConfig({
  testDir: "./tests/mobile/dev",
  outputDir: "./playwright-test-results",
  timeout: THREE_MINUTES,
  fullyParallel: false,
  workers: 1,
  reporter: [["html", { outputFolder: "./playwright-report" }], ["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5573",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
    serviceWorkers: "block",
    bypassCSP: true,
  },
  projects: [
    {
      name: "mobile-firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 412, height: 915 },
      },
    },
  ],
});
