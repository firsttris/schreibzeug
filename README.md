<div align="center">

<h1>Everything your team knows from Google Docs. Without Google knowing your documents.</h1>

**Schreibzeug: Word, Excel, PowerPoint and PDF, edited together – self-hosted and open source**

Editing together in real time, in the browser or as a desktop app. No document server, no tracking. Made in Europe.

**English** · [Deutsch](README.de.md)

[![CI](https://github.com/firsttris/schreibzeug/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/schreibzeug/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/firsttris/schreibzeug?logo=github&label=release)](https://github.com/firsttris/schreibzeug/releases/latest)
[![Docker Pulls](https://img.shields.io/docker/pulls/tristanteu/schreibzeug?logo=docker&logoColor=white)](https://hub.docker.com/r/tristanteu/schreibzeug)
[![Image Size](https://img.shields.io/docker/image-size/tristanteu/schreibzeug/latest?logo=docker&logoColor=white&label=image)](https://hub.docker.com/r/tristanteu/schreibzeug)
[![Docs](https://img.shields.io/badge/docs-firsttris.github.io%2Fschreibzeug-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/schreibzeug/)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Desktop](https://img.shields.io/badge/desktop-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/firsttris/schreibzeug/releases/latest)
[![GDPR](https://img.shields.io/badge/GDPR-files%20on%20your%20server-15803d)](#-why-schreibzeug)
[![Made in Europe](https://img.shields.io/badge/made%20in-Europe-003399)](https://github.com/Euro-Office)
[![MCP server](https://img.shields.io/badge/MCP-Claude%20Code-d97757)](https://firsttris.github.io/schreibzeug/mcp.html)

[Why](#-why-schreibzeug) •
[Install](#-install) •
[Features](#-features) •
[Screenshots](#-screenshots) •
[Alternatives](#-schreibzeug-and-the-alternatives) •
[FAQ](#-faq) •
[Documentation](https://firsttris.github.io/schreibzeug/)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/editor-dark.png">
  <img src="docs/screenshots/editor-light.png" alt="Schreibzeug, a self-hosted Word editor in the browser: a .docx document open with toolbar for paragraph style, font, size, bold, italic, colours, lists and alignment" width="900">
</picture>

</div>

## 💡 Why Schreibzeug?

Google Docs and Microsoft 365 keep your documents in someone else's cloud and charge per user.
Self-hosted office suites usually need a separate document server next to Nextcloud and look like
the office programs of 2010. Schreibzeug is one small server with a modern interface.

- **Your files stay with you (GDPR)**: documents live on your server, or with the desktop app on
  your own computer. No US cloud, no third-party document server, no telemetry.
- **Real Office files**: a .docx stays a .docx, an .xlsx an .xlsx, an .odt an .odt – Word, Excel
  and LibreOffice open them as before.
- **Mature compatibility**: the editing engine is Euro-Office, the European open-source fork of
  ONLYOFFICE, so tables, tracked changes, comments, charts and pivot tables come through intact.
- **Editing together in real time**: several people in the same file with live cursors and
  comments, without a document server.
- **E-invoices**: ZUGFeRD invoices straight from an invoice document, and e-invoices in PDFs read
  and shown.
- **AI if you want it**: Claude Code and other assistants find, read and write your files with your
  rights; changes to a document you have open need your consent and can be undone.
- **Simple to run**: one container with a SQLite database and a data folder; backing up the folder
  backs up everything.

Runs on any Linux server or VPS with Docker or Podman (amd64), on a home server, or without any
server as the desktop app for Windows, macOS and Linux.

## 🚀 Install

### 1. Let an agent set it up

Give Claude Code or another coding agent this repository and SSH access to your server and say:
"Set up Schreibzeug on my server following the [installation guide](https://firsttris.github.io/schreibzeug/installation.html)."

### 2. Manually

On a server with Docker (or Podman), a domain pointing to it and open ports 80 and 443:

```bash
# The configuration (compose.yaml, .env.example, Caddyfile); the programs come from Docker Hub
git clone https://github.com/firsttris/schreibzeug /opt/schreibzeug && cd /opt/schreibzeug
cp deploy/.env.example deploy/.env
nano deploy/.env                                          # domain, mail for Let's Encrypt, version
docker compose -f deploy/compose.yaml up -d schreibzeug   # pulls Schreibzeug and starts it, for now only on the server itself
```

Then:

1. Create the first account through an SSH tunnel (`ssh -L 3000:127.0.0.1:3000 <server>`, then
   http://localhost:3000), before anyone else can reach the server.
2. Start Caddy as well, which gets the HTTPS certificate: `docker compose -f deploy/compose.yaml up -d`.
3. Open `https://<your domain>`. More accounts come through sharing links, or by anyone with
   `SCHREIBZEUG_OPEN_SIGNUP=true` in `deploy/.env`.

With [Kontext](https://github.com/firsttris/kontext) Schreibzeug needs no install of its own: it
comes with Kontext as its documents. Only trying it on your own computer:
`docker run -d -p 127.0.0.1:3000:3000 -v schreibzeug-data:/data tristanteu/schreibzeug`, then
http://localhost:3000. Settings, your own reverse proxy, backups and updates are in the
[installation guide](https://firsttris.github.io/schreibzeug/installation.html).
The desktop app is described under [Desktop app](https://firsttris.github.io/schreibzeug/desktop.html); its installers for Windows, macOS and Linux are attached to every [release](https://github.com/firsttris/schreibzeug/releases).

## ✨ Features

| | |
|---|---|
| 📝 **Documents** (.docx) | **Comments and tracked changes**, headers, footers and table of contents, spell checking in German and English, templates, **mail merge**, **e-invoices** (ZUGFeRD), PDF and PDF/A · [more →](https://firsttris.github.io/schreibzeug/engine.html#mail-merge) |
| 📊 **Spreadsheets** (.xlsx) | Formulas, number formats, sorting and filters, frozen rows, **charts**, **pivot tables**, dropdown lists, conditional formats, CSV · [more →](https://firsttris.github.io/schreibzeug/engine.html#spreadsheets) |
| 📽️ **Presentations** (.pptx) | Slide layouts, shapes, designs, transitions, speaker notes and a full-screen **slide show** · [more →](https://firsttris.github.io/schreibzeug/engine.html#presentations) |
| 📄 **PDFs** | **Fill in forms and sign**, by hand or **digitally** with your certificate (not qualified), notes and highlighting, **black out**, add and remove pages, **OCR** for scans · [more →](https://firsttris.github.io/schreibzeug/pdf.html) |
| 🗒️ **Markdown & text** (.md, .txt) | A **live view** that keeps the text Markdown, or source and preview side by side; encoding and line endings kept byte for byte · [more →](https://firsttris.github.io/schreibzeug/text.html) |
| 📁 **Files & teamwork** | Folders, upload, recent files and trash, **versions** to go back to, **sharing** with accounts or by link, **real-time co-editing** with live cursors · [more →](https://firsttris.github.io/schreibzeug/files.html) |
| 🤖 **AI & Kontext** | **MCP server** for Claude Code and other MCP clients, with your rights, asking before it edits a document you have open; **sign in with [Kontext](https://github.com/firsttris/kontext)** and use Schreibzeug as its documents module · [more →](https://firsttris.github.io/schreibzeug/mcp.html) |
| 🖥️ **Desktop app** | **Windows, macOS and Linux** (Tauri): the files in your documents folder without any server, or a window onto a Schreibzeug server (builds not signed yet) · [more →](https://firsttris.github.io/schreibzeug/desktop.html) |
| ♿ **Accessibility** | Menus and toolbars by **keyboard**, **screen reader support** in documents, spreadsheets and presentations (off unless switched on, Strg+Alt+Z), checked automatically against WCAG 2.2 AA · [more →](https://firsttris.github.io/schreibzeug/accessibility.html) |

## 📸 Screenshots

<table>
  <tr>
    <td><img src="docs/screenshots/files-light.png" alt="Schreibzeug file browser: folders, Word documents, a spreadsheet and a presentation with last change and size, buttons for new folder, new file and upload"></td>
    <td><img src="docs/screenshots/spreadsheet-light.png" alt="Self-hosted spreadsheet editor for .xlsx files in the browser: toolbar, formula bar and grid with sheet tabs"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/presentation-light.png" alt="Presentation editor for .pptx files: slide list on the left, the title slide of a talk and the toolbar above"></td>
    <td><img src="docs/screenshots/pdf-light.png" alt="PDF editor in the browser: tools for highlighting, drawing, notes, signature and redaction beside a filled-in order form"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/comments-light.png" alt="Comments beside a Word document in Schreibzeug, with replies"></td>
    <td><img src="docs/screenshots/share-light.png" alt="Sharing a folder with another account or by link, to edit or to view"></td>
  </tr>
</table>

## 🔀 Schreibzeug and the alternatives

Schreibzeug is made for people who want the compatibility of a mature office engine with an
interface that feels like today's web apps, on their own server.

| | What it is | Where Schreibzeug differs |
|---|---|---|
| [ONLYOFFICE Docs](https://github.com/ONLYOFFICE/DocumentServer) / [Euro-Office](https://github.com/Euro-Office) | Collaborative office engine with a Microsoft-Office-like interface, usually embedded in Nextcloud | Same engine, a new interface, its own file management, no document server |
| [Collabora Online](https://github.com/CollaboraOnline/online) | LibreOffice in the browser, strongest with OpenDocument | Focus on Microsoft formats and a modern interface |
| [CryptPad](https://github.com/cryptpad/cryptpad) | End-to-end encrypted collaboration suite | Files stay plain .docx, .xlsx and .pptx on your storage |
| Google Docs, Microsoft 365 | Cloud office suites | Self-hosted, open source, no per-user price, your files unconverted |

## ❓ FAQ

<details>
<summary><b>Is there a self-hosted alternative to Google Docs and Microsoft 365?</b></summary>

Yes. Schreibzeug runs on your own server with Docker and edits Word, Excel, PowerPoint and PDF
files in the browser, several people at once. See the [installation guide](https://firsttris.github.io/schreibzeug/installation.html).
</details>

<details>
<summary><b>Does it need an ONLYOFFICE Document Server or Nextcloud?</b></summary>

No. The Euro-Office engine runs in the browser and the Schreibzeug server stores the files and
relays the changes; there is nothing else to install. How that works is in [the engine](https://firsttris.github.io/schreibzeug/engine.html).
</details>

<details>
<summary><b>Are my files converted into another format?</b></summary>

No. A .docx stays a .docx, an .xlsx stays an .xlsx, an .odt stays an .odt; every save is a new
version of the same file.
</details>

<details>
<summary><b>Can I use Schreibzeug offline, without a server?</b></summary>

Yes, with the desktop app for Windows, macOS and Linux: it opens the files in your documents folder
directly. See [Desktop app](https://firsttris.github.io/schreibzeug/desktop.html).
</details>

<details>
<summary><b>Can Claude or other AI assistants edit my documents?</b></summary>

Yes, through the built-in MCP server and a personal access token you create in the settings. A token
can be limited to "Nur lesen" (read only); edits to an open document need your consent and can be
undone. See [MCP server](https://firsttris.github.io/schreibzeug/mcp.html).
</details>

<details>
<summary><b>Can I create ZUGFeRD or XRechnung e-invoices?</b></summary>

ZUGFeRD yes: an invoice written in the text editor becomes a ZUGFeRD PDF/A-3 with Factur-X XML
(EN 16931). XRechnung is read and shown, but not created yet. See [E-invoices](https://firsttris.github.io/schreibzeug/e-invoice.html).
</details>

<details>
<summary><b>Is it secure?</b></summary>

Check it yourself, the code is open: let your agent run Cloudflare's [Security Audit Skill](https://github.com/cloudflare/security-audit-skill) or
Claude Code's `/security-review` on this repository.
Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
</details>

## 📚 Documentation

The documentation opens with a tour in pictures, made to send to customers: **[in English](https://firsttris.github.io/schreibzeug/)** and **[in German](https://firsttris.github.io/schreibzeug/de/)**.

The full documentation, with search, is at **[firsttris.github.io/schreibzeug](https://firsttris.github.io/schreibzeug/)**: [every feature
in detail](https://firsttris.github.io/schreibzeug/overview.html), [installation](https://firsttris.github.io/schreibzeug/installation.html), [accounts and sharing](https://firsttris.github.io/schreibzeug/accounts.html),
[collaboration](https://firsttris.github.io/schreibzeug/collaboration.html), [the engine](https://firsttris.github.io/schreibzeug/engine.html) and
[development](https://firsttris.github.io/schreibzeug/development.html). What changed in each release, with the steps an
update needs: the [changelog](CHANGELOG.md).

## 🛠️ Development

Requires [Bun](https://bun.sh) 1.4 or newer, on Linux x86_64 for preparing the engine; the database is a SQLite file.

```bash
git clone https://github.com/firsttris/schreibzeug && cd schreibzeug
bun install
bun run dev              # http://localhost:5173, with the API on http://localhost:3000
```

A React SPA with TanStack Router and Query, Tailwind and shadcn-style components; Euro-Office
`sdkjs` as the editing engine; a Bun server with Hono, Drizzle and SQLite; Tauri 3 (alpha) for the desktop
app. Checks, tests and architecture: [Development](https://firsttris.github.io/schreibzeug/development.html).

## 🧩 More from us

- Looking for a replacement for Gmail or Google Workspace? **[Kontext](https://github.com/firsttris/kontext)**: mail, calendar, contacts, chat and calls for your team, on your own server.
- Doing your own books in Germany? **[Haben](https://github.com/firsttris/haben)**: invoices with e-invoicing, receipts, bank reconciliation and VAT returns via ELSTER.

## 🤝 Contributing

Issues and pull requests are welcome. For a rendering or compatibility bug, please attach a file
that shows it (or a small one that reproduces it) and say which program made it. Please run
`bun run lint && bun run typecheck && bun run test` before opening a pull request; the checks,
conventions and how contributions are licensed are in [CONTRIBUTING.md](CONTRIBUTING.md).
Security problems please report privately ([SECURITY.md](SECURITY.md)).

---

<div align="center">

⭐ Like Schreibzeug? A [star on GitHub](https://github.com/firsttris/schreibzeug) helps others find it.<br>
🐛 [Report a bug](https://github.com/firsttris/schreibzeug/issues/new?template=bug_report.yml) · 💡 [Request a feature](https://github.com/firsttris/schreibzeug/issues/new?template=feature_request.yml)

<sub>License: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel and contributors · <a href="README.de.md">Deutsche Version</a><br>
Changed versions you pass on or run for others must offer their source code under the AGPL; a commercial license without these obligations is available via <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Schreibzeug builds on the open-source Euro-Office engine and is not affiliated with Euro-Office, ONLYOFFICE, Microsoft or Google.</sub>

</div>
