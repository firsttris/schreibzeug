import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBlobStore, sha256Of } from "../src/blobs";
import { readConfig } from "../src/config";
import { mimeOf } from "../src/files/mime";
import { contentDisposition } from "../src/files/serialize";

describe("blob store", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });
  const store = async () => {
    const dir = await mkdtemp(join(tmpdir(), "stapel-blob-test-"));
    dirs.push(dir);
    return { dir, blobs: createBlobStore(dir) };
  };

  it("keys bytes by their SHA-256 and reads them back", async () => {
    const { blobs } = await store();
    const bytes = new TextEncoder().encode("Stapel");
    const key = await blobs.put(bytes);
    expect(key).toBe(sha256Of(bytes));
    expect(await blobs.get(key)).toEqual(bytes);
  });

  it("writes the same bytes once and leaves no temporary files", async () => {
    const { dir, blobs } = await store();
    const bytes = new Uint8Array([1, 2, 3]);
    const key = await blobs.put(bytes);
    await blobs.put(bytes);
    expect(await readdir(dir)).toEqual([key.slice(0, 2)]);
    expect(await readdir(join(dir, key.slice(0, 2)))).toEqual([key]);
  });

  it("refuses keys that are not hashes", async () => {
    const { blobs } = await store();
    await expect(blobs.get("../../etc/passwd")).rejects.toThrow("not a blob key");
  });
});

describe("mimeOf", () => {
  it("goes by the extension, ignoring case", () => {
    expect(mimeOf("Bericht.DOCX")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(mimeOf("tabelle.xlsx")).toContain("spreadsheetml");
    expect(mimeOf("folien.pptx")).toContain("presentationml");
  });

  it("falls back for unknown and missing extensions", () => {
    expect(mimeOf("archiv.xyz")).toBe("application/octet-stream");
    expect(mimeOf("README")).toBe("application/octet-stream");
    expect(mimeOf(".docx")).toBe("application/octet-stream");
  });
});

describe("contentDisposition", () => {
  it("keeps quotes out of the plain name", () => {
    expect(contentDisposition('a"b.docx')).toBe(
      `attachment; filename="a_b.docx"; filename*=UTF-8''a%22b.docx`,
    );
  });
});

describe("readConfig", () => {
  it("has defaults for development", () => {
    expect(readConfig({})).toEqual({
      ok: true,
      value: {
        databaseUrl: "postgres://stapel:stapel@localhost:5432/stapel",
        dataDir: "data",
        port: 3000,
        maxUploadBytes: 512 * 1024 * 1024,
      },
    });
  });

  it("reports what is wrong", () => {
    const config = readConfig({ PORT: "kein Port" });
    expect(config.ok).toBe(false);
    expect(config.ok ? "" : config.error).toContain("PORT");
  });
});
