import {
  type FileNode,
  folderListingSchema,
  nodeSchema,
  SESSION_SAVE_HEADER,
  type SessionSave,
  versionSchema,
} from "@schreibzeug/files-api";
import { strFromU8, unzipSync } from "fflate";
import { testClient } from "hono/testing";
import type { UpgradeWebSocket } from "hono/ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hub } from "../src/collab/hub";
import { MAX_UPLOAD_BYTES, startServer, type TestServer } from "./harness";

let server: TestServer;
let api: ReturnType<typeof testClient<TestServer["app"]>>["api"];
let cookie: string;
beforeAll(async () => {
  server = await startServer();
  cookie = await server.signUp("Anna");
  api = testClient(server.app, {}, undefined, { headers: { cookie } }).api;
});
afterAll(() => server?.stop());

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const bytesOf = (text: string) => new TextEncoder().encode(text);

/** What both `app.request()` and the typed test client return. */
type Reply = { status: number; text: () => Promise<string>; json: () => Promise<unknown> };

const expectNode = async (response: Reply, status = 200): Promise<FileNode> => {
  const body = await response.text();
  expect(response.status, body).toBe(status);
  return nodeSchema.parse(JSON.parse(body));
};

const expectError = async (response: Reply, status: number, kind: string) => {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error: { kind } });
};

const folder = async (name: string, parentId: string | null = null) =>
  expectNode(await api.folders.$post({ json: { name, parentId } }), 201);

const upload = (name: string, content: string | Uint8Array, parentId?: string) =>
  api.files.$post({
    form: {
      file: new File([typeof content === "string" ? bytesOf(content) : content], name),
      ...(parentId ? { parentId } : {}),
    },
  });

const uploaded = async (name: string, content: string, parentId?: string) =>
  expectNode(await upload(name, content, parentId), 201);

const list = async (parent: string | null) =>
  folderListingSchema.parse(await (await api.nodes.$get({ query: { parent: parent ?? "root" } })).json());

const childNames = async (parent: string | null) => (await list(parent)).children.map((node) => node.name);

const content = (id: string, version?: number) =>
  api.files[":id"].content.$get({
    param: { id },
    query: version ? { version: String(version) } : {},
  });

const save = (id: string, text: string) =>
  server.app.request(`/api/files/${id}/content`, { method: "PUT", body: bytesOf(text), headers: { cookie } });

const trash = (id: string) => api.nodes[":id"].trash.$post({ param: { id } });
const restore = (id: string) => api.nodes[":id"].restore.$post({ param: { id } });
const update = (id: string, json: { name?: string; parentId?: string | null }) =>
  api.nodes[":id"].$patch({ param: { id }, json });

describe("health", () => {
  it("answers", async () => {
    expect(await (await api.health.$get()).json()).toEqual({ ok: true });
  });
});

describe("folders", () => {
  it("lists folders before files, by name, with a path to the folder", async () => {
    const projects = await folder("Projekte");
    const schreibzeug = await folder("Schreibzeug", projects.id);
    await uploaded("b.docx", "b", schreibzeug.id);
    await folder("Zeug", schreibzeug.id);
    await uploaded("A.docx", "a", schreibzeug.id);

    const listing = await list(schreibzeug.id);
    expect(listing.folder?.id).toBe(schreibzeug.id);
    expect(listing.path.map((node) => node.name)).toEqual(["Projekte", "Schreibzeug"]);
    expect(listing.children.map((node) => node.name)).toEqual(["Zeug", "A.docx", "b.docx"]);
  });

  it("keeps names unique per folder, ignoring case", async () => {
    await folder("Rechnungen");
    await expectError(
      await api.folders.$post({ json: { name: "rechnungen", parentId: null } }),
      409,
      "name_taken",
    );
  });

  it("ignores case also in umlauts, which SQLite's lower() does not know", async () => {
    await folder("Übersicht");
    await expectError(
      await api.folders.$post({ json: { name: "übersicht", parentId: null } }),
      409,
      "name_taken",
    );
  });

  it("rejects names a file system cannot hold", async () => {
    for (const name of ["", "  ", "a/b", "..", "x:y"]) {
      await expectError(await api.folders.$post({ json: { name, parentId: null } }), 400, "invalid");
    }
  });

  it("reports a missing folder", async () => {
    await expectError(await api.nodes.$get({ query: { parent: crypto.randomUUID() } }), 404, "not_found");
    await expectError(await api.nodes.$get({ query: { parent: "kein-uuid" } }), 400, "invalid");
  });

  it("does not put anything into a file", async () => {
    const file = await uploaded("blatt.docx", "x");
    await expectError(
      await api.folders.$post({ json: { name: "Innen", parentId: file.id } }),
      422,
      "not_a_folder",
    );
  });
});

describe("files", () => {
  it("stores an upload and gives back the same bytes", async () => {
    const file = await uploaded("Brief.docx", "Inhalt");
    expect(file).toMatchObject({ kind: "file", name: "Brief.docx", mime: DOCX, size: 6, version: 1 });

    const response = await content(file.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(DOCX);
    expect(response.headers.get("x-schreibzeug-version")).toBe("1");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("Inhalt");
  });

  it("names the download in UTF-8", async () => {
    const file = await uploaded("Übersicht 2026.docx", "x");
    expect((await content(file.id)).headers.get("content-disposition")).toBe(
      `attachment; filename="_bersicht 2026.docx"; filename*=UTF-8''%C3%9Cbersicht%202026.docx`,
    );
  });

  it("keeps every saved version", async () => {
    const file = await uploaded("Notiz.txt", "eins");
    expect(await expectNode(await save(file.id, "zwei, länger"))).toMatchObject({ version: 2, size: 13 });
    await expectNode(await save(file.id, "drei"));

    const versions = versionSchema
      .array()
      .parse(await (await api.files[":id"].versions.$get({ param: { id: file.id } })).json());
    expect(versions.map((version) => [version.number, version.size])).toEqual([
      [3, 4],
      [2, 13],
      [1, 4],
    ]);
    expect(await (await content(file.id)).text()).toBe("drei");
    expect(await (await content(file.id, 1)).text()).toBe("eins");
    await expectError(await content(file.id, 9), 404, "not_found");
  });

  it("restores an older version as a new one, keeping the ones in between", async () => {
    const file = await uploaded("Vertrag.txt", "erste Fassung");
    await expectNode(await save(file.id, "zweite Fassung"));

    const restored = await expectNode(
      await api.files[":id"].versions[":number"].restore.$post({ param: { id: file.id, number: "1" } }),
    );
    expect(restored.version).toBe(3);
    expect(await (await content(file.id)).text()).toBe("erste Fassung");
    expect(await (await content(file.id, 2)).text()).toBe("zweite Fassung");

    await expectError(
      await api.files[":id"].versions[":number"].restore.$post({ param: { id: file.id, number: "7" } }),
      404,
      "not_found",
    );
  });

  it("copies the newest version next to the original, with a name that is free", async () => {
    const parent = await folder("Kopien");
    const file = await uploaded("Angebot.docx", "erste", parent.id);
    await expectNode(await save(file.id, "neueste"));
    const copy = () => api.files[":id"].copy.$post({ param: { id: file.id } });

    const first = await expectNode(await copy(), 201);
    expect(first).toMatchObject({ name: "Angebot (Kopie).docx", parentId: parent.id, version: 1 });
    expect(await (await content(first.id)).text()).toBe("neueste");
    expect((await expectNode(await copy(), 201)).name).toBe("Angebot (Kopie 2).docx");
  });

  it("does not copy a folder", async () => {
    const parent = await folder("Nicht kopierbar");
    await expectError(await api.files[":id"].copy.$post({ param: { id: parent.id } }), 400, "invalid");
  });

  it("stores the same bytes once", async () => {
    const a = await uploaded("a.txt", "gleich");
    const b = await uploaded("b.txt", "gleich");
    const [va, vb] = await Promise.all(
      [a, b].map(
        async (file) =>
          versionSchema
            .array()
            .parse(await (await api.files[":id"].versions.$get({ param: { id: file.id } })).json())[0],
      ),
    );
    expect(va?.sha256).toBe(vb?.sha256);
  });

  it("numbers concurrent saves without gaps or duplicates", async () => {
    const file = await uploaded("parallel.txt", "0");
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => save(file.id, `v${i}`)));
    expect(results.map((response) => response.status)).toEqual(Array(8).fill(200));
    const versions = versionSchema
      .array()
      .parse(await (await api.files[":id"].versions.$get({ param: { id: file.id } })).json());
    expect(versions.map((version) => version.number)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("refuses uploads above the limit", async () => {
    await expectError(await upload("gross.bin", new Uint8Array(MAX_UPLOAD_BYTES + 1)), 413, "too_large");
  });

  it("creates a blank Word document with the right extension", async () => {
    const created = await expectNode(
      await api.files.blank.$post({ json: { name: "Neues Dokument", parentId: null, format: "docx" } }),
      201,
    );
    expect(created).toMatchObject({ name: "Neues Dokument.docx", mime: DOCX, version: 1 });

    const zip = unzipSync(new Uint8Array(await (await content(created.id)).arrayBuffer()));
    const document = zip["word/document.xml"];
    expect(document && strFromU8(document)).toContain("<w:body>");
  });

  it("creates a blank spreadsheet with one sheet", async () => {
    const created = await expectNode(
      await api.files.blank.$post({ json: { name: "Zahlen", parentId: null, format: "xlsx" } }),
      201,
    );
    expect(created).toMatchObject({
      name: "Zahlen.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const zip = unzipSync(new Uint8Array(await (await content(created.id)).arrayBuffer()));
    const workbook = zip["xl/workbook.xml"];
    expect(workbook && strFromU8(workbook)).toContain('name="Tabelle1"');
  });

  it("creates a blank presentation with a title slide", async () => {
    const created = await expectNode(
      await api.files.blank.$post({ json: { name: "Vortrag", parentId: null, format: "pptx" } }),
      201,
    );
    expect(created).toMatchObject({
      name: "Vortrag.pptx",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const zip = unzipSync(new Uint8Array(await (await content(created.id)).arrayBuffer()));
    expect(Object.keys(zip)).toContain("ppt/slides/slide1.xml");
  });

  it("refuses a blank file whose name grows too long with its extension", async () => {
    await expectError(
      await api.files.blank.$post({ json: { name: "a".repeat(255), parentId: null, format: "docx" } }),
      400,
      "invalid",
    );
    const fits = await expectNode(
      await api.files.blank.$post({ json: { name: "b".repeat(250), parentId: null, format: "docx" } }),
      201,
    );
    expect(fits.name).toHaveLength(255);
  });

  it("does not read a folder as a file", async () => {
    const box = await folder("Kein Inhalt");
    await expectError(await content(box.id), 400, "invalid");
    await expectError(await save(box.id, "x"), 400, "invalid");
  });
});

describe("rename and move", () => {
  it("renames, also when only the case changes", async () => {
    const file = await uploaded("bericht.docx", "x");
    expect((await expectNode(await update(file.id, { name: "Bericht.docx" }))).name).toBe("Bericht.docx");
  });

  it("moves into another folder and back to the root", async () => {
    const target = await folder("Ziel");
    const file = await uploaded("wandert.docx", "x");
    await expectNode(await update(file.id, { parentId: target.id }));
    expect(await childNames(target.id)).toEqual(["wandert.docx"]);
    await expectNode(await update(file.id, { parentId: null }));
    expect(await childNames(target.id)).toEqual([]);
  });

  it("does not move a folder into itself or below itself", async () => {
    const outer = await folder("Aussen");
    const inner = await folder("Innen", outer.id);
    await expectError(await update(outer.id, { parentId: outer.id }), 409, "conflict");
    await expectError(await update(outer.id, { parentId: inner.id }), 409, "conflict");
  });

  it("does not move onto a taken name", async () => {
    const target = await folder("Belegt");
    await uploaded("doppelt.docx", "1", target.id);
    const other = await uploaded("doppelt.docx", "2");
    await expectError(await update(other.id, { parentId: target.id }), 409, "name_taken");
  });

  it("needs something to change", async () => {
    const file = await uploaded("leer.docx", "x");
    await expectError(await update(file.id, {}), 400, "invalid");
  });
});

describe("trash", () => {
  it("hides a trashed folder with everything in it, and brings it all back", async () => {
    const archive = await folder("Archiv");
    const year = await folder("2025", archive.id);
    const file = await uploaded("alt.docx", "x", year.id);

    await expectNode(await trash(archive.id));
    expect(await childNames(null)).not.toContain("Archiv");
    await expectError(await content(file.id), 404, "not_found");
    expect((await (await api.recent.$get()).json()).map((node) => node.id)).not.toContain(file.id);
    expect((await (await api.trash.$get()).json()).map((node) => node.id)).toContain(archive.id);

    await expectNode(await restore(archive.id));
    expect(await childNames(year.id)).toEqual(["alt.docx"]);
    expect((await (await api.trash.$get()).json()).map((node) => node.id)).not.toContain(archive.id);
  });

  it("leaves what was trashed earlier in the trash", async () => {
    const box = await folder("Kiste");
    const early = await uploaded("früher.docx", "x", box.id);
    const later = await uploaded("später.docx", "x", box.id);
    await expectNode(await trash(early.id));
    await expectNode(await trash(box.id));
    await expectNode(await restore(box.id));
    expect(await childNames(box.id)).toEqual([later.name]);
    expect((await (await api.trash.$get()).json()).map((node) => node.id)).toContain(early.id);
  });

  it("frees the name, and refuses to restore onto it once it is taken again", async () => {
    const first = await uploaded("Plan.docx", "1");
    await expectNode(await trash(first.id));
    await uploaded("Plan.docx", "2");
    await expectError(await restore(first.id), 409, "name_taken");
  });

  it("restores only into a folder outside the trash", async () => {
    const parent = await folder("Eltern");
    const child = await uploaded("Kind.docx", "x", parent.id);
    await expectNode(await trash(child.id));
    await expectNode(await trash(parent.id));
    await expectError(await restore(child.id), 409, "conflict");
  });

  it("only restores what is in the trash", async () => {
    const file = await uploaded("hier.docx", "x");
    await expectError(await restore(file.id), 404, "not_found");
    await expectError(await trash(crypto.randomUUID()), 404, "not_found");
  });
});

describe("recent", () => {
  it("lists files by their last change", async () => {
    const old = await uploaded("zuerst.txt", "x");
    await uploaded("danach.txt", "x");
    await expectNode(await save(old.id, "neu"));
    const recent = (await (await api.recent.$get()).json()).map((node) => node.name);
    expect(recent.indexOf("zuerst.txt")).toBeLessThan(recent.indexOf("danach.txt"));
  });
});

describe("a save from a shared session", () => {
  const relayedServer = async () => {
    const stored: Array<[string, number, SessionSave]> = [];
    // The relay's session started at version 1.
    const hub = {
      begin: (_id: string, save: SessionSave) => save.baseVersion === 1,
      stored: (...args: [string, number, SessionSave]) => stored.push(args),
      abandon: () => {},
    } as unknown as Hub;
    const upgradeWebSocket = (() => () => new Response(null, { status: 426 })) as unknown as UpgradeWebSocket;
    const relayed = await startServer({ collab: { hub, upgradeWebSocket } });
    const anna = await relayed.signUp("Anna");
    const put = (id: string, headers: Record<string, string>) =>
      relayed.app.request(`/api/files/${id}/content`, {
        method: "PUT",
        body: bytesOf("neu"),
        headers: { cookie: anna, ...headers },
      });
    const form = new FormData();
    form.set("file", new File([bytesOf("x")], "geteilt.docx"));
    const file = await expectNode(
      await relayed.app.request("/api/files", { method: "POST", body: form, headers: { cookie: anna } }),
      201,
    );
    return { relayed, put, file, stored, anna };
  };

  it("tells the relay which version holds how much of the session's log", async () => {
    const { relayed, put, file, stored } = await relayedServer();
    try {
      await expectNode(await put(file.id, { [SESSION_SAVE_HEADER]: "1:7" }));
      await expectNode(await put(file.id, {})); // a save from outside a session
      await expectNode(await put(file.id, { [SESSION_SAVE_HEADER]: "7" }));
      expect(stored).toEqual([[file.id, 2, { baseVersion: 1, index: 7 }]]);
    } finally {
      await relayed.stop();
    }
  });

  it("refuses a save from a session that is gone, so its old copy stores no version", async () => {
    const { relayed, put, file, stored, anna } = await relayedServer();
    try {
      await expectError(await put(file.id, { [SESSION_SAVE_HEADER]: "0:3" }), 409, "conflict");
      expect(stored).toEqual([]);
      const versions = await relayed.app.request(`/api/files/${file.id}/versions`, {
        headers: { cookie: anna },
      });
      expect(await versions.json()).toHaveLength(1);
    } finally {
      await relayed.stop();
    }
  });
});
