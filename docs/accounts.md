# Accounts

Everyone signs in with an email address and a password, or, where the server has it, through
another service such as Kontext ([Schreibzeug in Kontext](kontext.md)). The accounts are
[Better Auth](https://www.better-auth.com/) on the Schreibzeug server (`apps/server/src/auth`), stored
in the app's own SQLite database through Better Auth's Drizzle adapter.

## Server

| Piece | Where |
|---|---|
| Better Auth's routes: sign-up, sign-in, sign-out, session | `/api/auth/*`, mounted in `src/app.ts` |
| Its tables `user`, `session`, `account`, `verification` | `src/db/auth-schema.ts`, as Better Auth's Drizzle schema generator writes them |
| The session check in front of every other route | `src/auth/middleware.ts` (`requireUser`); without a session the answer is `401` with `kind: "unauthorized"`. A bearer token from Kontext counts as well ([Schreibzeug in Kontext](kontext.md#tokens-from-kontext)) |
| Personal access tokens, for MCP clients | `src/auth/tokens.ts`, `/api/tokens`; a request with `Authorization: Bearer sz_…` acts for the token's user, see [the MCP server](mcp.md#access-tokens) |

The session is a cookie, named `schreibzeug.session_token` (and so on, `advanced.cookiePrefix`):
beside Kontext on one host, as `localhost` in development, Better Auth's default names would make
each sign-in replace the other's, since cookies know no ports. Better Auth checks the `Origin` of requests that carry it against its
trusted origins; Schreibzeug trusts its own origin, whatever host name the server is reached by, and
the ones in `SCHREIBZEUG_TRUSTED_ORIGINS` (the desktop app, later).

The rest of the API checks the same for requests that come with the session cookie: what changes
something (every method but `GET`, `HEAD` and `OPTIONS`) and the WebSocket upgrades of the relay
(`/api/collab`) and of the editor jobs (`/api/agent`) must come from the request's own origin,
`SCHREIBZEUG_URL` or `SCHREIBZEUG_TRUSTED_ORIGINS`, else the answer is `403`
(`src/auth/origin.ts`). The cookie is `SameSite=Lax`, so the browser also sends it from another
origin of the same site, such as another subdomain beside Kontext or another port of the host;
without the check, a page there could upload, trash or join a live session as the person. Without
an `Origin` header the browser's `Sec-Fetch-Site` decides; a request with neither comes from no
page. Personal access tokens and Kontext's tokens are not checked: a browser never sends them by
itself.

Every node has an `owner_id`. Every query in `src/files/repository.ts` takes the signed-in user and
asks `src/files/access.ts` what they may do with the node; a file they have no access to is "not
found", the same as one that does not exist. Names are unique per owner at the top level.

The collaboration relay needs a session too: the WebSocket upgrade carries the cookie. Every
connection is checked against the file, also when the file's session is already open, and the
relay replaces the user that the engine announces in `auth` with the signed-in one, so names at
cursors and on comments are real.

## Sharing

The owner shares a folder or a file with the account behind an e-mail address, as `edit` or
`view` (table `shares`; `src/files/shares.ts`). The person needs an account, unless the server
signs in through Kontext: then a share with an address without an account waits (table
`pending_shares`; the share dialog says "Noch ohne Konto") and becomes a share when that address
gets an account the provider confirmed, at its first sign-in through Kontext or with Kontext's
first token for it (`claimPendingShares`). A sign-up with a password never gets it, since anyone
could sign up with anybody's address. Kontext uses this when a document goes into a chat, a task or
an appointment ([Schreibzeug in Kontext](kontext.md#files-in-kontext)). A share on a folder holds for everything below it; the user's role on a node is "owner",
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
folder that was shared, each folder in it with the role the user has on it.

### Links

Instead of an address, the owner can create a link (`src/files/invites.ts`, table `invites`): a
random 24-byte token, a role and an expiry of 1, 7 or 30 days. It holds for everyone who opens
it until it expires or the owner deletes it, and stops when the node goes to the trash.

The link opens `/invite/<token>` in the web app, which shows who shares what (`GET
/api/invites/:token` needs no session). Someone without a session signs in or creates an account
and comes back; "Einladung annehmen" adds a share with the link's role, or keeps a stronger one the
user already has. A link that holds also opens a closed sign-up: the page sends its token in the
`x-schreibzeug-invite` header, and the sign-up hook in `src/auth/auth.ts` lets that one account in.

In the editor the relay takes the role from the database for every connection. A viewer joins
with `mode: "view"` whatever the client says, and the relay drops what would change the document
(`getLock`, `saveChanges`, `isSaveLock`, the save messages; DocsCoServer refuses the first three
from viewers too). The web app opens the file read-only (`put_Mode("view")`, `asc_setViewMode`)
without toolbar or saving; with fast co-editing the engine is then a live viewer and shows the
others' changes as they come.

## Sign-up

| Variable | Default | |
|---|---|---|
| `SCHREIBZEUG_OPEN_SIGNUP` | `false` | `true`: anyone who reaches the server may create an account. Otherwise only the first account can be created there. |
| `SCHREIBZEUG_AUTH_SECRET` | generated | Signs the session cookies, at least 32 characters. Without it the server generates one on first start and keeps it in `SCHREIBZEUG_DATA_DIR/auth-secret` (mode 600). |
| `SCHREIBZEUG_TRUSTED_ORIGINS` | – | More origins that may sign in and, with a session, change things, separated by commas. |
| `SCHREIBZEUG_TRUSTED_PROXIES` | – | The reverse proxies in front of the server (addresses or CIDR ranges). Sign-in and sign-up allow a few tries per client in ten seconds; a client is the connection's address, behind these proxies the first forwarded address that is not one of them, never an `X-Forwarded-For` a client sends itself (`src/auth/client-ip.ts`, [installation](installation.md#behind-a-reverse-proxy)). |

The first account takes over the files from before there were accounts (nodes without an owner),
so an existing installation keeps its files.

Signing in through Kontext also opens a closed sign-up: whoever Kontext knows belongs to the company
(the sign-up hook lets Better Auth's callback `/callback/:id` in). Someone who signs in through it
with the address of an existing account gets that account when its address is confirmed (Better
Auth's account linking with Kontext as a trusted provider, `requireLocalEmailVerified`). An account
with a password has an address nobody confirmed: Better Auth answers `account_not_linked`, the
sign-in page says so, and signing in with the password links Kontext right after (`linkSocial`,
only for the same address). When Kontext confirms the address (`email_verified: true` in its id
token or userinfo, nothing else counts), it counts as confirmed and what was shared with it waits
no longer; an address the provider does not confirm stays unconfirmed and gets nothing by it. One account has one person at Kontext: a second `sub` is not linked (the account
hook in `src/auth/auth.ts`), so an address given to someone new does not hand on the former
person's files. From then on the account is found by Kontext's `sub`, so a changed address keeps
it. The variables are in [Schreibzeug in Kontext](kontext.md#settings).

## Web app

`src/api/account.ts` wraps Better Auth's client (`better-auth/client`); TanStack Query keeps who is
signed in. Every page but `/login` sits under a route that reads the session first and sends
everyone without one to `/login?redirect=…` (`src/router.tsx`). A `401` from any request later
does the same. The editor opens documents as the signed-in user; the navigation shows the name
and the way out.

## Tests

`apps/server/test/accounts.test.ts`: no session, no API; each person sees only their files; closed
sign-up and the takeover of old files; the secret file. The server tests sign up an account in
their harness. In the E2E run (`SCHREIBZEUG_OPEN_SIGNUP=true`) every test signs up an account of its own
through the API (`e2e/app.ts`); `e2e/accounts.spec.ts` goes through the form, signs out and back in,
and checks that someone else's folder is not found. `apps/server/test/shares.test.ts` covers the
roles, shares on folders, taking a share back and the trash; `e2e/sharing.spec.ts` shares a
folder between two accounts: read-only with live changes, and editing; and someone without an
account follows a link, signs up and accepts it. `apps/server/test/invites.test.ts` covers links:
reading one without a session, accepting, roles that never get weaker, deleting, expiry, the trash,
and a closed sign-up opened only by a link that holds.
