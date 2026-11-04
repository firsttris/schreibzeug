# Architektur { #architecture }

Schreibzeug ist eine Single-Page-App, die Office-Dateien mit der Euro-Office-Engine im Browser
bearbeitet, und ein Bun-Server, der die Dateien speichert und die Zusammenarbeit weiterleitet.
Dieselbe App läuft im Browser und in der Tauri-Desktop-App.

```
apps/web (React SPA) ──HTTP /api──▶ apps/server (Bun + Hono) ──▶ SQLite (tree, versions, accounts)
   │                                         │                └─▶ data/blobs (file bytes)
   └─ iframe: engine (sdkjs + x2t)           ├─ WebSocket relay (collaboration)
MCP client (Claude Code) ──HTTP /mcp────────▶└─ MCP tools (packages/mcp) → the same /api
```

## Workspaces { #workspaces }

| Workspace | Was er tut |
|---|---|
| `packages/editor-core` | Der einzige Code, der `sdkjs` aufruft: lädt die Engine, öffnet und speichert Dateien, macht aus Engine-Ereignissen einen Store, für die Text-, Tabellen-, Präsentations- und PDF-Editoren. Ohne Framework. Siehe [die Engine](engine.md) und [PDFs](pdf.md). |
| `packages/text-editor` | Der Editor für Markdown- und reine Textdateien auf CodeMirror 6, ohne UI-Framework: liest und schreibt die eigene Kodierung und die Zeilenenden einer Datei, die Live-Vorschau, die Markdown-Befehle der Werkzeugleiste, die Vorschau der geteilten Ansicht. Siehe [Markdown- und Textdateien](text.md). |
| `packages/mcp` | Die Werkzeuge des MCP-Servers für Claude Code und andere Clients: Dateien finden, lesen, verwalten und anlegen, jeweils über die Dateien-API mit dem Token des Aufrufers. Siehe [den MCP-Server](mcp.md). |
| `packages/files-api` | Der Vertrag zwischen Server und Clients: Zod-Schemas für Namen, Knoten, Versionen und Fehler. |
| `packages/einvoice` | E-Rechnungen: findet und liest das Rechnungs-XML, das ein ZUGFeRD- oder Factur-X-PDF trägt (CII und UBL, aus Haben übernommen), und schreibt eines: liest eine Rechnung aus dem Text eines Dokuments, schreibt Factur-X-XML (EN 16931) und macht aus dem PDF/A ein ZUGFeRD-PDF/A-3. Siehe [E-Rechnungen](e-invoice.md). |
| `packages/pdf-ocr` | Durchsuchbare Scans: findet die Seiten eines PDFs ohne Text und legt erkannten Text unsichtbar darüber. Siehe [PDFs](pdf.md#text-recognition). |
| `packages/pdf-sign` | Digitale Signaturen in PDFs: signiert mit einem PKCS#12-Zertifikat (PKCS#7, detached) und prüft die Signaturen, die ein PDF enthält. Siehe [PDFs](pdf.md#digital-signatures). |
| `packages/ooxml` | Baut minimale Office-Open-XML-Pakete (.docx, .xlsx, .pptx): leere Dateien für den Server, Testdateien für die Tests; liest den Text einer .docx (für [E-Rechnungen](e-invoice.md) und den [MCP-Server](mcp.md)), die Blätter einer .xlsx und die Folien einer .pptx. |
| `apps/server` | Die Dateien-API auf Bun mit Hono, Drizzle und SQLite (`bun:sqlite`). Siehe [Dateien](files.md); Konten mit Better Auth in `src/auth/`, siehe [Konten](accounts.md). Das Relay für die Zusammenarbeit in `src/collab/`, siehe [Zusammenarbeit](collaboration.md). |
| `apps/local` | Der lokale Server der Desktop-App: dieselbe Dateien-API über einem Ordner auf dem Computer, für eine Person, ohne Konten. Siehe [die Desktop-App](desktop.md#files-on-this-computer). |
| `apps/desktop` | Die Desktop-App (Tauri 3, Alpha) für Windows, macOS und Linux: die Dateien auf diesem Computer über `apps/local` oder ein Fenster zu einem Schreibzeug-Server. Siehe [die Desktop-App](desktop.md). |
| `apps/web` | Die React-Oberfläche: Dateiseiten (`src/files/`), die Editor-Seite, Routen in `src/router.tsx`, der typisierte API-Client in `src/api/`, das Gespräch mit Kontext, wenn sie in dessen Frame gezeigt wird (`src/embed/`, siehe [Schreibzeug in Kontext](kontext.md)), die Demo ohne Server (`src/demo/`, siehe [Entwicklung](development.md#the-demo)). |

## Warum eine SPA und eine Hono-API, nicht TanStack Start { #why-a-spa-and-a-hono-api-not-tanstack-start }

Der Plan begann mit TanStack Start, dessen Server-Funktionen Server-Code wie lokale Funktionen
aufrufen. Sie existieren nur, solange der Start-Server läuft. Die Desktop-App liefert die Oberfläche
als statische Dateien aus, ohne diesen Server, und bräuchte trotzdem eine einfache HTTP-API, um
einen Schreibzeug-Server zu erreichen. Deshalb ist die Oberfläche eine einfache SPA (Vite, TanStack
Router und Query) und der Server eine kleine API, die Browser und Desktop auf dieselbe Weise
aufrufen.

Hono ist eine dünne Schicht über `Bun.serve`: Routing, Middleware, Zod-Validierung und ein
typisierter Client (`hc<AppType>`), der seine Typen aus den Routen des Servers nimmt. Dieser Client
gibt der Web-App dieselben Ende-zu-Ende-Typen, die Server-Funktionen gäben. Das Relay für die
Zusammenarbeit läuft im selben Prozess auf dem WebSocket-Upgrade von Hono, sodass die
Zugriffsprüfungen für Dateien und Bearbeitungssitzungen an einer Stelle liegen.

## Die Web-App { #the-web-app }

Routen sind im Code definiert (`src/router.tsx`): `/login` meldet an oder legt ein Konto an; jede
andere Seite braucht eine Sitzung ([Konten](accounts.md)). `/` und `/folders/:id` listen einen
Ordner, `/recent`, `/shared` (was andere geteilt haben, [Teilen](accounts.md#sharing)) und `/trash`
die anderen Ansichten, `/settings` die Sprache der Oberfläche, den Speicherplatz, den die Dateien
belegen, und die Zugriffstokens für MCP-Clients ([Dateien](files.md#storage),
[MCP-Server](mcp.md); im lokalen Modus nur die Sprache), `/invite/:token` einen Link, den jemand
geteilt hat (lesbar vor der Anmeldung), `/edit/:id` öffnet eine Datei in ihrem Editor im ganzen
Fenster (`src/editor/`: die Wortansicht für .docx, die Blattansicht für .xlsx, die Folienansicht für
.pptx, die PDF-Ansicht für .pdf, die Textansicht für .md und .txt, die sich die Kopfzeile mit dem
bearbeitbaren Namen, die Menüleiste, Status, Versionen, Download und Speichern teilen). Lesezugriffe
laufen über TanStack Query mit den Schlüsseln in `src/api/files.ts`; jeder Schreibzugriff
aktualisiert alle Schlüssel unter `files`. Die Editor-Seite tritt zuerst der Bearbeitungssitzung der
Datei bei (`src/editor/use-session-file.ts`) und öffnet die Version, von der die Sitzung ausging,
sodass das Aktualisieren der Listen nach einem Speichern das Dokument nicht neu öffnet. Eine
Textdatei hat keine Sitzung: Ihre Seite lädt die neueste Version und speichert die ganze Datei
darüber (`src/editor/text-page.tsx`, [Markdown- und Textdateien](text.md#saving)). Jede Antwort wird
gegen die Schemas in `packages/files-api` geprüft.

In der Entwicklung bereitet `bun run dev` bei Bedarf die Engine vor, startet den Server und liefert
die App auf Port 5173 aus, der `/api`, mit WebSockets, und `/mcp` an den Server weiterleitet
(`SCHREIBZEUG_API_URL`, Standard `http://localhost:3000`). Der E2E-Lauf startet einen eigenen
Server auf einer leeren Datenbank (`e2e/server.ts`, Port 3100) und die App auf Port 5174; daneben
den lokalen Server der Desktop-App mit einer eigenen App (`e2e/local-server.ts`) und einen Ersatz
für Kontext mit einem Server, der sich darüber anmeldet (`e2e/fake-kontext.ts`,
`e2e/kontext-server.ts`; `e2e/playwright.config.ts`). Ohne den eigenen Browser-Download von
Playwright lässt sich ein installiertes Chromium verwenden:
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome bun run test:e2e`.

## Oberflächentexte { #interface-texts }

Die Oberfläche spricht Deutsch und Englisch. Ihre Texte stehen in `apps/web/messages/de.json` und
`apps/web/messages/en.json` (das [inlang message format](https://inlang.com/m/reootnfj/plugin-inlang-messageFormat));
[Paraglide JS](https://paraglidejs.com) kompiliert sie zu einer typisierten Funktion pro Nachricht
in `apps/web/src/paraglide` (erzeugt, nicht committet): Der Code ruft `m.share_dialog_title()` oder
`m.folder_page_deleted({ name })` auf, und eine fehlende Nachricht oder ein fehlender Platzhalter
ist ein Typfehler. Das Vite-Plugin kompiliert bei `dev` und `build`; `bun run i18n` tut es allein,
und `typecheck` und `test` führen es zuerst aus. `apps/web/project.inlang` hält das Projekt: Deutsch
ist die Basissprache, das Format-Plugin kommt aus `node_modules` (nicht aus einem CDN, damit der
Build offline funktioniert), und `paraglide.config.js` legt fest, wie die Sprache gewählt wird: die
unter **Einstellungen → Sprache** gewählte (localStorage `schreibzeug.locale`), sonst die des
Browsers, sonst Deutsch. Ein Wechsel lädt die Seite neu.

Ein Schlüssel beginnt mit der Datei, die ihn nutzt (`word_menus_undo` in `word-menus.ts`); ein paar
Texte, die viele Dateien teilen, sind `common_*`. Tastenkürzel werden mit englischen Tastennamen
geschrieben und in der Sprache der Oberfläche gezeigt (`apps/web/src/lib/keys.ts`:
`keys("Ctrl+Z")` ist auf Deutsch „Strg+Z“). `packages/editor-core` bleibt ohne Paraglide: Die
Texte, die die Engine selbst zeichnet, und die Wörter des Screenreaders kommen als Daten von der
App. Wörter, die aus Dokumenten gelesen werden, bleiben Deutsch, egal was die Oberfläche sagt (die
„Rechnungsnummer“ einer Rechnung), ebenso das, was die Agent-Werkzeuge sagen. Noch nicht übersetzt:
was der Server antwortet (seine Fehlermeldungen), die Prüfungen, die der Server mit der App teilt
(Namen in `packages/files-api`, Probleme in `packages/einvoice` und `packages/pdf-sign`), und die
Namen der eingebauten Vorlagen (`packages/ooxml`), die deutsche Dokumente sind.

`apps/web/i18n.test.ts` sorgt in `bun run test` dafür, dass es so bleibt, und damit in der CI:
Beide Sprachen tragen dieselben Nachrichten mit denselben Platzhaltern, keine ist leer, jede
Nachricht wird genutzt, und kein Text steht im Code. Diese letzte Prüfung
(`apps/web/i18n-check.ts`) findet JSX-Text, die Attribute und Felder, die Beschriftungen enthalten
(`aria-label`, `title`, `placeholder`, `label`, …), und String-Literale mit deutschen Buchstaben
oder Wörtern; ein Literal, das Daten ist und kein Text, trägt einen Kommentar `// i18n-ignore`, der
sagt, warum. `bun apps/web/i18n-check.ts [file …]` listet, was sie findet. Unit-Tests lesen die
deutschen Texte (`apps/web/vitest.setup.ts`), die E2E-Specs laufen in einem deutschen Browser
(`locale: "de-DE"` in `e2e/playwright.config.ts`).

## Screenshots { #screenshots }

`docs/screenshots` enthält die Bilder für die README und die Dokumentation, hell und dunkel. Sie
werden von `e2e/screenshots.shot.ts` aufgenommen (`bun run screenshots`), in der CI von Hand mit
**Actions → Update screenshots**, das die geänderten Bilder committet. Der Lauf füllt den Server
mit denselben Ordnern, dem Brief aus `test-files/angebot.docx` und dem Formular aus
`test-files/formular.pdf`, fixiert ihre Daten in der Datenbank und die Uhr des Browsers und liefert
Geist als Schrift der Oberfläche mit, sodass eine unveränderte Seite ein unverändertes Bild ergibt.

## Formattreue { #format-fidelity }

`test-files/fidelity` enthält echte .docx-, .xlsx- und .pptx-Dateien aus der Testsuite von
LibreOffice (MPL-2.0), eine pro Bereich: in Dokumenten Tabellen, Listen, Fußnoten, Kopfzeilen,
Bilder, Textfelder, Spalten, ein Inhaltsverzeichnis, Kommentare, Diagramme und Formen; in Tabellen
Rahmen, Formate, Designfarben, Filter, Diagramme, Farbskalen und Datenbalken; in Präsentationen
Formen, Aufzählungszeichen, Designs, Tabellenformatvorlagen, Gruppen und SmartArt
(`test-files/README.md`). `e2e/formats.fidelity.ts` öffnet jede davon und vergleicht den ersten
Bildschirm mit seinem Referenzbild in `test-files/fidelity/screenshots`; dann speichert es die Datei
unverändert, öffnet die gespeicherte Version und vergleicht erneut, sodass ein Durchlauf durch die
Engine und x2t das Aussehen eines Dokuments nicht verändern darf. Die Referenzen werden in der CI
mit **Actions → Update screenshots** aufgenommen (`bun run fidelity:update`); die CI prüft sie bei
jedem Push als Teil von `bun run test:e2e`, das sie in drei Shards gleichzeitig ausführt. Ein
Engine-Update besteht nur, wenn sie gleich bleiben.
