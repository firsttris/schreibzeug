# Accounts

Everyone signs in with an email address and a password. The accounts are
[Better Auth](https://www.better-auth.com/) on the Stapel server (`apps/server/src/auth`), stored
in the app's own SQLite database through Better Auth's Drizzle adapter.

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
asks `src/files/access.ts` what they may do with the node; a file they have no access to is "not
found", the same as one that does not exist. Names are unique per owner at the top level.

The collaboration relay needs a session too: the WebSocket upgrade carries the cookie. Every
connection is checked against the file, also when the file's session is already open, and the
relay replaces the user that the engine announces in `auth` with the signed-in one, so names at
cursors and on comments are real.

## Sharing

The owner shares a folder or a file with the account behind an e-mail address, as `edit` or
`view` (table `shares`; `src/files/shares.ts`). There are no invitations yet: the person needs an
account. A share on a folder holds for everything below it; the user's role on a node is "owner",
or the strongest share on the node or on any folder above it, found with one recursive query
(`roleOf`).

| | view | edit | owner |
|---|:-:|:-:|:-:|
| Open, download, see versions | ✓ | ✓ | ✓ |
| Save, restore a version, rename, create in a folder | | ✓ | ✓ |
| Move, trash, share | | | ✓ |

Everything stays its owner's: what an editor creates in a shared folder belongs to the folder's
owner, and moving only happens within the owner's own folders. A weaker role than needed answers
`403 forbidden`. Trash and recent files list only the user's own nodes; "Für mich freigegeben"
(`GET /api/shared`) lists what was shared with them, and the path of a shared folder starts at the
folder that was shared.

In the editor the relay takes the role from the database for every connection. A viewer joins
with `mode: "view"` whatever the client says, and the relay drops what would change the document
(`getLock`, `saveChanges`, `isSaveLock`, the save messages; DocsCoServer refuses the first three
from viewers too). The web app opens the file read-only (`put_Mode("view")`, `asc_setViewMode`)
without toolbar or saving; with fast co-editing the engine is then a live viewer and shows the
others' changes as they come.

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
and checks that someone else's folder is not found. `apps/server/test/shares.test.ts` covers the
roles, shares on folders, taking a share back and the trash; `e2e/sharing.spec.ts` shares a
folder between two accounts: read-only with live changes, and editing.
