import type { ServerInfo } from "@schreibzeug/files-api";
import { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { type AgentHub, createAgentHub } from "./agent/hub";
import { agentRoutes, agentSocketRoutes } from "./agent/routes";
import type { Auth } from "./auth/auth";
import type { Bearer } from "./auth/bearer";
import { type AuthEnv, bearerToken, requireSession, requireUser } from "./auth/middleware";
import { tokenRoutes } from "./auth/token-routes";
import type { Hub } from "./collab/hub";
import { collabRoutes } from "./collab/routes";
import { type FilesDeps, filesRoutes, invitationRoutes } from "./files/routes";

export type AppDeps = FilesDeps & {
  auth: Auth;
  /** What the web app needs to know before signing in (sign-in through Kontext, the frame). */
  info?: ServerInfo;
  /** Requests from Kontext on someone's behalf (auth/bearer.ts); absent: sessions only. */
  bearer?: Bearer;
  log?: (message: string, error: unknown) => void;
  /** The collaboration relay; its WebSocket upgrade depends on the runtime (Bun in main.ts). */
  collab?: { hub: Hub; upgradeWebSocket: UpgradeWebSocket };
  /** Jobs for open editors (agent/hub.ts); its tabs connect over the collaboration's WebSocket upgrade. */
  agent?: AgentHub;
};

/**
 * The whole HTTP surface under /api. Built from its dependencies, so the tests run it against a
 * test database and a temporary blob folder with `app.request()` and no open port.
 *
 * Better Auth answers under /api/auth (sign-up, sign-in, sign-out, session), and what a link
 * shares can be read without signing in; everything after that needs a session, a token from the
 * sign-in provider, or a personal access token (auth/tokens.ts); tokens and live editing sessions
 * are for the person in the app. `DELETE /api/sessions` is only for the sign-in provider's server,
 * with a token for the person: Kontext ends someone's sessions here when they leave the company or
 * are locked (auth/bearer.ts).
 */
export const createApp = ({
  log = console.error,
  collab,
  auth,
  info = { mode: "server" },
  bearer,
  agent = createAgentHub(),
  ...deps
}: AppDeps) =>
  new Hono<AuthEnv>()
    .basePath("/api")
    .get("/health", (c) => c.json({ ok: true }))
    .get("/info", (c) => c.json(info))
    .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
    .route("/", invitationRoutes(deps))
    .delete("/sessions", async (c) => {
      const token = bearerToken(c.req.raw.headers);
      const result = bearer && token ? await bearer.endSessions(token) : "refused";
      return result === "refused"
        ? c.json({ error: { kind: "unauthorized" as const, message: "Bitte melde dich an." } }, 401)
        : c.body(null, 204);
    })
    .use(requireUser(auth, deps.db, bearer))
    .route("/", tokenRoutes(deps))
    .route("/", filesRoutes(deps))
    .route("/", agentRoutes({ db: deps.db, hub: agent }))
    .use("/collab/*", requireSession)
    .use("/agent/*", requireSession)
    .route("/", collab ? collabRoutes(collab) : new Hono<AuthEnv>())
    .route(
      "/",
      collab
        ? agentSocketRoutes({ db: deps.db, hub: agent, upgradeWebSocket: collab.upgradeWebSocket })
        : new Hono<AuthEnv>(),
    )
    .onError((error, c) => {
      log("[api]", error);
      return c.json({ error: { kind: "internal" as const, message: "Interner Fehler." } }, 500);
    });

/** The route types the web app's `hc` client is built from. */
export type AppType = ReturnType<typeof createApp>;
