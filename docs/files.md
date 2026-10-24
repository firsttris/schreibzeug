# Files

`apps/server` stores folders and files and every version of a file. It is a Hono app on Bun
(`src/app.ts`) over SQLite (`bun:sqlite` with Drizzle, `src/db/schema.ts`) and a folder of blobs;
both live in the data folder, so copying that folder backs up everything.

SQLite rather than PostgreSQL: one process and one folder to run, nothing else to install, the
same database the desktop app can use locally, and the same choice as firsttris/sekretaer, which
Schreibzeug is meant to join. While several people edit, their changes go through the relay in memory;
the database sees a save every few seconds, which one writer at a time handles easily.
`bun:sqlite` is synchronous, so the repository functions are too: a function that does not await
is not interleaved with other requests, and a transaction must not await (`src/db/database.ts`).

## Data

| Table | What it holds |
|---|---|
| `nodes` | Folders and files in one tree (`parent_id`, `null` is the root of the owner's files, `owner_id` whose they are; see [accounts](accounts.md)). A file has `mime`, `size` and its newest `version`. |
| `versions` | Every saved state of a file: number, size and the SHA-256 of its bytes. |
| `shares` | Who else may open a node, with `edit` or `view`; see [accounts](accounts.md#sharing). |
| `invites` | Links that share a node: a random token, the role, when it expires. |

The bytes are in the blob store (`src/blobs.ts`), under `data/blobs/ab/abcdef…` by their SHA-256:
the same bytes are stored once, and a blob is written to a temporary name and renamed, so a crash
never leaves half a blob under a real key. Images put into a document while it is edited go there
too, named after their hash (`src/files/media.ts`); once saved, the Office file holds them itself.

Names are unique per folder (at the top level per owner), ignoring case, as on macOS and Windows (a partial unique index on
`name_key` among nodes outside the trash; the server keeps `name_key` as the lowercased name, because
SQLite's own `lower()` only knows ASCII and would let "Übersicht" and "übersicht" stand side by side).
Times are stored as milliseconds. Names must not contain `/ \ : * ? " < > |` or control
characters, so every file can be downloaded under its name on every system
(`packages/files-api/src/schemas.ts`).

Saving adds a version. Concurrent saves of one file lock its row and get consecutive numbers.

## Trash

Trashing a node sets `trashed_at` on it and on everything below it with the same time, and marks it
as `trash_root`. Everywhere else "not in the trash" is then a single column. The trash lists the
roots; restoring one clears what was trashed with it, while what had been trashed before stays in
the trash. A restore fails when the old folder is itself in the trash or the name has been taken
again.

## API

All under `/api`; bodies are JSON unless noted. Every route but `/health` and Better Auth's
`/auth/*` needs a session and acts for its user ([accounts](accounts.md)). Errors are
`{ "error": { "kind", "message" } }`, with `kind` one of `not_found` (404), `invalid` (400),
`unauthorized` (401), `forbidden` (403: the role is too weak), `not_a_folder` (422), `name_taken` and `conflict` (409), `too_large` (413),
`internal` (500).

Every node in an answer carries `role`, what the user may do with it: `owner`, `edit` or `view`.

| Route | What it does |
|---|---|
| `GET /nodes?parent=root\|<id>` | A folder: the folder, its path from the root (for a shared folder, from the folder that was shared), its children (folders first, by name) |
| `GET /nodes/:id` | One node |
| `PATCH /nodes/:id` | Rename (`name`) and/or move (`parentId`) |
| `POST /nodes/:id/trash` | Move into the trash |
| `POST /nodes/:id/restore` | Bring back from the trash |
| `GET /trash`, `GET /recent` | What is in the trash; files by last change (both only the user's own) |
| `GET /nodes/:id/shares` | Who the node is shared with (owner only) |
| `PUT /nodes/:id/shares` | Share with the account behind `email`, or change its `role` (`edit`, `view`) |
| `DELETE /nodes/:id/shares/:userId` | Take a share back |
| `GET /shared` | What others shared with the user, with `ownerName` |
| `GET /nodes/:id/invites` | The node's links that still hold (owner only) |
| `POST /nodes/:id/invites` | A new link (`role`, `days`: 1, 7 or 30) |
| `DELETE /nodes/:id/invites/:token` | Delete a link |
| `GET /invites/:token` | What a link shares (`nodeName`, `kind`, `ownerName`, `role`, `expiresAt`); **no session needed** |
| `POST /invites/:token/accept` | Accept a link: a share with its role, never weaker than one the user has |
| `POST /folders` | New folder (`parentId`, `name`) |
| `POST /files` | Upload (multipart: `file`, optional `parentId`) |
| `POST /files/blank` | New empty file (`parentId`, `name`, `format`: `docx`, `xlsx` or `pptx`) |
| `GET /files/:id/content[?version=n]` | The bytes of the newest or a given version |
| `PUT /files/:id/content` | Save: the body becomes a new version |
| `GET /files/:id/versions` | All versions, newest first |
| `POST /files/:id/media` | Store an image put into the file while editing (PNG, JPEG, GIF, BMP, by its first bytes); answers its name, `<sha256>.<ext>`. Needs `edit` |
| `GET /files/:id/media/:name` | That image, for everyone who may see the file |
| `POST /files/:id/copy` | A copy of the newest version, named "… (Kopie).docx", next to the original when the user may add there, otherwise in their own files |
| `POST /files/:id/versions/:number/restore` | Make an older version the newest again (as a new version; the ones in between stay) |
| `GET /health` | `{ "ok": true }` |
| `GET /info` | `{ "mode": "server" }`; the desktop app's local server answers `{ "mode": "local", "rootName" }` ([desktop app](desktop.md#files-on-this-computer)). **No session needed** |

## Templates

"Neu → Aus Vorlage …" (`apps/web/src/files/template-dialog.tsx`) starts a file from a template:

- **Built in** (`packages/ooxml/src/templates.ts`): a letter after DIN 5008, an offer, an invoice
  with what § 14 UStG asks of one, a calculation (formulas for the totals and the tax, euro
  formats), a project plan and a presentation. They are written as Office XML there; square
  brackets mark what to fill in.
- **Own templates**: every document, spreadsheet and presentation in a folder named "Vorlagen" at
  the top of the user's files. Nothing else needs setting up, on a server as on the computer.

The new file is the template's bytes uploaded under the name given (`POST /files`), so the API
needs nothing of its own for it and an own template stays as it is.

## Running it

| Variable | Default |
|---|---|
| `SCHREIBZEUG_DATA_DIR` | `data`: the database `schreibzeug.db`, the blobs in `blobs/`, the generated `auth-secret` |
| `PORT` | `3000` |
| `SCHREIBZEUG_MAX_UPLOAD_MB` | `512` |
| `SCHREIBZEUG_OPEN_SIGNUP`, `SCHREIBZEUG_AUTH_SECRET`, `SCHREIBZEUG_TRUSTED_ORIGINS` | see [accounts](accounts.md) |
| `SCHREIBZEUG_WEB_DIR` | unset: the API only. The built web app (`apps/web/dist`, after `bun run build`) to serve beside it, so one address serves the app and the API; the [desktop app](desktop.md) opens that address |

`bun run server` starts it with reload; it applies the migrations in `apps/server/drizzle` on
start. After a change to the schema, `bun run --filter @schreibzeug/server db:generate` writes the next
migration. drizzle-kit 0.31 quotes the expressions of a SQLite index as column names; check
generated indexes on expressions (as `nodes_name_per_parent` in `0000_init.sql`, fixed by hand).

## Tests

`apps/server/test/files.test.ts` signs up an account and runs the app with `app.request()` and Hono's typed test client
against a real SQLite file: each test file gets a temporary data folder of its own
(`test/harness.ts`), removed afterwards. Vitest runs on Bun (`bun --bun vitest`), which `bun:sqlite`
needs. The E2E server starts on an empty `e2e/.data`; the screenshots pin their dates in its
database through a small Bun script (`e2e/sqlite.ts`), since Playwright runs on Node.
