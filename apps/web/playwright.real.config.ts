import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.REAL_E2E_BASE_URL;
if (!baseURL) {
  throw new Error("REAL_E2E_BASE_URL is required for staging real-mode E2E.");
}
const parsedBaseURL = new URL(baseURL);
const expectedHost = process.env.REAL_E2E_EXPECTED_HOST;
if (parsedBaseURL.hostname === "omidmed-platform.vercel.app") {
  throw new Error("Real-mode E2E must never target the production hostname.");
}
if (
  process.env.CI &&
  (!expectedHost ||
    parsedBaseURL.protocol !== "https:" ||
    parsedBaseURL.hostname !== expectedHost)
) {
  throw new Error(
    "CI real-mode E2E requires an HTTPS staging URL whose host exactly matches REAL_E2E_EXPECTED_HOST."
  );
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/real-mode.spec.ts",
  fullyParallel: true,
  forbidOnly: true,
  retries: 1,
  workers: 2,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-real-report", open: "never" }],
  ],
  use: {
    baseURL: parsedBaseURL.href,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "staging-chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.platform === "win32" ? { channel: "chrome" } : {}),
      },
    },
  ],
});
