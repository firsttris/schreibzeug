# Files

`apps/server` stores folders and files and every version of a file. It is a Hono app on Bun
(`src/app.ts`) over PostgreSQL (Drizzle, `src/db/schema.ts`) and a folder of blobs.

## Data

| Table | What it holds |
|---|---|
| `nodes` | Folders and files in one tree (`parent_id`, `null` is the root of the owner's files, `owner_id` whose they are; see [accounts](accounts.md)). A file has `mime`, `size` and its newest `version`. |
| `versions` | Every saved state of a file: number, size and the SHA-256 of its bytes. |
| `shares` | Who else may open a node, with `edit` or `view`; see [accounts](accounts.md#sharing). |

The bytes are in the blob store (`src/blobs.ts`), under `data/blobs/ab/abcdef…` by their SHA-256:
the same bytes are stored once, and a blob is written to a temporary name and renamed, so a crash
never leaves half a blob under a real key.

Names are unique per folder (at the top level per owner), ignoring case, as on macOS and Windows (a partial unique index on
`lower(name)` among nodes outside the trash). Names must not contain `/ \ : * ? " < > |` or control
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
| `POST /folders` | New folder (`parentId`, `name`) |
| `POST /files` | Upload (multipart: `file`, optional `parentId`) |
| `POST /files/blank` | New empty file (`parentId`, `name`, `format`: `docx`, `xlsx` or `pptx`) |
| `GET /files/:id/content[?version=n]` | The bytes of the newest or a given version |
| `PUT /files/:id/content` | Save: the body becomes a new version |
| `GET /files/:id/versions` | All versions, newest first |
| `POST /files/:id/versions/:number/restore` | Make an older version the newest again (as a new version; the ones in between stay) |
| `GET /health` | `{ "ok": true }` |

## Running it

| Variable | Default |
|---|---|
| `DATABASE_URL` | `postgres://stapel:stapel@localhost:5432/stapel` |
| `STAPEL_DATA_DIR` | `data` (blobs go to `data/blobs`) |
| `PORT` | `3000` |
| `STAPEL_MAX_UPLOAD_MB` | `512` |
| `STAPEL_OPEN_SIGNUP`, `STAPEL_AUTH_SECRET`, `STAPEL_TRUSTED_ORIGINS` | see [accounts](accounts.md) |

`bun run server` starts it with reload; it applies the migrations in `apps/server/drizzle` on
start. After a change to the schema, `bun run --filter @stapel/server db:generate` writes the next
migration.

## Tests

`apps/server/test/files.test.ts` signs up an account and runs the app with `app.request()` and Hono's typed test client
against a real PostgreSQL: each test file creates a database of its own from `TEST_DATABASE_URL`
(default as `DATABASE_URL`; the user needs `CREATEDB`) and drops it afterwards. CI runs them with a
PostgreSQL service.
