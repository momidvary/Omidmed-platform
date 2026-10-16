import base from "./playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...base,
  workers: 2,
  use: { ...base.use, launchOptions: { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" } },
  webServer: { ...(base.webServer as object), command: "npm run start -- --hostname 127.0.0.1 --port 3100", reuseExistingServer: false } as never,
});
