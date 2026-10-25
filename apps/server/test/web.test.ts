import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { frameAncestors, webRoutes } from "../src/web";

let folder: string;
let site: Hono;

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "schreibzeug-web-"));
  await mkdir(join(folder, "engine", "frame"), { recursive: true });
  await writeFile(join(folder, "index.html"), "<!doctype html><title>Schreibzeug</title>");
  await writeFile(join(folder, "engine", "frame", "word.js"), "window.engine = true;");
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
});
