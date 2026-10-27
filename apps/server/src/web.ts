import { stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { BunFile } from "bun";
import { Hono } from "hono";
import { createCompressionCache, type Encoding, encodingFor, isCompressible } from "./compression";

/** The file a path names inside the folder, or null for one outside it or that is not a file. */
const fileIn = async (root: string, path: string): Promise<string | null> => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  const target = resolve(join(root, decoded));
  if (target !== root && !target.startsWith(root + sep)) return null;
  const found = await stat(target).catch(() => null);
  return found?.isFile() ? target : null;
};

/**
 * Who may show the app in a frame: the app itself (the engine runs in frames of its own) and the
 * one site that embeds it (Kontext), no other.
 */
export const frameAncestors = (embedOrigin: string | undefined) =>
  `frame-ancestors 'self'${embedOrigin ? ` ${embedOrigin}` : ""}`;

/**
 * How long a browser keeps a file. The app's scripts (/assets/, named by their content) and the
 * engine (/engine/<id>/, named by the prepared engine, apps/web/engine-plugin.ts) never change
 * under their name, so they are kept for good: opening a document a second time downloads none of
 * its 60 MB again. Everything else, index.html first, is asked for again each time and answered
 * with 304 while it is unchanged.
 */
export const cacheControlOf = (path: string): string =>
  path.startsWith("/assets/") || path.startsWith("/engine/")
    ? "public, max-age=31536000, immutable"
    : "no-cache";

/** Tells one version of a file, as sent, from another: size and time, and the encoding. */
const etagOf = (file: BunFile, encoding: Encoding | null): string =>
  `"${file.size.toString(36)}-${file.lastModified.toString(36)}${encoding ? `-${encoding}` : ""}"`;

const matches = (ifNoneMatch: string | undefined, etag: string): boolean =>
  (ifNoneMatch ?? "").split(",").some((tag) => tag.trim() === etag || tag.trim() === "*");

/** Up to this much compressed output is kept in memory: the engines of all editors fit. */
const COMPRESSION_BUDGET_BYTES = 192 * 1024 * 1024;

export type WebOptions = {
  embedOrigin?: string | undefined;
  /**
   * Send files compressed (Brotli or gzip) to browsers that take them: the engine shrinks from
   * about 68 MB to 15 MB. Off for the desktop app's local server, where the bytes never leave the
   * computer.
   */
  compress?: boolean;
};

/**
 * The web app (apps/web/dist, the engine included) from the same server as the API, so one
 * address serves everything: the Docker image, and the desktop app's window onto a server.
 * Paths that name no file get index.html, where the app's router takes over (`/edit/…`).
 */
export const webRoutes = (folder: string, { embedOrigin, compress = true }: WebOptions = {}) => {
  const root = resolve(folder);
  const policy = frameAncestors(embedOrigin);
  const compressed = createCompressionCache(COMPRESSION_BUDGET_BYTES);
  return new Hono().get("*", async (c, next) => {
    if (c.req.path === "/api" || c.req.path.startsWith("/api/")) return next();
    const found = await fileIn(root, c.req.path);
    const file = found ?? join(root, "index.html");
    const body = Bun.file(file);
    const encoding =
      compress && isCompressible(body.type, body.size) ? encodingFor(c.req.header("accept-encoding")) : null;
    const etag = etagOf(body, encoding);
    const headers: Record<string, string> = {
      "content-security-policy": policy,
      // nosniff: a browser takes each file as the type it is served with, never as what it guesses.
      "x-content-type-options": "nosniff",
      "cache-control": found ? cacheControlOf(c.req.path) : "no-cache",
      etag,
      vary: "accept-encoding",
    };
    if (matches(c.req.header("if-none-match"), etag)) return new Response(null, { status: 304, headers });
    headers["content-type"] = body.type;
    if (!encoding) return new Response(body, { headers });
    const bytes = await compressed(
      { path: file, size: body.size, lastModified: body.lastModified },
      encoding,
      () => body.bytes(),
    );
    return new Response(bytes, { headers: { ...headers, "content-encoding": encoding } });
  });
};
