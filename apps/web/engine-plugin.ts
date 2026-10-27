import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { cp } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { Plugin } from "vite";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".bin": "application/octet-stream",
};

/** Resolves a request path inside the engine folder, or null when it points elsewhere. */
export const resolveEnginePath = (root: string, requestPath: string): string | null => {
  const decoded = decodeURIComponent(requestPath.split("?")[0] ?? "");
  const file = normalize(join(root, decoded));
  return file === root || file.startsWith(root + sep) ? file : null;
};

/**
 * The name of the prepared engine: the start of the stamp engine:prepare writes (engine/scripts/
 * prepare.ts, a hash of the release, the scripts and the frame pages), "dev" before it ran.
 */
export const engineId = (engineDist: string): string => {
  const stamp = join(engineDist, ".version");
  return existsSync(stamp) ? readFileSync(stamp, "utf8").trim().slice(0, 12) : "dev";
};

/** A request path without the engine's name in front, which dev and preview take with or without. */
export const withoutEngineId = (requestPath: string, id: string): string =>
  requestPath.startsWith(`/${id}/`) ? requestPath.slice(id.length + 1) : requestPath;

const serve =
  (root: string, id: string) =>
  (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const file = resolveEnginePath(root, withoutEngineId(req.url ?? "/", id));
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      next();
      return;
    }
    // Font files from allfontsgen have no extension; sdkjs reads them as binary.
    res.setHeader("Content-Type", contentTypes[extname(file)] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=3600");
    createReadStream(file).pipe(res);
  };

/**
 * Serves engine/dist at /engine in dev and preview and copies it into the build. The engine is
 * prepared by `bun run engine:prepare`; it is far too large for the module graph.
 *
 * The build puts it in a folder named after the prepared engine, /engine/<id>/, and the app loads
 * it from there (`import.meta.env.ENGINE_PATH`). A new engine gets a new name, so the server can let
 * browsers keep every engine file for good (apps/server/src/web.ts cacheControlOf).
 */
export const enginePlugin = (engineDist: string, base = "/engine"): Plugin => {
  const root = resolve(engineDist);
  const id = engineId(root);
  let outDir = "dist";
  return {
    name: "schreibzeug-engine",
    config: () => ({ define: { "import.meta.env.ENGINE_PATH": JSON.stringify(`${base}/${id}`) } }),
    configResolved: (config) => {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer: (server) => {
      server.middlewares.use(base, serve(root, id));
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(base, serve(root, id));
    },
    closeBundle: async () => {
      if (existsSync(root)) await cp(root, join(outDir, base, id), { recursive: true });
    },
  };
};
