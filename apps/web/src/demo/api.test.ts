import { SESSION_SAVE_HEADER } from "@schreibzeug/files-api";
import { describe, expect, it } from "vitest";
import { createDemoApi } from "./api";
import { createMemoryFolder } from "./folder";
import { createMemoryMedia } from "./media";
import type { PageSocket } from "./page-socket";

const ORIGIN = "https://firsttris.github.io";

const start = async () => {
  const folder = createMemoryFolder();
  const media = createMemoryMedia(() => "blob:demo");
  const api = createDemoApi({
    folder,
    media: media.store,
    rootName: "Meine Dateien",
    user: { id: "demo", name: "Anna" },
  });
  const file = await folder.createFile(null, "Brief.docx", new Uint8Array([1, 2, 3]));
  if (!file.ok) throw new Error("no file");
  const request = (path: string, init?: RequestInit) => api.fetch(new Request(`${ORIGIN}${path}`, init));
  return { api, folder, media, request, fileId: file.value.id };
};

/** A socket and everything it heard, as collab.ts uses one. */
const listen = (socket: PageSocket) => {
  const heard: Record<string, unknown>[] = [];
  const events: string[] = [];
  socket.onopen = () => events.push("open");
  socket.onmessage = ({ data }) => heard.push(JSON.parse(String(data)));
  socket.onclose = ({ code }) => events.push(`close ${code}`);
  return { heard, events };
};

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(check()).toBe(true);
};

describe("the demo's server in the page", () => {
  it("is a server for one person's own files, signed in without signing in", async () => {
    const { request } = await start();
    expect(await (await request("/api/info")).json()).toEqual({ mode: "local", rootName: "Meine Dateien" });
    const session = await (await request("/api/auth/get-session")).json();
    expect(session).toMatchObject({ user: { id: "demo", name: "Anna" } });
    const listing = await (await request("/api/nodes")).json();
    expect(listing.children.map((node: { name: string }) => node.name)).toEqual(["Brief.docx"]);
  });

  it("serves and saves a file's bytes", async () => {
    const { request, fileId } = await start();
    const put = await request(`/api/files/${fileId}/content`, {
      method: "PUT",
      body: new Uint8Array([9, 9]),
    });
    expect(put.status).toBe(200);
    const content = await request(`/api/files/${fileId}/content`);
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(new Uint8Array([9, 9]));
    expect(content.headers.get("x-schreibzeug-version")).toBe("2");
  });

  it("answers what only a server has as not there", async () => {
    const { request, fileId } = await start();
    expect((await request(`/api/nodes/${fileId}/shares`)).status).toBe(404);
    expect(await (await request(`/api/files/${fileId}/versions`)).json()).toEqual([]);
  });

  it("stores an image put into a file and shows it from a blob URL", async () => {
    const { request, media, fileId } = await start();
    // The first bytes of a PNG.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const stored = await request(`/api/files/${fileId}/media`, { method: "POST", body: png });
    const { name } = (await stored.json()) as { name: string };
    expect(name).toMatch(/^[0-9a-f]{64}\.png$/);
    expect(media.urlOf(name)).toBe("blob:demo");
    expect(media.urlOf(`${"0".repeat(64)}.png`)).toBe("");
  });

  it("opens a file's editing session over a WebSocket in the page", async () => {
    const { api, fileId } = await start();
    const socket = api.connect(`wss://firsttris.github.io/api/collab/${fileId}`);
    const { heard, events } = listen(socket);
    await until(() => heard.some((message) => message.type === "license"));
    expect(events).toEqual(["open"]);
    expect(heard[0]).toEqual({ type: "schreibzeug:session", baseVersion: 1 });

    socket.send(JSON.stringify({ type: "auth", user: { id: "someone" } }));
    await until(() => heard.some((message) => message.type === "auth"));
    // The relay names the user itself, whatever the engine claims.
    const auth = heard.find((message) => message.type === "auth") as { participants: { id: string }[] };
    expect(JSON.stringify(auth.participants)).toContain("demo");

    socket.close();
    await until(() => events.length === 2);
    expect(events).toEqual(["open", "close 1000"]);
  });

  it("tells the session about a save made from it", async () => {
    const { api, request, fileId } = await start();
    const socket = api.connect(`wss://firsttris.github.io/api/collab/${fileId}`);
    const { heard } = listen(socket);
    await until(() => heard.some((message) => message.type === "license"));
    socket.send(JSON.stringify({ type: "auth", user: { id: "demo" } }));
    socket.send(
      JSON.stringify({ type: "saveChanges", startSaveChanges: true, endSaveChanges: true, changes: ["c1"] }),
    );
    await until(() => heard.some((message) => message.type === "unSaveLock"));

    const put = await request(`/api/files/${fileId}/content`, {
      method: "PUT",
      headers: { [SESSION_SAVE_HEADER]: "1:1" },
      body: new Uint8Array([4]),
    });
    expect(put.status).toBe(200);
    await until(() => heard.some((message) => message.type === "schreibzeug:saved"));
  });

  it("closes a socket to a file that is not there, as the server does", async () => {
    const { api } = await start();
    const socket = api.connect(`wss://firsttris.github.io/api/collab/${crypto.randomUUID()}`);
    const { events } = listen(socket);
    await until(() => events.length === 2);
    // 4404: SOCKET_CLOSE.notFound (apps/server src/collab/limits.ts).
    expect(events).toEqual(["open", "close 4404"]);
  });

  it("closes a socket no route takes, as a browser does one the server did not upgrade", async () => {
    const { api } = await start();
    const { events } = listen(api.connect("wss://firsttris.github.io/api/nowhere"));
    await until(() => events.length > 0);
    expect(events).toEqual(["close 1006"]);
  });
});
