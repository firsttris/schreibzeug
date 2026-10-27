import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cacheControlOf, frameAncestors, webRoutes } from "../src/web";

let folder: string;
let site: Hono;

const engineScript = `window.engine = "${"sdkjs ".repeat(1000)}";`;

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "schreibzeug-web-"));
  await mkdir(join(folder, "engine", "frame"), { recursive: true });
  await mkdir(join(folder, "engine", "0123abcd", "sdkjs"), { recursive: true });
  await writeFile(join(folder, "index.html"), "<!doctype html><title>Schreibzeug</title>");
  await writeFile(join(folder, "engine", "frame", "word.js"), "window.engine = true;");
  await writeFile(join(folder, "engine", "0123abcd", "sdkjs", "sdk-all.js"), engineScript);
  await writeFile(join(folder, "logo.png"), new Uint8Array(4096));
  const api = new Hono().basePath("/api").get("/health", (c) => c.json({ ok: true }));
  site = new Hono()
    .route("/", api)
    .route("/", webRoutes(folder, { embedOrigin: "https://kontext.example.org" }));
});
afterAll(() => rm(folder, { recursive: true, force: true }));

describe("the web app beside the API", () => {
  it("serves files, and index.html for the app's own routes", async () => {
    const script = await site.request("/engine/frame/word.js");
    expect(script.status).toBe(200);
    expect(await script.text()).toBe("window.engine = true;");
    expect(script.headers.get("content-type")).toContain("javascript");
    expect(script.headers.get("x-content-type-options")).toBe("nosniff");
    const page = await site.request("/edit/8c2a5f8e-6a43-4f0b-9a55-0d6f0a3b1e11");
    expect(await page.text()).toContain("<title>Schreibzeug</title>");
  });

  it("lets only itself and the embedding site show it in a frame", async () => {
    const page = await site.request("/");
    expect(page.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'self' https://kontext.example.org",
    );
    expect(frameAncestors(undefined)).toBe("frame-ancestors 'self'");
  });

  it("leaves the API alone and does not leave its folder", async () => {
    expect(await (await site.request("/api/health")).json()).toEqual({ ok: true });
    expect((await site.request("/api/missing")).status).toBe(404);
    const outside = await site.request("/..%2f..%2fetc%2fpasswd");
    expect(await outside.text()).toContain("<title>Schreibzeug</title>");
  });

  it("lets browsers keep the app's scripts and the engine for good, and ask again for the rest", async () => {
    expect(cacheControlOf("/assets/index-DQl7xx1G.js")).toBe("public, max-age=31536000, immutable");
    expect(cacheControlOf("/engine/0123abcd/sdkjs/sdk-all.js")).toBe("public, max-age=31536000, immutable");
    expect(cacheControlOf("/index.html")).toBe("no-cache");
    const route = await site.request("/edit/8c2a5f8e-6a43-4f0b-9a55-0d6f0a3b1e11");
    expect(route.headers.get("cache-control")).toBe("no-cache");
    const script = await site.request("/engine/0123abcd/sdkjs/sdk-all.js");
    expect(script.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("answers 304 to a browser that has the file already", async () => {
    const page = await site.request("/");
    const etag = page.headers.get("etag") ?? "";
    expect(etag).toMatch(/^".+"$/);
    const again = await site.request("/", { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    // A proxy may hand the tag back weak; If-None-Match compares weakly (RFC 9110 13.1.2).
    const weak = await site.request("/", { headers: { "if-none-match": `W/${etag}` } });
    expect(weak.status).toBe(304);
  });

  it("sends files compressed, Brotli where the browser takes it, else gzip", async () => {
    const path = "/engine/0123abcd/sdkjs/sdk-all.js";
    const br = await site.request(path, { headers: { "accept-encoding": "gzip, deflate, br" } });
    expect(br.headers.get("content-encoding")).toBe("br");
    expect(br.headers.get("content-type")).toContain("javascript");
    expect(br.headers.get("vary")).toBe("accept-encoding");
    const brBytes = new Uint8Array(await br.arrayBuffer());
    expect(brBytes.length).toBeLessThan(engineScript.length / 10);
    expect(brotliDecompressSync(brBytes).toString()).toBe(engineScript);

    const gzip = await site.request(path, { headers: { "accept-encoding": "gzip" } });
    expect(gzip.headers.get("content-encoding")).toBe("gzip");
    expect(gunzipSync(new Uint8Array(await gzip.arrayBuffer())).toString()).toBe(engineScript);
    // Each encoding is its own version of the file.
    expect(gzip.headers.get("etag")).not.toBe(br.headers.get("etag"));

    const plain = await site.request(path);
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(await plain.text()).toBe(engineScript);
    const image = await site.request("/logo.png", { headers: { "accept-encoding": "br" } });
    expect(image.headers.get("content-encoding")).toBeNull();
  });

  it("sends files as they are when compression is off (the desktop app's local server)", async () => {
    const local = new Hono().route("/", webRoutes(folder, { compress: false }));
    const script = await local.request("/engine/0123abcd/sdkjs/sdk-all.js", {
      headers: { "accept-encoding": "br" },
    });
    expect(script.headers.get("content-encoding")).toBeNull();
    expect(await script.text()).toBe(engineScript);
  });
});
