# The desktop app

`apps/desktop` is Schreibzeug as a desktop app for Windows, macOS and Linux, built with Tauri 3 (alpha). It works
in one of two places, chosen on its start page and remembered for the next start:

- **On this computer**: the files in the documents folder (or another folder), through a small
  server the app starts beside its window ([below](#files-on-this-computer)). No account, no
  network.
- **On a Schreibzeug server**: the app asks for the server's address once, remembers the last ones, and
  then shows the server's own web app. Everything the browser can do works the same, and an update
  of the server updates the app's pages too.

```
                      ┌─▶ http://127.0.0.1:<port> (apps/local + the web app inside the app) ─▶ ~/Documents
Schreibzeug window (Tauri) ┤
  start page          └─▶ https://your-server (apps/server + apps/web/dist)
```

## How it fits together

- **The start page** (`apps/desktop/index.html`, `src/main.ts`, `src/servers.ts`, `src/start.ts`)
  is the app's own page. "Öffnen" starts the local server and opens the folder; "Ordner ändern …"
  picks another one. For a server it completes what is typed (`schreibzeug.example.org` gets `https://`, `localhost:3000` or an
  address in the local network `http://`), checks that something answers at `/api/health`, keeps
  the last five servers in its own storage. The next start goes back to where the app was last: the
  folder or the newest server.
- **The server serves the web app**: with `SCHREIBZEUG_WEB_DIR` pointing at `apps/web/dist`, the API
  server answers every path that is not `/api` with the built app, and unknown paths with
  `index.html` (`apps/server/src/web.ts`). The window loads the server's address directly, so
  sessions, the collaboration socket and the engine work exactly as in a browser on that server; no
  cross-origin requests, no second copy of the interface in the app.
- **The window** (`src-tauri/src/lib.rs`): downloads go to the download folder ("Downloads" at
  home where Linux has none configured) without overwriting a file (`downloads.rs`). A page of the
  same server that opens a new window (a new or copied document) gets a window of the app, where
  the session holds; any other link (Strg+click on a link in a document) opens in the system's
  browser, for http, https and mailto only. "Auf diesem Computer", "Ordner wählen …" and "Mit
  Server verbinden …" (back to the start page) are in the ⋮ menu beside the name at the bottom
  left; the window has no menu bar of its own, only macOS keeps one at the top of the screen. The
  app marks every page it shows (`window.schreibzeugDesktop`), and a command is a navigation to
  `https://desktop.schreibzeug.invalid/<command>`, which the window catches before it loads
  (`windows.rs` `desktop_action`), so neither the local nor a server's pages need native calls for it
  (`apps/web/src/desktop.ts`).
- **The local server** (`local.rs`): started on first use with a random key, stopped with the app;
  it also ends when its stdin closes, so a crashed app leaves nothing running. A new folder
  restarts it and closes the windows that showed the old one. The folder is kept in `settings.json`
  in the app's config folder (`settings.rs`); without one it is the system's documents folder
  (Windows' known folder, `~/Documents` on macOS, XDG's on Linux), called "Dokumente" in the app.
- **Native calls only from the start page**: its three commands (`open_local`, `local_folder`,
  `choose_folder`) are the app's own; the pages of a server or of the local server get none
  (`capabilities/default.json` grants only the core defaults to the app's own window content).

The browser engine is the system's on Windows (WebView2, Chromium) and macOS (WebKit). On Linux the
app brings Chromium itself (CEF, Tauri 3's `tauri-runtime-cef`) instead of WebKitGTK, which is slow
with the editors' canvas and differs from the browsers the web app is tested in. That makes the
Linux packages about 170 MB larger. Only one engine can be in a Linux build (WebKitGTK's runtime
builds on GTK 3, CEF on GTK 4), so the folder dialog there goes through the XDG desktop portal
(the desktop's own dialog) instead of GTK 3. Tauri 3 and its CEF runtime are alpha releases.

Chromium as CEF builds it talks to Google on its own: secure DNS probes, sign-in state, search,
the translation model, network time and component updates. The app switches all of that off
(`runtime()` in `src-tauri/src/lib.rs`); a net log of the app (`--log-net-log`) then shows only
requests to the app's own pages and server. In the Linux packages the bundler moves the app's binary
to `/usr/share/Schreibzeug/` and leaves the local server in `/usr/bin/`; the app looks in both places
(`local.rs`).

## Files on this computer

`apps/local` is a small server for working without a Schreibzeug server: it speaks the part of the
files API a single person needs (the same routes and shapes as `apps/server`, from
`@schreibzeug/files-api`) over a folder on the computer, the system's documents folder by default. The web app is the same; it asks `/api/info`
which kind of server it talks to and, for `local`, names the root after the folder ("Dokumente")
and leaves out what only makes sense with accounts.

- **Files are the files**: a folder in the app is a folder on disk, a file is a file. New
  documents, uploads, copies, renames and moves happen there; a save overwrites the file (written
  to a temporary name beside it first, then renamed). Hidden files, Office's `~$` lock files and
  `desktop.ini`/`Thumbs.db` are not listed, and a new file, folder or name the list would hide is
  refused (400) before anything happens on disk.
- **Ids**: the API names nodes by UUID; here a node's id is a UUID v5 of its path below the root,
  so a link stays the same after a restart. A rename or move keeps the id for as long as the server
  runs (`src/ids.ts`), so an open editor stays on its file.
- **Deleting** moves into the system's trash (`gio trash` on Linux, the Finder on macOS, the
  recycle bin on Windows; `src/trash.ts`) and only counts as done when the file is gone. There is no
  trash page of its own, no sharing, no links, no versions to go back to, no search and no jobs for
  an open document; those routes answer "Das gibt es nur auf einem Schreibzeug-Server"
  (`src/app.ts`). The version number only counts the saves since the server started, which the
  editing session needs.
- **Storage**: `/api/storage` names the room on the folder's drive and no usage of its own; the app
  shows no bar for it, the system's file manager does that, only the notice when less than 1 GB is
  left ([files](files.md#storage)).
- **Markdown and text files** open in the text editor ([Markdown and text files](text.md)): a
  save goes through only while the file on disk is still the bytes it was made from, so a change
  by another program (an editor, a sync tool) is not overwritten; the editor asks instead.
- **Editing** uses the same relay as the server (`apps/server/src/collab`), so two windows on the
  same file edit together. A session opens the version it started at and replays its changes on
  it, also after saves moved the file on; the folder keeps no older versions, so the server keeps
  the bytes of each session's first version while the session lasts (`src/session-bases.ts`) and
  serves them for `?version=` (a file written from outside before the session's first load, with
  no change made yet, starts the session as it is). Images added while editing wait in a cache folder until the file is
  saved with them inside.
- **Only for this computer** (`src/gate.ts`): the server listens on 127.0.0.1 and wants the key the
  app made at start. The app opens `/api/local/unlock?token=…`, which leaves an HttpOnly,
  SameSite=Strict cookie; a request with a foreign host name (DNS rebinding) or a change sent from
  another site's page is refused.
- **MCP** (`src/mcp.ts`): `/mcp` serves the same tools as a server ([MCP server](mcp.md#on-this-computer)),
  without a key, behind the same check of host and origin; its tools reach the local API with the
  app's own key.

| Variable | Meaning |
|---|---|
| `SCHREIBZEUG_LOCAL_ROOT` | The folder shown; `~/Documents`, else the home folder, when absent |
| `SCHREIBZEUG_LOCAL_ROOT_NAME` | What the app calls it; the folder's own name when absent |
| `SCHREIBZEUG_LOCAL_TOKEN` | The key (at least 16 characters); a random one, printed with the unlock address, when absent |
| `PORT` | 0 (default): any free port |
| `SCHREIBZEUG_WEB_DIR` | The built web app to serve beside the API |
| `SCHREIBZEUG_LOCAL_CACHE` | Where images wait until saved; a folder in the system's temp folder by default |
| `SCHREIBZEUG_MAX_UPLOAD_MB` | The largest file to upload or save; 512 by default |
| `SCHREIBZEUG_LOCAL_EXIT_WITH_STDIN` | `1`: stop when stdin closes, which the desktop app sets so the server ends with it (`src-tauri/src/local.rs`) |
| `USER`, `USERNAME` | The name shown for the one person; the system account's name |

Once it listens it prints `SCHREIBZEUG_LOCAL_READY http://127.0.0.1:<port>`. By hand, with the web
app's dev server in front of it:

```sh
SCHREIBZEUG_LOCAL_ROOT=~/Dokumente PORT=3300 bun run --filter @schreibzeug/local start
SCHREIBZEUG_API_URL=http://localhost:3300 bun run --filter @schreibzeug/web dev
# then open http://localhost:5173/api/local/unlock?token=<the printed token>
```

## Building

The app carries the built web app (`apps/web/dist`, the engine included) and the local server,
compiled with `bun build --compile` into one executable per platform (`scripts/sidecar.ts`, run by
Tauri before every build into `src-tauri/binaries/`). So build the web app first:

```sh
bun run engine:prepare && bun run build          # apps/web/dist (Linux x86_64 for the engine's fonts)
bun run --filter @schreibzeug/desktop desktop:dev     # the app against the start page's dev server
bun run --filter @schreibzeug/desktop desktop:build   # installers for this machine
```

The engine's fonts and the Bun runtime make the installers large (about 200 MB); slimming the
fonts is for later.

Linux needs GTK 4.14 or newer (`libgtk-4-dev librsvg2-dev`; Ubuntu 24.04, Debian 13); Chromium
(CEF, about 1 GB) is downloaded by the first build, to `CEF_PATH` if set. The workflow **Actions → Desktop app** builds the web app once on Linux and then all
three platforms: AppImage, .deb and .rpm; .msi and a setup .exe; a .dmg for Intel and Apple silicon. Run
by hand it keeps them as artifacts; every release (**Actions → Bump version**, see
[Development](development.md#releases)) builds them too and attaches them to the GitHub release. The
version comes from `apps/desktop/package.json`, which the bump keeps at the version of the release.
The .rpm is compressed with zstd and the setup .exe with zlib (`tauri.conf.json`): each takes about
a minute instead of four with gzip and LZMA, for a somewhat larger file.

### Patched Tauri CLI

Temporary, until Tauri fixes it ([#12](https://github.com/firsttris/schreibzeug/issues/12)): the
bundler of Tauri 3 alpha copies `libEGL.so` and `libGLESv2.so` from CEF into every Linux package,
and CEF 154 no longer ships them, so every Linux package fails. On Linux,
`apps/desktop/scripts/tauri.ts` therefore builds the Tauri CLI of the version in `package.json` from
Tauri's sources with `apps/desktop/patches/*.patch` applied (once, into
`src-tauri/target/patched-cli/`), and `bun run tauri …`, `desktop:dev` and `desktop:build` use it
(CI's `desktop` job builds it on `main`, so a release, which runs on its tag and reads `main`'s
cache, finds it there instead of spending four minutes on it);
Windows and macOS use the published CLI. The script stops when a patch no longer applies to a new
version: then check whether that release fixes it and remove the patch as described in
`apps/desktop/patches/README.md`.

The builds are not signed yet. Windows SmartScreen shows "unknown publisher" (More info → Run
anyway), and macOS Gatekeeper refuses to open the app until it is opened once with right click →
Open. Linux packages need no signature.

## Tests

`apps/local/test/files.test.ts` runs the local API over a temporary folder, `gate.test.ts` the
check of host, origin and key, `mcp.test.ts` the MCP endpoint, `units.test.ts` the settings and the
ids. `e2e/local.spec.ts` opens the app on the local server and works on files in its folder;
`apps/desktop/src/*.test.ts` covers the start page.

## Next

- Local and server files side by side, several folders.
- Schreibzeug as the default app for .docx, .xlsx and .pptx.
- Signing and updates through the Tauri updater.
