import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { createApp } from "../src/app";
import { createBlobStore } from "../src/blobs";
import { connect, migrateDatabase } from "../src/db/database";

/**
 * The server against a database of its own, created from TEST_DATABASE_URL (a user that may create
 * databases) and dropped afterwards, so test files run in parallel and leave nothing behind.
 */
const adminUrl = process.env.TEST_DATABASE_URL ?? "postgres://stapel:stapel@localhost:5432/stapel";

export const MAX_UPLOAD_BYTES = 64 * 1024;

export const startServer = async () => {
  const name = `stapel_test_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const connection = connect(url.toString());
  await migrateDatabase(connection.db);
  const dataDir = await mkdtemp(join(tmpdir(), "stapel-blobs-"));
  const app = createApp({
    db: connection.db,
    blobs: createBlobStore(dataDir),
    maxUploadBytes: MAX_UPLOAD_BYTES,
    log: () => {},
  });

  const stop = async () => {
    await connection.close();
    await admin.unsafe(`drop database if exists ${name} with (force)`);
    await admin.end();
    await rm(dataDir, { recursive: true, force: true });
  };

  return { app, db: connection.db, dataDir, stop };
};

export type TestServer = Awaited<ReturnType<typeof startServer>>;
