# Konten { #accounts }

Alle melden sich mit E-Mail-Adresse und Passwort an oder, wo der Server es anbietet, über einen
anderen Dienst wie Kontext ([Schreibzeug in Kontext](kontext.md)). Die Konten sind
[Better Auth](https://www.better-auth.com/) auf dem Schreibzeug-Server (`apps/server/src/auth`),
gespeichert in der eigenen SQLite-Datenbank der App über den Drizzle-Adapter von Better Auth.

## Server { #server }

| Teil | Wo |
|---|---|
| Die Routen von Better Auth: Registrierung, Anmeldung, Abmeldung, Sitzung | `/api/auth/*`, eingehängt in `src/app.ts` |
| Seine Tabellen `user`, `session`, `account`, `verification` | `src/db/auth-schema.ts`, so wie der Drizzle-Schema-Generator von Better Auth sie schreibt |
| Die Sitzungsprüfung vor jeder anderen Route | `src/auth/middleware.ts` (`requireUser`); ohne Sitzung lautet die Antwort `401` mit `kind: "unauthorized"`. Ein Bearer-Token von Kontext zählt ebenfalls ([Schreibzeug in Kontext](kontext.md#tokens-from-kontext)) |
| Persönliche Zugriffstokens für MCP-Clients | `src/auth/tokens.ts`, `/api/tokens`; eine Anfrage mit `Authorization: Bearer sz_…` handelt für den Benutzer des Tokens, siehe [den MCP-Server](mcp.md#access-tokens) |

Die Sitzung ist ein Cookie namens `schreibzeug.session_token` (und so weiter,
`advanced.cookiePrefix`): Neben Kontext auf einem Host, als `localhost` in der Entwicklung, würden
die Standardnamen von Better Auth jede Anmeldung die andere ersetzen lassen, denn Cookies kennen
keine Ports. Better Auth prüft den `Origin` von Anfragen, die einen mitbringen, gegen seine
vertrauenswürdigen Origins; Schreibzeug vertraut seinem eigenen Origin, unter welchem Hostnamen der
Server auch erreicht wird, und denen in `SCHREIBZEUG_TRUSTED_ORIGINS`. Die Desktop-App braucht
keinen: Ihr Fenster zeigt die eigenen Seiten des Servers ([Desktop-App](desktop.md#how-it-fits-together)).

Der Rest der API prüft dasselbe für Anfragen, die mit dem Sitzungs-Cookie kommen: Was etwas ändert
(jede Methode außer `GET`, `HEAD` und `OPTIONS`) und die WebSocket-Upgrades des Relays
(`/api/collab`) und der Editor-Jobs (`/api/agent`) müssen vom eigenen Origin der Anfrage kommen,
von `SCHREIBZEUG_URL` oder `SCHREIBZEUG_TRUSTED_ORIGINS`, sonst lautet die Antwort `403`
(`src/auth/origin.ts`). Das Cookie ist `SameSite=Lax`, also schickt der Browser es auch von einem
anderen Origin derselben Site, etwa einer anderen Subdomain neben Kontext oder einem anderen Port
des Hosts; ohne die Prüfung könnte eine Seite dort als die Person hochladen, in den Papierkorb
verschieben oder einer laufenden Sitzung beitreten. Ohne `Origin`-Header entscheidet
`Sec-Fetch-Site` des Browsers; eine Anfrage ohne beides kommt von keiner Seite. Persönliche
Zugriffstokens und die Tokens von Kontext werden nicht geprüft: Ein Browser schickt sie nie von
sich aus.

Jeder Knoten hat eine `owner_id`. Jede Abfrage in `src/files/repository.ts` nimmt den angemeldeten
Benutzer entgegen und fragt `src/files/access.ts`, was er mit dem Knoten darf; eine Datei, auf die
er keinen Zugriff hat, ist „nicht gefunden“, genau wie eine, die es nicht gibt. Namen sind auf der
obersten Ebene pro Eigentümer eindeutig.

Auch das Relay für die Zusammenarbeit braucht eine Sitzung: Das WebSocket-Upgrade trägt das Cookie.
Jede Verbindung wird gegen die Datei geprüft, auch wenn die Sitzung der Datei schon offen ist, und
das Relay ersetzt den Benutzer, den die Engine in `auth` ankündigt, durch den angemeldeten, sodass
die Namen an Cursorn und Kommentaren echt sind. Der Socket bleibt an die Anmeldesitzung gebunden,
mit der er kam (`src/sockets.ts`): Wenn diese Sitzung endet (Abmeldung, eine widerrufene Sitzung,
eine Passwortänderung, die die anderen Geräte abmeldet; `databaseHooks.session.delete` von Better
Auth) oder Kontext die Person überall abmeldet, schließen das Relay und der Job-Socket die Sockets
der Person (Code 4401), und die Engine zeigt, dass die Sitzung beendet ist. Eine Änderung an
Freigaben, am Papierkorb oder ein Verschieben prüft jeden offenen Socket erneut gegen die Datei
([Zusammenarbeit](collaboration.md#messages)).

## Teilen { #sharing }

Der Eigentümer teilt einen Ordner oder eine Datei mit dem Konto hinter einer E-Mail-Adresse, als
`edit` oder `view` (Tabelle `shares`; `src/files/shares.ts`). Die Person braucht ein Konto, außer
der Server meldet über Kontext an: Dann wartet eine Freigabe an eine Adresse ohne Konto (Tabelle
`pending_shares`; der Freigabedialog sagt „Noch ohne Konto“) und wird zur Freigabe, sobald diese
Adresse ein Konto bekommt, das der Anbieter bestätigt hat, bei ihrer ersten Anmeldung über Kontext
oder mit dem ersten Token von Kontext für sie (`claimPendingShares`). Eine Registrierung mit
Passwort bekommt sie nie, denn jeder könnte sich mit der Adresse eines anderen registrieren. Kontext
nutzt das, wenn ein Dokument in einen Chat, eine Aufgabe oder einen Termin kommt
([Schreibzeug in Kontext](kontext.md#files-in-kontext)).

Eine Adresse ist keine Identität, bis jemand sie bestätigt hat. Eine Registrierung mit Passwort
speichert jede Adresse unbestätigt, auch die einer Kollegin, die noch kein Konto hat; eine Freigabe
per Adresse darf also nicht stillschweigend bei dem landen, der sie zuerst registriert hat:

- Wo der Server über Kontext anmeldet, geht eine Freigabe nur an ein Konto, dessen Adresse bestätigt
  ist. Ein Konto mit Passwort unter dieser Adresse bekommt sie nicht; die Freigabe wartet wie oben
  („Noch ohne Konto“), bis die Adresse bestätigt ist, indem das Konto mit Kontext verknüpft wird
  ([Registrierung](#sign-up)). Eine Freigabe, die ein solches Konto schon hat, ändert ihre Rolle
  weiterhin an Ort und Stelle.
- Auf einem Server nur mit Passwörtern ist nichts bestätigt, also geht eine Freigabe wie bisher an
  das Konto mit der Adresse, aber die Freigabeliste markiert sie (`unverified` in
  `GET /api/nodes/:id/shares`; der Dialog sagt „Adresse nicht bestätigt“), sodass der Eigentümer
  sieht, dass das Konto nicht nachweislich die Person ist.

Eine Freigabe auf einen Ordner gilt für alles darunter; die Rolle des Benutzers auf einem Knoten ist
„owner“ oder die stärkste Freigabe auf dem Knoten oder auf einem Ordner darüber, gefunden mit einer
rekursiven Abfrage (`roleOf`).

| | view | edit | owner |
|---|:-:|:-:|:-:|
| Öffnen, herunterladen, Versionen sehen | ✓ | ✓ | ✓ |
| Speichern, eine Version wiederherstellen, umbenennen, in einem Ordner anlegen | | ✓ | ✓ |
| Verschieben, in den Papierkorb, teilen | | | ✓ |

Alles bleibt Eigentum seines Eigentümers: Was ein Bearbeiter in einem geteilten Ordner anlegt,
gehört dem Eigentümer des Ordners, und Verschieben geschieht nur innerhalb der eigenen Ordner des
Eigentümers. Eine schwächere Rolle als nötig wird mit `403 forbidden` beantwortet. Umbenennen
braucht auch den Ordner, in dem der Knoten liegt (die oberste Ebene zählt als die ihres
Eigentümers): Namen sind pro Ordner eindeutig, eine Kollision würde also jemandem mit einer Freigabe
auf einen einzelnen Knoten verraten, welche Namen daneben liegen. Ein einzeln geteilter Knoten
behält für die andere Person seinen Namen; nur eine Änderung der Groß- und Kleinschreibung geht
durch. Papierkorb und zuletzt geöffnete Dateien listen nur die eigenen Knoten des Benutzers; „Für
mich freigegeben“ (`GET /api/shared`) listet, was mit ihm geteilt wurde, und der Pfad eines
geteilten Ordners beginnt bei dem Ordner, der geteilt wurde, jeder Ordner darin mit der Rolle, die
der Benutzer darauf hat.

### Links { #links }

Statt einer Adresse kann der Eigentümer einen Link anlegen (`src/files/invites.ts`, Tabelle
`invites`): ein zufälliges 24-Byte-Token, eine Rolle und ein Ablauf nach 1, 7 oder 30 Tagen. Er
gilt für alle, die ihn öffnen, bis er abläuft oder der Eigentümer ihn löscht, und endet, wenn der
Knoten in den Papierkorb kommt.

Der Link öffnet `/invite/<token>` in der Web-App, die zeigt, wer was teilt (`GET
/api/invites/:token` braucht keine Sitzung). Wer keine Sitzung hat, meldet sich an oder legt ein
Konto an und kommt zurück; „Einladung annehmen“ fügt eine Freigabe mit der Rolle des Links hinzu
oder behält eine stärkere, die der Benutzer schon hat. Ein gültiger Link öffnet auch eine
geschlossene Registrierung: Die Seite schickt sein Token im Header `x-schreibzeug-invite`, und der
Registrierungs-Hook in `src/auth/auth.ts` lässt dieses eine Konto herein. Dieses Konto ist für den
Link gemacht: Der Hook nimmt den Link mit der Registrierung an, sodass die Person mit der Freigabe
ankommt („Einladung annehmen“ ändert danach nichts). Die Adresse, mit der es registriert wurde, ist
durch den Link nicht bestätigt, denn er nennt keine Adresse; sie zählt wie oben.

Im Editor nimmt das Relay die Rolle für jede Verbindung aus der Datenbank. Ein Betrachter tritt mit
`mode: "view"` bei, egal was der Client sagt, und das Relay verwirft, was das Dokument ändern würde
(`getLock`, `saveChanges`, `isSaveLock`, die Speicher-Nachrichten; DocsCoServer weist die ersten
drei von Betrachtern ebenfalls ab). Die Web-App öffnet die Datei schreibgeschützt
(`put_Mode("view")`, `asc_setViewMode`), ohne Werkzeugleiste und Speichern; mit schneller
gemeinsamer Bearbeitung ist die Engine dann ein Live-Betrachter und zeigt die Änderungen der anderen,
sobald sie kommen.

## Registrierung { #sign-up }

| Variable | Standard | |
|---|---|---|
| `SCHREIBZEUG_OPEN_SIGNUP` | `false` | `true`: Jeder, der den Server erreicht, darf ein Konto anlegen. Sonst kann dort nur das erste Konto angelegt werden. |
| `SCHREIBZEUG_AUTH_SECRET` | erzeugt | Signiert die Sitzungs-Cookies, mindestens 32 Zeichen. Ohne ihn erzeugt der Server beim ersten Start einen und bewahrt ihn in `SCHREIBZEUG_DATA_DIR/auth-secret` auf (Modus 600). |
| `SCHREIBZEUG_TRUSTED_ORIGINS` | – | Weitere Origins, die sich anmelden und mit einer Sitzung Dinge ändern dürfen, durch Kommas getrennt. |
| `SCHREIBZEUG_TRUSTED_PROXIES` | – | Die Reverse Proxys vor dem Server (Adressen oder CIDR-Bereiche). Anmeldung und Registrierung erlauben ein paar Versuche pro Client in zehn Sekunden; ein Client ist die Adresse der Verbindung, hinter diesen Proxys die erste weitergeleitete Adresse, die keiner von ihnen ist, nie ein `X-Forwarded-For`, das ein Client selbst schickt (`src/auth/client-ip.ts`, [Installation](installation.md#behind-a-reverse-proxy)). |

Das erste Konto übernimmt die Dateien aus der Zeit vor den Konten (Knoten ohne Eigentümer), sodass
eine bestehende Installation ihre Dateien behält.

Die Anmeldung über Kontext öffnet ebenfalls eine geschlossene Registrierung: für alle, von denen
Kontext weiß, dass sie zur Firma gehören (der Registrierungs-Hook lässt den Callback
`/callback/:id` von Better Auth herein). Wer sich darüber mit der Adresse eines bestehenden Kontos
anmeldet, bekommt dieses Konto, wenn dessen Adresse bestätigt ist (das Account Linking von Better
Auth mit Kontext als vertrauenswürdigem Anbieter, `requireLocalEmailVerified`). Ein Konto mit
Passwort hat eine Adresse, die niemand bestätigt hat: Better Auth antwortet `account_not_linked`,
die Anmeldeseite sagt das, und eine Anmeldung mit dem Passwort verknüpft Kontext gleich danach
(`linkSocial`, nur für dieselbe Adresse). Wenn Kontext die Adresse bestätigt (`email_verified:
true` in seinem ID-Token oder Userinfo, nichts anderes zählt), gilt sie als bestätigt, und was mit
ihr geteilt wurde, wartet nicht länger; eine Adresse, die der Anbieter nicht bestätigt, bleibt
unbestätigt und bekommt dadurch nichts. Ein Konto hat genau eine Person bei Kontext: Ein zweites
`sub` wird nicht verknüpft (der Account-Hook in `src/auth/auth.ts`), damit eine Adresse, die an
jemand Neues vergeben wird, nicht die Dateien der früheren Person weitergibt. Von da an wird das
Konto über das `sub` von Kontext gefunden, eine geänderte Adresse behält es also. Die Variablen
stehen in [Schreibzeug in Kontext](kontext.md#settings).

## Für Administratoren { #for-administrators }

Schreibzeug hat keinen Administrator: keine Admin-Oberfläche und kein Konto mit Rechten über die
anderen. Das erste Konto ist ein Konto wie jedes andere; es übernimmt nur die Dateien aus der Zeit
vor den Konten ([Registrierung](#sign-up)). Was das dem überlässt, der den Server betreibt:

- **Kein „Passwort vergessen“**: Die Anmeldeseite hat kein Zurücksetzen des Passworts, der Server
  verschickt keine E-Mail, und die App hat keine Seite, um ein Passwort zu ändern. Wer seines
  vergessen hat, braucht den Betreiber, der im Container ein neues setzen kann. Das Skript hasht es
  so, wie Better Auth es tut (`better-auth/crypto` `hashPassword`), und schreibt es in die Zeile
  der Tabelle `account` zur Adresse mit dem Anbieter `credential` (`src/db/auth-schema.ts`); Better
  Auth speichert Adressen in Kleinbuchstaben:

  ```bash
  read -rsp "New password: " PASSWORD && export PASSWORD
  docker exec -w /app/apps/server -e EMAIL=anna@example.org -e PASSWORD schreibzeug bun -e '
  import { Database } from "bun:sqlite";
  import { hashPassword } from "better-auth/crypto";
  const { EMAIL, PASSWORD } = process.env;
  if (!EMAIL || !PASSWORD || PASSWORD.length < 8) throw new Error("Needs EMAIL and a PASSWORD of at least 8 characters.");
  const db = new Database("/data/schreibzeug.db");
  db.exec("PRAGMA busy_timeout = 5000");
  const { changes } = db
    .query("UPDATE account SET password = ?, updated_at = ? WHERE provider_id = ? AND user_id = (SELECT id FROM user WHERE email = lower(?))")
    .run(await hashPassword(PASSWORD), Date.now(), "credential", EMAIL);
  console.log(changes === 1 ? "Password changed." : "No account with a password under this address.");
  '
  unset PASSWORD
  ```

  `-w /app/apps/server` führt es dort aus, wo `better-auth` installiert ist; das Passwort wird vom
  Terminal gelesen und bleibt so aus der Shell-History heraus. Angemeldete Geräte bleiben
  angemeldet. Ein Konto, das sich nur über Kontext anmeldet, hat kein Passwort; das Skript sagt das
  und ändert nichts.
- **Kein Löschen von Konten**: Weder die Person noch der Betreiber kann ein Konto in der App
  löschen.
- **Dateien werden nicht endgültig gelöscht**: Der Papierkorb wird nie geleert, eine Datei im
  Papierkorb behält also ihre Bytes und ihre Versionen. Versionen gehen nur durch das
  [Ausdünnen](files.md#versions); die neueste Version und die aufbewahrten bleiben. Ein Antrag auf
  Löschung der Daten einer Person (DSGVO Art. 17) braucht deshalb den Betreiber, und dafür gibt es
  noch kein Werkzeug: Die Dateien eines Kontos, ihre Versionen und Bilder, seine Freigaben, Links,
  Tokens und Sitzungen sind Zeilen in mehreren Tabellen und Blobs im Datenordner, und ein Verfahren,
  das alles davon stimmig entfernt, ist noch nicht geschrieben.

## Web-App { #web-app }

`src/api/account.ts` umhüllt den Client von Better Auth (`better-auth/client`); TanStack Query
behält, wer angemeldet ist. Jede Seite außer `/login` liegt unter einer Route, die zuerst die
Sitzung liest und alle ohne Sitzung nach `/login?redirect=…` schickt (`src/router.tsx`). Ein `401`
auf eine spätere Anfrage tut dasselbe. Der Editor öffnet Dokumente als der angemeldete Benutzer;
die Navigation zeigt den Namen und den Weg hinaus.

## Tests { #tests }

`apps/server/test/accounts.test.ts`: keine Sitzung, keine API; jede Person sieht nur ihre Dateien;
geschlossene Registrierung und die Übernahme alter Dateien; die Secret-Datei. Die Server-Tests
registrieren in ihrem Harness ein Konto. Im E2E-Lauf (`SCHREIBZEUG_OPEN_SIGNUP=true`) registriert
jeder Test über die API ein eigenes Konto (`e2e/app.ts`); `e2e/accounts.spec.ts` geht durch das
Formular, meldet sich ab und wieder an und prüft, dass der Ordner eines anderen nicht gefunden
wird. `apps/server/test/shares.test.ts` deckt die Rollen ab, Freigaben auf Ordner, das
Zurücknehmen einer Freigabe, den Papierkorb und die Markierung einer unbestätigten Adresse;
`apps/server/test/edge.test.ts` die Größengrenzen für Bodys, die Adresse, die das Rate Limit der
Anmeldung zählt, und die Origin-Prüfung für Cookie-Anfragen und WebSocket-Upgrades;
`e2e/sharing.spec.ts` teilt einen Ordner zwischen zwei Konten: schreibgeschützt mit Live-Änderungen
und zum Bearbeiten; und jemand ohne Konto folgt einem Link, registriert sich und nimmt ihn an.
`apps/server/test/invites.test.ts` deckt Links ab: einen ohne Sitzung lesen, annehmen, Rollen, die
nie schwächer werden, Löschen, Ablauf, den Papierkorb und eine geschlossene Registrierung, die nur
ein gültiger Link öffnet und die diesen Link annimmt.
