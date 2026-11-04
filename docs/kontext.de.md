# Schreibzeug in Kontext { #schreibzeug-in-kontext }

[Kontext](https://github.com/firsttris/kontext) (Mail, Kalender, Kontakte, Aufgaben und Chat auf
Stalwart) zeigt Schreibzeug als sein Modul „Dokumente“. Beide bleiben eigene Dienste, jeder mit
eigenen Sitzungen, Daten und Releases; sie treffen sich nur über Standards: OpenID Connect für die
Anmeldung, HTTP mit Bearer-Tokens zwischen den Servern und `postMessage` zwischen den beiden Seiten.
Ohne Kontext ändert sich nichts: Schreibzeug sieht aus und funktioniert wie für sich allein.

```
kontext.firma.de (Kontext) ── frame ──▶ dokumente.firma.de (Schreibzeug)   postMessage both ways
Schreibzeug ── OpenID Connect ──▶ Kontext's provider (/api/auth)            the sign-in
Kontext's server ── bearer token ──▶ Schreibzeug's API (/api/nodes, /api/files)   files
```

Beide laufen unter einer Site (`kontext.firma.de`, `dokumente.firma.de`), sodass die Cookies von
Schreibzeug im Frame von Kontext zählen (`SameSite=Lax`) und keine Drittanbieter-Cookies nötig sind.

## Anmelden über Kontext { #signing-in-through-kontext }

Kontext ist ein OpenID-Connect-Anbieter (`@better-auth/oauth-provider` von Better Auth), Schreibzeug
sein Client (das Generic-OAuth-Plugin von Better Auth, `apps/server/src/auth/auth.ts`): Discovery
unter `<OIDC_ISSUER>/.well-known/openid-configuration`, der Code-Flow mit PKCE, das Client-Secret im
Header `Authorization` (`client_secret_basic`), das ID-Token gegen die Schlüssel des Anbieters
geprüft. Der Callback ist `/api/auth/callback/oidc` (`/callback/:id` von Better Auth), also
registriert Kontext `<SCHREIBZEUG_URL>/api/auth/callback/oidc`.

- Die Anmeldeseite zeigt **Anmelden mit Kontext** (`OIDC_NAME`) über E-Mail und Passwort.
- **Im Frame von Kontext** wird jemand ohne Sitzung angemeldet, ohne gefragt zu werden: Die App
  versucht es einmal mit `prompt=none` (`signInSilently` in `apps/web/src/router.tsx`). Mit einer
  Sitzung bei Kontext kommt der Browser direkt zurück; ohne eine antwortet Kontext
  `login_required`, und die Anmeldeseite erscheint. Der Versuch wird für den Frame gemerkt
  (`sessionStorage`), sodass er nie in eine Schleife gerät; öffnet Kontext den Frame neu
  (`?embedded=kontext`), ist der nächste erlaubt.
- Eine neue Person bekommt ein Konto; eine Adresse, die eines hat, wird damit verknüpft, siehe
  [Konten](accounts.md#sign-up).

Dasselbe funktioniert mit anderen Anbietern (Microsoft Entra, Google, Keycloak): Issuer, Client-ID
und Secret sind alles, was es braucht.

## Eingebettet { #embedded }

Kontext öffnet den Frame unter `<page>?embedded=kontext`. Schreibzeug gilt nur in einem Frame als
eingebettet, nur wenn `SCHREIBZEUG_EMBED_ORIGIN` gesetzt ist, und merkt es sich für den Frame
(`apps/web/src/embed/`). Dann:

- zeigt die Shell keinen Namen, kein Kontofeld und keine Abmeldung (die hat Kontext); Dateiseiten
  und der Editor füllen den Frame; der Editor hat **In neuem Tab öffnen**;
- folgen hell oder dunkel Kontext (`data-theme` auf `<html>`; ohne Kontext setzt `index.html` es
  nach dem Gerät);
- erlaubt der Server das Einbetten in einen Frame nur sich selbst und diesem Origin:
  `Content-Security-Policy: frame-ancestors 'self' <SCHREIBZEUG_EMBED_ORIGIN>` (`apps/server/src/web.ts`).

### Nachrichten { #messages }

Jede Nachricht ist `{ source, type, … }`. Schreibzeug nimmt sie nur von seinem Elternfenster unter
`SCHREIBZEUG_EMBED_ORIGIN` an und schickt sie nur dorthin (`embed/messages.ts`); Kontext prüft
dasselbe in die andere Richtung (`src/features/documents/messages.ts` in Kontext).

| Von | `type` | Was |
|---|---|---|
| Schreibzeug | `ready` | Die App läuft; Kontext schickt das Design |
| Schreibzeug | `route` | Die gezeigte Seite (`path`), für die Adressleiste von Kontext (`/documents/edit/…`) |
| Schreibzeug | `title` | Der Name des offenen Dokuments, `null`, wenn keins offen ist |
| Schreibzeug | `unsaved` | Änderungen, die der Server noch nicht hat; Kontext markiert das Modul |
| Schreibzeug | `shortcut` | Eine der Tasten von Kontext (1–9, `?`), außerhalb eines Felds gedrückt; im Dokument behält der Frame der Engine die Tasten |
| Schreibzeug | `signed-out` | Die Antwort auf `logout` |
| Kontext | `theme` | `light` oder `dark` |
| Kontext | `navigate` | Eine Seite der App öffnen (`path`; nur Pfade der App, nie eine andere Site) |
| Kontext | `logout` | Kontext meldet ab: Schreibzeug ebenfalls, bevor Kontext den Frame entfernt |

## Tokens von Kontext { #tokens-from-kontext }

Wo sich Mail und Dokumente berühren (ein Anhang in einen Ordner, ein Dokument an eine Mail), ruft
der Server von Kontext die API von Schreibzeug selbst auf, nie über den Browser. Er schickt
`Authorization: Bearer <token>`: ein JWT, das Kontext mit seinen Anbieterschlüsseln für eine Person
signiert, fünf Minuten gültig, mit Kontext als Issuer und `SCHREIBZEUG_URL` als Audience. Ein
ID-Token nennt die Client-ID als Audience und wird abgelehnt. `apps/server/src/auth/bearer.ts`
prüft es gegen die Schlüssel aus dem Discovery-Dokument des Anbieters: signiert mit einem
asymmetrischen Algorithmus (EdDSA, ES*, RS*, PS*), mit `sub`, `iat` und `exp` und nicht älter als
zehn Minuten; ein Token, das einen Client nennt (`azp` oder `client_id`), muss `OIDC_CLIENT_ID`
nennen, sodass ein Token, das der Anbieter für einen anderen Client erstellt hat, abgelehnt wird.
Es findet die Person über `sub` (das Konto, das die Anmeldung behält), sonst über die Adresse, sonst
legt es sie an; die Anfrage hat dann genau die Rechte dieser Person. Über die Adresse nur so, wie
Better Auth eine Anmeldung verknüpft: Die Adresse des Kontos muss bestätigt sein, das Token muss
sie ebenfalls bestätigen (`email_verified: true`), und das Konto darf nicht schon zu einem anderen
`sub` gehören. Ein neues Konto aus einem Token hat seine Adresse bestätigt und bekommt, was mit ihr
geteilt wurde, ebenfalls nur mit `email_verified: true`; eines, das unbestätigt angelegt wurde,
wird durch das erste spätere Token, das es sagt, bestätigt und bekommt, was auf seine Adresse
gewartet hat. Ein Konto, das jemand mit Passwort unter der Adresse einer Kollegin registriert hat,
wird abgelehnt, ebenso eine neue Person bei Kontext, die die Adresse eines früheren Kollegen
bekommen hat; das erste Konto aus einem Token übernimmt die Dateien aus der Zeit vor den Konten,
wie bei einer Registrierung.

`DELETE /api/sessions` mit einem solchen Token meldet diese Person hier überall ab (ihre Sitzungen
und ihre persönlichen Zugriffstokens für MCP-Clients, [MCP-Server](mcp.md#access-tokens),
verschwinden, und die Sockets ihrer offenen Editoren schließen: Der Editor hört auf weiterzuleiten
und zeigt, dass die Sitzung beendet ist). Kontext ruft es auf, wenn jemand die Firma verlässt oder
gesperrt wird, sodass Dokumente mit Kontext schließt. Für jemanden ohne Konto hier tut es nichts und
legt keins an.

## Dateien in Kontext { #files-in-kontext }

Kontext legt Dateien aus Dokumente dorthin, wo sie hingehören: als Karte in seinen Chat, verknüpft
mit einer Aufgabe, angehängt an einen Termin. Jede öffnet `/documents/edit/<id>` im Modul. Damit die
Leute dort sie öffnen dürfen, teilt der Server von Kontext die Datei mit ihnen zum Ansehen, als ihr
Eigentümer, mit dem Token des Eigentümers (`PUT /api/nodes/:id/shares`). Kollegen, die Dokumente nie
geöffnet haben, haben noch kein Konto; ihre Freigabe wartet auf ihre Adresse und gilt ab ihrer
ersten Anmeldung über Kontext ([Konten](accounts.md#sharing)).

Ein geteiltes Postfach von Kontext (info@, rechnung@) ist hier ebenfalls eine Person: Kontext
schickt Tokens dafür (Subject `mailbox:<account id>`, die Adresse des Postfachs), es bekommt also
ein eigenes Konto mit einem Ordner, der nach seiner Adresse benannt ist. Kontext hält diesen Ordner
mit den Leuten des Postfachs geteilt (Mitglieder `edit`, Leser `view`) und nimmt die Freigabe
zurück, wenn jemand ausscheidet; sie finden ihn unter „Für mich freigegeben“. Niemand meldet sich
als das Postfach an: Es hat kein Passwort und keine Anmeldung über Kontext.

## Einstellungen { #settings }

| Variable | |
|---|---|
| `SCHREIBZEUG_URL` | Wo Browser Schreibzeug erreichen (`https://dokumente.firma.de`): die Basis-URL von Better Auth (der Callback) und die Audience der Tokens von Kontext. Pflicht mit den OIDC-Einstellungen: Der Server startet nicht ohne sie, damit der Callback nie dem `Host` folgt, den eine Anfrage nennt |
| `OIDC_ISSUER` | Der Issuer des Anbieters, für Kontext `https://kontext.firma.de/api/auth` |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Wie beim Anbieter registriert; Kontext: `schreibzeug` und sein `SCHREIBZEUG_CLIENT_SECRET` |
| `OIDC_NAME` | Der Name auf dem Button, Standard `Kontext` |
| `SCHREIBZEUG_EMBED_ORIGIN` | Der eine Origin, der Schreibzeug in einem Frame zeigen darf (`https://kontext.firma.de`) |

Die Anmeldung über den Anbieter braucht Issuer, Client-ID und Secret; ohne sie gibt es nur E-Mail
und Passwort. Mit ihnen braucht sie auch `SCHREIBZEUG_URL`, sonst startet der Server nicht: Sonst
würde Better Auth seine Basis-URL, und damit die `redirect_uri` der Anmeldung, aus dem `Host` jeder
Anfrage nehmen (`apps/server/src/config.ts`). Die `deploy/compose.yaml` von Kontext betreibt
Schreibzeug mit dem Profil `documents`, aus dem Image `tristanteu/schreibzeug`
(`docker/Dockerfile`; **Release** veröffentlicht es auf Docker Hub und GHCR, wenn ein `v*`-Tag
gepusht wird, [Installation](installation.md)).

## Tests { #tests }

`apps/server/test/pending-shares.test.ts`: Eine Freigabe an eine Adresse, die wartet, gilt, sobald
die Person über Kontext kommt, geht nie an eine Registrierung mit Passwort (auch nicht an eine, die
vor der Freigabe angelegt wurde), gilt aber, sobald dieses Konto mit Kontext verbunden ist, wartet
bei einem Token ohne `email_verified` und kann zurückgenommen werden.
`apps/server/test/bearer.test.ts`: Tokens, nach Subject zugeordnet, über eine bestätigte Adresse
gefunden, nie für ein Passwort-Konto unter der Adresse eines anderen oder für ein zweites Subject,
ein neues Konto, die Dateien aus der Zeit vor den Konten, das Beenden der Sitzungen einer Person,
`email_verified`, abgelehnte Audience, Issuer, Subject, andere Clients (`azp`, `client_id`),
fehlender Ablauf, Alter und Datenmüll; `apps/server/test/web.test.ts`: `frame-ancestors`;
`apps/web/src/embed/messages.test.ts`: Prüfungen von Origin und Fenster, wann die App als
eingebettet gilt, Pfade und Tasten. `e2e/kontext.spec.ts` läuft gegen einen Ersatz für Kontext
(`e2e/fake-kontext.ts`: Discovery, Authorize mit PKCE und `prompt=none`, Token, Userinfo,
Schlüssel und eine Seite mit dem Frame) und einen eigenen Server, der sich darüber anmeldet
(`e2e/kontext-server.ts`): Anmelden mit Kontext, der Frame mit stiller Anmeldung, Design,
Navigation und Abmeldung, die Anmeldeseite, wenn bei Kontext niemand angemeldet ist, ein Konto mit
Passwort, das nach der Anmeldung mit dem Passwort verbunden wird, und der Parameter ohne Frame.
