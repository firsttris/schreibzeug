import { join, resolve } from "node:path";
import { createApp } from "./app";
import { createBlobStore } from "./blobs";
import { readConfig } from "./config";
import { connect, migrateDatabase } from "./db/database";

const config = readConfig(process.env);
if (!config.ok) {
  console.error(`Invalid configuration:\n${config.error}`);
  process.exit(1);
}

const { databaseUrl, dataDir, port, maxUploadBytes } = config.value;
const { db, close } = connect(databaseUrl);
await migrateDatabase(db);

const app = createApp({ db, blobs: createBlobStore(join(resolve(dataDir), "blobs")), maxUploadBytes });
// Bun's own limit is 128 MB; uploads are bounded by the API's body limit instead.
const server = Bun.serve({ port, fetch: app.fetch, maxRequestBodySize: maxUploadBytes + 1024 * 1024 });
console.log(`Stapel server on http://localhost:${server.port}`);

const shutdown = async () => {
  await server.stop();
  await close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
