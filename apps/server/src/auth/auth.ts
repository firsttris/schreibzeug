import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins";
import { and, count, eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import type { OidcConfig } from "../config";
import type { Database } from "../db/database";
import * as schema from "../db/schema";
import { acceptInvite, findInvitation } from "../files/invites";
import { adoptOwnerless } from "../files/repository";
import { claimPendingShares } from "../files/shares";
import { CLIENT_IP_HEADER } from "./client-ip";

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
  /** A session ended (sign-out, revoked, password changed): its open editors' sockets close (sockets.ts). */
  onSessionEnded?: (ended: { id: string; userId: string }) => void;
  /** The proxies in front of the server, as addresses or CIDR ranges (client-ip.ts). */
  trustedProxies?: readonly string[];
  /** Better Auth's rate limit on sign-in and sign-up; absent: on in production only (its default). */
  rateLimit?: boolean;
};

/** The provider id of the sign-in through another service; its callback is /api/auth/callback/oidc. */
export const OIDC_PROVIDER = "oidc";

/** Better Auth's route that finishes a sign-in through another service (api/routes/callback.ts). */
const OAUTH_CALLBACK_PATH = "/callback/:id";

/**
 * The other service as a provider (better-auth plugins/generic-oauth): read from its discovery
 * document, with PKCE, the client secret in the Authorization header, and the id token checked
 * against its keys. The account is kept by the provider's `sub`, so a changed address keeps it.
 * The address counts as confirmed only when the provider says so with `email_verified: true`
 * (generic-oauth fetchUserInfo passes the claim on as it comes, a string or nothing included).
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
        mapProfileToUser: (profile) => ({ emailVerified: profile.email_verified === true }),
      },
    ],
  });

/**
 * Whether the provider's id token, stored with the account it was linked by, confirms `email`.
 * Better Auth checked the token against the provider's keys before (generic-oauth getUserInfo,
 * `requireIdTokenVerification`); linking from a session (`linkSocial`) does not mark the address
 * itself (oauth2/link-account.mjs linkOAuthAccount), so the hook reads the claim here.
 */
const confirmedBy = (idToken: string | null | undefined, email: string): boolean => {
  if (!idToken) return false;
  try {
    const claims = decodeJwt(idToken);
    return (
      claims.email_verified === true &&
      typeof claims.email === "string" &&
      claims.email.toLowerCase() === email.toLowerCase()
    );
  } catch {
    return false;
  }
};

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
export const createAuth = ({
  db,
  secret,
  openSignup,
  trustedOrigins = [],
  baseUrl,
  oidc,
  onSessionEnded = () => {},
  trustedProxies = [],
  rateLimit,
}: AuthDeps) =>
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
    // The rate limit counts each client by the address main.ts writes from the connection
    // (client-ip.ts), never by a header the client sets.
    advanced: {
      cookiePrefix: "schreibzeug",
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER], trustedProxies: [...trustedProxies] },
    },
    ...(rateLimit === undefined ? {} : { rateLimit: { enabled: rateLimit } }),
    // Someone who signs in through Kontext with the address of an existing account gets that account
    // when the address is confirmed here (Better Auth's `requireLocalEmailVerified`, on by default).
    // An account with a password is linked from its own session instead (login page: signing in with
    // the password after `account_not_linked` links Kontext right after, `linkSocial`).
    account: { accountLinking: { enabled: true, trustedProviders: [OIDC_PROVIDER] } },
    plugins: oidc ? [oidcPlugin(oidc)] : [],
    databaseHooks: {
      // Every way a session ends deletes its row through the internal adapter, which runs this
      // hook per session (better-auth db/internal-adapter.mjs deleteSession, deleteSessions,
      // deleteUserSessions): sign-out, revoke-session(s), revoke-other-sessions, a password change
      // that revokes the others, an expired session found by getSession.
      session: { delete: { after: async (ended) => onSessionEnded(ended) } },
      account: {
        create: {
          // One person at the provider per account: an address given to someone new at Kontext (a
          // new subject) does not take over the account the former person used.
          before: async (created) => {
            if (created.providerId !== OIDC_PROVIDER) return;
            const other = linkedSubject(db, created.userId);
            if (other && other !== created.accountId) return false;
          },
          // Better Auth links only an address that matches the provider's (oauth2/link-account.mjs).
          // When the provider confirms it (or it was confirmed before), it counts as confirmed, and
          // what was shared with it is the person's; an address the provider does not vouch for
          // gets nothing by it.
          after: async (created) => {
            if (created.providerId !== OIDC_PROVIDER) return;
            const owner = db.select().from(schema.user).where(eq(schema.user.id, created.userId)).get();
            if (!owner) return;
            if (!owner.emailVerified && !confirmedBy(created.idToken, owner.email)) return;
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
              throw new APIError("FORBIDDEN", {
                message: "Neue Konten gibt es hier nur über einen Einladungslink.",
              });
            }
          },
          // The first account takes over the files from before there were accounts. An address
          // the provider confirmed gets what was shared with it before it had an account. An
          // account a link opened is made for that link: it accepts it right away (the page's
          // "Einladung annehmen" after it changes nothing more).
          after: async (user, context) => {
            if (userCount(db) === 1) adoptOwnerless(db, user.id);
            if (user.emailVerified) claimPendingShares(db, user.id, user.email);
            const invite = context?.headers?.get(INVITE_HEADER);
            if (invite) acceptInvite(db, user.id, invite);
          },
        },
        // A sign-in through the provider confirms the address of an account it is linked to later
        // (oauth2/link-account.mjs handleOAuthUserInfo): then it gets what waited for it.
        update: {
          after: async (user) => {
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
