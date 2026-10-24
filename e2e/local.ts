/**
 * The desktop app's local server for the E2E run (apps/local): a folder of its own as "Dokumente",
 * emptied by local-server.ts before every run, and the token the tests unlock it with.
 */
import { join } from "node:path";

export const E2E_LOCAL_ROOT = join(import.meta.dirname, ".local", "Dokumente");
export const E2E_LOCAL_TOKEN = "e2e-token-for-the-local-server";

/** The local server (local.spec.ts) and a web app in front of it, on ports of their own. */
export const E2E_LOCAL_PORT = 3200;
export const E2E_LOCAL_WEB_PORT = 5175;
export const E2E_LOCAL_URL = `http://localhost:${E2E_LOCAL_WEB_PORT}`;
