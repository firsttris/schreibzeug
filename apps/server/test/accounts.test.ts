import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { folderListingSchema, nodeSchema } from "@schreibzeug/files-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth/auth";
import { loadSecret } from "../src/auth/secret";
import { createBlobStore } from "../src/blobs";
import { nodes } from "../src/db/schema";
import { startServer, type TestServer } from "./harness";

let server: TestServer;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server?.stop());

const call = (path: string, cookie: string | null, init: RequestInit = {}) =>
  server.app.request(path, { ...init, headers: { ...(cookie ? { cookie } : {}), ...init.headers } });

const createFolder = async (cookie: string, name: string) =>
  nodeSchema.parse(
    await (
      await call("/api/folders", cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId: null }),
      })
    ).json(),
  );

const rootNames = async (cookie: string) =>
  folderListingSchema
    .parse(await (await call("/api/nodes?parent=root", cookie)).json())
    .children.map((n) => n.name);

describe("accounts", () => {
  it("answers 401 to the API without a session, but stays open for health and sign-in", async () => {
    const reply = await call("/api/nodes", null);
    expect(reply.status).toBe(401);
    expect(await reply.json()).toMatchObject({ error: { kind: "unauthorized" } });
    expect((await call("/api/health", null)).status).toBe(200);
    expect((await call("/api/auth/get-session", null)).status).toBe(200);
    expect(await (await call("/api/info", null)).json()).toEqual({ mode: "server" });
  });

  it("keeps each person's files to themselves", async () => {
    const anna = await server.signUp("Carla");
    const ben = await server.signUp("David");
    const folder = await createFolder(anna, "Angebote");
    await createFolder(ben, "Angebote");

    expect(await rootNames(anna)).toEqual(["Angebote"]);
    expect(await rootNames(ben)).toEqual(["Angebote"]);
    expect((await call(`/api/nodes/${folder.id}`, ben)).status).toBe(404);
    expect((await call(`/api/nodes/${folder.id}/trash`, ben, { method: "POST" })).status).toBe(404);
    expect((await call(`/api/nodes/${folder.id}`, anna)).status).toBe(200);
  });

  it("tells who is signed in", async () => {
    const cookie = await server.signUp("Erik");
    const session = (await (await call("/api/auth/get-session", cookie)).json()) as {
      user: { name: string };
    };
    expect(session.user.name).toBe("Erik");
  });
});

describe("sign-up", () => {
  it("lets only the first person in when sign-up is closed, and gives them the files from before", async () => {
    // A fresh database: the shared one already has accounts.
    const fresh = await startServer();
    try {
      await fresh.db.insert(nodes).values({ kind: "folder", name: "Von früher", nameKey: "von früher" });
      const closed = createAuth({ db: fresh.db, secret: "x".repeat(40), openSignup: false });
      const app = createApp({
        auth: closed,
        db: fresh.db,
        blobs: createBlobStore(fresh.dataDir),
        maxUploadBytes: 1024,
        disk: async () => null,
      });
      const signUp = (name: string) =>
        app.request("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, email: `${name}@example.org`, password: "geheim-genug" }),
        });

      const first = await signUp("first");
      expect(first.status).toBe(200);
      const cookie = first.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const listing = await app.request("/api/nodes", { headers: { cookie } });
      expect(folderListingSchema.parse(await listing.json()).children.map((n) => n.name)).toEqual([
        "Von früher",
      ]);

      const second = await signUp("second");
      expect(second.status).toBe(403);
    } finally {
      await fresh.stop();
    }
  });
});

describe("loadSecret", () => {
  it("prefers the configured secret, else makes one and keeps it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "schreibzeug-secret-"));
    try {
      expect(await loadSecret("configured", join(dir, "auth-secret"))).toBe("configured");
      const made = await loadSecret(undefined, join(dir, "auth-secret"));
      expect(made.length).toBeGreaterThanOrEqual(32);
      expect(await loadSecret(undefined, join(dir, "auth-secret"))).toBe(made);
      expect((await readFile(join(dir, "auth-secret"), "utf8")).trim()).toBe(made);
      expect((await stat(join(dir, "auth-secret"))).mode & 0o777).toBe(0o600);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
