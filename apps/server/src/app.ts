import { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import type { Hub } from "./collab/hub";
import { collabRoutes } from "./collab/routes";
import { type FilesDeps, filesRoutes } from "./files/routes";

export type AppDeps = FilesDeps & {
  log?: (message: string, error: unknown) => void;
  /** The collaboration relay; its WebSocket upgrade depends on the runtime (Bun in main.ts). */
  collab?: { hub: Hub; upgradeWebSocket: UpgradeWebSocket };
};

/**
 * The whole HTTP surface under /api. Built from its dependencies, so the tests run it against a
 * test database and a temporary blob folder with `app.request()` and no open port.
 */
export const createApp = ({ log = console.error, collab, ...deps }: AppDeps) =>
  new Hono()
    .basePath("/api")
    .get("/health", (c) => c.json({ ok: true }))
    .route("/", filesRoutes(deps))
    .route("/", collab ? collabRoutes(collab) : new Hono())
    .onError((error, c) => {
      log("[api]", error);
      return c.json({ error: { kind: "internal" as const, message: "Interner Fehler." } }, 500);
    });

/** The route types the web app's `hc` client is built from. */
export type AppType = ReturnType<typeof createApp>;
