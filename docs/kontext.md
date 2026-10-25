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
from the provider's discovery document and finds the person by `sub` (the account the sign-in
keeps), else by address, else creates them; the request then has exactly that person's rights.

## Settings

| Variable | |
|---|---|
| `SCHREIBZEUG_URL` | Where browsers reach Schreibzeug (`https://dokumente.firma.de`): Better Auth's base URL (the callback) and the audience of Kontext's tokens. Without it no tokens are taken |
| `OIDC_ISSUER` | The provider's issuer, for Kontext `https://kontext.firma.de/api/auth` |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | As registered at the provider; Kontext: `schreibzeug` and its `SCHREIBZEUG_CLIENT_SECRET` |
| `OIDC_NAME` | The name on the button, default `Kontext` |
| `SCHREIBZEUG_EMBED_ORIGIN` | The one origin that may show Schreibzeug in a frame (`https://kontext.firma.de`) |

Sign-in through the provider needs issuer, client id and secret; without them it is email and
password only. Kontext's `deploy/compose.yaml` runs Schreibzeug with the profile `documents`, from
the image `tristanteu/schreibzeug` (`docker/Dockerfile`, published by **Release** on a version tag).

## Tests

`apps/server/test/bearer.test.ts`: tokens found by address and kept by subject, a new account,
refused audience, issuer, subject and garbage; `apps/server/test/web.test.ts`: `frame-ancestors`;
`apps/web/src/embed/messages.test.ts`: origin and window checks, when the app counts as embedded,
paths and keys. `e2e/kontext.spec.ts` runs against a stand-in for Kontext (`e2e/fake-kontext.ts`:
discovery, authorize with PKCE and `prompt=none`, token, userinfo, keys, and a page with the frame)
and a server of its own that signs in through it (`e2e/kontext-server.ts`): signing in with Kontext,
the frame with silent sign-in, theme, navigation and sign-out, the sign-in page when nobody is
signed in at Kontext, and the parameter without a frame.
