import { defineConfig, devices } from "@playwright/test";
import { E2E_LOCAL_PORT as localPort, E2E_LOCAL_WEB_PORT as localWebPort } from "./local";

/** Ports of their own, so a development server that is already running does not get in the way. */
const webPort = 5174;
const serverPort = 3100;

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: "retain-on-failure",
    acceptDownloads: true,
    // A Chromium already on the machine instead of Playwright's own download, e.g. in a sandbox
    // without access to the browser CDN: PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome bun run test:e2e
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      testMatch: "**/*.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      // test-files/fidelity against their reference pictures (formats.fidelity.ts).
      name: "fidelity",
      testMatch: "**/*.fidelity.ts",
      snapshotPathTemplate: "{testDir}/../test-files/fidelity/screenshots/{arg}{ext}",
      expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001 } },
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      // docs/screenshots, taken by hand (screenshots.shot.ts); one after the other, on one seed.
      name: "screenshots",
      testMatch: "**/*.shot.ts",
      fullyParallel: false,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        locale: "de-DE",
        timezoneId: "Europe/Berlin",
      },
    },
  ],
  webServer: [
    {
      // An empty database and data folder for every run (server.ts).
      command: "bun e2e/server.ts",
      cwd: "..",
      url: `http://localhost:${serverPort}/api/health`,
      env: { E2E_SERVER_PORT: String(serverPort) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bunx vite --port ${webPort} --strictPort`,
      cwd: "../apps/web",
      url: `http://localhost:${webPort}`,
      env: { SCHREIBZEUG_API_URL: `http://localhost:${serverPort}` },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // A folder of its own on every run (local-server.ts).
      command: "bun e2e/local-server.ts",
      cwd: "..",
      url: `http://localhost:${localPort}/api/health`,
      env: { E2E_LOCAL_PORT: String(localPort) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bunx vite --port ${localWebPort} --strictPort`,
      cwd: "../apps/web",
      url: `http://localhost:${localWebPort}`,
      env: { SCHREIBZEUG_API_URL: `http://localhost:${localPort}` },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
