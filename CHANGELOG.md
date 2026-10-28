# Changelog

What changed for people who use or run Schreibzeug, newest first. Images:
`tristanteu/schreibzeug:<version>` on Docker Hub (also `ghcr.io/firsttris/schreibzeug`);
installers: the [releases](https://github.com/firsttris/schreibzeug/releases). How to update:
[installation](https://firsttris.github.io/schreibzeug/installation.html#updates).

## Unreleased

- **Keyboard**: F6 and Umschalt+F6 lead out of the document to the menu bar and the toolbar and
  back, as in Word and LibreOffice (Tab stays a tab in the document); each toolbar is one stop for
  Tab, with the arrow keys along its buttons
  ([accessibility](https://firsttris.github.io/schreibzeug/accessibility.html)).
- **Screen reader support**: *Hilfe → Unterstützung für Screenreader*, or Strg+Alt+Z in the
  document, lets the engine read out the text the cursor passes, a selection, a cell with its
  address, a slide's number and a picture's alternative text, in German. Off unless switched on,
  and then it costs nothing; remembered in the browser
  ([accessibility](https://firsttris.github.io/schreibzeug/accessibility.html)).
- The menu bar works with the arrow keys, Home, End and Escape, as the ARIA menu bar pattern has
  it. Every page and editor is checked against WCAG 2.2 AA with axe-core.
- **Installing with Docker Compose**: `deploy/` holds `compose.yaml` (Schreibzeug and Caddy for
  HTTPS), `.env.example` and the `Caddyfile`; `git clone`, fill in `deploy/.env`, `docker compose
  up -d`, as with Kontext
  ([installation](https://firsttris.github.io/schreibzeug/installation.html#with-docker-compose)).
  A server started with `docker run` keeps working as before.
- **Versions are thinned out with age**: every version of the last day stays, then the newest per
  hour up to 30 days, per day up to a year, per week after that. "Version behalten" in the
  versions dialog keeps a version for good, and the newest always stays
  ([versions](https://firsttris.github.io/schreibzeug/files.html#versions)). The bytes of dropped
  versions are removed every six hours.

**Upgrading:** the thinning applies to a file's older versions at its next save or restore, also
to versions saved before the update. To keep every version as before, set
`SCHREIBZEUG_VERSIONS=all` before you start the new image. The database gets a new column at
start (`apps/server/drizzle/0005_kept_versions.sql`).

## 0.1.8 – 2026-10-27

- On a phone the editor gives the document the room: the header is one row (back, name, save
  state, the editor's buttons, "Werkzeuge" and "Speichern"); menus, file buttons and toolbar show
  after a tap on "Werkzeuge". Text documents open in the engine's mobile view, so text is no
  longer shrunk to fit the page.

## 0.1.7 – 2026-10-27

- Storage at a glance: a bar at the foot of the navigation shows how full the server's drive is,
  the new "Speicher" section in the settings what your files, older versions and trash take, and a
  notice above the file pages warns when less than 1 GB is left.

## 0.1.6 – 2026-10-27

- Documents open faster, on a phone too: the server compresses the app and the editing engine and
  lets browsers keep the engine, and a file is converted while the engine loads.
- The file pages and the editor's header fit on a phone (from 0.1.5).

## 0.1.5 – 2026-10-27

Tagged only; no image or release was published. Its change came out with 0.1.6.

## 0.1.4 – 2026-10-26

- **Markdown notes and text files**: open, create and edit `.md` and `.txt` files, with live
  preview, split view and source view.
- Desktop app: no menu bar of its own on Windows and Linux; "Auf diesem Computer", "Ordner wählen …"
  and "Mit Server verbinden …" are in the ⋮ menu beside the name. On Linux the app brings Chromium
  (CEF) instead of WebKitGTK.
- Security fixes from an audit: changes made with a session cookie must come from Schreibzeug's own
  origin; sign-in tries are counted by an address the client cannot forge; code a document carries
  (macros, custom functions, PDF scripts) never runs; limits on request bodies, collaboration
  messages and archives; open editors close when the sign-in ends or access is taken away.
- New setting `SCHREIBZEUG_TRUSTED_PROXIES` for the reverse proxy in front of the server.

**Upgrading:**

- The server in the image now runs as the unprivileged user `bun` (uid 1000) instead of root. A
  data volume from an older image belongs to root; hand it over once with the container stopped
  ([installation](https://firsttris.github.io/schreibzeug/installation.html#updates)), else the
  server stops at start with "attempt to write a readonly database".
- Behind an HTTPS proxy, set `SCHREIBZEUG_URL` to the address people open; without it sign-in and
  changes are refused (403).
- With sign-in through OpenID Connect (`OIDC_*`) the server no longer starts without
  `SCHREIBZEUG_URL`.
- Behind a proxy, name it in `SCHREIBZEUG_TRUSTED_PROXIES`, so the sign-in rate limit counts each
  client on its own.

## 0.1.3 – 2026-10-26

- The first published Docker image: the image build now installs the tools the engine's
  preparation needs.

## 0.1.2 – 2026-10-26

Tagged only; the image build failed (the build stage lacked the tools the engine's preparation
needs), so no image or release was published.

## 0.1.1 – 2026-10-26

The first tagged version; no image or release was published. What it holds came out with 0.1.3:

- Editors for documents (.docx), spreadsheets (.xlsx) and presentations (.pptx) on the Euro-Office
  engine, with real-time co-editing without a document server; OpenDocument files edited as they
  are, older formats opened as an Office copy.
- PDFs: fill in, comment, sign by hand or digitally, black out, rearrange pages, text recognition
  for scans, PDF/A export.
- E-invoices: a ZUGFeRD invoice from a Word invoice, the e-invoice inside a ZUGFeRD PDF as a card.
- Mail merge, templates, spell checking in German and English.
- Files with folders, versions and trash; accounts, sharing with accounts or by link.
- Sign-in through Kontext and Schreibzeug inside Kontext.
- The MCP server for AI assistants, with personal access tokens.
- The desktop app for Windows, macOS and Linux.
