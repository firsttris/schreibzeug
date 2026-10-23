import { defineConfig, devices } from "@playwright/test";

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
  },
  projects: [
    {
      name: "chromium",
      testMatch: "**/*.spec.ts",
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
      env: { STAPEL_API_URL: `http://localhost:${serverPort}` },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
