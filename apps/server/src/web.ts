import { stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { Hono } from "hono";

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
 * The web app (apps/web/dist, the engine included) from the same server as the API, so one
 * address serves everything: the Docker image, and the desktop app's window onto a server.
 * Paths that name no file get index.html, where the app's router takes over (`/edit/…`).
 */
export const webRoutes = (folder: string, { embedOrigin }: { embedOrigin?: string | undefined } = {}) => {
  const root = resolve(folder);
  const policy = frameAncestors(embedOrigin);
  return new Hono().get("*", async (c, next) => {
    if (c.req.path === "/api" || c.req.path.startsWith("/api/")) return next();
    const file = (await fileIn(root, c.req.path)) ?? join(root, "index.html");
    const body = Bun.file(file);
    return new Response(body, { headers: { "content-type": body.type, "content-security-policy": policy } });
  });
};
