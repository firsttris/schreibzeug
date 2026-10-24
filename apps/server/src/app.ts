import { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import type { Auth } from "./auth/auth";
import { type AuthEnv, requireUser } from "./auth/middleware";
import type { Hub } from "./collab/hub";
import { collabRoutes } from "./collab/routes";
import { type FilesDeps, filesRoutes, invitationRoutes } from "./files/routes";

export type AppDeps = FilesDeps & {
  auth: Auth;
  log?: (message: string, error: unknown) => void;
  /** The collaboration relay; its WebSocket upgrade depends on the runtime (Bun in main.ts). */
  collab?: { hub: Hub; upgradeWebSocket: UpgradeWebSocket };
};

/**
 * The whole HTTP surface under /api. Built from its dependencies, so the tests run it against a
 * test database and a temporary blob folder with `app.request()` and no open port.
 *
 * Better Auth answers under /api/auth (sign-up, sign-in, sign-out, session), and what a link
 * shares can be read without signing in; everything after that needs a session.
 */
export const createApp = ({ log = console.error, collab, auth, ...deps }: AppDeps) =>
  new Hono<AuthEnv>()
    .basePath("/api")
    .get("/health", (c) => c.json({ ok: true }))
    .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
    .route("/", invitationRoutes(deps))
    .use(requireUser(auth))
    .route("/", filesRoutes(deps))
    .route("/", collab ? collabRoutes(collab) : new Hono<AuthEnv>())
    .onError((error, c) => {
      log("[api]", error);
      return c.json({ error: { kind: "internal" as const, message: "Interner Fehler." } }, 500);
    });

/** The route types the web app's `hc` client is built from. */
export type AppType = ReturnType<typeof createApp>;
