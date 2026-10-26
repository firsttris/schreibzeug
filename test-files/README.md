# Test files

Documents the engine, end-to-end and format-fidelity tests open. Only files we may redistribute
belong here; note each file's source below.

| File | Source | Used by |
|---|---|---|
| `hello.docx` | written by `make.ts` in this folder (AGPL-3.0, like the repository) | `e2e/word-roundtrip.spec.ts`, `e2e/files.spec.ts` |
| `angebot.docx` | written by `make.ts` in this folder (AGPL-3.0, like the repository) | `e2e/screenshots.shot.ts` |
| `preise.xlsx` | written by `make.ts` in this folder (AGPL-3.0, like the repository) | `e2e/spreadsheet.spec.ts`, `e2e/screenshots.shot.ts` |
| `umsatz.xlsx` | written by `make.ts` in this folder (AGPL-3.0, like the repository) | `e2e/pivot.spec.ts` |
| `vortrag.pptx` | written by `make.ts` in this folder (AGPL-3.0, like the repository) | `e2e/presentation.spec.ts`, `e2e/screenshots.shot.ts` |
| `formular.pdf` | written by `make.ts` with `pdf.ts` in this folder (AGPL-3.0, like the repository) | `e2e/pdf-engine.spec.ts`, `e2e/pdf.spec.ts`, `e2e/screenshots.shot.ts` |
| `rechnung.docx` | written by `make.ts` with `rechnung.ts`: Schreibzeug's invoice template filled in (AGPL-3.0, like the repository) | `e2e/e-invoice.spec.ts` |
| `rechnung.pdf` | written by `make.ts` with `rechnung.ts` in this folder: a ZUGFeRD invoice with its Factur-X XML attached (AGPL-3.0, like the repository) | `e2e/pdf-invoice.spec.ts` |
| `angebot.odt` | `angebot.docx` converted with LibreOffice 24.2 (`soffice --headless --convert-to odt`); ours, AGPL-3.0, like the repository | `e2e/other-formats.spec.ts` |
| `preise.ods` | `preise.xlsx` converted with LibreOffice 24.2 (`soffice --headless --convert-to ods`); ours, AGPL-3.0, like the repository | `e2e/other-formats.spec.ts` |
| `vortrag.odp` | `vortrag.pptx` converted with LibreOffice 24.2 (`soffice --headless --convert-to odp`); ours, AGPL-3.0, like the repository | `e2e/other-formats.spec.ts` |
| `angebot.doc` | `angebot.docx` converted with LibreOffice 24.2 (`soffice --headless --convert-to doc`); ours, AGPL-3.0, like the repository | `e2e/other-formats.spec.ts` |
| `angebot.rtf` | `angebot.docx` converted with LibreOffice 24.2 (`soffice --headless --convert-to rtf`); ours, AGPL-3.0, like the repository | `e2e/other-formats.spec.ts` |
| `preise.xls` | `preise.xlsx` converted with LibreOffice 24.2 (`soffice --headless --convert-to xls`); ours, AGPL-3.0, like the repository | `e2e/other-formats.spec.ts` |
| `vortrag.ppt` | `vortrag.pptx` converted with LibreOffice 24.2 (`soffice --headless --convert-to ppt`); ours, AGPL-3.0, like the repository | `e2e/other-formats.spec.ts` |
| `einladung.docx` | written by `make.ts` in this folder: a letter with Word's merge fields (AGPL-3.0, like the repository) | `e2e/mail-merge.spec.ts` |
| `empfaenger.xlsx` | written by `make.ts` in this folder: the letter's recipients (AGPL-3.0, like the repository) | `e2e/mail-merge.spec.ts` |
| `notiz.md` | written by hand for the screenshots (AGPL-3.0, like the repository) | `e2e/screenshots.shot.ts` |
| `anhang.pdf` | written by `make.ts` with `pdf.ts` in this folder (AGPL-3.0, like the repository) | `e2e/pdf.spec.ts` |

`fidelity/` holds documents for the format-fidelity test (`e2e/formats.fidelity.ts`), each with its
reference picture in `fidelity/screenshots/`. They come unchanged from LibreOffice
(`sw/qa/extras/ooxmlexport/data`, commit `c2c53029370c1fd95fff099d5c8c900c6504e99b`), licensed
under the [Mozilla Public License 2.0](https://www.mozilla.org/MPL/2.0/):

| File | What it covers |
|---|---|
| `table-borders.docx` | table and cell borders |
| `table-style-cell-back-color.docx` | table style with cell shading |
| `text_number_list.docx` | numbered lists |
| `footnote.docx` | footnotes |
| `inheritFirstHeader.docx` | headers, first-page header |
| `image-noborder.docx` | an inline image |
| `textbox-rounded-corners.docx` | a text box shape (VML) |
| `multi-column-line-separator-SAVED.docx` | columns with a separator line |
| `toc_doc.docx` | a table of contents field |
| `CommentReply.docx` | a comment with a reply |
| `chart.docx` | an embedded chart |
| `preset-shape.docx` | a DrawingML preset shape |

Regenerate the generated files with `bun run test-files`; the same content gives the same bytes.

The spreadsheets in `fidelity/` come unchanged from the same LibreOffice commit
(`sc/qa/unit/data/xlsx`, Mozilla Public License 2.0):

| File | What it covers |
|---|---|
| `formats.xlsx` | number formats |
| `Test_ThemeColor_Text_Background_Border.xlsx` | theme colours for text, fills and borders |
| `cell-borders.xlsx` | cell borders |
| `colorscale.xlsx` | conditional formatting with colour scales |
| `databar.xlsx` | conditional formatting with data bars |
| `autofilter.xlsx` | an autofilter |
| `chart_hyperlink.xlsx` | charts |

The presentations in `fidelity/` come unchanged from the same LibreOffice commit
(`sd/qa/unit/data/pptx`, Mozilla Public License 2.0):

| File | What it covers |
|---|---|
| `predefined-table-style.pptx` | a table with a built-in table style |
| `bulletColor.pptx` | coloured bullets |
| `group-rot.pptx` | rotated grouped shapes |
| `chart_pt_color_bg1.pptx` | a chart with theme colours |
| `smartart-org-chart.pptx` | a SmartArt organisation chart |
| `ooxtheme.pptx` | a theme |
| `ShapeLineProperties.pptx` | shape outlines |

