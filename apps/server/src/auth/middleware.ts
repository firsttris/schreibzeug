import { createMiddleware } from "hono/factory";
import { type Auth, type SessionUser, sessionUser } from "./auth";

/** What routes behind `requireUser` find on the context. */
export type AuthEnv = { Variables: { user: SessionUser } };

/** Lets a request through only with a session; its user is `c.var.user` from then on. */
export const requireUser = (auth: Auth) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const user = await sessionUser(auth, c.req.raw.headers);
    if (!user) {
      return c.json({ error: { kind: "unauthorized" as const, message: "Bitte melde dich an." } }, 401);
    }
    c.set("user", user);
    await next();
  });
