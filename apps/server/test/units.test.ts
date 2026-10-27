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
    const dir = await mkdtemp(join(tmpdir(), "schreibzeug-blob-test-"));
    dirs.push(dir);
    return { dir, blobs: createBlobStore(dir) };
  };

  it("keys bytes by their SHA-256 and reads them back", async () => {
    const { blobs } = await store();
    const bytes = new TextEncoder().encode("Schreibzeug");
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
        dataDir: "data",
        port: 3000,
        maxUploadBytes: 512 * 1024 * 1024,
        authSecret: undefined,
        openSignup: false,
        trustedOrigins: [],
        trustedProxies: [],
        versionPolicy: "thin",
      },
    });
  });

  it("keeps every version when asked to, and refuses another policy", () => {
    expect(readConfig({ SCHREIBZEUG_VERSIONS: "all" })).toMatchObject({
      ok: true,
      value: { versionPolicy: "all" },
    });
    expect(readConfig({ SCHREIBZEUG_VERSIONS: "none" }).ok).toBe(false);
  });

  it("reads the proxies in front of the server, and refuses what is no address", () => {
    expect(readConfig({ SCHREIBZEUG_TRUSTED_PROXIES: "127.0.0.1, 172.16.0.0/12, ::1" })).toMatchObject({
      ok: true,
      value: { trustedProxies: ["127.0.0.1", "172.16.0.0/12", "::1"] },
    });
    for (const wrong of ["proxy.local", "10.0.0.0/33", "10.0.0.1/8/1"]) {
      const config = readConfig({ SCHREIBZEUG_TRUSTED_PROXIES: wrong });
      expect(config.ok ? "" : config.error).toContain("SCHREIBZEUG_TRUSTED_PROXIES");
    }
  });

  it("reads the account settings", () => {
    const config = readConfig({
      SCHREIBZEUG_AUTH_SECRET: "x".repeat(32),
      SCHREIBZEUG_OPEN_SIGNUP: "true",
      SCHREIBZEUG_TRUSTED_ORIGINS: "tauri://localhost, https://office.example.org",
    });
    expect(config).toMatchObject({
      ok: true,
      value: {
        authSecret: "x".repeat(32),
        openSignup: true,
        trustedOrigins: ["tauri://localhost", "https://office.example.org"],
      },
    });
    expect(readConfig({ SCHREIBZEUG_AUTH_SECRET: "short" }).ok).toBe(false);
  });

  it("reads the sign-in through Kontext and the frame", () => {
    const config = readConfig({
      SCHREIBZEUG_URL: "https://dokumente.example.org/",
      SCHREIBZEUG_EMBED_ORIGIN: "https://kontext.example.org/mail",
      OIDC_ISSUER: "https://kontext.example.org/api/auth",
      OIDC_CLIENT_ID: "schreibzeug",
      OIDC_CLIENT_SECRET: "geheim",
    });
    expect(config).toMatchObject({
      ok: true,
      value: {
        publicUrl: "https://dokumente.example.org",
        embedOrigin: "https://kontext.example.org",
        oidc: {
          issuer: "https://kontext.example.org/api/auth",
          clientId: "schreibzeug",
          clientSecret: "geheim",
          name: "Kontext",
        },
      },
    });
    // Without all three, email and password only; an empty address counts as none.
    expect(
      readConfig({ OIDC_ISSUER: "https://kontext.example.org/api/auth", SCHREIBZEUG_URL: "" }),
    ).toMatchObject({
      ok: true,
      value: { oidc: undefined, publicUrl: undefined },
    });
  });

  it("needs the public address for the sign-in through Kontext", () => {
    const config = readConfig({
      OIDC_ISSUER: "https://kontext.example.org/api/auth",
      OIDC_CLIENT_ID: "schreibzeug",
      OIDC_CLIENT_SECRET: "geheim",
    });
    expect(config.ok).toBe(false);
    expect(config.ok ? "" : config.error).toContain("SCHREIBZEUG_URL");
  });

  it("reports what is wrong", () => {
    const config = readConfig({ PORT: "kein Port" });
    expect(config.ok).toBe(false);
    expect(config.ok ? "" : config.error).toContain("PORT");
  });
});
