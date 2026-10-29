import { createLocalApp, type LocalGate, type LocalUser, ownerAccess } from "@schreibzeug/local";
import { createHub } from "@schreibzeug/server/collab/hub";
import type { Folder } from "./folder";
import type { createMemoryMedia } from "./media";
import { createPageSockets, type PageSocket } from "./page-socket";

/** As large as a server takes by default (SCHREIBZEUG_MAX_UPLOAD_MB); the page holds it in memory. */
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

/** Nobody to keep out: the page is the server, and the files are the visitor's own. */
const OPEN_GATE: LocalGate = {
  unlock: (c) => c.redirect("/"),
  require: async (_c, next) => {
    await next();
  },
};

export type DemoApiDeps = {
  folder: Folder;
  media: ReturnType<typeof createMemoryMedia>["store"];
  /** What the top folder is called, in the interface's language. */
  rootName: string;
  user: LocalUser;
};

/**
 * The demo's server in the page: the desktop app's local API (apps/local app.ts) over the files in
 * memory, with the collaboration hub of the server (apps/server src/collab), so the editors join an
 * editing session and save through it exactly as they do on the computer. What only a Schreibzeug
 * server has (accounts, sharing, versions, the trash, MCP) is missing as it is on the computer, and
 * the app hides it (`/api/info` says "local").
 */
export const createDemoApi = ({ folder, media, rootName, user }: DemoApiDeps) => {
  const sockets = createPageSockets();
  const hub = createHub({ access: ownerAccess(folder) });
  const app = createLocalApp({
    folder,
    rootName,
    user,
    gate: OPEN_GATE,
    media,
    maxUploadBytes: MAX_UPLOAD_BYTES,
    // The browser does not say how much room it gives a page; nothing is written to disk anyway.
    disk: async () => null,
    collab: { hub, upgradeWebSocket: sockets.upgradeWebSocket },
  });
  const fetch = async (request: Request): Promise<Response> => app.fetch(request);
  return {
    fetch,
    /** A WebSocket to a route of this API (`ws://…/api/collab/:fileId`). */
    connect: (url: string): PageSocket => sockets.connect(url, fetch),
  };
};

export type DemoApi = ReturnType<typeof createDemoApi>;
