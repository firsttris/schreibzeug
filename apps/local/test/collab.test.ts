import { mkdir, mkdtemp, rm } from "node:fs/promises";
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
import { COOKIE } from "../src/gate";
import { createIds } from "../src/ids";

const TOKEN = "a-token-for-the-tests-only";
let base = "";
afterEach(() => rm(base, { recursive: true, force: true }));

/** The local app with its relay, wired as main.ts does; no WebSocket, the hub is driven directly. */
const start = async () => {
  base = await mkdtemp(join(tmpdir(), "schreibzeug-local-collab-"));
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
    token: TOKEN,
    media: createBlobStore(join(base, "media")),
    maxUploadBytes: 64 * 1024,
    log: () => {},
    collab: { hub, upgradeWebSocket },
  });
  return { app, hub, headers: { cookie: `${COOKIE}=${TOKEN}`, origin: "http://localhost" } };
};

describe("the local relay", () => {
  it("has the next window open the file on disk and replay only what it lacks", async () => {
    const { app, hub, headers } = await start();
    const created = await app.request("/api/files/blank", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ parentId: null, name: "Bericht", format: "docx" }),
    });
    const { id } = (await created.json()) as { id: string };

    const first: Record<string, unknown>[] = [];
    const a = (await hub.open(id, { id: "local", name: "T" }, (m) => first.push(m))) as string;
    expect(first[0]).toEqual({ type: "schreibzeug:session", baseVersion: 1 });
    hub.message(a, { type: "auth", user: { id: "local" } });
    hub.message(a, {
      type: "saveChanges",
      startSaveChanges: true,
      endSaveChanges: true,
      changes: ["c1", "c2", "c3"],
    });
    // A save holding the first two changes; the window closes before the next one.
    const put = await app.request(`/api/files/${id}/content`, {
      method: "PUT",
      headers: { ...headers, [SESSION_SAVE_HEADER]: "1:2" },
      body: new Uint8Array([1, 2, 3, 4]),
    });
    expect(put.status).toBe(200);
    hub.close(a);

    // The local server keeps no older version: the file on disk (version 2) is what opens.
    const second: Record<string, unknown>[] = [];
    const b = (await hub.open(id, { id: "local", name: "T" }, (m) => second.push(m))) as string;
    hub.message(b, { type: "auth", user: { id: "local" } });
    expect(second[0]).toEqual({ type: "schreibzeug:session", baseVersion: 2 });
    expect(second.find((m) => m.type === "authChanges")?.changes).toMatchObject([{ change: '"c3"' }]);

    // A late save of the first window's copy (version 1 and two changes) is refused: it lacks c3.
    const late = await app.request(`/api/files/${id}/content`, {
      method: "PUT",
      headers: { ...headers, [SESSION_SAVE_HEADER]: "1:2" },
      body: new Uint8Array([9]),
    });
    expect(late.status).toBe(409);
    const onDisk = await app.request(`/api/files/${id}/content`, { headers });
    expect(new Uint8Array(await onDisk.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});
