import { createMiddleware } from "hono/factory";
import { type Auth, type SessionUser, sessionUser } from "./auth";
import type { Bearer } from "./bearer";

/** What routes behind `requireUser` find on the context. */
export type AuthEnv = { Variables: { user: SessionUser } };

const BEARER = /^Bearer\s+(\S+)$/i;

/** The bearer token a request carries, if any. */
export const bearerToken = (headers: Headers): string | undefined =>
  headers.get("authorization")?.match(BEARER)?.[1];

/** The person of the request: from the session cookie, or from a bearer token where those count. */
const userOf = async (auth: Auth, bearer: Bearer | undefined, headers: Headers) => {
  const token = bearer && bearerToken(headers);
  return bearer && token ? bearer.person(token) : sessionUser(auth, headers);
};

/**
 * Lets a request through only with a session, or with a token from the sign-in provider
 * (auth/bearer.ts) when the server has one; its user is `c.var.user` from then on.
 */
export const requireUser = (auth: Auth, bearer?: Bearer) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const user = await userOf(auth, bearer, c.req.raw.headers);
    if (!user) {
      return c.json({ error: { kind: "unauthorized" as const, message: "Bitte melde dich an." } }, 401);
    }
    c.set("user", user);
    await next();
  });
