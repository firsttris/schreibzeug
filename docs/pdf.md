# PDFs

Schreibzeug opens a PDF in the engine's PDF editor, in the browser, without a Document Server, and
saves it as a PDF again. What can be done with it: fill in forms, add notes and text boxes, mark
text (highlight, underline, strike out), draw freehand and shapes, sign, black out areas for good,
turn, add and remove pages, append another PDF, save pages as a PDF of their own, print and
download. How the engine reads and writes the file is in
[the engine](engine.md#pdfs).

On a phone held upright the pages get the whole width of the screen: the page thumbnails beside
them are left out (a media query in `engine/frame/editor/pdf/main/index.html`, below the width the
app takes for a phone, `apps/web/src/editor/use-mobile-view.ts`), and turning or removing a page
acts on the page in view.

## Opening and saving

A PDF opens like any other file: from the file list into `/edit/:id`, where the edit page picks the
PDF view (`apps/web/src/editor/pdf-view.tsx`). `packages/editor-core` `openPdfDocument`
(`src/pdf.ts`) hands the file's own bytes to the editor; there is no conversion. Saving asks the
editor for its changes since the file was opened and lets x2t write them into that file
(`savePdf`), so every save is a whole PDF and a new version on the server, as for Office files. A
PDF without changes is saved as it is. "Datei → Herunterladen" downloads that PDF; "Drucken"
prints it through the browser, as for Office files ([engine](engine.md#pdf-and-printing)).

## Commenting, not designing

The editor opens in commenting mode, as web-apps opens a PDF (`pdfeditor` `Main.js`: annotate,
`asc_setRestriction(View)`). In it, forms are filled in, annotations added and pages turned, added
and removed; the page content and the form's fields stay as they are. Without it the editor is the
form designer: every field shows its name and a click selects the field to move it.

## The tools

| Tool | Engine call (pdf/api.js) |
|---|---|
| select, move the page (hand) | `asc_setViewerTargetType("select" \| "hand")` |
| highlight, underline, strike out | `SetMarkerFormat(ANNOTATIONS_TYPES.Highlight …, true, opacity, r, g, b)`, off: `SetMarkerFormat(undefined, false)`; the engine ends it with `asc_onMarkerFormatChanged` |
| freehand | `asc_StartDrawInk(pen)`, off: `asc_StopInkDrawer()` |
| rectangle, ellipse, line | `StartAddAnnot(ANNOTATIONS_TYPES.Square …, pen, true)`, off: `StartAddAnnot("", undefined, false)`; ended: `asc_onStartAddShapeChanged(false)` |
| text box | `AddFreeTextAnnot(FREE_TEXT_INTENT_TYPE.freeText)` on the page in view |
| note | `asc_addComment(data)`: the comments panel, as in the other editors; a note is a text annotation on the page in view |
| black out | `SetRedactTool(true)` draws boxes; `ApplyRedact()` removes what is under them from the page (`drawingfile.wasm` `RedactPage`), and saving writes the page without it. The older versions of the file still hold the original, and anyone who may open the file may open them ([files](files.md)): share a blacked-out PDF as a new file (download it, or save the pages apart) |
| turn, add, remove pages | `asc_RotatePage(±90, pages)`, `asc_AddPage(position)`, `asc_RemovePage(pages)` after `asc_CanRemovePages`; on the pages selected in the thumbnails (`getSelectedPages`), or the page in view |
| undo, redo | `Undo()`, `Redo()`; `asc_onCanUndo`, `asc_onCanRedo` |

## Signing

"Unterschreiben" opens a dialog (`apps/web/src/editor/signature-dialog.tsx`) to draw the signature
with the mouse, a pen or a finger, or to take the last one used in this browser (kept as strokes in
`localStorage`, only there). The strokes go on the page in view as an ink annotation, sharp at any
size, about 6 cm wide (a tall drawing at most about 3 cm high) in the middle of what is in view,
and can be moved and sized there
(`packages/editor-core/src/pdf-signature.ts`). It is built the way the engine's document builder
builds one (`pdf/apiBuilder.js` `Api.CreateInkAnnot`: annotation props, a solid border of the
pen's width and colour, `SetInkPoints`), in one step of the history. It is a signature to look at,
not a digital signature with a certificate.

A picture of a signature would be an image stamp, but this engine cannot make one:
`CPDFDoc.AddStampAnnot` reads the stamp render an image stamp lacks and throws, and with that
worked around, x2t's WebAssembly build stops on writing the stamp. So the dialog offers drawing
only. Saving still hands the document's images to x2t in "media/" beside the change file, for
changes that refer to pictures.

## Digital signatures

"Kommentieren → Digital signieren …" signs the PDF with the person's own certificate, a PKCS#12
file (.p12, .pfx) and its password, in the browser; the certificate never leaves it (PKCS#12, RSA; not a qualified eIDAS
signature).
`packages/pdf-sign` does the work, without the engine:

1. `readIdentity` opens the PKCS#12 file with node-forge (RSA keys; a wrong password is said as
   such) and takes the certificate that belongs to the key, the others as its chain.
2. `signPdf` saves the PDF once more with pdf-lib, with an invisible signature field and a
   signature dictionary (`/Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached`, a /Contents of
   16 KB of zeros, a /ByteRange of placeholders), then fills in the byte range around /Contents
   and a detached PKCS#7 signature (RFC 2315, SHA-256, with content type, message digest and
   signing time as signed attributes) over those bytes (ISO 32000-1 12.8).
3. The PDF view stores the signed PDF as the newest version and opens it.

`checkSignatures` reads every signature of a PDF: the digest of the byte ranges against the
signed message digest, the RSA signature over the signed attributes with the certificate the
signature carries, and whether the ranges reach the end of the file. It only reads a /ByteRange
as signers write it (from the start of the file, ordered, inside the file, a gap of at most 128 KB
of hex), checks at most 32 signatures, and calls a signature invalid when the gap is anything but
one hex string with only zeros after the DER signature: nothing unsigned can ride along. /Reason
and /Location are read from the signature dictionary's signed bytes, never from the gap; the
signing time comes from the signed attributes. The view shows the result
above the pages, with who signed, when and why; a self-signed certificate is called so, and the
trust chain of other certificates is not checked. Once a signed PDF is changed, the view warns
that saving breaks the signature: the engine writes the file anew. A PDF that is signed already
is not signed a second time yet; that needs an incremental update, which pdf-lib does not write.
Poppler's `pdfsig` takes the signatures as valid ("Signature is Valid", "Total document signed").

The signing code (node-forge and pdf-lib, about 700 KB before compression) loads when someone signs or opens a PDF with a
signature, not with the app.

## Pages between files

"Seiten → PDF anhängen …" puts the pages of a PDF from the computer at the end, the way pages
pasted into the thumbnails come in (`CPDFDoc.MergePagesBinary` in one history step); forms and
annotations of both files stay. "Als neues PDF speichern" makes a PDF of the selected pages with
what was changed on them (`CPDFDoc.GetPagesBinary`, which `drawingfile.wasm` `SplitPages` writes)
and stores it beside the file as "<Name> – Seiten 1–2.pdf" (in "Meine Dateien" when the folder
belongs to someone else).

## E-invoices (ZUGFeRD)

A ZUGFeRD or Factur-X invoice is a PDF for people with the invoice for machines attached, as XML
(CII; an XRechnung or a UBL invoice may come attached the same way). Opening such a PDF shows a card
above it: the invoice's number and date, who sends it to whom, net, tax and total, what is due
until when; "Details" adds the IBAN, the payment reference, the VAT ID, the period of service and
the lines. "XML herunterladen" gives the attached XML as it is, for accounting software that
wants it alone. The card says what the XML says, not what the page shows: changing the PDF does
not change the invoice data, and the card says so.

`packages/einvoice` is taken from Haben (github.com/firsttris/haben, `packages/einvoice`,
AGPL-3.0-only, the same author), without Node and with failures as values:

- `extractEmbeddedXml` looks through the `EmbeddedFiles` name tree, the catalog's `/AF` (PDF/A-3)
  and, failing both, any file specification, and prefers `factur-x.xml`, `zugferd-invoice.xml`
  and `xrechnung.xml` to other XML attachments. An attachment is unpacked to 32 MB at most.
- `readInvoiceXml` reads CII (ZUGFeRD 1 and 2, Factur-X, XRechnung CII) and UBL (Invoice,
  CreditNote) with fast-xml-parser, namespace prefixes removed; amounts in cents as integers,
  credit notes negative. XML it cannot read gives the reason, and the card shows it beside the
  download.

Saving keeps the attachment: x2t writes the changes into the PDF itself (see "Opening and saving"), and
`e2e/pdf-invoice.spec.ts` reads the invoice back from the stored file after turning a page.
Making ZUGFeRD invoices from a text document is described in [E-invoices](e-invoice.md).

## Text recognition

A scanned PDF is pictures of pages: its words can be neither searched nor copied. Opening one
shows a notice above it ("Dieses PDF besteht nur aus Bildern …"), and "Text erkennen" there or in
"Seiten → Text erkennen (OCR) …" recognises the text with [Tesseract](https://github.com/naptha/tesseract.js)
(Apache-2.0) in a worker of the page, German and English, and stores the PDF as a new version.
It looks as before; the text lies over the page, invisible, where its letters are.

- Which pages: `packages/pdf-ocr` `textlessPages` reads the saved PDF with pdf-lib and takes the
  pages whose content, and the form XObjects it draws, shows no text (no `Tj`/`TJ` in a text
  object). Pages with text stay as they are, so a second run finds nothing to do.
- The page images: the engine draws each of those pages at 300 dpi, unrotated and without
  annotations (`PageCommands.render` → pdf/src/file.js `CFile.getPage`); Tesseract gets them as PNG,
  as its loader does not take the frame's canvases for canvases.
- The text layer: `addTextLayer` sets each word in Helvetica, text rendering mode 3 (invisible,
  ISO 32000-1 9.3.6), at the place and height of its box on the image and stretched to its width
  (`Tz`), as OCRmyPDF does; Helvetica is not embedded, as invisible text is never drawn. Characters
  WinAnsi has no code for become "?".
- Nothing leaves the computer: tesseract.js would load its core and the language models from a CDN;
  `apps/web/ocr-plugin.ts` serves them from the app at `/ocr` instead (the core builds with and
  without SIMD, `tessdata_best` integer models of `deu` and `eng`, about 16 MB in all), and the
  desktop app has them offline. They load when text is recognised, not with the app.

A digitally signed PDF is not changed: the text layer would break the signature.

## PDF/A

"Datei → Als PDF/A herunterladen" gives the PDF with the changes made as PDF/A-2 for archiving,
as "<Name> (PDF-A).pdf"; the stored file stays as it is. x2t draws the PDF anew into a PDF/A
(`X2tConverter/src/lib/pdf_image.h`: with `m_bIsPDFA` a PDF is not copied to a PDF), with the
change file applied first, as when saving, and the fonts the engine drew it with in `m_sFontDir`
(`print.ts`). Text documents, spreadsheets and presentations have the same menu item (`docs/engine.md`).

The PDF/A embeds every font, as it has to. One limit: a PDF that leaves out one of the 14 standard
fonts (Helvetica, Times, Courier and their styles, which a reader brings along) is drawn with the
converter's own copies of them, which are Type 1 fonts, and x2t embeds only TrueType, OpenType and
CFF fonts (`PdfFile/PdfWriter.cpp` `GetFont`); the text in those fonts becomes outlines: it looks
the same but cannot be searched or copied. Text in fonts the PDF embeds stays text.

## Pens

Pens are `asc_CStroke` objects as web-apps builds them (`Toolbar.js` `onInsertShapeComment`): a
solid colour, a width in millimetres, opaque. One tool is on at a time; switching ends the one
before the way it was started. The last page cannot be removed; the toolbar says so.

## Typing into forms

The editor finds a font for every new character and loads it while typing. Until it is there, a
form field takes no keys (`pdf/src/document.js` `getTextController` → `checkFieldFont`), so the
second key of someone typing fast went missing. When a PDF opens, `preloadTypingFonts` lets the
font picker collect the fonts for the characters of German and English text and loads them, as the
first key would. Tab moves to the next field.

A form's JavaScript (format, keystroke, calculation and link actions) does not run, so a field
another program formats by script shows its plain value; the scripts stay in the saved PDF
([code in documents](engine.md#code-in-documents-does-not-run)).

## Together

Several people edit a PDF at once, as an Office file: the PDF view opens in the file's editing
session ([collaboration](collaboration.md)), the PDF editor sends its changes through the relay
and replays the others' (pdf/src/CollaborativeEditing.js), and any save writes everyone's changes
into the PDF the session started from. Notes, markings, form values and page operations of one
show up for the others.

Typing into a form field takes the field's lock from the relay for every key: the PDF editor
checks the lock without the fast-mode exception the text editor uses (`CPDFDoc.Document_Is_
SelectionLocked` → `CollaborativeEditing.Get_GlobalLock`), and keys that come while a request is
on its way are dropped. At a person's pace on a nearby server that does not happen; on a slow
connection someone who types very fast can lose a character in a shared form.

## Tests

`e2e/pdf-sign.spec.ts` signs through the app with a certificate made for the test (a wrong
password first), checks the stored file and the warning after a change; `packages/pdf-sign/test`
signs and checks below the app, also a changed byte, bytes added after signing, data planted in
the padding of /Contents, a range past the end of the file and thousands of junk /ByteRange entries.
`e2e/pdf-invoice.spec.ts` opens `test-files/rechnung.pdf` (a ZUGFeRD invoice written by
`test-files/rechnung.ts`), checks the card and the XML download, and that saving keeps the invoice;
`packages/einvoice/test` reads CII, ZUGFeRD 2 BASIC WL, UBL and a UBL credit note and finds the
XML among other attachments. `e2e/pdf-ocr.spec.ts` uploads a scan made in the browser (text drawn into a PNG), recognises its
text through the notice and checks the stored text layer and that a second run has nothing to do;
`packages/pdf-ocr/test` checks which pages count as textless and where the words go, and
`apps/web/src/editor/ocr.test.ts` the run over the pages. `e2e/pdf-a.spec.ts` downloads a text document and an edited PDF as PDF/A and checks the
conformance in the XMP metadata, the output intent, and that every font is embedded with a
ToUnicode map. `e2e/pdf-engine.spec.ts` checks the engine below the app; `e2e/pdf-together.spec.ts` has two
people fill in and comment the same PDF. `e2e/pdf.spec.ts` works through the app
with `test-files/formular.pdf`: turn a page and add one, fill in both fields (typed at once, Tab to
the next), remove a page and not the last, add a note and a drawing, highlight, black out a
heading, sign with a drawn signature, append `test-files/anhang.pdf`, save a page as a PDF of its
own. Each test reads the saved file back with pdf-lib: pages, rotation, field values,
annotations, and the text left on the page. `packages/editor-core/test/pdf.test.ts` checks the
calls the commands make.
