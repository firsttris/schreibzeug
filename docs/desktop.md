# The desktop app

`apps/desktop` is Stapel as a desktop app for Windows, macOS and Linux, built with Tauri 2. For now
it is a window onto a Stapel server: it asks for the server's address once, remembers the last
ones, and then shows the server's own web app. Everything the browser can do works the same, and an
update of the server updates the app's pages too.

```
Stapel window (Tauri) ── start page (apps/desktop/src) ──▶ https://your-server (apps/server + apps/web/dist)
```

## How it fits together

- **The start page** (`apps/desktop/index.html`, `src/main.ts`, `src/servers.ts`) is the app's own
  page. It completes what is typed (`stapel.example.org` gets `https://`, `localhost:3000` or an
  address in the local network `http://`), checks that something answers at `/api/health`, keeps
  the last five servers in its own storage and goes to the newest one on the next start.
- **The server serves the web app**: with `STAPEL_WEB_DIR` pointing at `apps/web/dist`, the API
  server answers every path that is not `/api` with the built app, and unknown paths with
  `index.html` (`apps/server/src/web.ts`). The window loads the server's address directly, so
  sessions, the collaboration socket and the engine work exactly as in a browser on that server; no
  cross-origin requests, no second copy of the interface in the app.
- **The window** (`src-tauri/src/lib.rs`): downloads go to the download folder ("Downloads" at
  home where Linux has none configured) without overwriting a file (`downloads.rs`); a link that
  opens a new window (Strg+click on a link in a document) opens in the system's browser, for http,
  https and mailto only. The menu "Stapel → Server wechseln …" goes back to the start page.
- **No native calls from pages**: the start page needs none, and the server's pages get none
  (`capabilities/default.json` grants only the core defaults to the app's own window content).

The browser engine is the system's: WebView2 (Chromium) on Windows, WebKit on macOS, WebKitGTK on
Linux. The editors, the converter (WebAssembly) and saving were tried in WebKitGTK 2.52.

## Files on this computer

`apps/local` is a small server for working without a Stapel server: it speaks the same files API
as `apps/server` (the same routes and shapes from `@stapel/files-api`) over a folder on the
computer, the system's documents folder by default. The web app is the same; it asks `/api/info`
which kind of server it talks to and, for `local`, names the root after the folder ("Dokumente")
and leaves out what only makes sense with accounts.

- **Files are the files**: a folder in the app is a folder on disk, a file is a file. New
  documents, uploads, copies, renames and moves happen there; a save overwrites the file (written
  to a temporary name beside it first, then renamed). Hidden files, Office's `~$` lock files and
  `desktop.ini`/`Thumbs.db` are not listed.
- **Ids**: the API names nodes by UUID; here a node's id is a UUID v5 of its path below the root,
  so a link stays the same after a restart. A rename or move keeps the id for as long as the server
  runs (`src/ids.ts`), so an open editor stays on its file.
- **Deleting** moves into the system's trash (`gio trash` on Linux, the Finder on macOS, the
  recycle bin on Windows; `src/trash.ts`) and only counts as done when the file is gone. There is no
  trash page of its own, no sharing, no links and no versions to go back to; the version number
  only counts the saves since the server started, which the editing session needs.
- **Editing** uses the same relay as the server (`apps/server/src/collab`), so two windows on the
  same file edit together. Images added while editing wait in a cache folder until the file is
  saved with them inside.
- **Only for this computer** (`src/gate.ts`): the server listens on 127.0.0.1 and wants the key the
  app made at start. The app opens `/api/local/unlock?token=…`, which leaves an HttpOnly,
  SameSite=Strict cookie; a request with a foreign host name (DNS rebinding) or a change sent from
  another site's page is refused.

| Variable | Meaning |
|---|---|
| `STAPEL_LOCAL_ROOT` | The folder shown; `~/Documents`, else the home folder, when absent |
| `STAPEL_LOCAL_ROOT_NAME` | What the app calls it; the folder's own name when absent |
| `STAPEL_LOCAL_TOKEN` | The key (at least 16 characters); a random one, printed with the unlock address, when absent |
| `PORT` | 0 (default): any free port |
| `STAPEL_WEB_DIR` | The built web app to serve beside the API |
| `STAPEL_LOCAL_CACHE` | Where images wait until saved; a folder in the system's temp folder by default |

Once it listens it prints `STAPEL_LOCAL_READY http://127.0.0.1:<port>`. By hand, with the web
app's dev server in front of it:

```sh
STAPEL_LOCAL_ROOT=~/Dokumente PORT=3300 bun run --filter @stapel/local start
STAPEL_API_URL=http://localhost:3300 bun run --filter @stapel/web dev
# then open http://localhost:5173/api/local/unlock?token=<the printed token>
```

## Building

```sh
bun run --filter @stapel/desktop desktop:dev     # the app against the start page's dev server
bun run --filter @stapel/desktop desktop:build   # installers for this machine
```

Linux needs WebKitGTK and its tooling (`libwebkit2gtk-4.1-dev libayatana-appindicator3-dev
librsvg2-dev`, Tauri's prerequisites). The workflow **Actions → Desktop app** builds all three
platforms: AppImage, .deb and .rpm; .msi and a setup .exe; a .dmg for Intel and Apple silicon. Run
by hand it keeps them as artifacts; a tag `desktop-v<version>` also attaches them to a draft
release. The version comes from `apps/desktop/package.json`.

The builds are not signed yet. Windows SmartScreen shows "unknown publisher" (More info → Run
anyway), and macOS Gatekeeper refuses to open the app until it is opened once with right click →
Open. Linux packages need no signature.

## Next

- Local files in the app: start `apps/local` beside the window, with a setting for the folder.
- Stapel as the default app for .docx, .xlsx and .pptx.
- Signing and updates through the Tauri updater.
