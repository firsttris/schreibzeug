# PDFs { #pdfs }

Schreibzeug öffnet ein PDF im PDF-Editor der Engine, im Browser, ohne Document Server, und
speichert es wieder als PDF. Was sich damit machen lässt: Formulare ausfüllen, Notizen und
Textfelder hinzufügen, Text markieren (hervorheben, unterstreichen, durchstreichen), freihand und
Formen zeichnen, unterschreiben, Bereiche endgültig schwärzen, Seiten drehen, einfügen und
entfernen, ein weiteres PDF anhängen, Seiten als eigenes PDF speichern, drucken und herunterladen.
Wie die Engine die Datei liest und schreibt, steht unter [Die Engine](engine.md#pdfs).

Auf einem hochkant gehaltenen Telefon bekommen die Seiten die ganze Breite des Bildschirms: Die
Seitenvorschauen daneben fallen weg (eine Media Query in
`engine/frame/editor/pdf/main/index.html`, unterhalb der Breite, die die App für ein Telefon
annimmt, `apps/web/src/editor/use-mobile-view.ts`), und Drehen oder Entfernen einer Seite wirkt auf
die sichtbare Seite.

## Öffnen und Speichern { #opening-and-saving }

Ein PDF öffnet sich wie jede andere Datei: aus der Dateiliste nach `/edit/:id`, wo die
Bearbeitungsseite die PDF-Ansicht wählt (`apps/web/src/editor/pdf-view.tsx`).
`packages/editor-core` `openPdfDocument` (`src/pdf.ts`) übergibt dem Editor die eigenen Bytes der
Datei; eine Umwandlung gibt es nicht. Beim Speichern fragt es den Editor nach seinen Änderungen
seit dem Öffnen und lässt x2t sie in diese Datei schreiben (`savePdf`); jede Speicherung ist also
ein ganzes PDF und eine neue Version auf dem Server, wie bei Office-Dateien. Ein PDF ohne
Änderungen wird gespeichert, wie es ist. „Datei → Herunterladen“ lädt dieses PDF herunter;
„Drucken“ druckt es über den Browser, wie bei Office-Dateien
([Engine](engine.md#pdf-and-printing)).

## Kommentieren, nicht gestalten { #commenting-not-designing }

Der Editor öffnet im Kommentiermodus, so wie web-apps ein PDF öffnet (`pdfeditor` `Main.js`:
annotate, `asc_setRestriction(View)`). Darin werden Formulare ausgefüllt, Anmerkungen hinzugefügt
und Seiten gedreht, eingefügt und entfernt; der Seiteninhalt und die Felder des Formulars bleiben,
wie sie sind. Ohne ihn ist der Editor der Formular-Designer: Jedes Feld zeigt seinen Namen, und ein
Klick wählt das Feld aus, um es zu verschieben.

## Die Werkzeuge { #the-tools }

| Werkzeug | Aufruf der Engine (pdf/api.js) |
|---|---|
| auswählen, Seite verschieben (Hand) | `asc_setViewerTargetType("select" \| "hand")` |
| hervorheben, unterstreichen, durchstreichen | `SetMarkerFormat(ANNOTATIONS_TYPES.Highlight …, true, opacity, r, g, b)`, aus: `SetMarkerFormat(undefined, false)`; die Engine beendet es mit `asc_onMarkerFormatChanged` |
| freihand | `asc_StartDrawInk(pen)`, aus: `asc_StopInkDrawer()` |
| Rechteck, Ellipse, Linie | `StartAddAnnot(ANNOTATIONS_TYPES.Square …, pen, true)`, aus: `StartAddAnnot("", undefined, false)`; beendet: `asc_onStartAddShapeChanged(false)` |
| Textfeld | `AddFreeTextAnnot(FREE_TEXT_INTENT_TYPE.freeText)` auf der sichtbaren Seite |
| Notiz | `asc_addComment(data)`: die Kommentarleiste, wie in den anderen Editoren; eine Notiz ist eine Textanmerkung auf der sichtbaren Seite |
| schwärzen | `SetRedactTool(true)` zeichnet Kästen; `ApplyRedact()` entfernt, was darunter liegt, von der Seite (`drawingfile.wasm` `RedactPage`), und beim Speichern wird die Seite ohne es geschrieben. Die älteren Versionen der Datei enthalten noch das Original, und jeder, der die Datei öffnen darf, darf auch sie öffnen ([Dateien](files.md)): Teile ein geschwärztes PDF als neue Datei (lad es herunter oder speichere die Seiten getrennt) |
| Seiten drehen, einfügen, entfernen | `asc_RotatePage(±90, pages)`, `asc_AddPage(position)`, `asc_RemovePage(pages)` nach `asc_CanRemovePages`; auf den in den Vorschauen ausgewählten Seiten (`getSelectedPages`) oder der sichtbaren Seite |
| rückgängig, wiederholen | `Undo()`, `Redo()`; `asc_onCanUndo`, `asc_onCanRedo` |

## Unterschreiben { #signing }

„Unterschreiben“ öffnet einen Dialog (`apps/web/src/editor/signature-dialog.tsx`), um die
Unterschrift mit der Maus, einem Stift oder einem Finger zu zeichnen oder die zuletzt in diesem
Browser benutzte zu nehmen (als Striche in `localStorage` gespeichert, nur dort). Die Striche kommen
als Freihand-Anmerkung auf die sichtbare Seite, scharf in jeder Größe, etwa 6 cm breit (eine hohe
Zeichnung höchstens etwa 3 cm hoch) in der Mitte des sichtbaren Bereichs, und lassen sich dort
verschieben und in der Größe ändern (`packages/editor-core/src/pdf-signature.ts`). Sie wird so
aufgebaut, wie der Dokument-Builder der Engine eine aufbaut (`pdf/apiBuilder.js`
`Api.CreateInkAnnot`: Anmerkungseigenschaften, ein durchgezogener Rand in Breite und Farbe des
Stifts, `SetInkPoints`), in einem Schritt des Verlaufs. Es ist eine Unterschrift zum Ansehen, keine
digitale Signatur mit Zertifikat.

Ein Bild einer Unterschrift wäre ein Bildstempel, aber diese Engine kann keinen erzeugen:
`CPDFDoc.AddStampAnnot` liest die Stempeldarstellung, die einem Bildstempel fehlt, und wirft einen
Fehler, und ist das umgangen, bleibt der WebAssembly-Build von x2t beim Schreiben des Stempels
stehen. Der Dialog bietet deshalb nur das Zeichnen an. Beim Speichern übergibt es x2t trotzdem die
Bilder des Dokuments in „media/“ neben der Änderungsdatei, für Änderungen, die sich auf Bilder
beziehen.

## Digitale Signaturen { #digital-signatures }

„Kommentieren → Digital signieren …“ signiert das PDF mit dem eigenen Zertifikat der Person, einer
PKCS#12-Datei (.p12, .pfx) und ihrem Passwort, im Browser; das Zertifikat verlässt ihn nie
(PKCS#12, RSA; keine qualifizierte eIDAS-Signatur).
`packages/pdf-sign` erledigt die Arbeit, ohne die Engine:

1. `readIdentity` öffnet die PKCS#12-Datei mit node-forge (RSA-Schlüssel; ein falsches Passwort
   wird als solches gemeldet) und nimmt das Zertifikat, das zum Schlüssel gehört, die anderen als
   seine Kette.
2. `signPdf` speichert das PDF mit pdf-lib noch einmal, mit einem unsichtbaren Signaturfeld und
   einem Signaturverzeichnis (`/Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached`, ein
   /Contents aus 16 KB Nullen, ein /ByteRange aus Platzhaltern), füllt dann den Byte-Bereich um
   /Contents aus und eine abgetrennte PKCS#7-Signatur (RFC 2315, SHA-256, mit Inhaltstyp,
   Nachrichten-Digest und Signaturzeit als signierten Attributen) über diese Bytes
   (ISO 32000-1 12.8).
3. Die PDF-Ansicht speichert das signierte PDF als neueste Version und öffnet es.

`checkSignatures` liest jede Signatur eines PDFs: den Digest der Byte-Bereiche gegen den signierten
Nachrichten-Digest, die RSA-Signatur über die signierten Attribute mit dem Zertifikat, das die
Signatur mitbringt, und ob die Bereiche bis zum Ende der Datei reichen. Es liest einen /ByteRange
nur so, wie Signierprogramme ihn schreiben (ab dem Anfang der Datei, geordnet, innerhalb der Datei,
eine Lücke von höchstens 128 KB Hex), prüft höchstens 32 Signaturen und nennt eine Signatur
ungültig, wenn die Lücke etwas anderes ist als ein Hex-String mit nur Nullen nach der
DER-Signatur: Nichts Unsigniertes kann mitreisen. /Reason und /Location werden aus den signierten
Bytes des Signaturverzeichnisses gelesen, nie aus der Lücke; die Signaturzeit kommt aus den
signierten Attributen. Die Ansicht zeigt das Ergebnis über den Seiten, mit wer, wann und warum
signiert hat; ein selbstsigniertes Zertifikat wird so genannt, und die Vertrauenskette anderer
Zertifikate wird nicht geprüft. Sobald ein signiertes PDF geändert wird, warnt die Ansicht, dass
das Speichern die Signatur bricht: Die Engine schreibt die Datei neu. Ein bereits signiertes PDF
wird noch nicht ein zweites Mal signiert; das braucht ein inkrementelles Update, das pdf-lib nicht
schreibt. Popplers `pdfsig` hält die Signaturen für gültig („Signature is Valid“, „Total document
signed“).

Der Signier-Code (node-forge und pdf-lib, etwa 700 KB vor der Kompression) lädt, wenn jemand
signiert oder ein PDF mit einer Signatur öffnet, nicht mit der App.

## Seiten zwischen Dateien { #pages-between-files }

„Seiten → PDF anhängen …“ setzt die Seiten eines PDFs vom Rechner ans Ende, so wie in die
Vorschauen eingefügte Seiten hereinkommen (`CPDFDoc.MergePagesBinary` in einem Schritt des
Verlaufs); Formulare und Anmerkungen beider Dateien bleiben. „Als neues PDF speichern“ macht aus
den ausgewählten Seiten mit dem, was auf ihnen geändert wurde, ein PDF
(`CPDFDoc.GetPagesBinary`, das `drawingfile.wasm` `SplitPages` schreibt) und speichert es neben
der Datei als „<Name> – Seiten 1–2.pdf“ (in „Meine Dateien“, wenn der Ordner jemand anderem
gehört).

## E-Rechnungen (ZUGFeRD) { #e-invoices-zugferd }

Eine ZUGFeRD- oder Factur-X-Rechnung ist ein PDF für Menschen, an das die Rechnung für Maschinen als
XML angehängt ist (CII; eine XRechnung oder eine UBL-Rechnung kann auf dieselbe Weise angehängt
sein). Wer ein solches PDF öffnet, sieht darüber eine Karte: Nummer und Datum der Rechnung, wer sie
an wen schickt, netto, Steuer und Summe, was bis wann fällig ist; „Details“ ergänzt IBAN,
Verwendungszweck, USt-IdNr., Leistungszeitraum und die Positionen. „XML herunterladen“ liefert das
angehängte XML, wie es ist, für Buchhaltungssoftware, die es allein haben will. Die Karte zeigt,
was das XML sagt, nicht was die Seite zeigt: Eine Änderung am PDF ändert die Rechnungsdaten nicht,
und die Karte sagt das.

`packages/einvoice` ist aus Haben übernommen (github.com/firsttris/haben, `packages/einvoice`,
AGPL-3.0-only, derselbe Autor), ohne Node und mit Fehlern als Werten:

- `extractEmbeddedXml` sucht im Namensbaum `EmbeddedFiles`, in `/AF` des Katalogs (PDF/A-3) und,
  wenn beides nichts ergibt, in jeder Dateispezifikation, und zieht `factur-x.xml`,
  `zugferd-invoice.xml` und `xrechnung.xml` anderen XML-Anhängen vor. Ein Anhang wird auf höchstens
  32 MB entpackt.
- `readInvoiceXml` liest CII (ZUGFeRD 1 und 2, Factur-X, XRechnung CII) und UBL (Invoice,
  CreditNote) mit fast-xml-parser, ohne Namensraum-Präfixe; Beträge in Cent als Ganzzahlen,
  Gutschriften negativ. XML, das es nicht lesen kann, ergibt den Grund, und die Karte zeigt ihn
  neben dem Download.

Beim Speichern bleibt der Anhang: x2t schreibt die Änderungen in das PDF selbst (siehe „Öffnen und
Speichern“), und `e2e/pdf-invoice.spec.ts` liest die Rechnung nach dem Drehen einer Seite aus der
gespeicherten Datei zurück. Wie ZUGFeRD-Rechnungen aus einem Textdokument entstehen, steht unter
[E-Rechnungen](e-invoice.md).

## Texterkennung { #text-recognition }

Ein gescanntes PDF besteht aus Bildern von Seiten: Seine Wörter lassen sich weder durchsuchen noch
kopieren. Wer eines öffnet, sieht darüber einen Hinweis („Dieses PDF besteht nur aus Bildern …“),
und „Text erkennen“ dort oder unter „Seiten → Text erkennen (OCR) …“ erkennt den Text mit
[Tesseract](https://github.com/naptha/tesseract.js) (Apache-2.0) in einem Worker der Seite, Deutsch
und Englisch, und speichert das PDF als neue Version. Es sieht aus wie vorher; der Text liegt
unsichtbar über der Seite, dort, wo seine Buchstaben sind.

- Welche Seiten: `packages/pdf-ocr` `textlessPages` liest das gespeicherte PDF mit pdf-lib und nimmt
  die Seiten, deren Inhalt, samt den Form-XObjects, die er zeichnet, keinen Text zeigt (kein
  `Tj`/`TJ` in einem Textobjekt). Seiten mit Text bleiben, wie sie sind, ein zweiter Durchlauf
  findet also nichts zu tun.
- Die Seitenbilder: Die Engine zeichnet jede dieser Seiten mit 300 dpi, ungedreht und ohne
  Anmerkungen (`PageCommands.render` → pdf/src/file.js `CFile.getPage`); Tesseract bekommt sie als
  PNG, weil sein Loader die Canvas-Elemente des Frames nicht als Canvas erkennt.
- Die Textebene: `addTextLayer` setzt jedes Wort in Helvetica, Textdarstellungsmodus 3
  (unsichtbar, ISO 32000-1 9.3.6), an Ort und Höhe seines Kastens im Bild und auf dessen Breite
  gestreckt (`Tz`), wie OCRmyPDF es macht; Helvetica wird nicht eingebettet, da unsichtbarer Text
  nie gezeichnet wird. Zeichen, für die WinAnsi keinen Code hat, werden zu „?“.
- Nichts verlässt den Rechner: tesseract.js würde seinen Kern und die Sprachmodelle von einem CDN
  laden; `apps/web/ocr-plugin.ts` liefert sie stattdessen aus der App unter `/ocr` aus (der Kern
  gebaut mit und ohne SIMD, `tessdata_best`-Integer-Modelle von `deu` und `eng`, zusammen etwa
  16 MB), und die Desktop-App hat sie offline. Sie laden, wenn Text erkannt wird, nicht mit der App.

Ein digital signiertes PDF wird nicht geändert: Die Textebene würde die Signatur brechen.

## PDF/A { #pdfa }

„Datei → Als PDF/A herunterladen“ liefert das PDF mit den vorgenommenen Änderungen als PDF/A-2 für
die Archivierung, als „<Name> (PDF-A).pdf“; die gespeicherte Datei bleibt, wie sie ist. x2t
zeichnet das PDF neu in ein PDF/A (`X2tConverter/src/lib/pdf_image.h`: mit `m_bIsPDFA` wird ein PDF
nicht in ein PDF kopiert), wobei die Änderungsdatei zuerst angewendet wird, wie beim Speichern, und
die Schriften, mit denen die Engine es gezeichnet hat, in `m_sFontDir` liegen (`print.ts`).
Textdokumente, Tabellen und Präsentationen haben denselben Menüpunkt (`docs/engine.md`).

Das PDF/A bettet jede Schrift ein, wie es muss. Eine Grenze: Ein PDF, das eine der 14
Standardschriften weglässt (Helvetica, Times, Courier und ihre Schnitte, die ein Reader
mitbringt), wird mit den eigenen Kopien des Konverters gezeichnet, und das sind Type-1-Schriften;
x2t bettet aber nur TrueType-, OpenType- und CFF-Schriften ein (`PdfFile/PdfWriter.cpp`
`GetFont`), der Text in diesen Schriften wird also zu Umrissen: Er sieht gleich aus, lässt sich
aber nicht durchsuchen oder kopieren. Text in Schriften, die das PDF einbettet, bleibt Text.

## Stifte { #pens }

Stifte sind `asc_CStroke`-Objekte, so wie web-apps sie baut (`Toolbar.js`
`onInsertShapeComment`): eine Vollfarbe, eine Breite in Millimetern, deckend. Es ist immer nur ein
Werkzeug an; ein Wechsel beendet das vorige so, wie es gestartet wurde. Die letzte Seite lässt sich
nicht entfernen; die Werkzeugleiste sagt das.

## In Formulare tippen { #typing-into-forms }

Der Editor sucht für jedes neue Zeichen eine Schrift und lädt sie beim Tippen. Bis sie da ist,
nimmt ein Formularfeld keine Tasten an (`pdf/src/document.js` `getTextController` →
`checkFieldFont`), sodass bei schnellem Tippen die zweite Taste verloren ging. Wenn ein PDF sich
öffnet, lässt `preloadTypingFonts` die Schriftauswahl die Schriften für die Zeichen deutscher und
englischer Texte sammeln und lädt sie, wie es die erste Taste täte. Tab springt zum nächsten Feld.

Das JavaScript eines Formulars (Format-, Tastendruck-, Berechnungs- und Link-Aktionen) läuft
nicht; ein Feld, das ein anderes Programm per Skript formatiert, zeigt also seinen rohen Wert; die
Skripte bleiben im gespeicherten PDF erhalten
([Code in Dokumenten](engine.md#code-in-documents-does-not-run)).

## Gemeinsam { #together }

Mehrere Leute bearbeiten ein PDF gleichzeitig, wie eine Office-Datei: Die PDF-Ansicht öffnet sich
in der Bearbeitungssitzung der Datei ([Zusammenarbeit](collaboration.md)), der PDF-Editor schickt
seine Änderungen über das Relay und spielt die der anderen ein (pdf/src/CollaborativeEditing.js),
und jede Speicherung schreibt die Änderungen aller in das PDF, mit dem die Sitzung begann. Notizen,
Markierungen, Formularwerte und Seitenoperationen des einen erscheinen bei den anderen.

Tippen in ein Formularfeld holt sich für jede Taste die Sperre des Felds vom Relay: Der PDF-Editor
prüft die Sperre ohne die Ausnahme für den schnellen Modus, die der Texteditor benutzt
(`CPDFDoc.Document_Is_
SelectionLocked` → `CollaborativeEditing.Get_GlobalLock`), und Tasten, die kommen, während eine
Anfrage unterwegs ist, gehen verloren. Im Tempo eines Menschen auf einem nahen Server passiert das
nicht; über eine langsame Verbindung kann jemand, der sehr schnell tippt, in einem gemeinsamen
Formular ein Zeichen verlieren.

## Tests { #tests }

`e2e/pdf-sign.spec.ts` signiert über die App mit einem für den Test erzeugten Zertifikat (zuerst
mit einem falschen Passwort), prüft die gespeicherte Datei und die Warnung nach einer Änderung;
`packages/pdf-sign/test` signiert und prüft unterhalb der App, auch ein geändertes Byte, nach dem
Signieren angehängte Bytes, in der Auffüllung von /Contents versteckte Daten, einen Bereich über
das Dateiende hinaus und Tausende unsinnige /ByteRange-Einträge.
`e2e/pdf-invoice.spec.ts` öffnet `test-files/rechnung.pdf` (eine ZUGFeRD-Rechnung, geschrieben von
`test-files/rechnung.ts`), prüft die Karte und den XML-Download und dass beim Speichern die
Rechnung erhalten bleibt; `packages/einvoice/test` liest CII, ZUGFeRD 2 BASIC WL, UBL und eine
UBL-Gutschrift und findet das XML unter anderen Anhängen. `e2e/pdf-ocr.spec.ts` lädt einen im
Browser erzeugten Scan hoch (Text in ein PNG gezeichnet), erkennt seinen Text über den Hinweis und
prüft die gespeicherte Textebene und dass ein zweiter Durchlauf nichts zu tun hat;
`packages/pdf-ocr/test` prüft, welche Seiten als textlos gelten und wohin die Wörter kommen, und
`apps/web/src/editor/ocr.test.ts` den Durchlauf über die Seiten. `e2e/pdf-a.spec.ts` lädt ein
Textdokument und ein bearbeitetes PDF als PDF/A herunter und prüft die Konformität in den
XMP-Metadaten, den Output Intent und dass jede Schrift mit einer ToUnicode-Tabelle eingebettet ist.
`e2e/pdf-engine.spec.ts` prüft die Engine unterhalb der App; in `e2e/pdf-together.spec.ts` füllen
zwei Leute dasselbe PDF aus und kommentieren es. `e2e/pdf.spec.ts` arbeitet sich mit
`test-files/formular.pdf` durch die App: eine Seite drehen und eine einfügen, beide Felder
ausfüllen (sofort getippt, mit Tab zum nächsten), eine Seite entfernen und die letzte nicht, eine
Notiz und eine Zeichnung hinzufügen, hervorheben, eine Überschrift schwärzen, mit einer
gezeichneten Unterschrift unterschreiben, `test-files/anhang.pdf` anhängen, eine Seite als eigenes
PDF speichern. Jeder Test liest die gespeicherte Datei mit pdf-lib zurück: Seiten, Drehung,
Feldwerte, Anmerkungen und den Text, der auf der Seite übrig ist.
`packages/editor-core/test/pdf.test.ts` prüft die Aufrufe, die die Befehle machen.
