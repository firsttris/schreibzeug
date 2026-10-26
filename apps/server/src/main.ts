import { join, resolve } from "node:path";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { createAgentHub } from "./agent/hub";
import { createApp } from "./app";
import { createAuth, OIDC_PROVIDER } from "./auth/auth";
import { createBearer } from "./auth/bearer";
import { loadSecret } from "./auth/secret";
import { createBlobStore } from "./blobs";
import { createHub } from "./collab/hub";
import { MAX_MESSAGE_BYTES } from "./collab/limits";
import { readConfig } from "./config";
import { connect, migrateDatabase } from "./db/database";
import { roleOf } from "./files/access";
import { mcpRoutes } from "./mcp";
import { openSockets } from "./sockets";
import { webRoutes } from "./web";

const config = readConfig(process.env);
if (!config.ok) {
  console.error(`Invalid configuration:\n${config.error}`);
  process.exit(1);
}

const {
  dataDir,
  port,
  maxUploadBytes,
  authSecret,
  openSignup,
  trustedOrigins,
  webDir,
  publicUrl,
  embedOrigin,
  oidc,
} = config.value;
// One SQLite file next to the blobs: backing up the data folder backs up everything.
const { db, close } = connect(join(resolve(dataDir), "schreibzeug.db"));
migrateDatabase(db);

const hub = createHub({
  access: async (fileId, userId) => {
    const found = roleOf(db, userId, fileId);
    return found?.node.kind === "file" && found.node.version !== null
      ? { version: found.node.version, role: found.role }
      : null;
  },
});
const agent = createAgentHub();
// Ending a sign-in closes the editors' sockets it opened (sockets.ts).
const sockets = openSockets({ db, collab: hub, agent });
const auth = createAuth({
  db,
  secret: await loadSecret(authSecret, join(resolve(dataDir), "auth-secret")),
  openSignup,
  trustedOrigins,
  baseUrl: publicUrl,
  oidc,
  onSessionEnded: sockets.sessionEnded,
});
const { upgradeWebSocket, websocket } = createBunWebSocket();
const app = createApp({
  auth,
  agent,
  db,
  blobs: createBlobStore(join(resolve(dataDir), "blobs")),
  maxUploadBytes,
  pendingShares: Boolean(oidc),
  collab: { hub, upgradeWebSocket },
  // Kontext's tokens name this server's address, so they need it (SCHREIBZEUG_URL).
  ...(oidc && publicUrl
    ? {
        bearer: createBearer({
          db,
          issuer: oidc.issuer,
          audience: publicUrl,
          providerId: OIDC_PROVIDER,
          onSessionsEnded: sockets.userSignedOut,
        }),
      }
    : {}),
  info: {
    mode: "server",
    ...(oidc ? { oidc: { name: oidc.name } } : {}),
    ...(embedOrigin ? { embedOrigin } : {}),
  },
});
// The API and the MCP endpoint first; the web app, when there is one to serve, gets every other path.
const site = new Hono().route("/", app).route("/", mcpRoutes({ db, api: app, publicUrl }));
if (webDir) site.route("/", webRoutes(webDir, { embedOrigin }));
// Bun's own limit is 128 MB; uploads are bounded by the API's body limit instead.
const server = Bun.serve({
  port,
  fetch: site.fetch,
  // A larger message closes the socket (code 1009); an engine's change batches stay far below.
  websocket: { ...websocket, maxPayloadLength: MAX_MESSAGE_BYTES },
  maxRequestBodySize: maxUploadBytes + 1024 * 1024,
});
console.log(`Schreibzeug server on http://localhost:${server.port}`);

const shutdown = async () => {
  await server.stop();
  close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
