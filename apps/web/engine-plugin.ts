import { createReadStream, existsSync, statSync } from "node:fs";
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

const serve =
  (root: string) =>
  (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const file = resolveEnginePath(root, req.url ?? "/");
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
 */
export const enginePlugin = (engineDist: string, base = "/engine"): Plugin => {
  const root = resolve(engineDist);
  let outDir = "dist";
  return {
    name: "stapel-engine",
    configResolved: (config) => {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer: (server) => {
      server.middlewares.use(base, serve(root));
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(base, serve(root));
    },
    closeBundle: async () => {
      if (existsSync(root)) await cp(root, join(outDir, base), { recursive: true });
    },
  };
};
