# Dateien { #files }

`apps/server` speichert Ordner und Dateien und jede Version einer Datei. Es ist eine Hono-App auf
Bun (`src/app.ts`) über SQLite (`bun:sqlite` mit Drizzle, `src/db/schema.ts`) und einem Ordner mit
Blobs; beides liegt im Datenordner, wer diesen Ordner kopiert, sichert also alles.

SQLite statt PostgreSQL: ein Prozess und ein Ordner im Betrieb, sonst nichts zu installieren,
dieselbe Datenbank, die die Desktop-App lokal benutzen kann, und dieselbe Wahl wie
firsttris/sekretaer, zu dem Schreibzeug dazukommen soll. Während mehrere Leute bearbeiten, laufen
ihre Änderungen über das Relay im Speicher; die Datenbank sieht alle paar Sekunden eine
Speicherung, was ein Schreiber zur Zeit leicht schafft. `bun:sqlite` ist synchron, die
Repository-Funktionen sind es also auch: Eine Funktion, die nicht wartet (`await`), wird nicht mit
anderen Anfragen verschachtelt, und eine Transaktion darf nicht warten (`src/db/database.ts`).

## Daten { #data }

| Tabelle | Was sie enthält |
|---|---|
| `nodes` | Ordner und Dateien in einem Baum (`parent_id`, `null` ist die Wurzel der Dateien des Eigentümers, `owner_id`, wem sie gehören; siehe [Konten](accounts.md)). Eine Datei hat `mime`, `size` und ihre neueste `version`. |
| `versions` | Die gespeicherten Stände einer Datei, [mit dem Alter ausgedünnt](#versions): Nummer, Größe, der SHA-256 ihrer Bytes und `kept`, wenn jemand sie behalten wollte. |
| `media` | Welches Bild zu welcher Datei gehört: die Datei und der SHA-256 eines Bilds, das beim Bearbeiten in sie eingefügt wurde. |
| `shares` | Wer einen Knoten sonst noch öffnen darf, mit `edit` oder `view`; siehe [Konten](accounts.md#sharing). |
| `invites` | Links, die einen Knoten teilen: ein zufälliges Token, die Rolle, wann er abläuft. |
| `pending_shares` | Freigaben an eine Adresse, die noch kein Konto hat, übernommen bei ihrer ersten Anmeldung; siehe [Konten](accounts.md). |
| `access_tokens` | Persönliche Zugangsschlüssel für MCP-Clients: nur ihr SHA-256, Name, Umfang, Ablauf, letzte Benutzung; siehe [den MCP-Server](mcp.md#access-tokens). |

Die Bytes liegen im Blob-Speicher (`src/blobs.ts`), unter `data/blobs/ab/abcdef…` nach ihrem
SHA-256: Dieselben Bytes werden nur einmal gespeichert, und ein Blob wird unter einem temporären
Namen geschrieben und umbenannt, sodass ein Absturz nie einen halben Blob unter einem echten
Schlüssel hinterlässt. Bilder, die beim Bearbeiten in ein Dokument eingefügt werden, kommen auch
dorthin, benannt nach ihrem Hash (`src/files/media.ts`), und `media` vermerkt, in welche Datei
jedes eingefügt wurde; nach dem Speichern enthält die Office-Datei sie selbst.

Namen sind pro Ordner eindeutig (auf der obersten Ebene pro Eigentümer), ohne Rücksicht auf
Groß- und Kleinschreibung, wie unter macOS und Windows (ein partieller eindeutiger Index auf
`name_key` unter den Knoten außerhalb des Papierkorbs; der Server führt `name_key` als den Namen in
Kleinbuchstaben, weil SQLites eigenes `lower()` nur ASCII kennt und „Übersicht“ und „übersicht“
nebeneinander stehen ließe). Zeiten werden in Millisekunden gespeichert. Namen dürfen weder
`/ \ : * ? " < > |` noch Steuerzeichen enthalten, damit sich jede Datei auf jedem System unter
ihrem Namen herunterladen lässt (`packages/files-api/src/schemas.ts`).

Speichern fügt eine Version hinzu. Gleichzeitige Speicherungen einer Datei sperren deren Zeile und
bekommen aufeinanderfolgende Nummern.

## Versionen { #versions }

Der Editor speichert ein paar Sekunden nach jeder Änderung (`AUTOSAVE_DELAY` in
`packages/editor-core/src/session-progress.ts`); ein Arbeitstag ergibt also Hunderte von
Versionen. Nach jedem Speichern und Wiederherstellen dünnt der Server die älteren der Datei aus
(`src/files/thinning.ts`), wie Nextcloud es tut:

| Alter | Was bleibt |
|---|---|
| bis zu einem Tag | jede Version |
| bis zu 30 Tagen | die neueste pro Stunde |
| bis zu einem Jahr | die neueste pro Tag |
| älter | die neueste pro Woche |

Die neueste Version bleibt immer, und ebenso jede Version, die jemand behalten wollte („Version
behalten“ im Versionen-Dialog, `PATCH /files/:id/versions/:number` mit `{ "kept": true }`, für
alle, die bearbeiten dürfen): die verschickte Rechnung, der unterschriebene Vertrag. Mit
`SCHREIBZEUG_VERSIONS=all` bleibt jede Version ([Installation](installation.md#settings)).

Die Zeile einer ausgedünnten Version verschwindet sofort; ihre Bytes bleiben im Blob-Speicher bis
zur Sammlung (`src/blob-collection.ts`), die alle sechs Stunden läuft und die Blobs entfernt, auf
die keine Version und kein Bild verweist und die vor mehr als einer Stunde gespeichert wurden. Eine
Speicherung legt ihre Bytes ab, bevor sie deren Zeile schreibt, und das Ablegen schon vorhandener
Bytes erneuert deren Zeit, sodass die Sammlung nie den Blob einer laufenden Speicherung nimmt.

## Papierkorb { #trash }

Wird ein Knoten in den Papierkorb gelegt, bekommen er und alles darunter `trashed_at` mit derselben
Zeit, und er wird als `trash_root` markiert. Überall sonst ist „nicht im Papierkorb“ dann eine
einzige Spalte. Der Papierkorb listet die Wurzeln; wer eine wiederherstellt, holt zurück, was mit
ihr in den Papierkorb kam, während das, was schon vorher dort lag, im Papierkorb bleibt. Eine
Wiederherstellung schlägt fehl, wenn der alte Ordner selbst im Papierkorb liegt oder der Name
wieder vergeben ist.

## API { #api }

Alles unter `/api`; Bodys sind JSON, sofern nicht anders angegeben. Jede Route außer `/health`,
`/info`, Better Auths `/auth/*`, `GET /invites/:token` und `DELETE /sessions` (nur mit einem Token
von Kontext, [Kontext](kontext.md#tokens-from-kontext)) braucht eine Sitzung oder einen
persönlichen Zugangsschlüssel und handelt für dessen Benutzer ([Konten](accounts.md),
[MCP-Server](mcp.md#access-tokens)). Fehler sind
`{ "error": { "kind", "message" } }`, wobei `kind` eines ist von `not_found` (404), `invalid`
(400), `unauthorized` (401), `forbidden` (403: die Rolle reicht nicht), `not_a_folder` (422),
`name_taken` und `conflict` (409), `too_large` (413), `internal` (500).

Nur die Uploads (`POST /files`, `PUT /files/:id/content`, `POST /files/:id/media`) nehmen Bodys bis
`SCHREIBZEUG_MAX_UPLOAD_MB`. Better Auths `/auth/*` beantwortet einen Body über 64 KB mit `413`,
bevor es ihn liest, und jede andere Route einen über 16 MB (`src/limits.ts`): Buns eigenes Limit
ist auf die Uploads ausgelegt, und Better Auth liest einen JSON-Body ganz, bevor es prüft, wer
fragt.

Jeder Knoten in einer Antwort trägt `role`, was der Benutzer damit darf: `owner`, `edit` oder
`view`.

| Route | Was sie tut |
|---|---|
| `GET /nodes?parent=root\|<id>` | Ein Ordner: der Ordner, sein Pfad von der Wurzel (bei einem geteilten Ordner von dem Ordner, der geteilt wurde), seine Kinder (Ordner zuerst, nach Namen) |
| `GET /nodes/:id` | Ein Knoten |
| `PATCH /nodes/:id` | Umbenennen (`name`; braucht Bearbeiten und den Ordner, in dem er liegt, [Teilen](accounts.md#sharing)) und/oder verschieben (`parentId`, nur Eigentümer) |
| `POST /nodes/:id/trash` | In den Papierkorb verschieben |
| `POST /nodes/:id/restore` | Aus dem Papierkorb zurückholen |
| `GET /trash`, `GET /recent` | Was im Papierkorb liegt; Dateien nach letzter Änderung (beide nur die eigenen des Benutzers) |
| `GET /storage` | Wie viel Platz da ist, [unten](#storage) |
| `GET /search?q=` | Knoten, deren Name `q` enthält, ohne Rücksicht auf Groß- und Kleinschreibung: die eigenen des Benutzers und was in oder unter dem liegt, was mit ihm geteilt ist, Dateien zuerst, höchstens 50 |
| `GET /nodes/:id/shares` | Mit wem der Knoten geteilt ist (nur Eigentümer) |
| `PUT /nodes/:id/shares` | Mit dem Konto hinter `email` teilen oder dessen `role` ändern (`edit`, `view`) |
| `DELETE /nodes/:id/shares/:userId` | Eine Freigabe zurücknehmen |
| `GET /shared` | Was andere mit dem Benutzer geteilt haben, mit `ownerName` |
| `GET /nodes/:id/invites` | Die Links des Knotens, die noch gelten (nur Eigentümer) |
| `POST /nodes/:id/invites` | Ein neuer Link (`role`, `days`: 1, 7 oder 30) |
| `DELETE /nodes/:id/invites/:token` | Einen Link löschen |
| `GET /invites/:token` | Was ein Link teilt (`nodeName`, `kind`, `ownerName`, `role`, `expiresAt`); **keine Sitzung nötig** |
| `POST /invites/:token/accept` | Einen Link annehmen: eine Freigabe mit seiner Rolle, nie schwächer als eine, die der Benutzer schon hat |
| `POST /folders` | Neuer Ordner (`parentId`, `name`) |
| `POST /files` | Hochladen (multipart: `file`, optional `parentId`) |
| `POST /files/blank` | Neue Datei (`parentId`, `name`, `format`: `docx`, `xlsx`, `pptx`, oder `md` und `txt`, die leer sind) |
| `GET /files/:id/content[?version=n]` | Die Bytes der neuesten oder einer bestimmten Version, als Download (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`) |
| `PUT /files/:id/content` | Speichern: Der Body wird zu einer neuen Version; aus einer gemeinsamen Sitzung mit `x-schreibzeug-session-save` (409, wenn diese Sitzung nicht mehr besteht; die Bearbeiten-Rolle wird zuerst geprüft, wer sie nicht hat, bekommt also 404/403, egal in welchem Zustand die Sitzung ist), siehe [Zusammenarbeit](collaboration.md#saving). Mit `If-Match: "<sha256>"` nur, solange der Inhalt der neuesten Version diesen SHA-256 hat, sonst 409 (der Texteditor, [Markdown- und Textdateien](text.md#saving)); ein fehlerhafter ergibt 400 |
| `GET /files/:id/versions` | Alle Versionen, neueste zuerst |
| `POST /files/:id/media` | Ein beim Bearbeiten in die Datei eingefügtes Bild speichern (PNG, JPEG, GIF, BMP, nach seinen ersten Bytes); antwortet mit seinem Namen, `<sha256>.<ext>`. Braucht `edit` |
| `GET /files/:id/media/:name` | Dieses Bild, für alle, die die Datei sehen dürfen; nur Bilder, die in diese Datei eingefügt wurden, nie ein anderer Blob über seinen Hash; mit `X-Content-Type-Options: nosniff` |
| `POST /files/:id/copy` | Eine Kopie der neuesten Version, benannt „… (Kopie).docx“, neben dem Original, wenn der Benutzer dort etwas hinzufügen darf, sonst in seinen eigenen Dateien |
| `POST /files/:id/versions/:number/restore` | Eine ältere Version wieder zur neuesten machen (als neue Version; die dazwischen bleiben) |
| `PATCH /files/:id/versions/:number` | `{ "kept": true }` bewahrt eine Version vor dem [Ausdünnen](#versions), `false` gibt sie wieder frei (Bearbeiten) |
| `GET /health` | `{ "ok": true }` |
| `GET /info` | `{ "mode": "server" }`, mit `oidc: { name }`, wenn ein Anmeldeanbieter eingestellt ist, und `embedOrigin`, wenn eine Website die App in einem Frame zeigen darf ([Kontext](kontext.md)); der lokale Server der Desktop-App antwortet `{ "mode": "local", "rootName" }` ([Desktop-App](desktop.md#files-on-this-computer)). **Keine Sitzung nötig** |

Weitere Routen, beschrieben dort, wo sie hingehören:

| Route | Wo |
|---|---|
| `GET /tokens`, `POST /tokens`, `DELETE /tokens/:id` | Persönliche Zugangsschlüssel, nur mit Sitzung ([MCP-Server](mcp.md#access-tokens)) |
| `POST /files/:id/agent`, `GET /files/:id/outline` | Ein Auftrag für den offenen Editor ([MCP-Server](mcp.md#editing-in-the-open-tab)) |
| `GET /collab/:fileId` (WebSocket) | Die Bearbeitungssitzung einer Datei ([Zusammenarbeit](collaboration.md)) |
| `GET /agent/:fileId` (WebSocket) | Ein offener Editor, der Aufträge annimmt ([MCP-Server](mcp.md#editing-in-the-open-tab)) |
| `DELETE /sessions` | Kontext meldet jemanden überall ab ([Kontext](kontext.md#tokens-from-kontext)) |
| `/mcp` (außerhalb von `/api`) | Der MCP-Endpunkt ([MCP-Server](mcp.md#the-endpoint)) |

## Speicherplatz { #storage }

`GET /api/storage` antwortet, wie viel die eigenen Dateien des Benutzers belegen und wie viel Platz
übrig ist (`src/files/storage.ts`, `src/disk.ts`):

- `usage`: die Größen ihrer Versionen, aufgeteilt in `files` (die neueste Version jeder Datei
  außerhalb des Papierkorbs), `versions` (die älteren, die das [Ausdünnen](#versions) übrig gelassen
  hat) und `trash` (jede Version dessen, was dort liegt). Das sind die Größen der Dateien: Der
  Blob-Speicher hält dieselben Bytes nur einmal, die Platte kann also weniger belegen. Eine geteilte
  Datei zählt für ihren Eigentümer.
- `disk`: `free` und `total` des Laufwerks, auf dem der Datenordner liegt (`statfs`; `free` ist das,
  was ein unprivilegierter Prozess noch schreiben darf, ohne die für root reservierten Blöcke),
  jedes Mal neu abgefragt; `null`, wenn das System es nicht sagt. Jedes angemeldete Konto sieht
  es: Sie teilen sich das Laufwerk.
- `uploadLimit`: `SCHREIBZEUG_MAX_UPLOAD_MB` in Bytes.

Die App zeigt es unten in der Navigation (ein Balken, der ab 80 % gelb und ab 95 % rot wird, wie
der Postfach-Ring von Kontext, und was die Dateien des Benutzers belegen) und in den
Einstellungen, aufgeteilt wie oben (`apps/web/src/storage`,
`apps/web/src/settings/storage-section.tsx`). Bei weniger als 1 GB frei, oder weniger als dem
Upload-Limit, wenn das größer ist, sagt ein Hinweis über jeder Dateiseite, dass Speicherungen bald
fehlschlagen können (`apps/web/src/lib/storage.ts`); ein Anteil am Laufwerk würde nicht taugen, denn
5 % eines großen sind immer noch reichlich. Der lokale Server der Desktop-App beantwortet dieselbe
Route mit dem Laufwerk seines Ordners und ohne `usage`, und die App zeigt nur diesen Hinweis
([Desktop-App](desktop.md)).

## Vorlagen { #templates }

„Neu → Aus Vorlage …“ (`apps/web/src/files/template-dialog.tsx`) beginnt eine Datei aus einer
Vorlage:

- **Eingebaut** (`packages/ooxml/src/templates.ts`): ein Brief nach DIN 5008, ein Angebot, eine
  Rechnung mit dem, was § 14 UStG von einer verlangt, eine Kalkulation (Formeln für die Summen und
  die Steuer, Euro-Formate), ein Projektplan und eine Präsentation. Sie sind dort als Office-XML
  geschrieben; eckige Klammern markieren, was auszufüllen ist.
- **Eigene Vorlagen**: jedes Dokument, jede Tabelle und jede Präsentation in einem Ordner namens
  „Vorlagen“ auf der obersten Ebene der Dateien des Benutzers. Sonst muss nichts eingerichtet
  werden, auf einem Server wie auf dem Rechner.

Die neue Datei sind die Bytes der Vorlage, hochgeladen unter dem angegebenen Namen
(`POST /files`); die API braucht dafür also nichts Eigenes, und eine eigene Vorlage bleibt, wie sie
ist.

## Betrieb { #running-it }

| Variable | Standard |
|---|---|
| `SCHREIBZEUG_DATA_DIR` | `data`: die Datenbank `schreibzeug.db`, die Blobs in `blobs/`, das erzeugte `auth-secret` |
| `PORT` | `3000` |
| `SCHREIBZEUG_MAX_UPLOAD_MB` | `512` |
| `SCHREIBZEUG_OPEN_SIGNUP`, `SCHREIBZEUG_AUTH_SECRET`, `SCHREIBZEUG_TRUSTED_ORIGINS`, `SCHREIBZEUG_TRUSTED_PROXIES` | siehe [Konten](accounts.md) |
| `SCHREIBZEUG_URL`, `SCHREIBZEUG_EMBED_ORIGIN`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_NAME` | siehe [Schreibzeug in Kontext](kontext.md#settings) |
| `SCHREIBZEUG_WEB_DIR` | nicht gesetzt: nur die API. Die gebaute Web-App (`apps/web/dist`, nach `bun run build`), die daneben ausgeliefert wird, sodass eine Adresse App und API ausliefert (jede Datei mit `X-Content-Type-Options: nosniff`, damit ein Browser sie nie für einen anderen Typ hält); die [Desktop-App](desktop.md) öffnet diese Adresse |

Das Image `tristanteu/schreibzeug` (`docker/Dockerfile`) enthält den Server und die gebaute Web-App
mit ihrer Engine, mit den Daten in `/data` (`SCHREIBZEUG_WEB_DIR=/app/web`, Port 3000). **Actions →
Release** veröffentlicht es auf Docker Hub und als `ghcr.io/firsttris/schreibzeug`, wenn ein
`v*`-Tag gepusht wird; zum Selberbauen `docker build -f docker/Dockerfile .`
([Installation](installation.md)).

`bun run server` startet ihn mit Reload; er wendet beim Start die Migrationen in
`apps/server/drizzle` an. Nach einer Änderung am Schema schreibt
`bun run --filter @schreibzeug/server db:generate` die nächste Migration. drizzle-kit 0.31 setzt
die Ausdrücke eines SQLite-Index in Anführungszeichen wie Spaltennamen; prüf erzeugte Indizes auf
Ausdrücken (wie `nodes_name_per_parent` in `0000_init.sql`, von Hand korrigiert).

## Tests { #tests }

`apps/server/test/files.test.ts` registriert ein Konto und führt die App mit `app.request()` und
dem typisierten Test-Client von Hono gegen eine echte SQLite-Datei aus: Jede Testdatei bekommt
einen eigenen temporären Datenordner (`test/harness.ts`), der danach entfernt wird. Vitest läuft
auf Bun (`bun --bun vitest`), was `bun:sqlite` braucht. Der E2E-Server startet auf einem leeren
`e2e/.data`; die Screenshots legen ihre Datumsangaben in dessen Datenbank über ein kleines Bun-Skript
fest (`e2e/sqlite.ts`), da Playwright auf Node läuft.
`apps/server/test/media.test.ts` deckt beim Bearbeiten gespeicherte Bilder ab, `storage.test.ts`,
was `/storage` zählt, `units.test.ts` die Einstellungen, Namen und kleine Hilfsfunktionen.
Vorlagen: `apps/web/src/files/templates.test.ts` (welche Dateien zählen, die Namen) und
`e2e/templates.spec.ts` (eine Datei aus einer eingebauten und aus einer eigenen Vorlage, in ihrem
Editor geöffnet). `e2e/files.spec.ts` geht die Dateiliste durch, wie ein Mensch es tut.
