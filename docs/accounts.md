# Accounts

Everyone signs in with an email address and a password. The accounts are
[Better Auth](https://www.better-auth.com/) on the Stapel server (`apps/server/src/auth`), stored
in the app's own PostgreSQL through Better Auth's Drizzle adapter.

## Server

| Piece | Where |
|---|---|
| Better Auth's routes: sign-up, sign-in, sign-out, session | `/api/auth/*`, mounted in `src/app.ts` |
| Its tables `user`, `session`, `account`, `verification` | `src/db/auth-schema.ts`, as Better Auth's Drizzle schema generator writes them |
| The session check in front of every other route | `src/auth/middleware.ts` (`requireUser`); without a session the answer is `401` with `kind: "unauthorized"` |

The session is a cookie. Better Auth checks the `Origin` of requests that carry it against its
trusted origins; Stapel trusts its own origin, whatever host name the server is reached by, and
the ones in `STAPEL_TRUSTED_ORIGINS` (the desktop app, later).

Every node has an `owner_id`. Every query in `src/files/repository.ts` takes the signed-in user and
sees only their nodes; someone else's file is "not found", the same as one that does not exist.
Names are unique per owner at the top level.

The collaboration relay needs a session too: the WebSocket upgrade carries the cookie. Every
connection is checked against the file, also when the file's session is already open, and the
relay replaces the user that the engine announces in `auth` with the signed-in one, so names at
cursors and on comments are real.

## Sign-up

| Variable | Default | |
|---|---|---|
| `STAPEL_OPEN_SIGNUP` | `false` | `true`: anyone who reaches the server may create an account. Otherwise only the first account can be created there. |
| `STAPEL_AUTH_SECRET` | generated | Signs the session cookies, at least 32 characters. Without it the server generates one on first start and keeps it in `STAPEL_DATA_DIR/auth-secret` (mode 600). |
| `STAPEL_TRUSTED_ORIGINS` | – | More origins that may sign in, separated by commas. |

The first account takes over the files from before there were accounts (nodes without an owner),
so an existing installation keeps its files.

## Web app

`src/api/account.ts` wraps Better Auth's client (`better-auth/client`); TanStack Query keeps who is
signed in. Every page but `/login` sits under a route that reads the session first and sends
everyone without one to `/login?redirect=…` (`src/router.tsx`). A `401` from any request later
does the same. The editor opens documents as the signed-in user; the navigation shows the name
and the way out.

## Tests

`apps/server/test/accounts.test.ts`: no session, no API; each person sees only their files; closed
sign-up and the takeover of old files; the secret file. The server tests sign up an account in
their harness. In the E2E run (`STAPEL_OPEN_SIGNUP=true`) every test signs up an account of its own
through the API (`e2e/app.ts`); `e2e/accounts.spec.ts` goes through the form, signs out and back in,
and checks that someone else's folder is not found.
