import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // You can comment out the ones you don't need for better performance
    projects: [
      "packages/assist",
      "packages/assist/frontend",
      "packages/send",
      "packages/send/backend",
      "packages/send/frontend",
      "packages/shared",
      "packages/addon",
    ],
  },
});
