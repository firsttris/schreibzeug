/**
 * Starts the Stapel server for the E2E run on an empty data folder (database and blobs), so every
 * run begins from the same state. Playwright starts it (playwright.config.ts) and stops it after.
 *
 * E2E_SERVER_PORT: set by playwright.config.ts; the data folder: database.ts.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { E2E_DATA_DIR } from "./database";

await rm(E2E_DATA_DIR, { recursive: true, force: true });

const server = Bun.spawn(["bun", join(import.meta.dir, "../apps/server/src/main.ts")], {
  env: {
    ...process.env,
    STAPEL_DATA_DIR: E2E_DATA_DIR,
    PORT: process.env.E2E_SERVER_PORT ?? "3100",
    // Every test signs up an account of its own.
    STAPEL_OPEN_SIGNUP: "true",
  },
  stdio: ["inherit", "inherit", "inherit"],
});

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.kill(signal));
process.exit(await server.exited);
