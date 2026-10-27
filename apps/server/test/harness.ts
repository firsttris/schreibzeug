import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentHub } from "../src/agent/hub";
import { type AppDeps, createApp } from "../src/app";
import { createAuth } from "../src/auth/auth";
import type { Bearer } from "../src/auth/bearer";
import { createBlobStore } from "../src/blobs";
import { connect, type Database, migrateDatabase } from "../src/db/database";
import { diskSpace } from "../src/disk";
import { mcpRoutes } from "../src/mcp";
import { openSockets } from "../src/sockets";

/**
 * The server on a database and a data folder of its own, in a temporary folder that is removed
 * afterwards, so test files run in parallel and leave nothing behind. The database is a real
 * SQLite file, as in production (bun:sqlite: the tests run on Bun, `bun --bun vitest`).
 */
export const MAX_UPLOAD_BYTES = 64 * 1024;

const TEST_SECRET = "a-test-secret-that-is-long-enough-for-better-auth";

/**
 * `bearer`: builds the check of other services' tokens from the server's database (auth/bearer.ts);
 * `pendingShares`: shares may wait for an address without an account (as with a sign-in provider).
 */
export const startServer = async ({
  bearer,
  pendingShares = false,
  collab,
  rateLimit,
  trustedOrigins,
}: {
  /** Gets what closes a person's sockets when it signs them out everywhere, as main.ts wires it. */
  bearer?: (db: Database, onSessionsEnded: (userId: string) => void) => Bearer;
  pendingShares?: boolean;
  /** The collaboration relay, for the tests of what the file routes tell it. */
  collab?: AppDeps["collab"];
  /** Better Auth's rate limit, which is off outside production. */
  rateLimit?: boolean;
  /** Origins besides the request's own that may change things with a session. */
  trustedOrigins?: string[];
} = {}) => {
  const dataDir = await mkdtemp(join(tmpdir(), "schreibzeug-test-"));
  const connection = connect(join(dataDir, "schreibzeug.db"));
  migrateDatabase(connection.db);
  // Tabs that take jobs are stood in for by the tests (mcp-edit.test.ts), with a short wait.
  const agent = createAgentHub({ timeoutMs: 1000 });
  const sockets = openSockets({ db: connection.db, ...(collab ? { collab: collab.hub } : {}), agent });
  const auth = createAuth({
    db: connection.db,
    secret: TEST_SECRET,
    openSignup: true,
    ...(rateLimit === undefined ? {} : { rateLimit }),
    onSessionEnded: sockets.sessionEnded,
  });
  const app = createApp({
    agent,
    auth,
    ...(bearer ? { bearer: bearer(connection.db, sockets.userSignedOut) } : {}),
    db: connection.db,
    blobs: createBlobStore(join(dataDir, "blobs")),
    maxUploadBytes: MAX_UPLOAD_BYTES,
    disk: diskSpace(dataDir),
    pendingShares,
    ...(collab ? { collab } : {}),
    ...(trustedOrigins ? { trustedOrigins } : {}),
    log: () => {},
  });

  // The MCP endpoint beside the API, as main.ts mounts it.
  const mcp = mcpRoutes({ db: connection.db, api: app });

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
      .map((cookie: string) => cookie.split(";")[0])
      .join("; ");
  };

  return { app, mcp, agent, auth, db: connection.db, dataDir, signUp, stop };
};

export type TestServer = Awaited<ReturnType<typeof startServer>>;
