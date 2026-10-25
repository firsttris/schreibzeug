import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type FileNode, folderListingSchema, nodeSchema, serverInfoSchema } from "@schreibzeug/files-api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Local, startLocal } from "./harness";

let local: Local;
beforeEach(async () => {
  local = await startLocal();
});
afterEach(() => local.stop());

const listing = async (parent = "root") =>
  folderListingSchema.parse(await (await local.request(`/api/nodes?parent=${parent}`)).json());

const created = async (response: Response): Promise<FileNode> => {
  expect(response.status).toBe(201);
  return nodeSchema.parse(await response.json());
};

describe("the local files API", () => {
  it("says it is local and what the root is called", async () => {
    const info = serverInfoSchema.parse(await (await local.request("/api/info")).json());
    expect(info).toEqual({ mode: "local", rootName: "Dokumente" });
  });

  it("answers the session as the person at the computer", async () => {
    const session = (await (await local.request("/api/auth/get-session")).json()) as { user: unknown };
    expect(session.user).toMatchObject({ id: "local", name: "Tristan" });
  });

  it("lists the folder's files and folders, folders first, hidden ones left out", async () => {
    await mkdir(join(local.root, "Briefe"));
    await writeFile(join(local.root, "Zahlen.xlsx"), "x");
    await writeFile(join(local.root, "antrag.docx"), "x");
    await writeFile(join(local.root, ".hidden"), "x");
    await writeFile(join(local.root, "~$antrag.docx"), "x");

    const { folder, path, children } = await listing();
    expect(folder).toBeNull();
    expect(path).toEqual([]);
    expect(children.map((node) => [node.kind, node.name])).toEqual([
      ["folder", "Briefe"],
      ["file", "antrag.docx"],
      ["file", "Zahlen.xlsx"],
    ]);
    expect(children.every((node) => node.role === "owner" && node.parentId === null)).toBe(true);
  });

  it("creates a blank document in a subfolder, on disk", async () => {
    const folder = await created(
      await local.json("/api/folders", "POST", { parentId: null, name: "Briefe" }),
    );
    const file = await created(
      await local.json("/api/files/blank", "POST", { parentId: folder.id, name: "Antrag", format: "docx" }),
    );
    expect(file).toMatchObject({ name: "Antrag.docx", parentId: folder.id, version: 1 });
    const bytes = await readFile(join(local.root, "Briefe", "Antrag.docx"));
    expect(bytes.subarray(0, 2).toString()).toBe("PK");

    const inside = await listing(folder.id);
    expect(inside.path.map((node) => node.name)).toEqual(["Briefe"]);
    expect(inside.folder?.name).toBe("Briefe");
    expect(inside.children.map((node) => node.id)).toEqual([file.id]);
  });

  it("refuses a name that is taken", async () => {
    await writeFile(join(local.root, "Antrag.docx"), "x");
    const response = await local.json("/api/files/blank", "POST", {
      parentId: null,
      name: "Antrag",
      format: "docx",
    });
    expect(response.status).toBe(409);
  });

  it("checks a blank file's name with its extension", async () => {
    const tooLong = await local.json("/api/files/blank", "POST", {
      parentId: null,
      name: "a".repeat(255),
      format: "docx",
    });
    expect(tooLong.status).toBe(400);
    const longest = await created(
      await local.json("/api/files/blank", "POST", { parentId: null, name: "a".repeat(250), format: "docx" }),
    );
    expect(longest.name).toHaveLength(255);
  });

  it("refuses a name the file list would hide, before touching the disk", async () => {
    await writeFile(join(local.root, "a.docx"), "x");
    const [file] = (await listing()).children;
    if (!file) throw new Error("no file");

    const renamed = await local.json(`/api/nodes/${file.id}`, "PATCH", { name: ".a.docx" });
    expect(renamed.status).toBe(400);
    expect(existsSync(join(local.root, "a.docx"))).toBe(true);

    const folder = await local.json("/api/folders", "POST", { parentId: null, name: ".geheim" });
    expect(folder.status).toBe(400);
    const blank = await local.json("/api/files/blank", "POST", {
      parentId: null,
      name: "~$Antrag",
      format: "docx",
    });
    expect(blank.status).toBe(400);
    const form = new FormData();
    form.set("file", new File(["x"], "desktop.ini"));
    const upload = await local.request("/api/files", { method: "POST", body: form });
    expect(upload.status).toBe(400);
    expect(existsSync(join(local.root, ".geheim"))).toBe(false);
    expect(existsSync(join(local.root, "~$Antrag.docx"))).toBe(false);
    expect(existsSync(join(local.root, "desktop.ini"))).toBe(false);
  });

  it("saves over the file and counts the saves as versions", async () => {
    await writeFile(join(local.root, "Notiz.txt"), "alt");
    const [file] = (await listing()).children;
    if (!file) throw new Error("no file");

    const read = await local.request(`/api/files/${file.id}/content`);
    expect(await read.text()).toBe("alt");

    const saved = await local.request(`/api/files/${file.id}/content`, { method: "PUT", body: "neu" });
    expect(nodeSchema.parse(await saved.json()).version).toBe(2);
    expect(await readFile(join(local.root, "Notiz.txt"), "utf8")).toBe("neu");
  });

  it("keeps the id through a rename and a move, also for what is in a moved folder", async () => {
    const folder = await created(await local.json("/api/folders", "POST", { parentId: null, name: "A" }));
    const target = await created(await local.json("/api/folders", "POST", { parentId: null, name: "B" }));
    const file = await created(
      await local.json("/api/files/blank", "POST", { parentId: folder.id, name: "Text", format: "docx" }),
    );

    const renamed = await local.json(`/api/nodes/${folder.id}`, "PATCH", { name: "A2", parentId: target.id });
    expect(nodeSchema.parse(await renamed.json())).toMatchObject({ id: folder.id, parentId: target.id });
    expect(existsSync(join(local.root, "B", "A2", "Text.docx"))).toBe(true);

    const moved = nodeSchema.parse(await (await local.request(`/api/nodes/${file.id}`)).json());
    expect(moved).toMatchObject({ name: "Text.docx", parentId: folder.id });
    const inside = await listing(folder.id);
    expect(inside.path.map((node) => node.name)).toEqual(["B", "A2"]);
  });

  it("does not move a folder into itself", async () => {
    const folder = await created(await local.json("/api/folders", "POST", { parentId: null, name: "A" }));
    const inner = await created(await local.json("/api/folders", "POST", { parentId: folder.id, name: "I" }));
    const response = await local.json(`/api/nodes/${folder.id}`, "PATCH", { parentId: inner.id });
    expect(response.status).toBe(400);
  });

  it("moves a deleted file into the trash", async () => {
    await writeFile(join(local.root, "Weg.docx"), "x");
    const [file] = (await listing()).children;
    if (!file) throw new Error("no file");
    const response = await local.request(`/api/nodes/${file.id}/trash`, { method: "POST" });
    expect(nodeSchema.parse(await response.json()).trashedAt).not.toBeNull();
    expect(existsSync(join(local.trashed, "Weg.docx"))).toBe(true);
    expect((await listing()).children).toEqual([]);
  });

  it("copies a file next to the original", async () => {
    await writeFile(join(local.root, "Plan.xlsx"), "x");
    const [file] = (await listing()).children;
    if (!file) throw new Error("no file");
    const copy = await created(await local.request(`/api/files/${file.id}/copy`, { method: "POST" }));
    expect(copy.name).toBe("Plan (Kopie).xlsx");
    expect(await readFile(join(local.root, "Plan (Kopie).xlsx"), "utf8")).toBe("x");
  });

  it("uploads a file into the folder", async () => {
    const form = new FormData();
    form.set("file", new File(["hallo"], "Gruß.txt"));
    const file = await created(await local.request("/api/files", { method: "POST", body: form }));
    expect(file.name).toBe("Gruß.txt");
    expect(await readFile(join(local.root, "Gruß.txt"), "utf8")).toBe("hallo");
  });

  it("lists the files changed last from every folder", async () => {
    await mkdir(join(local.root, "Tief", "Tiefer"), { recursive: true });
    await writeFile(join(local.root, "alt.docx"), "x");
    await writeFile(join(local.root, "Tief", "Tiefer", "neu.docx"), "x");
    const old = new Date("2020-01-01");
    const { utimes } = await import("node:fs/promises");
    await utimes(join(local.root, "alt.docx"), old, old);

    const recent = nodeSchema.array().parse(await (await local.request("/api/recent")).json());
    expect(recent.map((node) => node.name)).toEqual(["neu.docx", "alt.docx"]);
  });

  it("finds a file by its id after a restart, without listing it first", async () => {
    await mkdir(join(local.root, "Briefe"));
    await writeFile(join(local.root, "Briefe", "Antrag.docx"), "x");
    const id = (await listing()).children[0]?.id;
    const inside = await listing(id);
    const fileId = inside.children[0]?.id;

    const again = await startLocal();
    try {
      await mkdir(join(again.root, "Briefe"));
      await writeFile(join(again.root, "Briefe", "Antrag.docx"), "y");
      const found = await again.request(`/api/nodes/${fileId}`);
      expect(nodeSchema.parse(await found.json()).name).toBe("Antrag.docx");
    } finally {
      await again.stop();
    }
  });

  it("keeps images added while editing until the file is saved", async () => {
    await writeFile(join(local.root, "Bild.docx"), "x");
    const [file] = (await listing()).children;
    if (!file) throw new Error("no file");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const added = await local.request(`/api/files/${file.id}/media`, { method: "POST", body: png });
    const { name } = (await added.json()) as { name: string };
    const served = await local.request(`/api/files/${file.id}/media/${name}`);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png);
  });

  it("has no sharing, versions or trash of its own", async () => {
    expect(await (await local.request("/api/shared")).json()).toEqual([]);
    expect(await (await local.request("/api/trash")).json()).toEqual([]);
    const shares = await local.request("/api/nodes/6f1c2a52-0d7e-4b8e-9a43-5d3c7b1e2f90/shares");
    expect(shares.status).toBe(404);
  });

  it("keeps out of the folder's parent", async () => {
    const response = await local.json("/api/folders", "POST", { parentId: null, name: ".." });
    expect(response.status).toBe(400);
  });
});
