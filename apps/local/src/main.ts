import { mkdir, stat } from "node:fs/promises";
import { createBlobStore } from "@schreibzeug/server/blobs";
import { createHub } from "@schreibzeug/server/collab/hub";
import { diskSpace } from "@schreibzeug/server/disk";
import { webRoutes } from "@schreibzeug/server/web";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { createLocalApp } from "./app";
import { readConfig } from "./config";
import { createFolder } from "./folder";
import { createIds } from "./ids";
import { localMcpRoutes } from "./mcp";
import { createTrash } from "./trash";

/**
 * The local server the desktop app starts beside its window (docs/desktop.md). It prints one line,
 * `SCHREIBZEUG_LOCAL_READY <url>`, once it listens; the app opens `<url>/api/local/unlock?token=…`.
 */
const config = readConfig(process.env);
if (!config.ok) {
  console.error(`Invalid configuration:\n${config.error}`);
  process.exit(1);
}
const { root, rootName, token, port, webDir, cacheDir, maxUploadBytes, userName } = config.value;
if (!(await stat(root).catch(() => null))?.isDirectory()) {
  console.error(`Not a folder: ${root}`);
  process.exit(1);
}
await mkdir(cacheDir, { recursive: true });

const folder = createFolder({ root, ids: createIds(), trash: createTrash() });
const user = { id: "local", name: userName };
const hub = createHub({
  access: async (fileId) => {
    const file = await folder.findFile(fileId);
    return file.ok && file.value.version !== null ? { version: file.value.version, role: "owner" } : null;
  },
});
const { upgradeWebSocket, websocket } = createBunWebSocket();
const app = createLocalApp({
  folder,
  rootName,
  user,
  token,
  media: createBlobStore(cacheDir),
  maxUploadBytes,
  disk: diskSpace(root),
  collab: { hub, upgradeWebSocket },
});
const site = new Hono().route("/", app).route("/", localMcpRoutes({ api: app, token }));
// The bytes stay on this computer: compressing them would only cost time.
if (webDir) site.route("/", webRoutes(webDir, { compress: false }));
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch: site.fetch,
  websocket,
  maxRequestBodySize: maxUploadBytes + 1024 * 1024,
});
const url = `http://127.0.0.1:${server.port}`;
console.log(`SCHREIBZEUG_LOCAL_READY ${url}`);
if (!process.env.SCHREIBZEUG_LOCAL_TOKEN) console.log(`Open ${url}/api/local/unlock?token=${token}`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// Started by the desktop app: its end closes our stdin, also when it crashed (local.rs).
if (process.env.SCHREIBZEUG_LOCAL_EXIT_WITH_STDIN === "1") {
  process.stdin.on("end", () => void shutdown());
  process.stdin.on("close", () => void shutdown());
  process.stdin.resume();
}
