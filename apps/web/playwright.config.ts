import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/real-mode.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ]
    : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The Playwright CDN is unavailable in some local regions. On
        // Windows, use the installed stable Chrome; CI still installs and
        // uses Playwright's pinned Chromium build.
        ...(process.platform === "win32" ? { channel: "chrome" } : {}),
      },
    },
  ],
  webServer: {
    command: process.env.CI
      ? "npm run start -- --hostname 127.0.0.1 --port 3100"
      : "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_DATA_MODE: "mock",
      NEXT_PUBLIC_ENABLE_POSTURE_SANDBOX: "false",
      NEXT_PUBLIC_ENABLE_CLINICAL_AI_DRAFTS: "false",
    },
  },
});
