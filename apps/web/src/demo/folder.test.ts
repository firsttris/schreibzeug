import { describe, expect, it } from "vitest";
import { createMemoryFolder, sha256Of } from "./folder";

const bytes = (text: string) => new TextEncoder().encode(text);

const value = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value;
};

describe("the demo's folder in memory", () => {
  it("lists folders first, then files by name, with the folder's path", async () => {
    const folder = createMemoryFolder();
    await folder.createFile(null, "b.docx", bytes("b"));
    const projects = value(await folder.createFolder(null, "Projekte"));
    await folder.createFile(null, "a.xlsx", bytes("a"));
    const inner = value(await folder.createFolder(projects.id, "2026"));

    const top = value(await folder.listing(null));
    expect(top.children.map((node) => node.name)).toEqual(["Projekte", "a.xlsx", "b.docx"]);
    expect(top.children[1]).toMatchObject({ kind: "file", version: 1, size: 1, role: "owner" });
    expect(top.children[1]?.mime).toContain("spreadsheetml");

    const listing = value(await folder.listing(inner.id));
    expect(listing.path.map((node) => node.name)).toEqual(["Projekte", "2026"]);
    expect(value(await folder.find(inner.id)).path).toBe("Projekte/2026");
  });

  it("keeps names unique per folder, ignoring case, as on the computer", async () => {
    const folder = createMemoryFolder();
    const notes = value(await folder.createFile(null, "Übersicht.md", bytes("")));
    expect(await folder.createFile(null, "übersicht.md", bytes(""))).toMatchObject({
      ok: false,
      error: { kind: "name_taken" },
    });
    // A rename that only changes the case is the same file.
    expect(value(await folder.update(notes.id, { name: "ÜBERSICHT.md" })).name).toBe("ÜBERSICHT.md");
  });

  it("moves, but never a folder into itself", async () => {
    const folder = createMemoryFolder();
    const outer = value(await folder.createFolder(null, "Außen"));
    const inner = value(await folder.createFolder(outer.id, "Innen"));
    const file = value(await folder.createFile(null, "Brief.docx", bytes("x")));

    expect(await folder.update(outer.id, { parentId: inner.id })).toMatchObject({
      error: { kind: "invalid" },
    });
    expect(value(await folder.update(file.id, { parentId: inner.id })).parentId).toBe(inner.id);
    expect(await folder.update(file.id, { parentId: file.id })).toMatchObject({
      error: { kind: "not_a_folder" },
    });
  });

  it("saves over the file and counts its version, and refuses a save over bytes that changed", async () => {
    const folder = createMemoryFolder();
    const note = value(await folder.createFile(null, "Notiz.md", bytes("eins")));
    const first = await sha256Of(bytes("eins"));

    expect(value(await folder.write(note.id, bytes("zwei"), first)).version).toBe(2);
    expect(await folder.write(note.id, bytes("drei"), first)).toMatchObject({ error: { kind: "conflict" } });
    const read = value(await folder.read(note.id));
    expect(new TextDecoder().decode(read.bytes)).toBe("zwei");
    expect(read.node.size).toBe(4);
  });

  it("lets only one of two saves over the same bytes through", async () => {
    const folder = createMemoryFolder();
    const note = value(await folder.createFile(null, "Notiz.md", bytes("eins")));
    const over = await sha256Of(bytes("eins"));
    const results = await Promise.all([
      folder.write(note.id, bytes("A"), over),
      folder.write(note.id, bytes("B"), over),
    ]);
    expect(results.map((result) => result.ok)).toEqual([true, false]);
  });

  it("copies next to the original under a free name", async () => {
    const folder = createMemoryFolder();
    const offer = value(await folder.createFile(null, "Angebot.docx", bytes("x")));
    expect(value(await folder.copy(offer.id)).name).toBe("Angebot (Kopie).docx");
    expect(value(await folder.copy(offer.id)).name).toBe("Angebot (Kopie 2).docx");
  });

  it("deletes a folder with everything in it", async () => {
    const folder = createMemoryFolder();
    const outer = value(await folder.createFolder(null, "Alt"));
    const file = value(await folder.createFile(outer.id, "Brief.docx", bytes("x")));
    expect(value(await folder.trash(outer.id)).trashedAt).not.toBeNull();
    expect(await folder.find(file.id)).toMatchObject({ error: { kind: "not_found" } });
    expect(value(await folder.listing(null)).children).toEqual([]);
  });

  it("lists the files changed last first", async () => {
    let clock = Date.parse("2026-10-29T10:00:00Z");
    const tick = () => {
      clock += 1000;
      return new Date(clock);
    };
    const folder = createMemoryFolder({ now: tick });
    const a = value(await folder.createFile(null, "a.md", bytes("")));
    await folder.createFile(null, "b.md", bytes(""));
    await folder.createFolder(null, "Ordner");
    await folder.write(a.id, bytes("neu"));
    expect((await folder.recent()).map((node) => node.name)).toEqual(["a.md", "b.md"]);
  });
});
