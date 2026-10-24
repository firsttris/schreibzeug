# Architecture

Stapel is a single-page app that edits Office files in the browser with the Euro-Office engine, and
one Bun server that stores the files and relays collaboration. The same app runs in the
browser and in the Tauri desktop app.

```
apps/web (React SPA) ──HTTP /api──▶ apps/server (Bun + Hono) ──▶ PostgreSQL (tree, versions)
   │                                         │                └─▶ data/blobs (file bytes)
   └─ iframe: engine (sdkjs + x2t)           └─ WebSocket relay (collaboration)
```

## Workspaces

| Workspace | What it does |
|---|---|
| `packages/editor-core` | The only code that calls `sdkjs`: loads the engine, opens and saves files, turns engine events into a store, for the text, spreadsheet and presentation editors. Framework-free. See [the engine](engine.md). |
| `packages/files-api` | The contract between server and clients: Zod schemas for names, nodes, versions and errors. |
| `packages/ooxml` | Builds minimal Office Open XML packages (.docx, .xlsx, .pptx): blank files for the server, test files for the tests. |
| `apps/server` | The files API on Bun with Hono, Drizzle and PostgreSQL. See [files](files.md); accounts with Better Auth in `src/auth/`, see [accounts](accounts.md). The collaboration relay in `src/collab/`, see [collaboration](collaboration.md). |
| `apps/web` | The React interface: file pages (`src/files/`), the editor page, routes in `src/router.tsx`, the typed API client in `src/api/`. |

## Why a SPA and a Hono API, not TanStack Start

The plan started with TanStack Start, whose server functions call server code like local
functions. They only exist while the Start server runs. The desktop app ships the interface as
static files, without that server, and would still need a plain HTTP API to reach a Stapel server.
So the interface is a plain SPA (Vite, TanStack Router and Query), and the server is a small API
that browser and desktop call the same way.

Hono is a thin layer over `Bun.serve`: routing, middleware, Zod validation, and a typed client
(`hc<AppType>`) that takes its types from the server's routes. That client gives the web app the
same end-to-end types server functions would. The collaboration relay runs in the same process on
Hono's WebSocket upgrade, so access checks for files and editing sessions live in one place.

## The web app

Routes are defined in code (`src/router.tsx`): `/login` signs in or creates an account; every
other page needs a session ([accounts](accounts.md)). `/` and `/folders/:id` list a folder, `/recent`,
`/shared` (what others shared, [sharing](accounts.md#sharing)) and `/trash` the other views, `/edit/:id` opens a file in its editor with the whole window
(`src/editor/`: the word view for .docx, the sheet view for .xlsx, the slide view for .pptx, sharing
the header with status, versions, download and save). Reads go
through TanStack Query with the keys in `src/api/files.ts`; every write refreshes all keys under
`files`. The editor page joins the file's editing session first (`src/use-session-file.ts`) and
opens the version the session started from, so refreshing the lists after a save does not reopen
the document. Every reply is checked against the schemas in
`packages/files-api`.

In development `bun run dev` serves the app on port 5173 and forwards `/api`, WebSockets included, to the server
(`STAPEL_API_URL`, default `http://localhost:3000`). The E2E run starts its own server on an empty
database (`e2e/server.ts`, port 3100) and the app on port 5174. Without Playwright's own browser download, an installed
Chromium can be used: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome bun run test:e2e`.

## Screenshots

`docs/screenshots` holds the pictures for the README and the docs, light and dark. They are taken
by `e2e/screenshots.shot.ts` (`bun run screenshots`), in CI by hand with **Actions → Update
screenshots**, which commits the pictures that changed. The run seeds the server with the same
folders and the letter from `test-files/angebot.docx`, pins their dates in the database and the
browser's clock, and ships Geist as the interface font, so an unchanged page gives an unchanged
picture.

## Format fidelity

`test-files/fidelity` holds real .docx files from LibreOffice's test suite (MPL-2.0), one per area:
tables, lists, footnotes, headers, images, text boxes, columns, a table of contents, comments,
charts and shapes. `e2e/formats.fidelity.ts` opens each one and compares the first screen with its
reference picture in `test-files/fidelity/screenshots`; then it saves the file unchanged, opens the
saved version and compares again, so a round trip through the engine and x2t must not change how
a document looks. The references are taken in CI with **Actions → Update screenshots**
(`bun run fidelity:update`); CI checks them on every push as part of `bun run test:e2e`. An engine
update passes only when they stay the same.
