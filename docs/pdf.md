# PDFs

Schreibzeug opens a PDF in the engine's PDF editor, in the browser, without a Document Server, and
saves it as a PDF again. What can be done with it: fill in forms, add notes and text boxes, mark
text (highlight, underline, strike out), draw freehand and shapes, sign, black out areas for good,
turn, add and remove pages, append another PDF, save pages as a PDF of their own, print and
download. How the engine reads and writes the file is in
[the engine](engine.md#pdfs).

## Opening and saving

A PDF opens like any other file: from the file list into `/edit/:id`, where the edit page picks the
PDF view (`apps/web/src/editor/pdf-view.tsx`). `packages/editor-core` `openPdfDocument`
(`src/pdf.ts`) hands the file's own bytes to the editor; there is no conversion. Saving asks the
editor for its changes since the file was opened and lets x2t write them into that file
(`savePdf`), so every save is a whole PDF and a new version on the server, as for Office files. A
PDF without changes is saved as it is. "Datei → Herunterladen" downloads that PDF; "Drucken"
prints it through the browser.

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
| black out | `SetRedactTool(true)` draws boxes; `ApplyRedact()` removes what is under them from the page (`drawingfile.wasm` `RedactPage`), and saving writes the page without it |
| turn, add, remove pages | `asc_RotatePage(±90, pages)`, `asc_AddPage(position)`, `asc_RemovePage(pages)` after `asc_CanRemovePages`; on the pages selected in the thumbnails (`getSelectedPages`), or the page in view |
| undo, redo | `Undo()`, `Redo()`; `asc_onCanUndo`, `asc_onCanRedo` |

## Signing

"Unterschreiben" opens a dialog (`apps/web/src/editor/signature-dialog.tsx`) to draw the signature
with the mouse, a pen or a finger, or to take the last one used in this browser (kept as strokes in
`localStorage`, only there). The strokes go on the page in view as an ink annotation, sharp at any
size, about 6 cm wide in the middle of what is in view, and can be moved and sized there
(`packages/editor-core/src/pdf-signature.ts`). It is built the way the engine's document builder
builds one (`pdf/apiBuilder.js` `Api.CreateInkAnnot`: annotation props, a solid border of the
pen's width and colour, `SetInkPoints`), in one step of the history. It is a signature to look at,
not a digital signature with a certificate.

A picture of a signature would be an image stamp, but this engine cannot make one:
`CPDFDoc.AddStampAnnot` reads the stamp render an image stamp lacks and throws, and with that
worked around, x2t's WebAssembly build stops on writing the stamp. So the dialog offers drawing
only. Saving still hands the document's images to x2t in "media/" beside the change file, for
changes that refer to pictures.

## Pages between files

"Seiten → PDF anhängen …" puts the pages of a PDF from the computer at the end, the way pages
pasted into the thumbnails come in (`CPDFDoc.MergePagesBinary` in one history step); forms and
annotations of both files stay. "Als neues PDF speichern" makes a PDF of the selected pages with
what was changed on them (`CPDFDoc.GetPagesBinary`, which `drawingfile.wasm` `SplitPages` writes)
and stores it beside the file as "<Name> – Seiten 1–2.pdf" (in "Meine Dateien" when the folder
belongs to someone else).

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

`e2e/pdf-engine.spec.ts` checks the engine below the app; `e2e/pdf-together.spec.ts` has two
people fill in and comment the same PDF. `e2e/pdf.spec.ts` works through the app
with `test-files/formular.pdf`: turn a page and add one, fill in both fields (typed at once, Tab to
the next), remove a page and not the last, add a note and a drawing, highlight, black out a
heading, sign with a drawn signature, append `test-files/anhang.pdf`, save a page as a PDF of its
own. Each test reads the saved file back with pdf-lib: pages, rotation, field values,
annotations, and the text left on the page. `packages/editor-core/test/pdf.test.ts` checks the
calls the commands make.
