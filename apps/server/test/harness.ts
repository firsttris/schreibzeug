import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth/auth";
import { createBlobStore } from "../src/blobs";
import { connect, migrateDatabase } from "../src/db/database";

/**
 * The server on a database and a data folder of its own, in a temporary folder that is removed
 * afterwards, so test files run in parallel and leave nothing behind. The database is a real
 * SQLite file, as in production (bun:sqlite: the tests run on Bun, `bun --bun vitest`).
 */
export const MAX_UPLOAD_BYTES = 64 * 1024;

const TEST_SECRET = "a-test-secret-that-is-long-enough-for-better-auth";

export const startServer = async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "stapel-test-"));
  const connection = connect(join(dataDir, "stapel.db"));
  migrateDatabase(connection.db);
  const auth = createAuth({ db: connection.db, secret: TEST_SECRET, openSignup: true });
  const app = createApp({
    auth,
    db: connection.db,
    blobs: createBlobStore(join(dataDir, "blobs")),
    maxUploadBytes: MAX_UPLOAD_BYTES,
    log: () => {},
  });

  const stop = async () => {
    connection.close();
    await rm(dataDir, { recursive: true, force: true });
  };

  /** Creates an account and returns the cookie of its session, for the `cookie` header. */
  const signUp = async (person: string, email = `${person.toLowerCase()}@example.org`): Promise<string> => {
    const response = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: person, email, password: "geheim-genug" }),
    });
    if (!response.ok) throw new Error(`Sign-up failed: ${response.status} ${await response.text()}`);
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  };

  return { app, auth, db: connection.db, dataDir, signUp, stop };
};

export type TestServer = Awaited<ReturnType<typeof startServer>>;
