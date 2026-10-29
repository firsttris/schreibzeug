import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSION_SAVE_HEADER } from "@schreibzeug/files-api";
import { createBlobStore } from "@schreibzeug/server/blobs";
import { createHub } from "@schreibzeug/server/collab/hub";
import { ok } from "@schreibzeug/server/result";
import type { UpgradeWebSocket } from "hono/ws";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalApp } from "../src/app";
import { createFolder } from "../src/folder";
import { COOKIE, tokenGate } from "../src/gate";
import { createIds } from "../src/ids";

const TOKEN = "a-token-for-the-tests-only";
let base = "";
afterEach(() => rm(base, { recursive: true, force: true }));

const start = async () => {
  base = await mkdtemp(join(tmpdir(), "schreibzeug-local-outside-edit-"));
  const root = join(base, "Dokumente");
  await Promise.all([mkdir(root), mkdir(join(base, "media"))]);
  const folder = createFolder({ root, ids: createIds(), trash: async () => ok(null) });
  const hub = createHub({
    access: async (fileId) => {
      const file = await folder.findFile(fileId);
      return file.ok && file.value.version !== null ? { version: file.value.version, role: "owner" } : null;
    },
  });
  const upgradeWebSocket = (() => () => new Response(null, { status: 426 })) as unknown as UpgradeWebSocket;
  const app = createLocalApp({
    folder,
    rootName: "Dokumente",
    user: { id: "local", name: "T" },
    gate: tokenGate(TOKEN),
    media: createBlobStore(join(base, "media")),
    maxUploadBytes: 64 * 1024,
    disk: async () => null,
    log: () => {},
    collab: { hub, upgradeWebSocket },
  });
  return { app, hub, root, headers: { cookie: `${COOKIE}=${TOKEN}`, origin: "http://localhost" } };
};

describe("the kept base of an earlier session", () => {
  it("is not served for a later session at the same version number after an outside edit", async () => {
    const { app, hub, root, headers } = await start();
    const created = await app.request("/api/files/blank", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ parentId: null, name: "Bericht", format: "docx" }),
    });
    const { id } = (await created.json()) as { id: string };
    await writeFile(join(root, "Bericht.docx"), new Uint8Array([0xa]));
    const content = async (version?: number) => {
      const r = await app.request(`/api/files/${id}/content${version ? `?version=${version}` : ""}`, {
        headers,
      });
      return { status: r.status, bytes: [...new Uint8Array(await r.arrayBuffer())] };
    };

    // 1. A window opens the file (session at version 1, loads A) and closes without a change.
    const a = (await hub.open(id, { id: "local", name: "T" }, () => {})) as string;
    hub.message(a, { type: "auth", user: { id: "local" } });
    expect((await content(1)).bytes).toEqual([0xa]);
    hub.close(a);
    expect(hub.session(id)).toBeUndefined();

    // 2. The file is edited in another program: B on disk. Outside writes keep the version number.
    await writeFile(join(root, "Bericht.docx"), new Uint8Array([0xb]));

    // 3. A window opens it again: a new session, again at version 1; it loads B.
    const b = (await hub.open(id, { id: "local", name: "T" }, () => {})) as string;
    hub.message(b, { type: "auth", user: { id: "local" } });
    expect(hub.session(id)?.baseVersion).toBe(1);
    expect((await content(1)).bytes).toEqual([0xb]);

    // 4. That window saves without a change (Ctrl+S): version 2, still B.
    const put = await app.request(`/api/files/${id}/content`, {
      method: "PUT",
      headers: { ...headers, [SESSION_SAVE_HEADER]: "1:0" },
      body: new Uint8Array([0xb]),
    });
    expect(put.status).toBe(200);

    // 5. A second window joins the session (version 1) and loads it: it must get B, as the first did.
    const c = (await hub.open(id, { id: "local", name: "T" }, () => {})) as string;
    hub.message(c, { type: "auth", user: { id: "local" } });
    expect(hub.session(id)?.baseVersion).toBe(1);
    expect((await content(1)).bytes).toEqual([0xb]);
  });
});
