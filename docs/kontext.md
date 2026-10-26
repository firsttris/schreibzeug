# Schreibzeug in Kontext

[Kontext](https://github.com/firsttris/kontext) (mail, calendar, contacts, tasks and chat on
Stalwart) shows Schreibzeug as its module "Dokumente". Both stay services of their own, each with
its own sessions, data and releases; they meet only through standards: OpenID Connect for the
sign-in, HTTP with bearer tokens between the servers, and `postMessage` between the two pages.
Without Kontext nothing changes: Schreibzeug looks and works as on its own.

```
kontext.firma.de (Kontext) ── frame ──▶ dokumente.firma.de (Schreibzeug)   postMessage both ways
Schreibzeug ── OpenID Connect ──▶ Kontext's provider (/api/auth)            the sign-in
Kontext's server ── bearer token ──▶ Schreibzeug's API (/api/nodes, /api/files)   files
```

Both run under one site (`kontext.firma.de`, `dokumente.firma.de`), so Schreibzeug's cookies count
in Kontext's frame (`SameSite=Lax`) and no third-party cookies are needed.

## Signing in through Kontext

Kontext is an OpenID Connect provider (Better Auth's `@better-auth/oauth-provider`), Schreibzeug
its client (Better Auth's generic OAuth plugin, `apps/server/src/auth/auth.ts`): discovery at
`<OIDC_ISSUER>/.well-known/openid-configuration`, the code flow with PKCE, the client secret in the
`Authorization` header (`client_secret_basic`), the id token checked against the provider's keys.
The callback is `/api/auth/callback/oidc` (Better Auth's `/callback/:id`), so Kontext registers
`<SCHREIBZEUG_URL>/api/auth/callback/oidc`.

- The sign-in page shows **Anmelden mit Kontext** (`OIDC_NAME`) above email and password.
- **In Kontext's frame** someone without a session is signed in without being asked: the app tries
  once with `prompt=none` (`signInSilently` in `apps/web/src/router.tsx`). With a session at Kontext
  the browser comes straight back; without one Kontext answers `login_required`, and the sign-in
  page shows. The try is remembered for the frame (`sessionStorage`), so it never loops; Kontext
  opening the frame anew (`?embedded=kontext`) allows the next one.
- A new person gets an account; an address that has one is linked to it, see
  [accounts](accounts.md#sign-up).

The same works with other providers (Microsoft Entra, Google, Keycloak): issuer, client id and
secret are all it needs.

## Embedded

Kontext opens the frame at `<page>?embedded=kontext`. Schreibzeug counts as embedded only in a frame,
only with `SCHREIBZEUG_EMBED_ORIGIN` set, and remembers it for the frame (`apps/web/src/embed/`).
Then:

- the shell shows no name, account box or sign-out (Kontext has them); file pages and the editor
  fill the frame; the editor has **In neuem Tab öffnen**;
- light or dark follow Kontext (`data-theme` on `<html>`; without Kontext `index.html` sets it from
  the device);
- the server allows framing only by itself and that origin:
  `Content-Security-Policy: frame-ancestors 'self' <SCHREIBZEUG_EMBED_ORIGIN>` (`apps/server/src/web.ts`).

### Messages

Every message is `{ source, type, … }`. Schreibzeug takes them only from its parent window at
`SCHREIBZEUG_EMBED_ORIGIN` and sends them only there (`embed/messages.ts`); Kontext checks the same
the other way (`src/features/documents/messages.ts` in Kontext).

| From | `type` | What |
|---|---|---|
| Schreibzeug | `ready` | The app runs; Kontext sends the theme |
| Schreibzeug | `route` | The page shown (`path`), for Kontext's address bar (`/documents/edit/…`) |
| Schreibzeug | `title` | The open document's name, `null` when none is open |
| Schreibzeug | `unsaved` | Changes the server does not have yet; Kontext marks the module |
| Schreibzeug | `shortcut` | One of Kontext's keys (1–9, `?`) pressed outside a field; inside the document the engine's frame keeps the keys |
| Schreibzeug | `signed-out` | The answer to `logout` |
| Kontext | `theme` | `light` or `dark` |
| Kontext | `navigate` | Open a page of the app (`path`; only paths of the app, never another site) |
| Kontext | `logout` | Kontext signs out: so does Schreibzeug, before Kontext removes the frame |

## Tokens from Kontext

Where mail and documents touch (an attachment into a folder, a document onto a mail), Kontext's
server calls Schreibzeug's API itself, never through the browser. It sends
`Authorization: Bearer <token>`: a JWT Kontext signs with its provider keys for one person, valid
for five minutes, with Kontext as issuer and `SCHREIBZEUG_URL` as audience. An id token names the
client id as audience and is refused. `apps/server/src/auth/bearer.ts` checks it against the keys
from the provider's discovery document, signed with an asymmetric algorithm (EdDSA, ES*, RS*, PS*),
with `sub`, `iat` and `exp` and no older than ten minutes; a token that names a client (`azp` or
`client_id`) must name `OIDC_CLIENT_ID`, so a token the provider made for another client is refused.
It finds the person by `sub` (the account the sign-in
keeps), else by address, else creates them; the request then has exactly that person's rights.
By address only as Better Auth links a sign-in: the account's address must be confirmed, the
token must confirm it as well (`email_verified: true`), and the account must not belong to another
`sub` already. A new account made from a token has its address confirmed, and gets what was shared
with it, only with `email_verified: true` too; one made unconfirmed is confirmed, and gets what
waited for its address, by the first later token that says so. An account someone registered with a password
under a colleague's address is refused, and so is a new person at Kontext who got a former
colleague's address; the first account made from a token takes over the files from before there
were accounts, as at a sign-up.

`DELETE /api/sessions` with such a token signs that person out everywhere here (their sessions and their
personal access tokens for MCP clients, [MCP server](mcp.md#access-tokens), go, and the sockets of their open editors close: the editor stops relaying and shows that the
session ended). Kontext calls it when someone leaves the
company or is locked, so Dokumente closes with Kontext. For someone without an account here it does
nothing and makes none.

## Files in Kontext

Kontext puts files of Dokumente where they belong: as a card in its chat, linked to a task, attached
to an appointment. Each opens `/documents/edit/<id>` in the module. So that the people there may
open it, Kontext's server shares the file with them to view, as its owner, with the owner's token
(`PUT /api/nodes/:id/shares`). Colleagues who never opened Dokumente have no account yet; their
share waits for their address and holds from their first sign-in through Kontext
([accounts](accounts.md#sharing)).

A shared mailbox of Kontext (info@, rechnung@) is a person here too: Kontext sends tokens for it
(subject `mailbox:<account id>`, the mailbox's address), so it gets an account of its own with
one folder named after its address. Kontext keeps that folder shared with the mailbox's people
(members `edit`, readers `view`) and takes the share back from whoever leaves; they find it under
"Für mich freigegeben". Nobody signs in as the mailbox: it has no password and no sign-in through
Kontext.

## Settings

| Variable | |
|---|---|
| `SCHREIBZEUG_URL` | Where browsers reach Schreibzeug (`https://dokumente.firma.de`): Better Auth's base URL (the callback) and the audience of Kontext's tokens. Required with the OIDC settings: the server does not start without it, so the callback never follows the `Host` a request names |
| `OIDC_ISSUER` | The provider's issuer, for Kontext `https://kontext.firma.de/api/auth` |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | As registered at the provider; Kontext: `schreibzeug` and its `SCHREIBZEUG_CLIENT_SECRET` |
| `OIDC_NAME` | The name on the button, default `Kontext` |
| `SCHREIBZEUG_EMBED_ORIGIN` | The one origin that may show Schreibzeug in a frame (`https://kontext.firma.de`) |

Sign-in through the provider needs issuer, client id and secret; without them it is email and
password only. With them it needs `SCHREIBZEUG_URL` as well, or the server does not start: else
Better Auth would take its base URL, and with it the sign-in's `redirect_uri`, from the `Host` of
each request (`apps/server/src/config.ts`). Kontext's `deploy/compose.yaml` runs Schreibzeug with the profile `documents`, from
the image `tristanteu/schreibzeug` (`docker/Dockerfile`; **Release** publishes it on Docker Hub
and GHCR when a `v*` tag is pushed, [installation](installation.md)).

## Tests

`apps/server/test/pending-shares.test.ts`: a share with an address that waits, holds once the
person comes through Kontext, never goes to a sign-up with a password (also one made before the
share) but holds once that account is connected with Kontext, waits for a token without
`email_verified`, and can be taken back.
`apps/server/test/bearer.test.ts`: tokens kept by subject, found by a confirmed address, never
for a password account under someone else's address or for a second subject, a new account, the
files from before accounts, ending a person's sessions, `email_verified`, refused audience, issuer,
subject, other clients (`azp`, `client_id`), missing expiry, age and garbage; `apps/server/test/web.test.ts`: `frame-ancestors`;
`apps/web/src/embed/messages.test.ts`: origin and window checks, when the app counts as embedded,
paths and keys. `e2e/kontext.spec.ts` runs against a stand-in for Kontext (`e2e/fake-kontext.ts`:
discovery, authorize with PKCE and `prompt=none`, token, userinfo, keys, and a page with the frame)
and a server of its own that signs in through it (`e2e/kontext-server.ts`): signing in with Kontext,
the frame with silent sign-in, theme, navigation and sign-out, the sign-in page when nobody is
signed in at Kontext, an account with a password connected after signing in with the password,
and the parameter without a frame.
