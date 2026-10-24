import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nameOfUser, readConfig } from "../src/config";
import { isVisible } from "../src/folder";
import { createIds, uuidV5 } from "../src/ids";
import { createTrash, trashCommand } from "../src/trash";

describe("ids", () => {
  it("are UUID v5, the same for the same path", () => {
    // RFC 9562 appendix A.4: the DNS namespace and "www.example.com".
    expect(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
    expect(createIds().idOf("a/b.docx")).toBe(createIds().idOf("a/b.docx"));
  });

  it("follow a moved folder's contents", () => {
    const ids = createIds();
    const [folder, file] = [ids.idOf("A"), ids.idOf("A/x.docx")];
    ids.idOf("AB/y.docx");
    ids.moved("A", "C/A");
    expect(ids.pathOf(folder)).toBe("C/A");
    expect(ids.pathOf(file)).toBe("C/A/x.docx");
    expect(ids.idOf("AB/y.docx")).not.toBe(file);
  });

  it("give a new file at a moved file's old path an id of its own", () => {
    const ids = createIds();
    const moved = ids.idOf("a.docx");
    ids.moved("a.docx", "b.docx");
    expect(ids.idOf("a.docx")).not.toBe(moved);
    expect(ids.pathOf(moved)).toBe("b.docx");
  });
});

describe("visible files", () => {
  it("leave out hidden files and Office's lock files", () => {
    expect(["Brief.docx", ".git", "~$Brief.docx", "desktop.ini", "Thumbs.db"].filter(isVisible)).toEqual([
      "Brief.docx",
    ]);
  });
});

describe("the trash", () => {
  it("uses the system's own on every platform, with the path never in the command text", () => {
    expect(trashCommand("linux", "/a b").cmd).toEqual(["gio", "trash", "--", "/a b"]);
    expect(trashCommand("darwin", "/a b").cmd.at(-1)).toBe("/a b");
    const windows = trashCommand("win32", "C:\\a b");
    expect(windows.env).toEqual({ STAPEL_TRASH_PATH: "C:\\a b" });
    expect(windows.cmd.join(" ")).not.toContain("C:\\a b");
  });

  it("fails when the file is still there afterwards", async () => {
    const folder = await mkdtemp(join(tmpdir(), "stapel-trash-"));
    try {
      const result = await createTrash("linux", async () => 0)(folder);
      expect(result.ok).toBe(false);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe("the configuration", () => {
  it("takes the folder, its name and the token from the environment", () => {
    const config = readConfig({
      STAPEL_LOCAL_ROOT: "/home/t/Dokumente",
      STAPEL_LOCAL_TOKEN: "sixteen-characters",
    });
    expect(config.ok && config.value).toMatchObject({
      root: "/home/t/Dokumente",
      rootName: "Dokumente",
      token: "sixteen-characters",
      port: 0,
    });
  });

  it("makes up a token when none is given", () => {
    const config = readConfig({ STAPEL_LOCAL_ROOT: "/tmp" });
    expect(config.ok && config.value.token.length).toBeGreaterThanOrEqual(32);
  });
});

describe("the person's name", () => {
  it("is the account's, as a name", () => {
    expect(nameOfUser({ USER: "tristan" })).toBe("Tristan");
    expect(nameOfUser({ USERNAME: "Anna" }, undefined)).toBe("Anna");
    expect(nameOfUser({}, "unknown")).toBe("Ich");
  });
});
