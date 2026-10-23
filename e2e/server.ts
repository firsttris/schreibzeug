/**
 * Starts the Stapel server for the E2E run on an empty database and an empty data folder, so every
 * run begins from the same state. Playwright starts it (playwright.config.ts) and stops it after.
 *
 * E2E_DATABASE_URL: a PostgreSQL user that may create databases (default: the development one).
 * E2E_SERVER_PORT: set by playwright.config.ts.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const adminUrl = process.env.E2E_DATABASE_URL ?? "postgres://stapel:stapel@localhost:5432/stapel";
const database = "stapel_e2e";
const dataDir = join(import.meta.dir, ".data");

const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
await admin.unsafe(`drop database if exists ${database} with (force)`);
await admin.unsafe(`create database ${database}`);
await admin.end();
await rm(dataDir, { recursive: true, force: true });

const url = new URL(adminUrl);
url.pathname = `/${database}`;

const server = Bun.spawn(["bun", join(import.meta.dir, "../apps/server/src/main.ts")], {
  env: {
    ...process.env,
    DATABASE_URL: url.toString(),
    STAPEL_DATA_DIR: dataDir,
    PORT: process.env.E2E_SERVER_PORT ?? "3100",
  },
  stdio: ["inherit", "inherit", "inherit"],
});

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.kill(signal));
process.exit(await server.exited);
