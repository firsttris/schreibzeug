import { join } from "node:path";
import { nodeSchema, versionSchema } from "@schreibzeug/files-api";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectBlobs } from "../src/blob-collection";
import { createBlobStore } from "../src/blobs";
import { versions } from "../src/db/schema";
import { startServer, type TestServer } from "./harness";

let server: TestServer;
let owner: string;
let guest: string;
beforeAll(async () => {
  server = await startServer();
  owner = await server.signUp("Vera");
  guest = await server.signUp("Gast");
});
afterAll(() => server?.stop());

const DAY = 24 * 60 * 60 * 1000;

const call = (path: string, cookie: string, init: RequestInit = {}) =>
  server.app.request(path, { ...init, headers: { cookie, ...init.headers } });

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const upload = async (name: string, text: string) => {
  const form = new FormData();
  form.append("file", new File([text], name, { type: "text/plain" }));
  const reply = await call("/api/files", owner, { method: "POST", body: form });
  expect(reply.status, await reply.clone().text()).toBe(201);
  return nodeSchema.parse(await reply.json());
};

const save = (id: string, text: string) =>
  call(`/api/files/${id}/content`, owner, { method: "PUT", body: text });

const numbers = async (id: string) =>
  versionSchema
    .array()
    .parse(await (await call(`/api/files/${id}/versions`, owner)).json())
    .map((version) => [version.number, version.kept]);

const HOUR = 60 * 60 * 1000;

/** Moves a version back in time, to the middle of the hour `days` ago, as if it had been saved then. */
const age = (fileId: string, number: number, days: number) =>
  server.db
    .update(versions)
    .set({ createdAt: new Date(Math.floor((Date.now() - days * DAY) / HOUR) * HOUR + HOUR / 2) })
    .where(and(eq(versions.fileId, fileId), eq(versions.number, number)))
    .run();

describe("versions", () => {
  it("thins out older versions after a save, and keeps a kept one", async () => {
    const file = await upload("Angebot.txt", "eins");
    await save(file.id, "zwei");
    await save(file.id, "drei");
    // Three versions within one hour, three days ago: only the newest of that hour would stay.
    for (const number of [1, 2, 3]) age(file.id, number, 3);
    const kept = await call(`/api/files/${file.id}/versions/1`, owner, json("PATCH", { kept: true }));
    expect(versionSchema.parse(await kept.json())).toMatchObject({ number: 1, kept: true });

    expect((await save(file.id, "vier")).status).toBe(200);
    expect(await numbers(file.id)).toEqual([
      [4, false],
      [3, false],
      [1, true],
    ]);
  });

  it("lets only those who may edit keep a version", async () => {
    const file = await upload("Nur lesen.txt", "eins");
    await call(
      `/api/nodes/${file.id}/shares`,
      owner,
      json("PUT", { email: "gast@example.org", role: "view" }),
    );
    const reply = await call(`/api/files/${file.id}/versions/1`, guest, json("PATCH", { kept: true }));
    expect(reply.status).toBe(403);
    expect(
      (await call(`/api/files/${file.id}/versions/9`, owner, json("PATCH", { kept: true }))).status,
    ).toBe(404);
  });

  it("collects the bytes of thinned-out versions once they are old", async () => {
    const blobs = createBlobStore(join(server.dataDir, "blobs"));
    const file = await upload("Entwurf.txt", "nur in einer alten Version");
    await save(file.id, "jetzt");
    // Both in one hour three days ago: the next save drops the older one.
    age(file.id, 1, 3);
    age(file.id, 2, 3);
    await save(file.id, "neuer");
    expect((await numbers(file.id)).map(([number]) => number)).not.toContain(1);

    // Young blobs stay; an hour and more later the one without a version goes.
    expect(await collectBlobs(server.db, blobs, new Date())).toBe(0);
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
    expect(await collectBlobs(server.db, blobs, later)).toBeGreaterThanOrEqual(1);
    expect(await (await call(`/api/files/${file.id}/content`, owner)).text()).toBe("neuer");
  });
});
