import { createMiddleware } from "hono/factory";
import type { AgentHub } from "./agent/hub";
import type { Auth } from "./auth/auth";
import type { AuthEnv } from "./auth/middleware";
import type { Database } from "./db/database";
import { requireFile } from "./files/repository";

/** The hubs whose WebSockets stay open: the collaboration relay and the jobs for open editors. */
export type SocketHubs = {
  db: Database;
  collab?: {
    revalidate: () => Promise<void>;
    closeSession: (id: string) => void;
    closeUser: (id: string) => void;
  };
  agent: AgentHub;
  log?: (message: string, error: unknown) => void;
};

/**
 * A WebSocket is authorized once, at its upgrade, and then stays open. These close it again when
 * what allowed it ends: the file's access (a share, the trash, a move), the sign-in session it came
 * with (sign-out, a revoked session, a password change), or all of a person's sessions (Kontext's
 * lockout, `DELETE /api/sessions`).
 */
export const openSockets = ({ db, collab, agent, log = console.error }: SocketHubs) => ({
  accessChanged: () => {
    collab?.revalidate().catch((error) => log("[collab]", error));
    agent.revalidate((userId, fileId) => requireFile(db, userId, fileId, "edit").ok);
  },
  sessionEnded: ({ id }: { id: string }) => {
    collab?.closeSession(id);
    agent.closeSession(id);
  },
  userSignedOut: (userId: string) => {
    collab?.closeUser(userId);
    agent.closeUser(userId);
  },
});

/**
 * Before a WebSocket upgrade with a session (requireSession): which sign-in session it is, so the
 * socket closes when that session ends. Better Auth's getSession is the same lookup requireUser did.
 */
export const bindSignInSession = (auth: Auth) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const found = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!found) {
      return c.json({ error: { kind: "unauthorized" as const, message: "Bitte melde dich an." } }, 401);
    }
    c.set("signInSession", found.session.id);
    await next();
  });
