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

/** As collab.test.ts, but the disk write of a save waits for `release` (a slow disk). */
const start = async () => {
  base = await mkdtemp(join(tmpdir(), "schreibzeug-local-slow-disk-"));
  const root = join(base, "Dokumente");
  await Promise.all([mkdir(root), mkdir(join(base, "media"))]);
  const real = createFolder({ root, ids: createIds(), trash: async () => ok(null) });
  const gate = { hold: false, writing: () => {}, release: Promise.resolve() };
  const folder = {
    ...real,
    write: async (id: string, bytes: Uint8Array) => {
      if (gate.hold) {
        gate.writing();
        await gate.release;
      }
      return real.write(id, bytes);
    },
  };
  const hub = createHub({
    access: async (fileId) => {
      const file = await real.findFile(fileId);
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
    disk: async () => null,
    log: () => {},
    collab: { hub, upgradeWebSocket },
  });
  return { app, hub, gate, headers: { cookie: `${COOKIE}=${TOKEN}`, origin: "http://localhost" } };
};

describe("the local relay, when a window closes while its save is written", () => {
  it("keeps the change no stored version holds for the next window", async () => {
    const { app, hub, gate, headers } = await start();
    const created = await app.request("/api/files/blank", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ parentId: null, name: "Bericht", format: "docx" }),
    });
    const { id } = (await created.json()) as { id: string };
    const put = (header: string, body: number[]) =>
      app.request(`/api/files/${id}/content`, {
        method: "PUT",
        headers: { ...headers, [SESSION_SAVE_HEADER]: header },
        body: new Uint8Array(body),
      });

    const a = (await hub.open(id, { id: "local", name: "T" }, () => {})) as string;
    hub.message(a, { type: "auth", user: { id: "local" } });
    hub.message(a, { type: "saveChanges", startSaveChanges: true, endSaveChanges: true, changes: ["c1"] });
    expect((await put("1:1", [1])).status).toBe(200); // autosave of c1: version 2
    hub.message(a, {
      type: "saveChanges",
      startSaveChanges: true,
      endSaveChanges: true,
      changes: ["c2", "c3"],
    });

    // The next autosave (c1, c2) is checked and goes to disk; the window closes meanwhile.
    let writing = () => {};
    const started = new Promise<void>((resolve) => {
      writing = resolve;
    });
    let release = () => {};
    gate.hold = true;
    gate.writing = writing;
    gate.release = new Promise<void>((resolve) => {
      release = resolve;
    });
    const late = put("1:2", [1, 2]);
    await started;
    hub.close(a);
    release();
    expect((await late).status).toBe(200); // version 3 on disk holds c1, c2

    // c3 is in no version on disk: the next window opens version 1 and replays all three.
    const next: Record<string, unknown>[] = [];
    const b = (await hub.open(id, { id: "local", name: "T" }, (m) => next.push(m))) as string;
    hub.message(b, { type: "auth", user: { id: "local" } });
    expect(next[0]).toEqual({ type: "schreibzeug:session", baseVersion: 1 });
    const replayed = (next.find((m) => m.type === "authChanges")?.changes ?? []) as Array<{ change: string }>;
    expect(replayed.map((c) => c.change)).toEqual(['"c1"', '"c2"', '"c3"']);
    expect(hub.session(id)?.savedIndex).toBe(2);
  });
});
