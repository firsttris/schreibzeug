/**
 * Starts the local server (apps/local) for the E2E run over an empty folder. Playwright starts it
 * (playwright.config.ts) and stops it after.
 *
 * E2E_LOCAL_PORT: set by playwright.config.ts.
 */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { E2E_LOCAL_ROOT, E2E_LOCAL_TOKEN } from "./local";

await rm(join(E2E_LOCAL_ROOT, ".."), { recursive: true, force: true });
await mkdir(E2E_LOCAL_ROOT, { recursive: true });

const server = Bun.spawn(["bun", join(import.meta.dir, "../apps/local/src/main.ts")], {
  env: {
    ...process.env,
    STAPEL_LOCAL_ROOT: E2E_LOCAL_ROOT,
    STAPEL_LOCAL_TOKEN: E2E_LOCAL_TOKEN,
    STAPEL_LOCAL_CACHE: join(E2E_LOCAL_ROOT, "..", "media"),
    PORT: process.env.E2E_LOCAL_PORT ?? "3200",
  },
  stdio: ["inherit", "inherit", "inherit"],
});

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.kill(signal));
process.exit(await server.exited);
