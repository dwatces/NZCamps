// End-to-end and accessibility tests (npm run test:e2e). They are not part of
// npm test. Playwright starts two local servers (e2e/server.js): one with an
// in-memory MongoDB on 7203 and one in demo mode on 7206, and stops them at
// the end.
//
// Browser: CHROME_PATH if it is set, otherwise Google Chrome at
// /usr/bin/google-chrome if it is there. Without either, Playwright uses its
// own Chromium, which has to be installed once with
// `npx playwright install chromium`; nothing is downloaded automatically.
const fs = require("node:fs");
const { defineConfig } = require("@playwright/test");
const { PORTS } = require("./e2e/constants");

const SYSTEM_CHROME = "/usr/bin/google-chrome";
const CHROME =
  process.env.CHROME_PATH || (fs.existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : undefined);

module.exports = defineConfig({
  testDir: "e2e",
  // One worker: the specs share one database, and the machine is shared too.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "test-results/e2e",
  use: {
    baseURL: `http://127.0.0.1:${PORTS.db}`,
    launchOptions: { executablePath: CHROME },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-NZ",
    timezoneId: "Pacific/Auckland",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "phone-390",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop-1440",
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: "node e2e/server.js",
      url: `http://127.0.0.1:${PORTS.db}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
      stdout: "pipe",
    },
    {
      command: "node e2e/server.js --demo",
      url: `http://127.0.0.1:${PORTS.demo}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
      stdout: "pipe",
    },
  ],
});
