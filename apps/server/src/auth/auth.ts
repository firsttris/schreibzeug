import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins";
import { and, count, eq } from "drizzle-orm";
import type { OidcConfig } from "../config";
import type { Database } from "../db/database";
import * as schema from "../db/schema";
import { findInvitation } from "../files/invites";
import { adoptOwnerless } from "../files/repository";
import { claimPendingShares } from "../files/shares";

export type AuthDeps = {
  db: Database;
  /** Signs the session cookies; at least 32 characters (main.ts keeps one in the data folder). */
  secret: string;
  /** Whether anyone may create an account. The first account can always be created. */
  openSignup: boolean;
  /** Origins besides the server's own that may sign in, e.g. the desktop app. */
  trustedOrigins?: string[];
  /** Where browsers reach the server; without it Better Auth takes the address of each request. */
  baseUrl?: string | undefined;
  /** Signing in through another service (Kontext); email and password stay. */
  oidc?: OidcConfig | undefined;
};

/** The provider id of the sign-in through another service; its callback is /api/auth/callback/oidc. */
export const OIDC_PROVIDER = "oidc";

/** Better Auth's route that finishes a sign-in through another service (api/routes/callback.ts). */
const OAUTH_CALLBACK_PATH = "/callback/:id";

/**
 * The other service as a provider (better-auth plugins/generic-oauth): read from its discovery
 * document, with PKCE, the client secret in the Authorization header, and the id token checked
 * against its keys. The account is kept by the provider's `sub`, so a changed address keeps it.
 */
const oidcPlugin = (oidc: OidcConfig) =>
  genericOAuth({
    config: [
      {
        providerId: OIDC_PROVIDER,
        name: oidc.name,
        discoveryUrl: `${oidc.issuer}/.well-known/openid-configuration`,
        clientId: oidc.clientId,
        clientSecret: oidc.clientSecret,
        scopes: ["openid", "profile", "email"],
        pkce: true,
        authentication: "basic",
        requireIdTokenVerification: true,
      },
    ],
  });

/** The header that carries an invitation's token with a sign-up (web: api/account.ts). */
export const INVITE_HEADER = "x-schreibzeug-invite";

/** The provider's subject an account is linked to, if any. */
const linkedSubject = (db: Database, userId: string): string | undefined =>
  db
    .select({ subject: schema.account.accountId })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, OIDC_PROVIDER)))
    .get()?.subject;

const userCount = (db: Database): number => db.select({ value: count() }).from(schema.user).get()?.value ?? 0;

/**
 * Accounts with email and password (Better Auth), stored in the app's database with its Drizzle
 * adapter. Sessions are cookies under /api/auth. Requests from the server's own origin are
 * trusted, whatever host name it is reached by; Better Auth checks the Origin header against
 * that (api/middlewares/origin-check.mjs validateOrigin).
 */
export const createAuth = ({ db, secret, openSignup, trustedOrigins = [], baseUrl, oidc }: AuthDeps) =>
  betterAuth({
    secret,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
    basePath: "/api/auth",
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
    trustedOrigins: (request) => [...trustedOrigins, ...(request ? [new URL(request.url).origin] : [])],
    telemetry: { enabled: false },
    // Cookies of their own name: beside Kontext on one host (localhost in development and tests),
    // Better Auth's default name would make each sign-in replace the other's (cookies know no ports).
    advanced: { cookiePrefix: "schreibzeug" },
    // Someone who signs in through Kontext with the address of an existing account gets that account
    // when the address is confirmed here (Better Auth's `requireLocalEmailVerified`, on by default).
    // An account with a password is linked from its own session instead (login page: signing in with
    // the password after `account_not_linked` links Kontext right after, `linkSocial`).
    account: { accountLinking: { enabled: true, trustedProviders: [OIDC_PROVIDER] } },
    plugins: oidc ? [oidcPlugin(oidc)] : [],
    databaseHooks: {
      account: {
        create: {
          // One person at the provider per account: an address given to someone new at Kontext (a
          // new subject) does not take over the account the former person used.
          before: async (created) => {
            if (created.providerId !== OIDC_PROVIDER) return;
            const other = linkedSubject(db, created.userId);
            if (other && other !== created.accountId) return false;
          },
          // Better Auth links only an address that matches the provider's (oauth2/link-account.mjs):
          // it is confirmed now, and what was shared with it is the person's.
          after: async (created) => {
            if (created.providerId !== OIDC_PROVIDER) return;
            const owner = db.select().from(schema.user).where(eq(schema.user.id, created.userId)).get();
            if (!owner) return;
            if (!owner.emailVerified)
              db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, owner.id)).run();
            claimPendingShares(db, owner.id, owner.email);
          },
        },
      },
      user: {
        create: {
          // A link that still holds opens a closed sign-up: the page sends its token along. So does
          // the sign-in through Kontext: whoever Kontext knows is one of the company.
          before: async (_user, context) => {
            const token = context?.headers?.get(INVITE_HEADER);
            const invited = token ? findInvitation(db, token).ok : false;
            const throughProvider = context?.path === OAUTH_CALLBACK_PATH;
            if (!openSignup && !invited && !throughProvider && userCount(db) > 0) {
              throw new APIError("FORBIDDEN", { message: "Neue Konten legt hier nur die Verwaltung an." });
            }
          },
          // The first account takes over the files from before there were accounts. An address
          // the provider confirmed gets what was shared with it before it had an account.
          after: async (user) => {
            if (userCount(db) === 1) adoptOwnerless(db, user.id);
            if (user.emailVerified) claimPendingShares(db, user.id, user.email);
          },
        },
      },
    },
  });

export type Auth = ReturnType<typeof createAuth>;

/** The signed-in person as the API sees them. */
export type SessionUser = { id: string; name: string; email: string };

/** The user of the session the request's cookies carry, or null. */
export const sessionUser = async (auth: Auth, headers: Headers): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
};
