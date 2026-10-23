import { join, resolve } from "node:path";
import { createBunWebSocket } from "hono/bun";
import { createApp } from "./app";
import { createBlobStore } from "./blobs";
import { createHub } from "./collab/hub";
import { readConfig } from "./config";
import { connect, migrateDatabase } from "./db/database";
import { findActive } from "./files/repository";

const config = readConfig(process.env);
if (!config.ok) {
  console.error(`Invalid configuration:\n${config.error}`);
  process.exit(1);
}

const { databaseUrl, dataDir, port, maxUploadBytes } = config.value;
const { db, close } = connect(databaseUrl);
await migrateDatabase(db);

const hub = createHub({
  currentVersion: async (fileId) => {
    const node = await findActive(db, fileId);
    return node?.kind === "file" ? (node.version ?? null) : null;
  },
});
const { upgradeWebSocket, websocket } = createBunWebSocket();
const app = createApp({
  db,
  blobs: createBlobStore(join(resolve(dataDir), "blobs")),
  maxUploadBytes,
  collab: { hub, upgradeWebSocket },
});
// Bun's own limit is 128 MB; uploads are bounded by the API's body limit instead.
const server = Bun.serve({
  port,
  fetch: app.fetch,
  websocket,
  maxRequestBodySize: maxUploadBytes + 1024 * 1024,
});
console.log(`Stapel server on http://localhost:${server.port}`);

const shutdown = async () => {
  await server.stop();
  await close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
