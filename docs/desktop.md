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

- Local files: the folder "Dokumente" as "Meine Dateien", new files there, without a server; a
  small server inside the app speaking the same API over the file system.
- Stapel as the default app for .docx, .xlsx and .pptx.
- Signing and updates through the Tauri updater.
