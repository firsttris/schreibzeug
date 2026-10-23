# Test files

Documents the engine, end-to-end and format-fidelity tests open. Only files we may redistribute
belong here; note each file's source below.

| File | Source | Used by |
|---|---|---|
| `hello.docx` | written by `make.ts` in this folder (AGPL-3.0, like the repository) | `e2e/word-roundtrip.spec.ts`, `e2e/files.spec.ts` |
| `angebot.docx` | written by `make.ts` in this folder (AGPL-3.0, like the repository) | `e2e/screenshots.shot.ts` |
| `preise.xlsx` | written by `make.ts` in this folder (AGPL-3.0, like the repository) | `e2e/spreadsheet.spec.ts`, `e2e/screenshots.shot.ts` |
| `vortrag.pptx` | written by `make.ts` in this folder (AGPL-3.0, like the repository) | `e2e/presentation.spec.ts`, `e2e/screenshots.shot.ts` |

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
