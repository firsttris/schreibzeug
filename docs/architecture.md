# Architecture

Schreibzeug is a single-page app that edits Office files in the browser with the Euro-Office engine, and
one Bun server that stores the files and relays collaboration. The same app runs in the
browser and in the Tauri desktop app.

```
apps/web (React SPA) ──HTTP /api──▶ apps/server (Bun + Hono) ──▶ SQLite (tree, versions, accounts)
   │                                         │                └─▶ data/blobs (file bytes)
   └─ iframe: engine (sdkjs + x2t)           ├─ WebSocket relay (collaboration)
MCP client (Claude Code) ──HTTP /mcp────────▶└─ MCP tools (packages/mcp) → the same /api
```

## Workspaces

| Workspace | What it does |
|---|---|
| `packages/editor-core` | The only code that calls `sdkjs`: loads the engine, opens and saves files, turns engine events into a store, for the text, spreadsheet, presentation and PDF editors. Framework-free. See [the engine](engine.md) and [PDFs](pdf.md). |
| `packages/text-editor` | The editor for Markdown and plain text files on CodeMirror 6, without a UI framework: reads and writes a file's own encoding and line endings, the live preview, the toolbar's Markdown commands, the split view's preview. See [Markdown and text files](text.md). |
| `packages/mcp` | The MCP server's tools for Claude Code and other clients: find, read, manage and create files, each through the files API with the caller's token. See [the MCP server](mcp.md). |
| `packages/files-api` | The contract between server and clients: Zod schemas for names, nodes, versions and errors. |
| `packages/einvoice` | E-invoices: finds and reads the invoice XML a ZUGFeRD or Factur-X PDF carries (CII and UBL, taken from Haben), and writes one: reads an invoice from a document's text, writes Factur-X XML (EN 16931) and makes the PDF/A a ZUGFeRD PDF/A-3. See [E-invoices](e-invoice.md). |
| `packages/pdf-ocr` | Searchable scans: finds the pages of a PDF without text and lays recognised text over them, invisible. See [PDFs](pdf.md#text-recognition). |
| `packages/pdf-sign` | Digital signatures in PDFs: signs with a PKCS#12 certificate (PKCS#7, detached) and checks the signatures a PDF holds. See [PDFs](pdf.md#digital-signatures). |
| `packages/ooxml` | Builds minimal Office Open XML packages (.docx, .xlsx, .pptx): blank files for the server, test files for the tests; reads the text of a .docx (for [e-invoices](e-invoice.md) and the [MCP server](mcp.md)), the sheets of an .xlsx and the slides of a .pptx. |
| `apps/server` | The files API on Bun with Hono, Drizzle and SQLite (`bun:sqlite`). See [files](files.md); accounts with Better Auth in `src/auth/`, see [accounts](accounts.md). The collaboration relay in `src/collab/`, see [collaboration](collaboration.md). |
| `apps/local` | The desktop app's local server: the same files API over a folder on the computer, for one person, without accounts. See [the desktop app](desktop.md#files-on-this-computer). |
| `apps/desktop` | The desktop app (Tauri 3, alpha) for Windows, macOS and Linux: the files on this computer through `apps/local`, or a window onto a Schreibzeug server. See [the desktop app](desktop.md). |
| `apps/web` | The React interface: file pages (`src/files/`), the editor page, routes in `src/router.tsx`, the typed API client in `src/api/`, the talk with Kontext when shown in its frame (`src/embed/`, see [Schreibzeug in Kontext](kontext.md)), the demo without a server (`src/demo/`, see [development](development.md#the-demo)). |

## Why a SPA and a Hono API, not TanStack Start

The plan started with TanStack Start, whose server functions call server code like local
functions. They only exist while the Start server runs. The desktop app ships the interface as
static files, without that server, and would still need a plain HTTP API to reach a Schreibzeug server.
So the interface is a plain SPA (Vite, TanStack Router and Query), and the server is a small API
that browser and desktop call the same way.

Hono is a thin layer over `Bun.serve`: routing, middleware, Zod validation, and a typed client
(`hc<AppType>`) that takes its types from the server's routes. That client gives the web app the
same end-to-end types server functions would. The collaboration relay runs in the same process on
Hono's WebSocket upgrade, so access checks for files and editing sessions live in one place.

## The web app

Routes are defined in code (`src/router.tsx`): `/login` signs in or creates an account; every
other page needs a session ([accounts](accounts.md)). `/` and `/folders/:id` list a folder, `/recent`,
`/shared` (what others shared, [sharing](accounts.md#sharing)) and `/trash` the other views,
`/settings` the language of the interface, the storage the files take and the access tokens for MCP clients ([files](files.md#storage), [MCP server](mcp.md); in local mode only the language), `/invite/:token` a link someone shared (readable before signing in), `/edit/:id` opens a file in its editor with the whole window
(`src/editor/`: the word view for .docx, the sheet view for .xlsx, the slide view for .pptx, the PDF view for .pdf, the text view for .md and .txt, sharing
the header with the editable name, the menu bar, status, versions, download and save). Reads go
through TanStack Query with the keys in `src/api/files.ts`; every write refreshes all keys under
`files`. The editor page joins the file's editing session first (`src/editor/use-session-file.ts`) and
opens the version the session started from, so refreshing the lists after a save does not reopen
the document. A text file has no session: its page loads the newest version and saves the whole
file over it (`src/editor/text-page.tsx`, [Markdown and text files](text.md#saving)). Every reply is checked against the schemas in
`packages/files-api`.

In development `bun run dev` prepares the engine if needed, starts the server and serves the app on port 5173, which forwards `/api`, WebSockets included, and `/mcp` to the server
(`SCHREIBZEUG_API_URL`, default `http://localhost:3000`). The E2E run starts its own server on an empty
database (`e2e/server.ts`, port 3100) and the app on port 5174; beside them the desktop app's local
server with an app of its own (`e2e/local-server.ts`), and a stand-in for Kontext with a server
signed in through it (`e2e/fake-kontext.ts`, `e2e/kontext-server.ts`; `e2e/playwright.config.ts`). Without Playwright's own browser download, an installed
Chromium can be used: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome bun run test:e2e`.

## Interface texts

The interface speaks German and English. Its texts are in `apps/web/messages/de.json` and
`apps/web/messages/en.json` (the [inlang message format](https://inlang.com/m/reootnfj/plugin-inlang-messageFormat));
[Paraglide JS](https://paraglidejs.com) compiles them into one typed function per message in
`apps/web/src/paraglide` (generated, not committed): the code calls `m.share_dialog_title()` or
`m.folder_page_deleted({ name })`, and a missing message or placeholder is a type error. The Vite
plugin compiles on `dev` and `build`; `bun run i18n` does it alone, and `typecheck` and `test` run it
first. `apps/web/project.inlang` holds the project: German is the base language, the format plugin
comes from `node_modules` (not from a CDN, so the build works offline), and `paraglide.config.js`
sets how the language is chosen: the one picked under **Settings → Language** (localStorage
`schreibzeug.locale`), else the browser's, else German. Changing it loads the page anew.

A key starts with the file that uses it (`word_menus_undo` in `word-menus.ts`); a few texts many
files share are `common_*`. Shortcuts are written with English key names and shown in the
interface's language (`apps/web/src/lib/keys.ts`: `keys("Ctrl+Z")` is "Strg+Z" in German).
`packages/editor-core` stays without Paraglide: the texts the engine draws itself and the screen
reader's words come from the app as data. Words read from documents stay German whatever the
interface says (an invoice's "Rechnungsnummer"), as does what the agent tools say. Not translated
yet: what the server answers (its error messages), the checks the server shares with the app
(`packages/files-api` names, `packages/einvoice` and `packages/pdf-sign` problems) and the names of
the built-in templates (`packages/ooxml`), which are German documents.

`apps/web/i18n.test.ts` keeps it that way in `bun run test`, and with it in CI: both languages
carry the same messages with the same placeholders, none is empty, every message is used, and no
text is written in the code. That last check (`apps/web/i18n-check.ts`) finds JSX text, the
attributes and fields that hold labels (`aria-label`, `title`, `placeholder`, `label`, …) and
string literals with German letters or words; a literal that is data, not text, carries an
`// i18n-ignore` comment saying why. `bun apps/web/i18n-check.ts [file …]` lists what it finds.
Unit tests read the German texts (`apps/web/vitest.setup.ts`), the E2E specs run in a German browser
(`locale: "de-DE"` in `e2e/playwright.config.ts`).

## Screenshots

`docs/screenshots` holds the pictures for the README and the docs, light and dark. They are taken
by `e2e/screenshots.shot.ts` (`bun run screenshots`), in CI by hand with **Actions → Update
screenshots**, which commits the pictures that changed. The run seeds the server with the same
folders, the letter from `test-files/angebot.docx` and the form from `test-files/formular.pdf`, pins their dates in the database and the
browser's clock, and ships Geist as the interface font, so an unchanged page gives an unchanged
picture.

## Format fidelity

`test-files/fidelity` holds real .docx, .xlsx and .pptx files from LibreOffice's test suite
(MPL-2.0), one per area: in documents tables, lists, footnotes, headers, images, text boxes,
columns, a table of contents, comments, charts and shapes; in spreadsheets borders, formats, theme
colours, filters, charts, colour scales and data bars; in presentations shapes, bullets, themes,
table styles, groups and SmartArt (`test-files/README.md`). `e2e/formats.fidelity.ts` opens each one and compares the first screen with its
reference picture in `test-files/fidelity/screenshots`; then it saves the file unchanged, opens the
saved version and compares again, so a round trip through the engine and x2t must not change how
a document looks. The references are taken in CI with **Actions → Update screenshots**
(`bun run fidelity:update`); CI checks them on every push as part of `bun run test:e2e`, which it runs
in three shards at once. An engine update passes only when they stay the same.
