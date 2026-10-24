/**
 * Where the E2E server keeps its data: emptied by server.ts before every run, read by the
 * screenshots to pin the dates they show.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export const E2E_DATA_DIR = join(import.meta.dirname, ".data");

/** The server's SQLite file in that folder (apps/server/src/main.ts). */
export const E2E_DATABASE = join(E2E_DATA_DIR, "schreibzeug.db");

export type Statement = { sql: string; params: Array<string | number | null> };

/**
 * Runs statements on the E2E database. Playwright runs on Node and the database is opened with
 * bun:sqlite, so a small Bun script does it (sqlite.ts); SQLite lets it write next to the server.
 */
export const runSql = (statements: Statement[]): void => {
  execFileSync("bun", [join(import.meta.dirname, "sqlite.ts"), E2E_DATABASE], {
    input: JSON.stringify(statements),
    stdio: ["pipe", "inherit", "inherit"],
  });
};
