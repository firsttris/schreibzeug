/**
 * Starts a Schreibzeug server for the E2E run that signs in through Kontext (fake-kontext.ts) and
 * may be shown in its frame, on an empty data folder of its own. Playwright starts it
 * (playwright.config.ts) and stops it after.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { E2E_EMBEDDED_PORT, E2E_EMBEDDED_URL, E2E_KONTEXT_URL, E2E_OIDC_CLIENT } from "./kontext";

const dataDir = join(import.meta.dir, ".kontext");
await rm(dataDir, { recursive: true, force: true });

const server = Bun.spawn(["bun", join(import.meta.dir, "../apps/server/src/main.ts")], {
  env: {
    ...process.env,
    SCHREIBZEUG_DATA_DIR: dataDir,
    PORT: String(E2E_EMBEDDED_PORT),
    SCHREIBZEUG_URL: E2E_EMBEDDED_URL,
    SCHREIBZEUG_EMBED_ORIGIN: E2E_KONTEXT_URL,
    OIDC_ISSUER: E2E_KONTEXT_URL,
    OIDC_CLIENT_ID: E2E_OIDC_CLIENT.id,
    OIDC_CLIENT_SECRET: E2E_OIDC_CLIENT.secret,
    // Accounts with a password beside Kontext's (the test that connects one).
    SCHREIBZEUG_OPEN_SIGNUP: "true",
  },
  stdio: ["inherit", "inherit", "inherit"],
});

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.kill(signal));
process.exit(await server.exited);
