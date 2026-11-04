# Die Bearbeitungs-Engine { #the-editing-engine }

Schreibzeug bearbeitet Dokumente mit **sdkjs**, der JavaScript-Engine von Euro-Office (einem Fork von ONLYOFFICE).
Sie läuft vollständig im Browser; einen Document Server gibt es nicht. Nur `packages/editor-core` spricht mit
ihr.

## Woher sie kommt { #where-it-comes-from }

`engine/engine.json` legt ein offizielles Release des Euro-Office Document Server fest.
`bun run engine:prepare` (`engine/scripts/prepare.ts`, das auch `bun run dev` ausführt) lädt dieses
Paket herunter, prüft seine SHA-256-Summe und baut `engine/dist`; dabei zeigt es jeden Schritt und den
Fortschritt des Downloads:

| Pfad | Was es ist |
|---|---|
| `sdkjs/{common,word,cell,slide,pdf}` | die gebaute Engine, wie das Release sie mitliefert (`pdf` enthält den PDF-Renderer `drawingfile.wasm`; der Code des PDF-Editors gehört zu `word`) |
| `sdkjs/common/AllFonts.js`, `fonts/` | der Schriftindex und die Webfonts, erzeugt von `allfontsgen` aus dem Release aus dessen Open-Source-Schriften (`core-fonts`) |
| `sdkjs/slide/themes/` | die Designs für Präsentationen (`themes.js` und ein Ordner pro Design), erzeugt von `allthemesgen` aus dem Release aus den mitgelieferten Designdateien, so wie es dessen Installationsskript tut (`documentserver-generate-allfonts.sh`) |
| `vendor/xregexp/`, `vendor/jquery/` | globale Bibliotheken, die sdkjs benutzt, ohne sie zu laden (jQuery: das Seitenlayout des Texteditors) |
| `x2t/` | der Konverter: x2t aus dem ONLYOFFICE-Core, nach WebAssembly kompiliert ([cryptpad/onlyoffice-x2t-wasm](https://github.com/cryptpad/onlyoffice-x2t-wasm)), festgelegt in `engine.json` |
| `frame/x2t/worker.js` | der Worker, in dem x2t läuft (aus `engine/frame`) |
| `frame/editor/<editor>/main/index.html` | die Seiten, die die Engine beherbergen (aus `engine/frame`) |
| `dictionaries/<lang>/` | Hunspell-Wörterbücher für die Rechtschreibprüfung, mit ihren Lizenzen ([unten](#spell-checking)) |
| `licenses/` | Lizenzen der Engine und der Schriften |

Ein neues Release von Euro-Office oder x2t kommt als Pull Request von Renovate, der `version` ändert;
der Workflow `engine-pin.yml` setzt dann auf dessen Branch `asset` und `sha256` dieses Releases
([Abhängigkeiten aktualisieren](development.md#dependency-updates)).

`allfontsgen` ist ein Programm für Linux x86_64, deshalb braucht das Vorbereiten der Engine Linux (die CI
erledigt das und legt das Ergebnis im Cache ab, nach dem Hash der Spezifikation, der Skripte und der
Frame-Seiten).

## Wie sie geladen wird { #how-it-is-loaded }

sdkjs findet seine eigenen Dateien relativ zur Seite unter `../../../../sdkjs/…` und `../../../../fonts/`
(`common/libfont/loader.js`, `common/GlobalLoaders.js`, `common/zlib/zlib.js`). Die Host-Seite liegt
deshalb vier Ordner unterhalb der Engine-Wurzel: `<engine>/frame/editor/<editor>/main/index.html`
(`<engine>` ist im Build `/engine/<id>`, siehe [unten](#opening-fast-on-a-phone-too)),
mit `word` für Textdokumente, `cell` für Tabellen, `slide` für Präsentationen und `pdf` für
PDFs ([PDFs](pdf.md)).

`mountEngineFrame` lädt diese Seite in einen iframe mit gleichem Ursprung (same-origin) und prüft, ob der
API-Konstruktor des Editors vorhanden ist (`asc_docs_api` für Texte und Präsentationen, `spreadsheet_api` für Tabellen). Der iframe hält die globalen Variablen der Engine
(`Asc`, `AscCommon`, `AscFonts`, …) aus der App heraus und gibt jedem Dokument eine eigene Engine.

Der iframe hat sein eigenes `Object`, `Array` und so weiter. sdkjs prüft Werte manchmal mit
`instanceof` (`CNumInfo.Parse` nimmt ein Objekt nur, wenn `value instanceof Object` gilt), und das schlägt
bei Objekten fehl, die im Fenster der App entstanden sind. Deshalb ist alles, was die Engine bekommt, ein
primitiver Wert, JSON-Text oder ein Objekt, das mit den Konstruktoren des Frames selbst erzeugt wurde
(`new win.Asc.asc_CColor(…)`).

### Schnell geöffnet, auch auf dem Handy { #opening-fast-on-a-phone-too }

Die Engine ist groß: Für ein Textdokument lädt der Browser etwa 68 MB (x2t.wasm 35 MB,
`word/sdk-all.js` 18 MB, `fonts.wasm`, die Schriften, die das Dokument benutzt). Folgendes sorgt dafür,
dass das nicht bei jedem Öffnen passiert und das erste Öffnen nicht aufhält:

- **Dauerhaft behalten.** Der Build legt die Engine in einen Ordner, der nach der vorbereiteten Engine
  benannt ist, `/engine/<id>/` (der Anfang des Stempels, den `engine:prepare` nach `engine/dist/.version`
  schreibt, ein Hash aus Release, Skripten und Frame-Seiten; `apps/web/engine-plugin.ts`), und die App lädt
  sie von dort (`import.meta.env.ENGINE_PATH`, `apps/web/src/editor/engine.ts`). Eine neue Engine bekommt
  einen neuen Namen, deshalb schickt der Server die Engine und die eigenen Skripte der App (`/assets/`,
  nach ihrem Inhalt benannt) mit `Cache-Control: immutable` für ein Jahr; alles andere, allen voran
  `index.html`, mit `no-cache` und einem `ETag`, nach dem der Browser jedes Mal neu fragt und 304 bekommt,
  solange sich nichts geändert hat (`apps/server/src/web.ts`). Öffnest du ein Dokument ein zweites Mal,
  wird nichts von der Engine heruntergeladen. Dev und Preview liefern die Engine unter `/engine/` aus,
  mit oder ohne den Namen.
- **Komprimiert.** Der Server komprimiert, was kleiner wird (Skripte, JSON, WebAssembly, die Schriften
  der Engine), mit Brotli, wo der Browser es annimmt, sonst mit gzip, einmal pro Datei, und behält das
  Ergebnis im Speicher (`apps/server/src/compression.ts`): etwa 15 MB statt 68 beim ersten Öffnen. Brotli
  mit Qualität 5: x2t.wasm braucht etwa eine Sekunde, Qualität 11 würde zwei Minuten dauern. Deshalb legt
  das Docker-Image in seiner Engine-Schicht einmalig Brotli-Kopien mit Qualität 11 der großen Skripte und
  WebAssembly-Module an (`engine/scripts/precompress.ts`), und der Server schickt die Kopie neben einer
  Datei, wo es eine gibt: x2t.wasm in 6,8 MB statt 8,1, `word/sdk-all.js` in 2,4 statt 2,9. Der lokale
  Server der Desktop-App schickt Dateien unverändert; sie verlassen den Rechner nie.
- **Gleichzeitig.** Die Datei wird konvertiert, während der Frame lädt: `convertForEngine` startet x2t,
  sobald der Editor eingehängt wird, sodass x2t in seinem Worker herunterlädt, kompiliert und konvertiert,
  während der Frame sdkjs parst, und die Öffnen-Funktion des Editors nimmt das Ergebnis als `converted`
  entgegen. Die API der Engine wird erzeugt, sobald der Frame da ist, nicht erst, wenn die Datei
  konvertiert ist: Das Erzeugen lädt den Rest der Engine (`sdk-all.js`, `common/apiBase.js` `_init` →
  `loadSdk`), und die Dokumentinfo folgt auf die Konvertierung, so wie web-apps sie erst setzt, wenn die
  API existiert und ihre Events gebunden sind (`documenteditor/mobile` `Main.jsx`; `src/document.ts`
  `openDocument`).
- **Bevor danach gefragt wird.** Während die Dateiliste angezeigt wird, holt die App die Dateien, auf die
  ein Textdokument wartet, in den Cache des Browsers, eine nach der anderen und mit niedriger Priorität,
  x2t zuerst (`prefetchedEngineFiles` in `src/prefetch.ts`, `apps/web/src/editor/prefetch-engine.ts`).
  Verlässt du die Liste, wird die Datei, die gerade unterwegs ist, noch fertig geladen, aber keine weitere
  geholt. Nicht in der Entwicklung (dort wird die Engine jedes Mal neu geschickt), nicht für Dateien auf
  diesem Rechner (die Desktop-App, ein lokaler Ordner) und nicht, wenn der Browser bittet, Daten zu sparen
  (`navigator.connection.saveData`).
- **Kompiliert, während sie herunterlädt.** Der Worker übergibt x2t.wasm an emscripten über
  `instantiateWasm` mit `WebAssembly.instantiateStreaming` (`engine/frame/x2t/worker.js`, der Hook in
  x2t.js `createWasm`), nicht als Bytes (`wasmBinary`): Es wird kompiliert, während es ankommt, und Chromium
  hält den kompilierten Code neben der Datei im Cache, sodass das nächste Öffnen nicht noch einmal 35 MB
  kompiliert.

Gemessen mit dem Viewport eines Handys, 20 Mbit/s und 4-facher CPU-Drosselung (ein kurzes Textdokument,
der Produktions-Build): Das erste Öffnen nach ein paar Sekunden in der Dateiliste dauert 2,7 s statt
8,1 bis 8,7 s. Das zweite Öffnen in einer neuen Seite dauert 3,4 s und jedes weitere etwa 1,1 s, wenn
Chromium auch den kompilierten Code der Engine hat.

### Code in Dokumenten läuft nicht { #code-in-documents-does-not-run }

Weil der Frame denselben Ursprung hat, handelt er mit der Sitzung des angemeldeten Benutzers. sdkjs kann
Code ausführen, den ein Dokument mitbringt, in Closures, die `window` und `document` verbergen, aber nicht
`parent`, `top`, `fetch` oder `location` (`common/macros.js` `_safe_eval_closure`,
`pdf/src/forms/formActions.js` `EvalScript`). Schreibzeug hat keinen Makro-Editor und keine Plugins,
deshalb schaltet `src/document-scripts.ts` all das ab:

- **JS-Makros** (Texte, Tabellen, Präsentationen): `createDocInfo` setzt
  `put_IsEnabledMacroses(false)`, was `asc_runMacros` (ein Klick auf eine Form oder Schaltfläche, die mit
  einem Makro verbunden ist) und `asc_runAutostartMacroses` prüfen (`common/apiBase.js`).
- **Eigene Funktionen einer Tabelle:** Die Engine wertet die aus, die eine Datei beim Öffnen mitbringt
  (`cell/api.js` `_openDocumentEndCallback` → `registerCustomFunctionsLibrary`,
  `cell/api_plugins.js`), ohne den Makro-Schalter zu fragen, und die Änderung eines Mitbearbeiters kann
  neue setzen (`SetCustomFunctions`). `withoutCustomFunctions` ersetzt diese Methode auf dem API-Objekt.
- **JavaScript-Aktionen eines PDFs** (die Format-, Tastendruck- und Berechnungsskripte eines Feldes,
  Link-Aktionen): `CActionRunScript` führt sie ganz ohne Schalter aus. `silencePdfScripts` lässt jede
  Aktion als leeres Skript laufen, unmittelbar bevor die Engine das PDF liest (`beforeOpening` umhüllt
  `openDocument`: Der PDF-Code steckt in `sdk-all.js`, das `sdk-all-min.js` erst lädt, wenn die API
  existiert, `common/editorscommon.js` `loadSdk`). Die Warteschlange der Aktionen läuft weiter wie bisher,
  und das Skript bleibt in der Datei; ein Feld, das ein Skript formatiert (`AFNumber_Format`), zeigt den
  reinen Wert.

`sdk-all.js` lässt sich dafür nicht aus `engine/dist` weglassen: Jeder Editor lädt es. Stattdessen zählt
`engine/scripts/prepare.ts` (`checkScriptHooks`) in den gebauten Bundles die Stellen, auf die sich diese
Schalter verlassen, und bricht ab, wenn ein Engine-Update eine davon verschiebt.

## Warum ein Konverter { #why-a-converter }

Die Engine öffnet und speichert ihr eigenes Binärformat („DOCY“, „XLSY“, „PPTY“). OOXML direkt zu lesen
und zu schreiben ist ein optionales Addon (`Asc.Addons.ooxml`, `CDocument.fromZip`), das nicht zum Build
von Euro-Office gehört: Das Flag zu setzen, verschiebt den Fehler nur nach `fromZip is not a function`.
Deshalb wandelt jedes Öffnen die .docx mit x2t ins Binärformat um, und jedes Speichern wandelt zurück, so
wie es CryptPad tut. x2t läuft in einem Worker (`createConverter`), damit sein großer Heap aus der Seite
herausbleibt.

## Wie ein Dokument ohne Server geöffnet wird { #how-a-document-opens-without-a-server }

Das Öffnen ist für jeden Editor gleich (`src/document.ts` `openDocument`); jeder Editor steuert seinen Teil
als `EditorBinding` bei: das Format, wie seine API erzeugt wird, seinen Zustand und seine Events, seine
Befehle, was er einmal setzt, sobald das Dokument angezeigt wird. `openWordDocument` (`src/word.ts`),
`openSheetDocument` (`src/cell.ts`) und `openPresentation` (`src/slide.ts`) sind die Bindings. Der Ablauf
konvertiert die Datei (`docx → bin`, `xlsx → bin`, `pptx → bin`) und
folgt dann den mobilen Editoren von web-apps (`apps/*editor/mobile/src/controller/Main.jsx`):

1. Die API des Editors im Frame: `new Asc.asc_docs_api({"id-view": "editor_sdk"})` oder
   `new Asc.spreadsheet_api({"id-view": "editor_sdk", "id-input": "ce-cell-content"})`.
2. Die Callbacks registrieren (Zustands-Events, `asc_onGetEditorPermissions`, `asc_onDocumentContentReady`,
   `asc_onError`).
3. `asc_setDocInfo(info)` mit der URL `AscCommon.offlineMode`. Das schaltet die Verbindung zum Server ab:
   `_coAuthoringInit` lässt die Co-Authoring-URL leer, `CDocsCoApi.init` antwortet dann mit einem lokalen
   „first connect“ und einer leeren Lizenz, statt einen Socket zu öffnen
   (`common/apiBase.js`, `common/docscoapi.js`).
   In einer gemeinsamen Sitzung ist die URL stattdessen eine Blob-URL des konvertierten Dokuments, und
   `window.io` im Frame ist ein Ersatz für socket.io, der mit dem Relay von Schreibzeug spricht; siehe
   [Zusammenarbeit](collaboration.md).
4. `asc_getEditorPermissions()`; der Callback für die Berechtigungen ruft `asc_LoadDocument()` auf.
5. Im Offline-Modus fragt sdkjs über `_openChartOrLocalDocument` nach der Datei, was ein leeres Dokument
   öffnen würde. Schreibzeug ersetzt das auf der API-Instanz durch `asc_openDocumentFromBytes(binary)`.
6. `asc_onDocumentContentReady` → der Editor ist bereit.

## Wie sie speichert { #how-it-saves }

`asc_nativeGetFile()` (`word/api.js`) gibt das Dokument im Binärformat als
`DOCY;v5;<size>;<base64>` zurück; x2t wandelt es in eine .docx um (`bin → docx`). Die Web-App legt das
Ergebnis auf dem Server als neue Version ab (`PUT /api/files/:id/content`, siehe [Dateien](files.md)) und
ruft dann `markSaved(saved)` auf, also `SetUnchangedDocument()`: „geändert“ wird bis zur nächsten Änderung
falsch. In einer gemeinsamen Sitzung teilt sie dem Relay außerdem mit, wie viel vom Änderungsprotokoll die
gespeicherte Kopie enthält; siehe [Zusammenarbeit](collaboration.md#saving).

## Serienbrief { #mail-merge }

„Serienbrief“ im Texteditor: Ein Brief mit Seriendruckfeldern und eine Tabelle mit Empfängern werden zu
einem neuen Dokument mit einem Brief pro Empfänger, jeder nach einem Seitenumbruch, abgelegt neben dem
Brief als „<Name> – Serienbrief.docx“ (`apps/web/src/editor/use-mail-merge.tsx`).

- **Empfänger:** „Empfänger wählen …“ nimmt eine Tabelle aus den eigenen Dateien oder vom Rechner:
  .xlsx (ihr erstes Blatt, gelesen von `packages/ooxml` `xlsxRows`, Datumsangaben und Zahlen als deutscher
  Text), .ods und .xls (vorher von x2t in eine .xlsx umgewandelt) oder .csv (`decodeCsv` in `src/csv.ts`;
  UTF-8 oder Windows-1252, wie das deutsche Excel sie schreibt). Die erste Zeile benennt die Felder; eine
  Spalte ohne Namen oder eine Tabelle ohne Empfänger wird mit Begründung abgelehnt. Die Engine bekommt sie
  als Liste (`word/api.js` `asc_StartMailMergeByList`); sie leben in der Sitzung, nicht im Dokument.
- **Felder:** Die Leiste über dem Brief setzt ein Feld an den Cursor (`asc_AddMailMergeField`, ein
  MERGEFIELD, das «Name» zeigt und das auch Word liest) und nennt die Felder des Briefs, die der Tabelle
  fehlen. Word schreibt Seriendruckfelder als komplexe Felder (`w:fldChar` … `MERGEFIELD Name` …
  `w:fldChar`); die Engine liest sie, führt aber nur einfache zusammen (`word/Editor/Document.js`
  `Register_Field` → `m_oMailMergeFields`), deshalb werden in einer .docx die komplexen Seriendruckfelder
  vor dem Öffnen zu einfachen gemacht (`w:fldSimple`, gleiche Anweisung und gleiches Ergebnis)
  (`packages/ooxml` `simplifyMergeFields`).
- **Vorschau:** zeigt den Brief für einen Empfänger (`asc_PreviewMailMergeResult`); die Engine lässt den
  Brief währenddessen nicht bearbeiten.
- **Die Briefe:** `CDocument.Get_MailMergedDocument` kopiert den Brief einmal pro Empfänger und ersetzt
  dabei die Felder. Der eigene Download der Engine schickt das an den Document Server; hier wird es im
  Binärformat geschrieben (`AscCommonWord.BinaryFileWriter`, wie `asc_nativeGetFile`) und von x2t mit den
  Bildern des Briefs in eine .docx umgewandelt (`src/word-mail-merge.ts`).

`e2e/mail-merge.spec.ts` führt `test-files/einladung.docx` (Seriendruckfelder von Word) mit
`test-files/empfaenger.xlsx` zusammen, fügt ein Feld hinzu, blättert durch die Vorschau und liest die
gespeicherten Briefe; ein zweiter Test nimmt eine CSV in Windows-1252 vom Rechner und prüft die Warnung für
Felder, die der Tabelle fehlen.

## Andere Formate { #other-formats }

x2t liest mehr als die Office-Formate, und die Dateiliste öffnet auch diese Dateien:

- **OpenDocument** (.odt, .ods, .odp, wie LibreOffice sie schreibt) öffnet sich im Editor seiner Art und
  wird als das gespeichert, was es ist: x2t liest es ins Binärformat (`odt → bin`) und schreibt es zurück
  (`bin → odt`), wie bei einer .docx (`OpenOptions.openDocument`, `OPEN_DOCUMENT_FORMAT` in
  `src/converter.ts`). „Herunterladen“ liefert die .odt; eine Tabelle lässt sich auch als CSV herunterladen.
- **Ältere Formate** (Word, Excel und PowerPoint 97–2003, RTF) liest x2t, schreibt sie aber nicht; eine
  .doc ins Binärformat zu lesen, bricht mit Fehler 88 ab, während `doc → docx` funktioniert. Deshalb macht
  Schreibzeug, was Word mit „Konvertieren“ macht: Die Seite für eine solche Datei
  (`apps/web/src/editor/convert-page.tsx`) legt daneben eine Kopie im Office-Format an
  (`OFFICE_FORMAT_OF_LEGACY`: .doc und .rtf zu .docx, .xls zu .xlsx, .ppt zu .pptx), unter einem freien
  Namen („Angebot.docx“, „Angebot (2).docx“), und öffnet diese; die Datei selbst bleibt, wie sie ist. Wem
  die Datei nur geteilt ist, der bekommt die Kopie in seine eigenen Dateien.

`e2e/other-formats.spec.ts` bearbeitet und speichert eine .odt, eine .ods und eine .odp und prüft die
gespeicherten Dateien (ihren `mimetype`-Teil und ihren Text), und es öffnet eine .doc, eine .rtf, eine .xls
und eine .ppt über ihre Kopie. LibreOffice liest die gespeicherte .odt mit ihrem Text wieder ein. Die
Testdateien sind Schreibzeugs eigene, mit LibreOffice konvertiert (`test-files/README.md`).

## Befehle und Zustand { #commands-and-state }

Die Oberfläche ruft die Engine nie auf. `editor-core` übersetzt Events der Engine in `EditorState`
(`src/events.ts`, `src/state.ts`) und bietet Befehle an (`src/commands.ts`):

| Befehl | Aufruf in der Engine | Event zurück |
|---|---|---|
| fett, kursiv, unterstrichen | `put_TextPrBold/Italic/Underline(value)` | `asc_onBold/Italic/Underline` |
| Schriftgröße | `put_TextPrFontSize(size)` | `asc_onFontSize` |
| Ausrichtung | `put_PrAlign(AscCommon.align_*)` | `asc_onPrAlign` |
| rückgängig, wiederholen | `Undo()`, `Redo()` | `asc_onCanUndo`, `asc_onCanRedo` |
| durchgestrichen | `put_TextPrStrikeout(value)` | `asc_onStrikeout` |
| Schriftart | `put_TextPrFontName(name)` | `asc_onFontFamily`; die Liste: `asc_onInitEditorFonts` |
| Textfarbe | `put_TextColor(asc_CColor)`, automatisch: `Auto = true` | `asc_onTextColor` |
| Absatzformatvorlage | `put_Style(name)` | `asc_onParaStyleName`; die Liste: `asc_onInitEditorStyles` |
| Aufzählung, nummerierte Liste | `put_ListTypeCustom(preset)`, beenden: `{ Type: "remove" }` | `asc_onFocusObject`, dann `asc_GetCurrentNumberingId` / `asc_GetNumberingPr` |
| Tabelle einfügen | `put_Table(columns, rows)` | `asc_onFocusObject` mit einem `Table`-Objekt |
| Zeilen, Spalten | `addRowAbove/Below()`, `addColumnLeft/Right()`, `remRow()`, `remColumn()`, `remTable()` | – |
| alles auswählen | `asc_EditSelectAll()` | – |
| hochgestellt, tiefgestellt | `put_TextPrBaseline(AscCommon.vertalign_*)` | `asc_onVerticalAlign` |
| Formatierung löschen | `ClearFormating()` | – |
| Seitenumbruch | `put_AddPageBreak()` | – |
| ausschneiden, kopieren, einfügen | `Cut()`, `Copy()`, `Paste()`; `false`: der Browser hat abgelehnt | – |
| Zoom | `zoomIn()`, `zoomOut()`, `zoom(percent)`, `zoomFitToWidth()`, `zoomFitToPage()` | `asc_onZoomChange(percent)`: `document.zoom` |
| als gespeichert markieren | `SetUnchangedDocument()` | `asc_onDocumentModifiedChanged` |
| – | – | `asc_onCountPages` |
| – | – | `asc_onStartAction` / `asc_onEndAction` mit `c_oAscAsyncAction.Disconnect`: `document.connected` |

## Builder-Skripte { #builder-scripts }

`OpenedDocument.runBuilder` führt ein Skript gegen die Builder-API der Engine aus (`word/apiBuilder.js`,
`cell/apiBuilder.js`, `slide/apiBuilder.js`), über `callCommand` (`common/apiBase.js`), so wie es Plugins
tun: eine Aktion im Verlauf, am Ende einmal neu berechnet, mit der Sperrprüfung fürs gemeinsame Bearbeiten.
Die Aufträge des MCP-Servers für ein offenes Dokument nutzen das (`src/agent.ts`, siehe [den MCP-Server](mcp.md#editing-in-the-open-tab)).
Das Skript wird so ausgewertet, wie es ist; deshalb wird es in eine Funktion verpackt, um einen Wert
zurückzugeben, und zurück kommen nur einfache Daten (`Asc.checkReturnCommand`).

## Kommentare { #comments }

`src/comments.ts` liest und schreibt `asc_CCommentDataWord` (`word/api.js`) so, wie es web-apps tut
(`common/mobile/lib/controller/collaboration/Comments.jsx`). Ein Kommentar trägt zwei Zeiten: `Time`,
die Ortszeit, geschrieben, als wäre sie UTC, und `OOTime`, echte Millisekunden; Schreibzeug führt eine Zeit
in Millisekunden und schreibt beide.

| Befehl | Aufruf in der Engine | Event zurück |
|---|---|---|
| hinzufügen (zur Auswahl) | `asc_addComment(data)` | `asc_onAddComment(id, data)` |
| antworten, erledigen | `asc_changeComment(id, data)` mit dem ganzen Kommentar und allen Antworten | `asc_onChangeCommentData` |
| löschen | `asc_removeComment(id)` | `asc_onRemoveComment` |
| hingehen | `asc_selectComment(id)` | – |
| – | `asc_showComments(false)` bei Content-Ready markiert kommentierten Text | `asc_onShowComment(ids)`, `asc_onHideComment` |

Beim Öffnen meldet die Engine jeden Kommentar der Datei mit `asc_onAddComment`; ein Kommentar trägt
den Namen des Kontos, das ihn geschrieben hat.

Die Präsentations-Engine spricht dieselben Aufrufe und Events (`slide/api.js`, `asc_CCommentDataSlide`,
exportiert als `Asc.asc_CCommentData`); ein neuer Kommentar gehört zur aktuellen Folie, und
`asc_showComments()` bei Content-Ready zeigt die Kommentarmarken auf den Folien.

Die Tabellen-Engine hat dieselben Kommentarfelder (`cell/model/CellComment.js`
`asc_CCommentData`), setzt einen neuen Kommentar aber auf die ganze Arbeitsmappe, solange sein
Dokument-Flag nicht falsch ist; deshalb setzt der Editor es auf falsch, und der Kommentar kommt an die
aktive Zelle, deren Bezug der Kommentar als sein Zitat meldet. `asc_addComment` gibt dort nichts zurück;
die ID kommt mit `asc_onAddComment`. Neben den einzelnen Events meldet sie Listen: die Kommentare eines
Blatts beim Öffnen und wenn es angezeigt wird (`asc_onAddComments`), verschobene (`asc_onChangeComments`)
und entfernte (`asc_onRemoveComments`). Die ID eines Kommentars beginnt mit `sheet<id>_` für sein Blatt
(`asc_getWorksheetId`), und die Seitenleiste zeigt die Kommentare des angezeigten Blatts, so wie web-apps
sie filtert. `asc_showComments(false)` markiert kommentierte Zellen.

Alle drei Editoren teilen sich die Befehle (`src/comments.ts`), den Zustand (`src/comment-state.ts`) und
die Seitenleiste (`apps/web/src/editor/use-comments-panel.tsx`).

`asc_onDocumentModifiedChanged` trägt keinen Wert (`word/api.js` `SetDocumentModified` schickt es
ohne); wie web-apps (`documenteditor/mobile` `Main.jsx`) liest `editor-core` beim Eintreffen
`isDocumentModified()`.

Die Namen der Formatvorlagen sind die englischen der Engine (`Normal`, `Heading 1`), wie sie in der .docx
stehen; die Werkzeugleiste zeigt die eingebauten auf Deutsch (`apps/web/src/toolbar/style-labels.ts`). Die
Listenvorlagen sind die ersten Aufzählungs- und Nummerierungsvorlagen von web-apps (`documenteditor/mobile`
`store/textSettings.js`), in `src/lists.ts`; die Farbpalette sind die zehn Standardfarben von Word.

Die Engine nimmt Zielwerte, keine Umschalter; deshalb liest ein Umschaltbefehl zuerst den aktuellen Zustand.

## Menüs und das Kontextmenü { #menus-and-the-context-menu }

Die Titelzeile des Editors trägt eine Menüleiste wie in einer Office-Suite auf dem Desktop (`apps/web/src/ui/menu-bar.tsx`).
„Datei“ und „Hilfe“ sind in jedem Editor gleich (`src/editor/file-menu.ts`); der Editor fügt seine
eigenen Menüs dazwischen ein (`src/editor/word-menus.ts`), gebaut aus dem Zustand und den Befehlen oben.
Die Einträge folgen den Desktop-Editoren von web-apps (`documenteditor/main` `Toolbar.js`,
`DocumentHolder.js`); die angezeigten Tastenkürzel sind die der Engine selbst (`word/Editor/Shortcuts.js`).
Auf dem Handy bekommt das Dokument den Platz: Die Kopfzeile ist eine Reihe (zurück, Name, der
Speicherstand als Symbol, die eigenen Schaltflächen des Editors, „Werkzeuge“ und „Speichern“), und die
Menüs, die Schaltflächen der Datei und die Werkzeugleiste erscheinen erst nach einem Tipp auf „Werkzeuge“
(`src/editor/editor-header.tsx`, `e2e/phone.spec.ts`). In Kontext lässt Kontext unter einer offenen Datei
seine Tab-Leiste weg.

Ein Textdokument öffnet sich auf dem Handy in der mobilen Ansicht der Engine, so wie es der mobile Editor von
web-apps öffnet (`documenteditor/mobile` `Main.jsx`, „mobile-view“): `ChangeReaderMode` setzt den Text in
der Breite des Bildschirms in einer lesbaren Größe, weiter bearbeitbar, ohne Lineale
(`packages/editor-core/src/word-mobile-view.ts`, `apps/web/src/editor/use-mobile-view.ts`). Es ist nur ein
Layout (`word/Editor/Layout/ReadView.js`, ohne Verlauf gesetzt), deshalb bleibt die gespeicherte .docx,
wie sie ist. PDF und Drucken brauchen die Seiten: Dafür kehrt die Engine zu den Seiten zurück, setzt sie
auf einmal (`RecalculateAllAtOnce`, wie `asc_Print` es tut) und wechselt wieder in die mobile Ansicht.
„Ansicht → Mobilansicht“ schaltet sie auf jedem Bildschirm ein. Eine Präsentation hat auf dem Handy ihre
Folienliste unter der Folie (`thumbnails-position: bottom`) und ihre Notizen ausgeblendet bis
„Ansicht → Notizen“, so wie es der mobile Präsentationseditor von web-apps hat
(`presentationeditor/mobile` `Main.jsx`).

Ein Rechtsklick ins Dokument lässt die Engine `asc_onContextMenu` mit einem `CContextMenuData` schicken
(`word/api.js` `sync_ContextMenuCallback`): den Punkt relativ zu ihrem Ansichtselement und ob er in einer
Kopf- oder Fußzeile lag. `editor-core` fügt die Lage des Ansichtselements im Frame hinzu
(`src/view.ts` `toContextMenuRequest`) und reicht die Anfrage an die `onContextMenu`-Listener weiter; die
Web-App fügt die Lage des Frames im Fenster hinzu und zeigt dort ihr eigenes Menü, so wie es web-apps tut
(`DocumentHolder.js` `showPopupMenu`). Wer nur ansehen darf, bekommt kein Kontextmenü.

„Hilfe“ enthält die Tastenkürzel des Editors, den Schalter für die Bildschirmleser-Unterstützung der
Engine ([Barrierefreiheit](accessibility.md)) und „Über Schreibzeug“ mit der Lizenz und dem Link zum
laufenden Quellcode, den die AGPL verlangt (`src/editor/help-dialogs.tsx`).

Ausschneiden, Kopieren und Einfügen aus einem Menü laufen über die Engine (`common/clipboard_base.js`
`Button_Copy`, `Button_Cut`, `Button_Paste`), die die asynchrone Clipboard-API benutzt; der Frame erlaubt
das (`allow="clipboard-read; clipboard-write"`). Lehnt der Browser ab, antwortet der Eintrag mit `false`,
und die App sagt, welche Tasten du nehmen kannst, wie web-apps.

## Seitenlayout und Abstände { #page-layout-and-spacing }

Das Menü „Layout“ setzt die Ausrichtung, das Papierformat und die Ränder des Abschnitts am Cursor;
„Format“ und die Werkzeugleiste setzen den Zeilenabstand und den Einzug der Absätze
(`src/layout.ts`). Die Auswahl ist die von web-apps (documenteditor main `view/Toolbar.js`: A4, A5,
Letter, Legal; Ränder normal, schmal, mittel, breit; Abstand 1 bis 3 Zeilen), und die Aufrufe sind es auch
(`controller/Toolbar.js`): `change_PageOrient(isPortrait)`, `change_DocSize(width, height)` mit dem
Hochformat (die Engine dreht es für eine Seite im Querformat), `asc_SetSectionProps` mit einem
`Asc.CDocumentSectionProps`, in dem nur die Ränder gesetzt sind (`CDocument.Set_SectionProps` lässt in
Ruhe, was undefiniert ist), `put_PrLineSpacing(Asc.linerule_Auto, multiple)` sowie
`IncreaseIndent` / `DecreaseIndent`. Was Abschnitt und Absatz am Cursor haben, kommt von
`asc_onSectionProps` (`CDocument.UpdateInterface`) und `asc_onParaSpacingLine`; eine Vorlage gilt als
gewählt, wenn jeder Wert auf ein Zehntel Millimeter stimmt, so wie web-apps es prüft.

## Kopfzeilen, Fußzeilen und Seitenzahlen { #headers-footers-and-page-numbers }

„Einfügen“ öffnet die Kopf- oder Fußzeile der aktuellen Seite (`GoToHeader(page)`,
`GoToFooter(page)` mit `getCurrentPage()`, wie `HeaderFooterTab.js` von web-apps) und schließt sie, wenn
man darin ist (`asc_CancelHdrFtrEditing`), oder entfernt sie (`asc_RemoveHeader`, `asc_RemoveFooter`).
Seitenzahlen kommen mit `put_PageNum(part, align)` hinein, mit den Zahlen von `c_pageNumPosition` aus
web-apps (`DocumentHolder.js`: oben 1, unten 2; rechts 0, links 1, Mitte 2), oder mit `put_PageNum(-1)` am
Cursor; `asc_AddPageCount` fügt die Seitenzahl gesamt hinzu (`src/header-footer.ts`). Das Menü liegt
außerhalb des Frames, deshalb gibt das Hineingehen in die Kopfzeile oder das Herausgehen die Tasten wieder
an die Engine. Ob der Cursor in einer Kopf- oder Fußzeile steht, kommt von `asc_onFocusObject` (ein
`Header`-Element).

## Inhaltsverzeichnis, Fußnoten, Umbrüche und Textfelder { #table-of-contents-notes-breaks-and-text-boxes }

„Einfügen“ fügt ein, was der Tab „Verweise“ und die Werkzeugleiste von web-apps anbieten (`src/word-insert.ts`,
nach `documenteditor/mobile` `controller/add/AddTableContents.jsx`, `controller/add/AddOther.jsx`,
`controller/add/AddShape.jsx`):

- **Inhaltsverzeichnis**: `asc_GetTableOfContentsPr()` für das, das das Dokument hat, oder ein neues
  `Asc.CTableOfContentsPr`, eingestellt auf die Überschriften 1 bis 9 (`put_OutlineRange(1, 9)`),
  verlinkte Einträge, Seitenzahlen rechtsbündig hinter Punkten (`c_oAscTabLeader.Dot`), dann
  `asc_AddTableOfContents(null, props)`; gibt es schon eines, wird dieses geändert, statt ein zweites
  hinzuzufügen. „Inhaltsverzeichnis aktualisieren“ ist `asc_UpdateTableOfContents(false)` (Einträge und
  Seitenzahlen); ohne Inhaltsverzeichnis sagt der Editor das, statt die Engine `ComplexFieldNoTOC` melden
  zu lassen.
- **Fußnoten und Endnoten**: `asc_AddFootnote()` und `asc_AddEndnote()` setzen das Zeichen an den Cursor und
  den Cursor in die Notiz. Strg+Alt+F ist das eigene Tastenkürzel der Engine (`InsertFootnoteNow`).
- **Umbrüche**: `put_AddPageBreak()` (Strg+Enter), `put_AddColumnBreak()` und
  `add_SectionBreak(c_oAscSectionBreakType.NextPage | Continuous)`, das einen Abschnitt mit eigener
  Seiteneinrichtung beginnt.
- **Textfeld**: `AddShapeOnCurrentPage("textRect")` zeichnet ein Rechteck, das Text aufnimmt, in die Mitte
  der angezeigten Seite (`GraphicObjects.addShapeOnPage`), ausgewählt, sodass die nächsten Tasten
  hineingehen. Es wird als `wps:txbx` gespeichert.

Das Menü liegt außerhalb des Frames, deshalb gehen die Tasten nach jedem dieser Schritte wieder an die
Engine, wie bei Kopf- und Fußzeile: Was du als Nächstes tippst, landet in der Notiz, im Textfeld oder auf
der Seite.

## Links { #links }

„Link …“ (Strg+K, die Werkzeugleiste, das Kontextmenü) funktioniert wie der Link-Dialog von web-apps
(`controller/Links.js`, `view/HyperlinkSettingsDialog.js`): Wenn `can_AddHyperlink()` den ausgewählten Text
zurückgibt, kommt ein neuer Link mit `add_Hyperlink` hinein; sonst steht der Cursor in einem Link, dessen
`Asc.CHyperlinkProperty` aus `getSelectedElements()` mit `change_Hyperlink` und `remove_Hyperlink`
geändert oder entfernt wird (`src/links.ts`). Eine Adresse ohne Schema bekommt `http://` (eine
E-Mail-Adresse `mailto:`), und ein unveränderter Text wird als null übergeben, damit der verlinkte Text
seine Formatierung behält. Strg+K erreicht die App als `asc_onDialogAddHyperlink`; die Kürzeltabelle der
Engine ist leer, bis sie auf die Standardwerte zurückgesetzt wird (`asc_resetAllShortcutTypes`, wie es
`Shortcuts.js` von web-apps tut), was der Texteditor einmal tut, sobald das Dokument angezeigt wird.
Strg+Klick auf einen Link schickt `asc_onHyperlinkClick`; die App öffnet http-, https- und mailto-Adressen
in einem neuen Tab.

## Hervorheben und Format übertragen { #highlight-and-format-painter }

„Hervorheben“ hebt die Auswahl in einer der ersten Farben der Palette von web-apps hervor oder nimmt die
Hervorhebung weg: `SetMarkerFormat(true, isColor, r, g, b)` (`CDocument.SetParagraphHighlight`),
dann `SetMarkerFormat(false)`, damit die Maus nicht wie in web-apps ein Textmarker bleibt, wo sie es bis
Escape tut. Die Farbe am Cursor wird aus `get_TextProps().get_TextPr().get_HighLight()` gelesen, wenn
`asc_onTextHighLight` kommt, wie es `onApiHighlightColor` von web-apps tut, weil das Event selbst „keine“
(-1) als Schwarz meldet. „Format übertragen“ ist `SetPaintFormat(1)`; die Engine überträgt die kopierte
Formatierung auf die nächste Auswahl, die mit der Maus gemacht wird, und meldet den Pinsel als aus
(`asc_onPaintFormatChanged`), aber nicht als an; deshalb hält die Schaltfläche diesen Zustand selbst
(`src/marking.ts`).

## Änderungen nachverfolgen { #tracked-changes }

`src/review.ts`, nach dem Review von web-apps (`common/main` `controller/ReviewChanges.js`,
`common/mobile` `controller/collaboration/Review.jsx`). Das Menü „Überprüfen“ schaltet das Nachverfolgen
ein und aus, geht durch die Änderungen, nimmt sie an oder lehnt sie ab und wählt, wie sie angezeigt werden;
eine Sprechblase neben der Änderung am Cursor nennt, wer sie wann gemacht hat, mit Annehmen und Ablehnen.

| Befehl | Aufruf in der Engine (word/api.js) |
|---|---|
| Änderungen nachverfolgen | `asc_SetLocalTrackRevisions(null)`, `asc_SetGlobalTrackRevisions(on)`: für das Dokument, gespeichert als `w:trackRevisions` in `settings.xml`, wie „für alle“ in web-apps; Zustand von `asc_onOnTrackRevisionsChange(local, global)` (local `null`: die Einstellung des Dokuments gilt) |
| annehmen, ablehnen am Cursor | `asc_AcceptChangesBySelection(true)`, `asc_RejectChangesBySelection(true)`: die Änderung am Cursor oder in der Auswahl, dann weiter zur nächsten |
| vorherige, nächste | `asc_GetPrevRevisionsChange()`, `asc_GetNextRevisionsChange()` |
| alle | `asc_AcceptAllChanges()`, `asc_RejectAllChanges()` |
| Anzeige | `asc_SetDisplayModeInReview(c_oAscDisplayModeInReview.Edit \| Final \| Original)`; es gibt kein Event, deshalb merkt sich der Editor die Wahl |

Die Änderungen am Cursor kommen mit `asc_onShowRevisionsChange(changes, isShow)`, jede ein
`CRevisionsChange` (`word/Editor/RevisionsChange.js`): `get_UserName`, `get_DateTime`, `get_Type`
(`c_oAscRevisionsChangeType`: Text oder Absatz hinzugefügt oder entfernt, Formatierung), `get_Value` (der
Text oder eine Liste aus Text und Zeichnungen) und `get_X`/`get_Y` relativ zum Ansichtselement
(`#editor_sdk`). Wie in web-apps erscheint die Sprechblase nur für den Cursor (`isShow`), nicht für eine
Auswahl, und nur, solange Änderungen markiert werden. Der Autor ist der Name, den das Relay der Sitzung
gibt (siehe [Zusammenarbeit](collaboration.md)).

## Rechtschreibprüfung { #spell-checking }

`src/spelling.ts`. Ohne Adresse eines Rechtschreibdienstes prüft die Engine in einem eigenen Worker
(`common/apiBase.js` `_coSpellCheckInit` → `CSpellchecker`, `common/spell/spell.js`: Hunspell als
WebAssembly) und lädt `<lang>/<lang>.aff` und `.dic` aus `engine/dist/dictionaries`, das
`engine/scripts/prepare.ts` aus dem Release-Paket mit den Sprachen aus `engine.json`
(`de_DE`, `de_AT`, `de_CH`, `en_US`, `en_GB`) und ihren Lizenzen füllt.

- **Nur mitgelieferte Sprachen.** Die Engine prüft jede Sprache, die sie aufführt
  (`AscCommon.spellcheckGetLanguages`); eine Sprache ohne ihr Wörterbuch markiert jedes Wort, und deshalb
  war die Prüfung vorher abgeschaltet. Die Liste wird vor dem Start des Editors auf die Wörterbücher
  gekürzt, die wir mitliefern (`limitSpellLanguages`); Text in anderen Sprachen bleibt unmarkiert.
- **Ein eigener Worker des Frames.** Aus dem Frame des Editors hat der gemeinsame Worker (`SharedWorker`,
  namens `onlyoffice-spellchecker`) in Chromium nie geantwortet, ein dedizierter Worker dagegen schon;
  spell.js kommt für WKWebView von WebKit ohnehin ohne den gemeinsamen aus, deshalb versteckt der Frame
  `SharedWorker`, bevor der Editor startet (`useDedicatedSpellWorker`).
- **Gestartet, egal wie schnell er lädt.** Der Worker (`common/spell/spell/spell.js`) setzt
  `Module.onRuntimeInitialized` erst, wenn die „init“-Nachricht der Seite kommt. Hat der Browser das
  WebAssembly im Cache, ist es schon vorher bereit, der Callback kommt nie, und die Assertions des Builds
  brechen das Modul ab („Attempt to set `Module.onRuntimeInitialized` after it has already been
  processed“): keine Rechtschreibprüfung in diesem Dokument. `engine/scripts/prepare.ts`
  (`patchSpellWorker`) lässt den Worker sofort `self.onEngineInit()` aufrufen, wenn `Module.calledRun`
  gesetzt ist; es bricht mit einem Fehler ab, falls ein Engine-Update diese Zeile ändert.
- **An oder aus** mit `asc_setSpellCheck(on)`, sobald das Dokument bereit ist, und über „Überprüfen →
  Rechtschreibprüfung“; die Wahl bleibt in diesem Browser gespeichert (`apps/web`
  `settings/spell-check.ts`, so wie web-apps „settings-spellcheck“ speichert). Wer nur ansehen darf, bekommt
  keine Unterstreichungen.
- **Vorschläge.** Steht der Cursor in einem falsch geschriebenen Wort, führt `asc_onFocusObject` ein
  `c_oAscTypeSelectElement.SpellCheck`-Element auf (`asc_CSpellCheckProperty`: `get_Word`,
  `get_Checked` falsch, `get_Variants`). Das Kontextmenü bietet die ersten fünf Varianten an
  (`asc_replaceMisspelledWord(variant, element)`), „Ignorieren“ und „Alle ignorieren“
  (`asc_ignoreMisspelledWord(element, all)`), wie das von web-apps (`documenteditor/main`
  `DocumentHolderExt.js` spellProps). Dieselben Aufrufe funktionieren im Präsentationseditor.

Die Bilder zur Formattreue und die Screenshots entstehen mit abgeschalteter Rechtschreibprüfung, damit ein
Update der Wörterbücher sie nicht verändert.

## Suchen und Ersetzen { #find-and-replace }

`src/search.ts` füllt im Frame der Engine ein `CSearchSettings` (`common/api/searchSettings.js`: Text,
Groß-/Kleinschreibung beachten, ganze Wörter) und ruft `asc_findText(settings, isNext)`,
`asc_replaceText(settings, replacement, isReplaceAll)` und `asc_endFindText()` auf, so wie es web-apps tut
(`documenteditor/main` `controller/Search.js`). Die Engine antwortet mit
`asc_onSetSearchCurrent(current, total)` und, nach „alle ersetzen“, mit `asc_onReplaceAll(total,
replaced)`; beides landet in `state.search`. Passt nichts, schickt sie nichts, deshalb meldet der Befehl
das selbst.

Strg+F und Strg+H behandelt die Engine nicht (web-apps öffnet dafür ein eigenes Panel); ein
keydown-Listener im Frame (`document.ts` `onKey` mit `shortcutOf`, nach außen gegeben als `onShortcut`) und einer im Fenster der App öffnen
stattdessen die Suchleiste statt der Suche des Browsers. Wer nur ansehen darf, kann suchen, aber nicht
ersetzen.

## PDF und Drucken { #pdf-and-printing }

Dieser Build von x2t macht aus einem Dokument nicht von selbst ein PDF; er schreibt ein PDF aus den
Zeichenbefehlen der Engine, so wie es der Document Server zum Drucken tut. `exportPdf` (`src/document.ts`)
gibt dem Konverter drei Dinge, so wie es CryptPad tut (`www/common/outer/x2t.js`
`x2tConvertDataInternal`):

- das Dokument im Binärformat der Engine (`asc_nativeGetFile()`) als `input.bin`;
- jede Seite als Zeichenbefehle, als `pdf.bin` daneben: `WordControl.m_oDrawingDocument
  .ToRendererPart(true, true)`, das, was `word/api.js` `_downloadAs` für ein PDF zum Drucken schickt; x2t
  liest diese Datei unter diesem Namen (`X2tConverter/src/lib/pdf_image.h` `doct_bin2pdf`, der Patch von
  CryptPad);
- die Schriften, mit denen das Dokument gezeichnet wurde, in `m_sFontDir`: die Schriftdateien, die die
  Engine geladen hat (`AscCommon.g_font_loader`, Status 0 oder 1), noch einmal aus ihrem Schriftordner
  geholt (der Browser hat sie im Cache) und mit rückgängig gemachter Verschleierung ihrer ersten 32 Bytes,
  so wie es die Engine beim Laden tut (`common/Drawings/Externals.js`, `guidOdttf`); `src/print.ts`.

„Als PDF/A herunterladen“ bittet x2t um dasselbe PDF als PDF/A-2 (`m_bIsPDFA` im Auftrag;
`X2tConverter/src/cextracttools.h` → `PdfFile.cpp` `CreatePdf(isPDFA)`): XMP-Metadaten mit
`pdfaid:part` 2, ein sRGB-Output-Intent, jede Schrift eingebettet. Für ein PDF selbst siehe [PDFs](pdf.md#pdfa).

„Drucken“ druckt dieses PDF über den Dialog des Browsers (`apps/web/src/editor/pdf.ts`), auf einem von
zwei Wegen (`apps/web/src/editor/print-pages.ts`):

- Wo der Browser einen eigenen PDF-Viewer hat (`navigator.pdfViewerEnabled`) und nicht WebKit ist
  (Chrome, Edge, Firefox auf einem Rechner), kommt das PDF in einen versteckten Frame, der druckt, sobald
  es geladen ist: scharf und mit seinem Text.
- Überall sonst zeichnet pdf.js (nur dann geladen) jede Seite mit 300 dpi, die Bilder kommen in die
  Seite, auf dem Bildschirm versteckt, und die Seite selbst druckt, sobald alle dekodiert sind; ein
  Druck-Stylesheet zeigt nur sie, eines pro Blatt in der Größe der ersten Seite. Chrome auf Android und die
  darauf gebauten Browser haben keinen PDF-Viewer und geben ein PDF in einem Frame an das System weiter,
  sodass kein Druckdialog käme. Safari meldet den Frame als geladen, bevor sein Viewer die Seiten
  gezeichnet hat; direkt nach einem Neuladen zu drucken, ergibt dann leere Seiten, und nichts verrät, wann
  sie gezeichnet sind. Alle Browser auf iOS sind WebKit. „Als PDF sichern“ im Druckdialog ergibt dort ein
  PDF aus Bildern; „Als PDF herunterladen“ liefert das echte.

Strg+P ist eine weitere Taste, die die Engine ihrer Oberfläche überlässt; sie geht an dieselbe Stelle wie
Strg+F (`onShortcut`), ebenso Strg+S, das über die App speichert (das eigene `asc_Save` der Engine würde
mit dem Document Server sprechen). Die Bilder des Dokuments gehen als `media/` mit, wie unten beschrieben.

## Bilder { #images }

Der Konverter hält die Bilder eines Dokuments von seiner Binärform getrennt: Beim Öffnen einer .docx
schreibt x2t sie nach `media/` neben die Ausgabe, und beim Speichern oder Drucken liest es sie von dort
(`engine/frame/x2t/worker.js`; CryptPad macht dasselbe in `www/common/outer/x2t.js`). Die Engine selbst
sieht nie Dateien; sie sucht jedes Bild unter seinem Namen in `AscCommon.g_oDocumentUrls`
(`common/editorscommon.js` `DocumentUrls`), das der Document Server mit Download-Links füllt.
`src/media.ts` füllt es mit Blob-URLs, die im Frame erzeugt werden (`provideMedia`), nachdem der Konverter
geantwortet hat, und holt beim Speichern oder Drucken jeden `media/`-Eintrag wieder in Bytes zurück
(`collectMedia`), auch Bilder, die beim Bearbeiten hinzugekommen sind.

„Einfügen → Bild …“ fügt ein Bild vom Rechner am Cursor ein (`insertImage`): Die App legt es auf dem Server
ab, der mit seinem Namen antwortet, und das Bild kommt unter diesem Namen mit seiner Server-URL in
DocumentUrls; dann findet `AddImageUrl([url])` (`common/apiBase.js`) die URL dort und reicht sie an
`_addImageUrl` des Editors weiter (word/api.js, cell/api.js, slide/api.js), wie nach einem Upload zum
Document Server (`UploadImageFiles`). Das Speichern bildet die URL wieder auf den Namen ab
(`Shapes/SerializeWriter.js` `getImageLocal`), sodass das Bild in `media/` der Datei landet. Wie die anderen
in einer Sitzung es bekommen, steht unter [Zusammenarbeit](collaboration.md#saving).

## Tastaturfokus { #keyboard-focus }

Die Engine nimmt Tasten über ein verstecktes Textfeld in ihrem Frame entgegen (`common/text_input2.js`, ID
`area_id`) und bricht `mousedown` auf ihrem Canvas ab. Ein Klick in die Seite nimmt der App deshalb nicht
den Fokus: Hatte eine Schaltfläche der Werkzeugleiste den Fokus, ging das Tippen ins Leere. `editor-core`
horcht im Frame auf `pointerdown` und fokussiert, wenn nichts im Frame die Tasten hält, die Eingabe der
Engine (`api.getFocusElement()`, `common/apiBase.js`); der eigene `focus`-Handler der Engine schaltet dann
ihre Tasten-Events wieder ein (`keepFocusOnClick` in `src/frame.ts`). Es prüft noch einmal, wenn die
Haupttaste losgelassen wird: Ein Klick in die Notizen der Präsentation lässt den Fokus danach auf dem Body
der Seite. Ein Rechtsklick bleibt dort unberührt, weil dann das Kontextmenü der App den Fokus hat.

Der Weg wieder hinaus ist F6: Im Dokument gehört Tab der Engine (ein Tabulator, die nächste Zelle, das
nächste Formularfeld), und Escape und Umschalt+Tab bleiben ebenfalls dort. `shortcutOf` (`src/view.ts`)
nimmt F6 und Umschalt+F6 im Frame vor der Engine ab, so wie Strg+F; die Web-App wechselt zur Menüleiste,
zur Werkzeugleiste oder zurück ins Dokument (`focus()`, wieder die Eingabe der Engine;
`src/editor/regions.ts`).

## Bildschirmleser { #screen-reader }

Die Bildschirmleser-Unterstützung der Engine (`common/workerspeech.js`) schreibt, worüber der Cursor ging
und was ausgewählt wurde, in `div#area_id_screen_reader` (`role="region"`, `aria-live="assertive"`) neben
ihrer Eingabe. `src/screen-reader.ts` schaltet sie mit `setSpeechEnabled` (`common/apiBase.js`), von Anfang
an, wenn `OpenOptions.screenReader` es sagt; ausgeschaltet hat `EditorActionSpeaker.stop` ihre Callbacks
entfernt. Strg+Alt+Z schaltet sie in der Engine selbst (`word/Editor/Shortcuts.js` `SpeechWorker`,
`cell/view/EventsController.js`, `slide/Editor/Format/Presentation.js`); ein `keyup`-Listener liest danach
`EditorActionSpeaker.isLanched`, sodass `screenReader` im Store und das Menü folgen. Ihre Wörter kommen aus
der `translate`-Map der API (`OpenOptions.texts`, die die App aus ihren Texten in
`apps/web/src/editor/engine-texts.ts` füllt; nachgeschlagen von `translateManager.getValue`). Gleich nachdem der Inhalt bereit ist, erzeugt die Engine ihre Eingabe
(`word/api.js` OpenDocument → `InitControl`); ein Microtask benennt sie dann nach der Datei und ersetzt ihr
`autocomplete="extremely_off"` (`common/text_input2.js`), das kein gültiger Wert ist.

## Tabellen { #spreadsheets }

`src/cell.ts` bindet die Tabellen-Engine (`cell/api.js`) an, nach dem Vorbild von
`spreadsheeteditor/mobile` aus web-apps:

- **Bearbeitungsleiste.** Die Engine tippt in ein Eingabefeld, das sie per ID in ihrem eigenen Dokument
  findet (`config["id-input"]`, `document.getElementById`), deshalb gehört die Bearbeitungsleiste zur
  Frame-Seite (`engine/frame/editor/cell/main/index.html`), mit dem Namensfeld daneben. Das Namensfeld zeigt
  `asc_onSelectionNameChanged` und springt mit Enter per `asc_findCell`.
- **Deutsches Regionalformat.** `asc_setLocale(0x0407)` vor dem Laden: Dezimalkomma, `;` zwischen
  Funktionsargumenten. Funktionsnamen bleiben englisch (`SUM`), weil die Engine ohne Übersetzungsdatei
  keine deutschen Namen hat.
- **Zustand.** `asc_onSelectionChanged` bringt die aktive Zelle (`asc_CCellInfo` →
  `CellXfs`: Schrift, Farben, Ausrichtung, Umbruch, Zahlenformat; Verbundzustand), `asc_onSheetsChanged` und
  `asc_onActiveSheetChanged` die Blattregister, gelesen mit `asc_getWorksheetsCount`,
  `asc_getWorksheetName`, `asc_isWorksheetHidden`, `asc_getActiveWorksheetIndex`.
- **Die Handler-Liste.** Die Engine hält eine einzelne Funktion pro Event, wie sie ist, und erst mehrere
  als Liste. Beim Öffnen meldet sie einen eigenen Callback für `asc_onSelectionChanged` ab, was das ganze
  Event löscht, wenn nur eine Funktion da ist (`cell/view/HandlerList.js` `remove`). Ein leerer erster
  Callback erhält unseren. Außerdem ruft sie nur auf, was ihr `asc_typeOf` „function“ nennt, deshalb sind
  Callbacks nie `async`-Funktionen.

| Befehl | Aufruf in der Engine (cell/api.js) |
|---|---|
| fett, kursiv, unterstrichen, durchgestrichen | `asc_setCellBold/Italic/Underline/Strikeout(value)` |
| Schriftart, Größe | `asc_setCellFontName(name)`, `asc_setCellFontSize(size)` (höchstens 409) |
| Textfarbe, Füllung | `asc_setCellTextColor(asc_CColor)`, `asc_setCellBackgroundColor(asc_CColor \| null)` |
| Ausrichtung, Umbruch | `asc_setCellAlign(AscCommon.align_*)`, `asc_setCellTextWrap(value)` |
| Zahlenformat | `asc_setCellFormat(code)`: `General`, `#,##0.00`, `#,##0.00\ [$€-407]`, `0.00%`, `dd.mm.yyyy`, `@` |
| verbinden | `asc_mergeCells(c_oAscMergeOptions.Merge \| None)` |
| Zeilen, Spalten | `asc_insertCells(c_oAscInsertOptions.InsertRows \| InsertColumns)`, `asc_deleteCells(…)` |
| rückgängig, wiederholen | `asc_Undo()`, `asc_Redo()`; Zustand von `asc_onCanUndoChanged`, `asc_onCanRedoChanged` |
| Blätter | `asc_showWorksheet(i)`, `asc_addWorksheet(name)`, `asc_renameWorksheet(name)`, `asc_deleteWorksheet()` |
| ausschneiden, kopieren, einfügen | `asc_Cut()`, `asc_Copy()`, `asc_Paste()` |
| Zoom | `asc_setZoom(factor)`, `asc_getZoom()`; `asc_onZoomChanged(factor)` |
| suchen, ersetzen | `asc_findText(asc_CFindOptions)` (die Anzahl), `asc_replaceText(options)`; `asc_onSetSearchCurrent`, `asc_onRenameCellTextEnd(found, replaced)` |
| PDF | `wb.calcPagesPrint()`, `wb.printSheets(pages, null).DocumentRenderer.Memory.GetData()`, wie `cell/api.js` `_downloadAs` |

Die Menüs und das Kontextmenü funktionieren wie im Texteditor (`apps/web/src/editor/sheet-menus.ts`).
Der Rechtsklick der Tabelle reicht das Maus-Event selbst weiter (`WorkbookView.js` `onContextMenu`),
dessen Punkt schon in den Koordinaten des Frames liegt. Die Suche folgt web-apps
(`spreadsheeteditor/main` `controller/Search.js`): Werte im aktiven Blatt, „ganze Wörter“ als „ganze
Zelle“; Treffer werden mit `asc_selectSearchingResults` markiert, weil `asc_endFindText` der Tabelle in
diesem Build fehlschlägt (es ruft ein `_cleanFindResults` auf, das `WorkbookView.js` fehlt).

Die Tabelle hat kein `SetUnchangedDocument`; ihr „geändert“-Flag fällt, sobald das Relay die Änderungen hat
(`asc_isDocumentModified`, `History.Have_Changes`).

### Sortieren, Filter und fixierte Bereiche { #sorting-filters-and-frozen-panes }

`src/cell-data.ts`, nach dem Desktop-Editor von web-apps (`spreadsheeteditor/main` `controller/Toolbar.js`
`onSortType`, `onAutoFilter`, `onClearFilter`; `controller/ViewTab.js` `onFreeze`) und seinem mobilen
Spaltenfilter (`spreadsheeteditor/mobile` `controller/FilterOptions.jsx`):

| Befehl | Aufruf in der Engine (cell/api.js) |
|---|---|
| sortieren | `asc_sortCellsRangeExpand()`, dann `asc_sortColFilter(c_oAscSortOptions.Ascending \| Descending, "", undefined, undefined, expand)` |
| Filter an, aus | `asc_addAutoFilter()`; `asc_changeAutoFilter(tableName, c_oAscChangeFilterOptions.filter, value)`, wo Schaltflächen sind oder eine formatierte Tabelle ist |
| Filter löschen | `asc_clearFilter()` |
| fixieren | `asc_freezePane()` (an der aktiven Zelle, oder Fixierung aufheben), `asc_freezePane(c_oAscFrozenPaneAddType.firstRow \| firstCol)` |
| Filter einer Spalte | `asc_onSetAFDialog(asc_CAutoFilterObject)`: Werte mit `asc_getText`/`asc_getVisible`; `asc_setVisible` auf jedem, `asc_getFilterObj().asc_setType(c_oAscAutoFilterTypes.Filters)`, `asc_applyAutoFilter(object)`; danach sortieren mit `asc_sortColFilter(order, asc_getCellId(), asc_getDisplayName())` |

- **Eine einzelne Spalte sortieren** stellt in web-apps die Frage von Excel, wenn daneben weitere Daten
  stehen (`c_oAscSelectionSortExpand.showExpandMessage`). Schreibzeug nimmt die Vorgabe dieser Frage und
  sortiert die Zeilen mit, den ganzen Bereich um die Auswahl; hat jemand anderes diese Zeilen
  (`showLockMessage`), sortiert es nur die Auswahl, was dort „Ja“ bewirkt.
- **Der Filterzustand** kommt mit der Auswahl: `asc_getAutoFilterInfo()` ist `true` mit Schaltflächen,
  `false`, wo sie hinzugefügt werden können, und `null`, wo nicht; `asc_getIsApplyAutoFilter()` sagt, ob
  ein Filter Zeilen ausblendet. Der Name einer formatierten Tabelle ist
  `asc_getFormatTableInfo().asc_getTableName()`.
- **Fixierte Bereiche** haben kein Event: Das Fixieren wartet auf die Sperre des Bereichs
  (`WorksheetView.js` `_isLockedFrozenPane`), in einer gemeinsamen Sitzung die Antwort des Relays.
  `asc_getSheetViewSettings().asc_getIsFreezePane()` wird kurz danach und bei jeder Bewegung der Auswahl
  erneut gelesen; das Menü zeigt „Fixierung aufheben“, solange etwas fixiert ist, wie das von web-apps.
- **Der Filter einer Spalte** öffnet sich unter ihrer Schaltfläche. Die Lage der Schaltfläche ist relativ
  zum Canvas des Rasters, in `#ws-canvas-outer`; wir addieren die Lage dieses Elements im Frame und die des
  Frames im Fenster. „OK“ wendet die markierten Werte an; mindestens einer bleibt sichtbar.

### Diagramme { #charts }

`src/cell-chart.ts`, nach dem mobilen Tabelleneditor von web-apps (`controller/add/AddChart.jsx`
`onInsertChart`, `controller/edit/EditChart.jsx` `onType`). „Einfügen“ und die Werkzeugleiste bieten
Säulen, Balken, Linien, ein Kreisdiagramm und Flächen an (`c_oAscChartTypeSettings` `barNormal`,
`hBarNormal`, `lineNormal`, `pie`, `areaNormal`):

- **Ein neues Diagramm**: `asc_getChartSettings(true)` liefert die Einstellungen für die Auswahl (`true`,
  ohne den Frame des Diagrammeditors zu öffnen), `putType(type)`, dann `asc_checkDataRange(
  c_oAscSelectionDialogType.Chart, getRange(), true, !getInColumns(), getType())`; mit
  `c_oAscError.ID.No` kommt das Diagramm mit `asc_addChartDrawingObject(settings)` hinein, zu viele
  Datenreihen (`MaxDataSeriesError`) oder kein Bereich werden in einer Meldung gesagt.
- **Das ausgewählte Diagramm**: Mit `asc_getSelectionType()` `RangeChart` (oder `RangeChartText`) ist das
  Diagramm unter `asc_getGraphicObjectProps()`, seine Einstellungen sind
  `get_ObjectValue().get_ChartProperties()`; `changeType(type)` ändert es sofort. Das Menü hakt dann die
  Art des ausgewählten Diagramms an.

### Dropdown-Listen und bedingte Formate { #dropdown-lists-and-conditional-formats }

`src/cell-rules.ts`, nach dem Desktop-Tabelleneditor von web-apps (`controller/DataTab.js`
`onDataValidation` mit `view/DataValidationDialog.js`; `controller/Toolbar.js` für die Auswahl der
bedingten Formate):

- **Eine Dropdown-Liste** („Daten → Dropdown-Liste …“) ist eine Datenüberprüfung vom Typ Liste.
  `asc_getDataValidationProps()` liefert die Regel der Auswahl; wo die Auswahl mehrere Regeln enthält,
  antwortet es mit `c_oAscError.ID.MoreOneTypeDataValidate` und wird erneut mit `null` gefragt (neu
  anfangen), sonst mit `true` (die Regel erweitern). Die Werte kommen als `CDataFormula` hinein, die
  Einträge mit „;“ verbunden (dem deutschen Argumenttrenner), mit `asc_setType(List)`,
  `asc_setAllowBlank(true)`, `asc_setShowErrorMessage(true)`, dann `asc_setDataValidation(props)`;
  Typ `None` nimmt die Liste weg. Die .xlsx bekommt sie in der Form der `x14`-Erweiterung.
- **Bedingte Formate** („Format“): ein Datenbalken und eine Farbskala Grün–Gelb–Rot, die jeweils erste
  Vorlage aus der Auswahl von web-apps: `asc_setCF([], [], [c_oAscCFRuleTypeSettings.dataBar | colorScale, 0])`.
  `asc_clearCF(c_oAscSelectionForCFType.selection)` nimmt sie von den ausgewählten Zellen.

### Pivot-Tabellen { #pivot-tables }

`src/cell-pivot.ts`, nach dem Desktop-Tabelleneditor von web-apps (`controller/PivotTable.js`,
`view/PivotSettings.js`, `view/ValueFieldSettingsDialog.js`); die Engine hält und berechnet die Tabelle
(`cell/model/PivotTables.js` `CT_pivotTableDefinition`), und x2t schreibt sie mit ihrem Cache in die .xlsx
(`xl/pivotTables/`, `xl/pivotCache/`).

- **Eine neue** („Einfügen → Pivot-Tabelle …“): Der Dialog beginnt mit der Tabelle um die aktive Zelle
  (`asc_getAddPivotTableOptions().asc_getRange()`), geprüft mit `asc_checkDataRange(
  c_oAscSelectionDialogType.PivotTableData, …)`; `asc_insertPivotNewWorksheet(source, "Pivot<n>")` legt sie
  auf ein neues Blatt mit dem ersten freien Namen (`createSheetName`). Wo der Bereich keine Überschriften
  hat, antwortet es nichts; der Dialog sagt das.
- **Die Tabelle an der aktiven Zelle** kommt mit der Auswahl: `asc_getCellInfo().asc_getPivotTableInfo()`.
  Ihre Felder sind `asc_getPivotFields()` (oder die Namen aus `asc_getCacheFields()` der Quelle), und die
  vier Bereiche `asc_getPageFields()`, `asc_getColumnFields()`, `asc_getRowFields()` (Feldindizes; `-2` ist
  der Eintrag „Werte“, sobald es zwei Werte gibt) und `asc_getDataFields()` (`CT_DataField` mit der
  Quellspalte, dem Namen und `c_oAscDataConsolidateFunction`). Die Feldliste neben dem Raster zeigt sie,
  solange die aktive Zelle in einer Pivot-Tabelle liegt.
- **Anordnen**: Ein angehaktes Feld kommt mit `asc_addField` hinein (Zahlen zu den Werten, andere zu den
  Zeilen, `CT_CacheField.isSumSubtotal`), ein abgehaktes mit `asc_removeField` heraus;
  `asc_moveToRowField`, `asc_moveToColField`, `asc_moveToPageField`, `asc_moveToDataField` verschieben eines
  (einen Wert mit seinem Platz unter den Werten). Statt Ziehen bietet jeder Eintrag an, wohin er darf.
- **Wie ein Wert zusammengefasst wird**: ein `CT_DataField` mit `asc_setSubtotal` und `asc_setName`,
  angewandt mit `value.asc_set(api, pivot, index, change)`. Werte heißen so, wie das deutsche Excel sie
  nennt („Summe von Betrag“, „Anzahl von …“): Die Engine füllt ihr Namensmuster (`%1 of %2`) mit dem
  englischen Funktionsnamen, deshalb benennt die App jeden neuen Wert sofort um.
- **Aktualisieren**, nachdem sich die Quelle geändert hat: `asc_refresh(api)` auf der Tabelle, über
  „Daten“, das Kontextmenü oder die Feldliste.
- **Beschriftungen in der Sprache der Oberfläche**: „Gesamtergebnis“, „Zeilenbeschriftungen“,
  „Spaltenbeschriftungen“, „Werte“, „(Alle)“, „(Leer)“ auf Deutsch, über die `translate`-Map, mit der die
  API erzeugt wird (`OpenOptions.texts`, gefüllt von `apps/web/src/editor/engine-texts.ts`; die Schlüssel
  sind die Beschriftungen aus `PivotTables.js`, so wie `Main.js` von web-apps sie übergibt).
- Die Engine ändert die Tabelle ohne Änderung der Auswahl, deshalb liest jeder Befehl den Zustand neu.

### CSV-Dateien { #csv-files }

Eine .csv öffnet sich im Tabelleneditor und wird wieder als CSV gespeichert, mit dem Trennzeichen, mit dem
sie kam (`src/csv.ts` `detectDelimiter`: das, das die meisten der ersten Zeilen außerhalb von
Anführungszeichen benutzen, ein Feld in Anführungszeichen, das über einen Zeilenumbruch weiterläuft,
eingeschlossen, ein Anführungszeichen mitten in einem Feld wie `27"` setzt nichts in Anführungszeichen, bei
Gleichstand „;“). Der Editor sagt einmal, dass nur Werte erhalten bleiben.

- **Lesen**: x2t liest eine CSV in eine .xlsx, nicht ins Binärformat (das bricht mit Fehler 89 ab), und nur
  mit beiden Formaten im Auftrag (`m_nFormatFrom` 260, `m_nFormatTo` 257) sowie
  `m_nCsvTxtEncoding` 46 (UTF-8) und `m_nCsvDelimiter` (`c_oAscCsvDelimiter`: Tab 1, „;“ 2, „,“ 4);
  `m_nLcid` 1031 lässt es „-4,20“ und „01.10.2026“ als Zahl und Datum lesen
  (Core `X2tConverter/src/cextracttools.h`, `OOXML/Binary/Sheets/Reader/CSVReader.cpp`). Die .xlsx öffnet
  sich dann wie gewohnt.
- **Schreiben** geschieht in der Seite, nicht in x2t: Der CSV-Writer von x2t kodiert Text über ICU, das im
  WebAssembly-Build keine Konverterdaten hat, sodass jedes Zeichen jenseits von ASCII als ein einzelnes Byte
  herauskam (`Writer/CSVWriter.cpp` `WriteFile`, `UnicodeConverter.cpp` `fromUnicode`). Die Werte sind die
  des aktiven Blatts, so wie seine Zellen sie zeigen, über die Document-Builder-API
  (`api.getJsApi().GetActiveSheet().GetUsedRange().GetText()`, `cell/apiBuilder.js`), und
  `encodeCsv` schreibt sie als UTF-8 mit Byte Order Mark und CR LF und setzt in Anführungszeichen, was das
  Trennzeichen, ein Anführungszeichen oder einen Zeilenumbruch enthält. „Als CSV herunterladen“ auf einer
  .xlsx macht dasselbe mit „;“.

## Präsentationen { #presentations }

`src/slide.ts` bindet die Präsentations-Engine an (`slide/api.js`), eingerichtet, wie es
`presentationeditor/mobile` von web-apps tut: `SetDrawingFreeze(true)` und `SetThemesPath` vor dem Laden,
`SetDrawingFreeze(false)`, `zoomFitToPage()`, sobald das Dokument angezeigt wird. Die Engine zeichnet die
Folienliste und das Notizfeld in ihrem Frame; die Notizen erscheinen, sobald das Dokument angezeigt wird
(`asc_ShowNotes(true)`, wie es der Desktop-Editor von web-apps tut, wenn sie nicht ausgeblendet waren), und
„Ansicht → Notizen“ blendet sie aus und ein. Die Engine meldet nicht, ob sie sichtbar sind, deshalb hält der
Befehl das im Zustand fest. Ihre eigenen Texte (leere Platzhalter, „click to add
notes“) kommen aus der `translate`-Map, mit der die API erzeugt wird (`OpenOptions.texts`): Die App übergibt
sie in der Sprache der Oberfläche (`apps/web/src/editor/engine-texts.ts`); ohne sie zeigt die Engine ihr
eigenes Englisch (`common/editorscommon.js` `CTranslateManager.getValue` gibt den Schlüssel zurück).

Die Zeichenformatierung heißt genauso und wird genauso gemeldet wie im Texteditor, deshalb teilen sich beide
`createCharacterCommands` und `textEvents` (`put_TextPrBold`, `asc_onBold`, …).

| Befehl | Aufruf in der Engine (slide/api.js) | Event zurück |
|---|---|---|
| neue Folie | `AddSlide(layoutIndex)` | `asc_onCountPages`, `asc_onCurrentPage` |
| Layout | `ChangeLayout(layoutIndex)`; die Layouts mit ihren Bildern: `asc_onUpdateLayout` (`CLayoutThumbnail`) | – |
| duplizieren, löschen | `DublicateSlide()` (die Schreibweise der Engine), `DeleteSlide()` | `asc_onCountPages` |
| Aufzählung, Nummerierung | `put_ListType(0 \| 1, 1)`, beenden: `put_ListType(…, -1)` (`CommonController.js` `fFillBullet`) | `asc_onListType` |
| Zeichenformatierung, Ausrichtung, rückgängig | wie im Texteditor | wie im Texteditor |
| Zwischenablage, Zoom, Suchen und Ersetzen | wie im Texteditor (`Copy`, `zoom`, `asc_findText`, …) | wie im Texteditor |
| PDF | `WordControl.m_oDrawingDocument.ToRendererPart(true, false)`: alle Folien, wie `slide/api.js` `_downloadAs` | – |

### Formen, Designs und Übergänge { #shapes-designs-and-transitions }

`src/slide-design.ts`, nach web-apps (`presentationeditor/mobile` `controller/add/AddShape.jsx`,
`controller/edit/EditSlide.jsx`, `lib/editor.jsx`; main `controller/Transitions.js`):

- **Formen** („Einfügen“): `AddShapeOnCurrentPage(preset)` setzt eine Form in die Mitte der Folie,
  ausgewählt: ein Textfeld (`textRect`, gespeichert mit `txBox="1"`), ein Rechteck (`rect`), ein
  abgerundetes (`roundRect`), eine Ellipse, einen Pfeil (`rightArrow`) und eine Linie. Die Tasten gehen
  danach wieder an die Engine, sodass Tippen das Textfeld füllt.
- **Designs** („Design“): Die Engine lädt die Liste ihrer Designs aus `themes.js` im Design-Pfad
  (`SetThemesPath`, `g_defaultThemes`) und schickt sie mit `asc_onInitEditorStyles`
  (`[editor's, document's]`, `CAscThemeInfo` mit `get_Index`, `get_Name`); das Menü benennt sie auf
  Deutsch. `ChangeTheme(index)` lädt `theme<index + 1>/theme.bin` und wendet es auf jede Folie an. Das
  verwendete Design wird nur über seinen Master gemeldet (`asc_onUpdateThemeIndex` mit `-master - 1`),
  deshalb ist keines angehakt.
- **Übergänge** („Übergänge“): `SetSlideProps(props)` mit einem `CAscSlideTransition` aus
  `c_oAscSlideTransitionTypes` und jeweils der ersten Option, so wie `fillEffectTypes` von web-apps sie
  wählt (`c_oAscSlideTransitionParams`), auf den ausgewählten Folien; `SlideTransitionApplyToAll()` gibt den
  Übergang der aktuellen Folie allen Folien. Der Übergang der ausgewählten Folie kommt mit
  `asc_onFocusObject` (das Objekt vom Typ `Slide`, `get_transition().get_TransitionType()`) und wird
  angehakt.

Die Bildschirmpräsentation steht in „Ansicht“ (von Anfang an oder ab der aktuellen Folie), neben der
Schaltfläche „Präsentieren“.

Ein Rechtsklick schickt `CContextMenuData` wie im Texteditor; sein Typ unterscheidet die Folie
(`c_oAscContextMenuTypes.Main`) von der Folienliste (`Thumbnails`), und das Kontextmenü bietet in der Liste
zuerst die Folien an (`apps/web/src/editor/slide-menus.ts`).

Neue Präsentationen kommen aus `packages/ooxml` (`pptx.ts`): ein Master mit den Layouts
„Titelfolie“, „Titel und Inhalt“, „Nur Titel“ und „Leer“, ein Design mit den Standardfarben von Office
und Calibri, 16:9.


### Bildschirmpräsentation { #slide-show }

„Präsentieren“ (und „Ansicht → Bildschirmpräsentation …“, von Anfang an oder ab der aktuellen Folie) zeigt
die Folien im Vollbild, so wie es die Vorschau von web-apps tut (`controller/Viewport.js`
`onPreviewStart`, mobil `controller/Preview.jsx`). Die Engine zeichnet die Präsentation in ein Element
ihrer eigenen Seite, `#presentation-preview` (`CDemonstrationManager.Start` in
`slide/Drawing/Transitions.js`), und behandelt die Pfeiltasten, Leertaste, Klicks und Escape dort selbst,
aber nur, solange nichts in ihrer Seite die Tasten hält (`wrapKeyboard`); deshalb gibt `src/slide-show.ts`
dem Fenster des Frames den Fokus und nimmt ihn vorher der Eingabe der Engine. Die App schaltet den Frame ins
Vollbild und startet die Präsentation, sobald sie die Größe des Bildschirms hat
(`StartDemonstrationFromBeginning`, `StartDemonstrationFromCurrentSlide`). Das Vollbild zu verlassen,
beendet die Präsentation (`EndDemonstration`), und das Ende der Präsentation (`asc_onEndDemonstration`)
verlässt das Vollbild. Wer nur ansehen darf, kann ebenfalls präsentieren.

## PDFs { #pdfs }

Der PDF-Editor der Engine (`pdf/api.js` `PDFEditorApi`) ist in das Bundle für Textdokumente eingebaut,
`word/sdk-all-min.js`; `sdkjs/pdf/src/engine/` fügt seinen Renderer hinzu, `drawingfile.wasm`, der das PDF
selbst liest und zeichnet. Deshalb führt `engine.json` `pdf` unter den Editoren, und seine Host-Seite
(`frame/editor/pdf/main/index.html`) lädt das Word-Bundle und wird auf `PDFEditorApi` geprüft.

Anders als bei den Office-Editoren braucht ein PDF zum Öffnen keine Konvertierung und behält beim Speichern
sein Format:

- **Öffnen.** `asc_openDocumentFromBytes(pdf)` mit den eigenen Bytes des PDFs; der Editor gibt sie an
  `drawingfile.wasm` weiter (`PDFEditorApi.openDocument` → `DocumentRenderer.open`). Die Dokumentinfo
  nennt `pdf` als Format; der Rest der Ladekette ist der aus
  [Wie ein Dokument geöffnet wird](#how-a-document-opens-without-a-server).
- **Seitenminiaturen.** Hat die Host-Seite ein Element `thumbnails-list`, füllt der Editor es bei
  Content-Ready mit den Seitenminiaturen (`onDocumentContentReady`, `pdf/src/thumbnails.js`). Drehen,
  Entfernen und Verschieben von Seiten wirken auf die dort ausgewählten Seiten, deshalb hat die Seite eins.
- **Speichern.** `DocumentRenderer.Save()` des Editors (`pdf/src/viewer.js`) gibt eine Änderungsdatei
  zurück, kein PDF: „%PDF“ und die Seiten, Anmerkungen, Formularwerte und Seitenoperationen, die sich
  geändert haben. x2t schreibt sie ins Original: Der Worker legt das Original neben die Änderungsdatei
  (`changes/changes0.bin`) und setzt `m_bFromChanges` mit dem PDF-Format (513) in beide Richtungen, und x2t
  wendet sie an (`X2tConverter/src/lib/pdf_image.h` `fromCrossPlatform` → `applyChangesPdf` →
  `applyCompiledChangesPdf`). Das ist `savefromorigin` des Document Server (`word/api.js`
  `_downloadAs`), erledigt im Browser. `createConverter().applyPdfChanges(original, changes,
  media)` fordert es an.

`e2e/pdf-engine.spec.ts` prüft diesen Vertrag unterhalb der App: Es öffnet `test-files/formular.pdf` in
der Host-Seite, dreht eine Seite, entfernt eine, füllt ein Feld aus, speichert über den Worker, öffnet das
Ergebnis erneut und liest die Datei mit pdf-lib zurück.

Die PDF-Ansicht und ihre Werkzeuge bauen darauf auf; siehe [PDFs](pdf.md).

## Tests { #tests }

`packages/editor-core/test` prüft das Binding gegen einen Ersatz für die Engine
(`test/fake-engine.ts`): was jeder Befehl aufruft und wie Events der Engine zu Zustand werden. Die
E2E-Specs lassen die echte Engine in Chromium laufen:

| Spec | Was sie abdeckt |
|---|---|
| `e2e/word-roundtrip.spec.ts` | eine .docx, geöffnet und wieder gespeichert, mit Inhalt, Bildern, Kommentaren und Formatierung |
| `e2e/word-formatting.spec.ts`, `e2e/word-menus.spec.ts` | die Werkzeugleiste und die Menüs des Texteditors: Formatierung, Listen, Layout, Kopfzeilen, Fußnoten, Umbrüche |
| `e2e/comments.spec.ts`, `e2e/review.spec.ts` | Kommentare mit Antworten, Erledigen und Löschen; nachverfolgte Änderungen |
| `e2e/spelling.spec.ts` | die Markierungen und Vorschläge der Rechtschreibprüfung, nach Sprache |
| `e2e/spreadsheet.spec.ts`, `e2e/pivot.spec.ts` | der Tabelleneditor und Pivot-Tabellen |
| `e2e/presentation.spec.ts` | der Präsentationseditor und die Bildschirmpräsentation |
| `e2e/formats.fidelity.ts` | die Bilder zur Formattreue ([Architektur](architecture.md#format-fidelity)) |
