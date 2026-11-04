# MCP-Server { #mcp-server }

Claude Code und jeder andere Client des [Model Context Protocol](https://modelcontextprotocol.io)
arbeitet in Schreibzeug wie ein Mensch: Er findet und verwaltet Dateien, liest sie und legt neue
an, immer mit den Rechten der Person, deren Zugangsschlüssel er benutzt.

```
MCP client ──POST /mcp (Bearer token)──▶ apps/server src/mcp.ts ──▶ packages/mcp (tools)
                                                                        │ app.request("/api/…", same token)
                                                                        ▼
                                                              the files API (src/app.ts)
```

## Verbinden { #connecting }

In der App unter **Einstellungen → Zugangsschlüssel**: Gib dem Schlüssel einen Namen, wähl seinen
Umfang und wie lange er gilt, und leg ihn an. Der Schlüssel wird einmal angezeigt, zusammen mit
dem Befehl für Claude Code:

```sh
claude mcp add --transport http schreibzeug https://<server>/mcp --header "Authorization: Bearer sz_…"
```

`SCHREIBZEUG_URL`, die Adresse des Servers (auch die Basis des Rückrufs nach der Anmeldung,
[Kontext](kontext.md)), ist das, was die Werkzeuge in Links schreiben (z. B.
`https://office.example.org`); ohne sie nehmen sie die Adresse, an die die Anfrage ging, und
berücksichtigen hinter einem Reverse Proxy `X-Forwarded-Proto` und `X-Forwarded-Host`. In der
Entwicklung leitet der Vite-Server `/mcp` wie `/api` an den API-Server weiter.

### Auf diesem Rechner { #on-this-computer }

Der lokale Server der Desktop-App (`apps/local src/mcp.ts`) hat ebenfalls `/mcp`, für die Dateien
in seinem Ordner. Es gibt eine Person und kein Konto, also auch keinen Schlüssel: Wie der Rest des
lokalen Servers beantwortet er nur Anfragen an 127.0.0.1 und lehnt eine ab, die eine Webseite von
einem anderen Origin schickt (`gate.ts`). Seine Werkzeuge rufen die lokale API mit dem eigenen
Schlüssel der App auf; was nur ein Server hat (Teilen, Links, Versionen, der Papierkorb,
`search_files` und die Werkzeuge für ein offenes Dokument: `outline`, `replace_text`,
`insert_content`, `set_cells`, `export_pdf`), beantworten sie mit der Meldung des lokalen Servers
„Das gibt es nur auf einem Schreibzeug-Server“.
Die Desktop-App startet den lokalen Server auf einem freien Port, bei jedem Start einem anderen;
ein MCP-Client, der mit dieser Adresse eingerichtet ist, funktioniert also nicht mehr, sobald die
App neu startet. Von Hand gestartet, mit einem festen Port:

```sh
SCHREIBZEUG_LOCAL_ROOT=~/Dokumente PORT=3300 bun run --filter @schreibzeug/local start
claude mcp add --transport http schreibzeug-lokal http://127.0.0.1:3300/mcp
```

Ein fester Port in den Einstellungen der Desktop-App kommt später.

## Zugangsschlüssel { #access-tokens }

Ein persönlicher Zugangsschlüssel (`src/auth/tokens.ts`, Tabelle `access_tokens`) ist `sz_` und 32
zufällige Bytes in base64url. Der Server speichert nur seinen SHA-256: Der Schlüssel hat zu viel
Entropie, um ihn zu erraten, ein langsamer Passwort-Hash brächte also nichts. Jeder hat einen
Namen, einen Umfang, ein optionales Ablaufdatum (30, 90 oder 365 Tage, oder keins) und den
Zeitpunkt, an dem er zuletzt benutzt wurde.

| Umfang | Was er darf |
|---|---|
| `read` | Nur `GET`-Anfragen, und nicht die Links eines Knotens (`GET /api/nodes/:id/invites`, `refuseReadToken`): Ihr Geheimnis ließe ein anderes Konto bearbeiten; über MCP sieht er die schreibenden Werkzeuge gar nicht erst |
| `write` | Was sein Benutzer darf |

`requireUser` (`src/auth/middleware.ts`) nimmt ein Sitzungs-Cookie oder
`Authorization: Bearer <token>`; ein Token, das mit `sz_` beginnt, ist ein persönlicher
Zugangsschlüssel, jedes andere eines von Kontext (wenn ein Anmeldeanbieter eingerichtet ist,
[Kontext](kontext.md#tokens-from-kontext)). Eine Anfrage mit einem persönlichen Zugangsschlüssel
wird allein nach ihm beurteilt: Ein falscher, widerrufener oder abgelaufener Schlüssel ergibt
`401` mit `WWW-Authenticate: Bearer`, auch wenn daneben ein gültiges Cookie mitkommt. Drei Dinge
brauchen die Person in der App mit einer Sitzung (`requireSession`): Schlüssel verwalten
(`GET/POST /api/tokens`, `DELETE /api/tokens/:id`), einer laufenden Bearbeitungssitzung beitreten
(`/api/collab`) und Aufträge für ein offenes Dokument annehmen (`/api/agent`). Weder ein
persönlicher Zugangsschlüssel noch ein Token, das Kontext im Auftrag von jemandem schickt, reicht
dafür; ein Schlüssel kann also keinen weiteren erzeugen, und ein kurzlebiger kann nicht zu einem
dauerhaften werden. Wenn Kontext die Sitzungen von jemandem beendet (`DELETE /api/sessions`),
enden seine persönlichen Zugangsschlüssel mit ihnen.

Später kommt OAuth, wie die MCP-Spezifikation es für entfernte Server beschreibt, damit sich ein
Client ohne kopierten Schlüssel verbindet.

## Der Endpunkt { #the-endpoint }

`/mcp` (`apps/server src/mcp.ts`) spricht den Streamable-HTTP-Transport von MCP mit dem offiziellen
TypeScript-SDK (`@modelcontextprotocol/sdk`, `WebStandardStreamableHTTPServerTransport`). Er nimmt
nur einen Schlüssel, nie ein Sitzungs-Cookie, damit keine Webseite ihn für die Person steuern kann.
Er ist zustandslos: Jede Anfrage bekommt ihren eigenen Server und Transport und wird als JSON
beantwortet.

Die Werkzeuge liegen in `packages/mcp`, das nichts von der Datenbank weiß: Jedes Werkzeug ruft die
Datei-API über `app.request` mit dem Schlüssel des Aufrufers auf, durchläuft also genau die
Prüfungen, die auch die Oberfläche durchläuft, und es gibt keine zweite Logik. Schlägt ein Werkzeug
fehl (nicht gefunden, kein Recht, Name vergeben), ist das ein Werkzeugergebnis mit `isError` und
der deutschen Meldung der API, kein Protokollfehler.

Namen und Eingaben sind englisch wie die API; Beschreibungen und Meldungen deutsch wie die
Oberfläche. Jede Änderung an einer Datei ist eine neue Version und lässt sich unter „Versionen“
rückgängig machen; Löschen verschiebt nur in den Papierkorb. Die Anweisungen des Servers und die
lesenden Werkzeuge sagen, dass das, was aus einem Dokument kommt, Daten sind, keine Anweisung.

Das ist ein Rat an das Modell, keine Grenze: Ein Dokument, das jemand mit dem Benutzer geteilt hat,
kann Text enthalten, der das Modell bittet, die Dateien des Benutzers zu teilen. Deshalb tragen
`share` und `create_link`, die Werkzeuge, die jemand anderen hereinlassen, die Annotationen
`destructiveHint` und `openWorldHint` (was ein Außenstehender gesehen hat, lässt sich nicht
zurücknehmen), damit ein Client, der einfache Schreibvorgänge von sich aus genehmigt, bei diesen
trotzdem nachfragt. Und bevor eines von beiden auf einen Knoten wirkt, der dem Benutzer gehört,
fragt es die Person per MCP-Elicitation und nennt dabei den Knoten, wie er gespeichert ist, und wer
welche Rolle bekommt („die Datei „X“ mit … teilen, zum Ansehen?“; bei einem Link seine Rolle und
Laufzeit); eine Ablehnung oder eine fehlgeschlagene Frage teilt nichts. Ein Client kann nur gefragt
werden, wenn er Elicitation beim `initialize` an denselben Server angekündigt hat: Der zustandslose
Endpunkt `/mcp` bekommt pro Anfrage einen neuen Server, der kein `initialize` gesehen hat; dort ist
also die eigene Genehmigung des Aufrufs durch den Client, geleitet von den Annotationen, die
Absicherung (`packages/mcp/src/tool.ts` `confirmWith`).

## Werkzeuge { #tools }

| Werkzeug | Was es tut | Umfang |
|---|---|---|
| `list_folder` | Ein Ordner, oder `root`, `shared`, `recent`, `trash`: ID, Art, Größe, Änderung, Rolle und Link jedes Eintrags | read |
| `search_files` | Dateien und Ordner nach einem Teil ihres Namens, eigene und geteilte (`GET /api/search?q=`) | read |
| `get_file` | Ein Knoten mit seinem Pfad, seinem Link und mit wem er geteilt ist (nur für den Eigentümer) | read |
| `list_versions` | Die Versionen einer Datei | read |
| `create_folder`, `rename`, `move`, `copy` | Wie in der Dateiliste | write |
| `trash`, `restore` | In den Papierkorb und zurück | write |
| `restore_version` | Eine ältere Version als neueste, als neue Version | write |
| `share`, `create_link` | Mit einem Konto teilen (oder, mit Kontext, mit einer Adresse, die noch keins hat: Die Freigabe wird als `pending` markiert; ein Konto, dessen Adresse niemand bestätigt hat, als `unverified`), oder ein Link zum Ansehen oder Bearbeiten; fragt vorher die Person, wo der Client gefragt werden kann (siehe oben) | write |
| `read_document` | Eine .docx als Markdown (Überschriften, Listen, Absätze, Tabellen; Kopf- und Fußzeilen danach) oder eine einfache Textdatei | read |
| `read_sheet` | Ein Blatt einer .xlsx nach Namen, optional ein Bereich wie `A1:D20`, als Markdown-Tabelle mit Spaltenbuchstaben und Zeilennummern; Werte so, wie das Blatt sie auf Deutsch zeigt | read |
| `read_presentation` | Eine .pptx Folie für Folie: Titel, Text, Notizen | read |
| `read_pdf` | Der Text eines PDFs Seite für Seite (`pages`: `1-3`, `2,5`), seine Formularfelder, seine digitalen Signaturen und ob sie gültig sind (jede mit ihrem Aussteller, oder „selbstsigniert“, und dem Hinweis, dass die Vertrauenskette nicht geprüft wird, der Name also nicht bestätigt ist), und die E-Rechnung, die es enthält | read |
| `list_templates` | Die eingebauten Vorlagen und die eigenen des Benutzers im Ordner „Vorlagen“, jede mit ihren Platzhaltern | read |
| `create_document` | Eine .docx aus Markdown | write |
| `create_from_template` | Eine Datei aus einer Vorlage mit ausgefüllten Platzhaltern (`[Nr.]`, `[Datum]` …); sagt, welche noch offen sind | write |
| `create_sheet` | Eine .xlsx aus Blättern mit Zeilen: Zahlen, Texte, Formeln, mit den Formaten fett, Währung, Datum, Prozent | write |
| `create_presentation` | Eine .pptx aus Folien (Titel, Inhalt, nur Titel, leer) | write |
| `append_rows` | Zeilen unter der letzten Zeile eines Blatts, als neue Version | write |
| `einvoice_xml` | Factur-X-XML (EN 16931) aus den Daten einer Rechnung, vorher geprüft (`draftProblems`) | write |
| `upload_file` | Eine kleine Datei aus dem Gespräch (bis 1 MB), als Text oder base64; mit `text` und einem Namen auf `.md` eine Markdown-Notiz | write |
| `write_text` | Der Text einer Markdown-Notiz oder Textdatei, ersetzt oder ergänzt, in der Kodierung und mit den Zeilenenden der Datei; auf Grundlage der Version, die es gelesen hat, sodass eine Speicherung dazwischen nicht überschrieben wird ([Markdown- und Textdateien](text.md)) | write |
| `outline` | Das offene Dokument so, wie es im Editor ist: nummerierte Absätze (mit ihrer Formatvorlage) und Tabellen, Blätter mit ihrem benutzten Bereich, Folien mit ihrem Text | read |
| `replace_text` | Suchen und Ersetzen in einer offenen .docx; antwortet, wie oft | write |
| `insert_content` | Markdown (Überschriften, Absätze, Listen, fett, kursiv) in eine offene .docx, vor oder nach Element n der Gliederung oder am Ende | write |
| `set_cells` | Werte und Formeln in eine offene .xlsx, ab der linken oberen Zelle eines Bereichs | write |
| `export_pdf` | Ein offenes Dokument als PDF oder PDF/A, daneben gespeichert | write |

Die lesenden Werkzeuge lesen die Datei selbst, ohne die Engine: `packages/ooxml` (`docxContent` mit
Überschriftenebenen aus der Gliederungsebene der Formatvorlagen und Listenebenen aus `w:numPr`,
`xlsxSheets`, `pptxSlides`), pdf.js (`pdfjs-dist`, dessen Legacy-Build, der auf Bun läuft) für Text
und Formularfelder eines PDFs, `packages/pdf-sign` für Signaturen und `packages/einvoice` für die
E-Rechnung. Ein Text, der länger als 20 000 Zeichen ist, kommt in Teilen: Die Antwort endet mit
dem `offset`, nach dem als Nächstes zu fragen ist, damit ein Dokument nicht das Gespräch füllt.
Eine Office-Datei wird mit einem Budget entpackt (`packages/ooxml` `boundedUnzip`): Die Teile, die
es braucht, dürfen zusammen höchstens 128 MiB groß sein, nach den Größen, die das Zip angibt, und
jeder Teil hört auf zu entpacken, sobald er mehr liefert als angegeben, damit eine kleine Zip-Bombe
den Server nicht blockieren kann; das Werkzeug antwortet, dass die Datei zu groß ist. Dasselbe gilt
für `list_templates`, `create_from_template` und `append_rows`. Ein Scan ohne Textebene liest sich
als leer; die Texterkennung in der App gibt ihm eine. ODT und die älteren Formate brauchen x2t, das
im Browser läuft: Öffne sie zuerst in Schreibzeug.

Die erzeugenden Werkzeuge schreiben die Datei auf dem Server, ohne offenen Editor, und speichern
sie, wie es ein Upload aus der Oberfläche täte (`POST /api/files`; `append_rows` speichert mit
`PUT` eine neue Version):

- `create_document` macht aus Markdown WordprocessingML (`packages/ooxml` `markdownDocx`):
  ATX-Überschriften werden zu Words eigenen Formatvorlagen „heading 1“–„heading 6“ mit ihrer
  Gliederungsebene, damit die Navigation und ein Inhaltsverzeichnis sie finden; Aufzählungen und
  nummerierte Listen bekommen einen Nummerierungsteil, jede nummerierte Liste beginnt bei 1;
  Pipe-Tabellen, Blockzitate, umzäunter Code, Trennlinien, fett, kursiv, Code und Links (als
  `w:hyperlink` mit einer externen Beziehung).
- `create_from_template` füllt Platzhalter im Text der Dokument-, Blatt- oder Folienteile
  (`fillPlaceholders`). Einen Platzhalter, den Word auf mehrere Runs verteilt hat, findet es nicht;
  die Antwort listet auf, was noch offen ist. Formeln bleiben, wie sie sind: Die Klammern eines
  strukturierten Verweises wie `=SUM(Tabelle1[Betrag])` sind kein Platzhalter.
- `append_rows` schreibt einfache Werte unter die letzte Zeile (`appendRows`), und der benutzte
  Bereich wächst mit; die eigenen Formatvorlagen der Arbeitsmappe bleiben, wie sie sind.
- `einvoice_xml` nimmt Beträge so, wie ein Mensch sie angibt (Euro, Prozent), und rechnet in
  Ganzzahlen, wie es `packages/einvoice` tut. Das ZUGFeRD-PDF braucht die Engine für das PDF/A und
  kommt mit dem Bearbeiten im offenen Tab.

## Bearbeiten im offenen Tab { #editing-in-the-open-tab }

Was ein vorhandenes Dokument ändert, läuft dort, wo die Engine ist: in dem Browser-Tab, der das
Dokument offen hat. Die Person sieht die Änderung, kann sie rückgängig machen, und wer mitbearbeitet,
bekommt sie über das Relay; sie wird sofort als neue Version gespeichert.

```
MCP client ─▶ /mcp edit tool ─▶ POST /api/files/:id/agent ─▶ agent hub (src/agent/hub.ts)
                                                               │ job over /api/agent/:fileId (WebSocket)
                                                               ▼
                                          the open editor (apps/web src/editor/use-agent.tsx)
                                          └─ editor-core agent.ts ─▶ engine (builder API) ─▶ save
```

- **Der Hub** (`apps/server src/agent`): Jeder Editor, der ein Dokument zum Bearbeiten offen hat,
  tritt `/api/agent/:fileId` bei (WebSocket, nur mit Sitzung; das Recht zum Bearbeiten wird beim
  Öffnen geprüft und erneut nach jeder Änderung an Freigaben, am Papierkorb oder nach einem
  Verschieben; ein Tab, der es verloren hat, wird mit 4403 geschlossen). Ein Auftrag für einen
  Benutzer und eine Datei geht an den Tab dieses Benutzers, der zuletzt beigetreten ist, und wartet
  bis zu zwei Minuten auf dessen Antwort. Ohne Tab lautet die Antwort
  `Das Dokument ist gerade in keinem Tab geöffnet.`, und das Werkzeug fügt den Link zum Öffnen
  hinzu. `POST /api/files/:id/agent` prüft „bearbeiten“, `GET /api/files/:id/outline` „ansehen“,
  sodass ein Schlüssel nur zum Lesen die Gliederung lesen darf.
- **Zustimmung**: Der erste Auftrag, der etwas ändert, fragt die Person im Tab („Claude möchte
  dieses Dokument bearbeiten“: Erlauben, Ablehnen), einmal pro Dokument und Tab. Danach sagt eine
  Leiste „Claude darf dieses Dokument bearbeiten.“ mit „Anhalten“; angehalten, lehnt der Tab jeden
  Auftrag ab, bis „Wieder zulassen“. Die Gliederung zu lesen braucht keine Zustimmung.
- **Die Engine** (`packages/editor-core src/agent.ts`): Aufträge sind Skripte gegen die
  Builder-API der Engine (`Api.GetDocument()`, `Api.GetSheet()`, `Api.GetPresentation()`),
  ausgeführt über deren Plugin-Befehl (`common/apiBase.js callCommand` → `common/plugins.js
  callCommandInternal`), der sie in eine Aktion einschließt (`canRunBuilderScript`: `StartAction`,
  `CheckActionLock`; `_onEndBuilderScript`: `Recalculate`, `FinalizeAction`). Ein Auftrag ist ein
  Schritt im Verlauf. Seine Eingabe geht als JSON-Literal hinein; er gibt einfache Daten zurück,
  die zur Antwort werden.
- **Ersetzen** benutzt `asc_replaceText` der Suchleiste, nicht `SearchAndReplace` des Builders. In
  einer gemeinsamen Sitzung fragt `ReplaceSearchElement` das Relay nach seinen Sperren und hält die
  globale Sperre, bis die Antwort kommt; eine Builder-Aktion darum herum sähe diese Sperre und
  machte sich selbst rückgängig (`private_CheckActionLock`, `StartSelectionLockCheck`).
- **Zellen**: `ApiRange.SetValue` schreibt jeden Wert als Text, den das Blatt in seiner Sprache
  liest (`checkFormat`, `Range.setValue`); Zahlen gehen also mit dem Dezimaltrennzeichen des
  Dokuments hinein (`AscCommon.g_oDefaultCultureInfo`), wahr und falsch als `=TRUE()` und
  `=FALSE()`.
- **Einfügen** bekommt Absätze, kein Markdown: `packages/mcp` macht aus dem Markdown mit
  `markdownParagraphs` (`packages/ooxml`) Absätze, damit die Anbindung an die Engine keinen Parser
  braucht. Überschriften bekommen Words Formatvorlage „Heading n“, Listeneinträge eine eigene
  Nummerierung pro Liste.

Der Builder der Engine führt Skripte nur mit einer leichten Sandbox aus (`common/macros.js`
`_safePluginEval` verbirgt `window` und `document`, aber nicht `fetch`), deshalb gibt es kein
freies Werkzeug `run_script`; die festen Werkzeuge sind das, was ein Assistent tun kann.
ZUGFeRD-PDFs, der Serienbrief und Formatierung kommen als Nächstes, dann das Bearbeiten ohne
offenen Tab (ein Headless-Browser auf dem Server).

Links zeigen in die App: `/edit/<id>` für eine Datei, `/folders/<id>` für einen Ordner,
`/invite/<token>` für einen Link.

## Tests { #tests }

`apps/server/test/tokens.test.ts`: Ein Schlüssel wird einmal gezeigt und als Hash gespeichert,
handelt für seinen Benutzer, `read` liest nur, widerrufene, abgelaufene und falsche Schlüssel
werden abgelehnt, Schlüssel können keine Schlüssel verwalten, jemand anderes kann keinen
widerrufen. `apps/server/test/mcp.test.ts` verbindet den eigenen Client des SDK im Speicher mit
`/mcp`: kein Schlüssel, die Werkzeuge, die ein Lese-Schlüssel sieht, dieselben Prüfungen wie in der
App (ein vergebener Name, der Ordner eines anderen), ein widerrufener Schlüssel.
`apps/server/test/mcp-read.test.ts` liest die Testdateien (`hello.docx`, `preise.xlsx`,
`vortrag.pptx`, `formular.pdf`, `rechnung.pdf`) und im Test geschriebene Dokumente: Überschriften
und Listen als Markdown, ein langer Text in Teilen, ein Blatt nach Name und Bereich, die
Formularfelder und die E-Rechnung eines PDFs, und eine Zip-Bombe, die als zu groß abgelehnt wird.
`apps/local/test/mcp.test.ts` benutzt den lokalen Endpunkt ohne Schlüssel, bekommt beim Teilen die
Antwort des lokalen Servers und wird für einen fremden Host oder Origin abgelehnt.
`apps/server/test/mcp-create.test.ts` erzeugt jede Art und liest sie zurück: Markdown zu .docx und
zurück, eine eingebaute und eine eigene Vorlage, ein Blatt mit angehängten Zeilen als Version 2,
eine Präsentation, eine E-Rechnung, mit `readInvoiceXml` zurückgelesen, kleine Uploads. Die Leser
und Schreiber haben ihre eigenen Tests in `packages/ooxml` und `packages/mcp`;
`packages/mcp/test/confirm.test.ts` verbindet im Speicher einen Client, der gefragt werden kann:
Teilen und ein Link nach einem Ja, nichts nach einem Nein, und ohne die Frage für einen Client, der
nicht gefragt werden kann. `mcp.test.ts` prüft die Annotationen von `share` und `create_link`.
`e2e/mcp.spec.ts` öffnet, was die Werkzeuge erzeugt haben, im Editor, speichert das Dokument über
die Engine und findet seine Überschrift-Formatvorlage und seine Tabelle wieder.
`apps/server/test/mcp-edit.test.ts` vertritt den Tab am Hub: der Link, wenn nichts offen ist, der
Auftrag und seine Antwort, eine Ablehnung, nur der neueste Tab derselben Person, ein Tab, der nicht
antwortet, die Gliederung für einen Schlüssel nur zum Lesen.
`packages/editor-core/test/agent.test.ts` deckt Eingabe und Antworten der Skripte ab.
`e2e/mcp-edit.spec.ts` führt es mit der Engine aus: ein Dokument in zwei Tabs offen, die
Gliederung, Ersetzen nach Zustimmung, Einfügen, der erste Tab bekommt beides über das Relay,
Rückgängig nimmt das Einfügen zurück, „Anhalten“, und die Antwort, sobald kein Tab mehr offen ist;
außerdem Zellen, die in einer offenen Tabelle gesetzt und als Zahlen und als Ergebnis einer Formel
zurückgelesen werden. `e2e/mcp.spec.ts` legt in den Einstellungen einen Schlüssel an, ruft den
Endpunkt auf, wie es ein Client täte, sieht den angelegten Ordner in der Dateiliste und widerruft
den Schlüssel.
