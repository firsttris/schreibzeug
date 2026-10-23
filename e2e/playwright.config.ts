import { defineConfig, devices } from "@playwright/test";

/** Ports of their own, so a development server that is already running does not get in the way. */
const webPort = 5174;
const serverPort = 3100;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
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
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
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
