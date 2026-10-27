<div align="center">

<h1>Schreibzeug: Word, Excel, PowerPoint and PDF, edited together – self-hosted and open source</h1>

The self-hosted Google Docs and Microsoft 365 alternative: in real time, in the browser or as a desktop app.<br>
AGPL, on the European Euro-Office engine, no document server, no cloud account, no tracking. Made in Europe.

**English** · [Deutsch](README.de.md)

[![CI](https://github.com/firsttris/schreibzeug/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/schreibzeug/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/firsttris/schreibzeug?logo=github&label=release)](https://github.com/firsttris/schreibzeug/releases/latest)
[![Docker Pulls](https://img.shields.io/docker/pulls/tristanteu/schreibzeug?logo=docker&logoColor=white)](https://hub.docker.com/r/tristanteu/schreibzeug)
[![Image Size](https://img.shields.io/docker/image-size/tristanteu/schreibzeug/latest?logo=docker&logoColor=white&label=image)](https://hub.docker.com/r/tristanteu/schreibzeug)
[![Docs](https://img.shields.io/badge/docs-firsttris.github.io%2Fschreibzeug-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/schreibzeug/)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Desktop](https://img.shields.io/badge/desktop-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/firsttris/schreibzeug/releases/latest)
[![GDPR](https://img.shields.io/badge/GDPR-files%20on%20your%20server-15803d)](#-your-files-stay-in-europe--with-ai)
[![GoBD](https://img.shields.io/badge/GoBD-kept%20versions%20stay-15803d)](#-your-files-stay-in-europe--with-ai)
[![Made in Europe](https://img.shields.io/badge/made%20in-Europe-003399)](https://github.com/Euro-Office)
[![MCP server](https://img.shields.io/badge/MCP-Claude%20Code-d97757)](https://firsttris.github.io/schreibzeug/mcp.html)

```bash
docker run -d --name schreibzeug -p 127.0.0.1:3000:3000 -v schreibzeug-data:/data tristanteu/schreibzeug
```

[Privacy & GoBD](#-your-files-stay-in-europe--with-ai) •
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

## 🇪🇺 Your files stay in Europe – with AI

- **GDPR**: documents live on your server, or on your own computer with the desktop app. The editor runs in your browser: no US cloud, no third-party document server, no telemetry.
- **GoBD**: on a Schreibzeug server older versions are thinned out with age, as in Google Docs, and the versions you keep – the sent invoice, the signed contract – stay for good; files are never deleted for good from the app (the trash keeps them). PDF/A for archiving. The software is one part; the company's processes and its procedure documentation are the other.
- **E-invoices**: ZUGFeRD / Factur-X (EN 16931) from an invoice document, and e-invoices in PDFs read and shown – for the German e-invoice obligation.
- **AI on your terms**: Claude Code and other MCP clients work with your rights through a personal token, "read only" if you like; edits to a document open in the app need your consent and can be undone.
- **No lock-in**: a .docx stays a .docx, an .odt stays an .odt.

## 💡 Why Schreibzeug?

Google Docs and Microsoft 365 keep your documents in someone else's cloud and charge per user.
Self-hosted office suites usually need a separate document server next to Nextcloud and look like
the office programs of 2010. Schreibzeug is one small server with a modern interface.

- **Real Office files**: documents are saved as .docx, .xlsx and .pptx (and .odt, .ods, .odp as
  themselves), never converted into a format of its own. Word, Excel and LibreOffice open them as before.
- **Mature compatibility**: the editing engine is Euro-Office (the open-source fork of ONLYOFFICE),
  so tables, tracked changes, comments, charts and pivot tables come through intact.
- **Real-time collaboration without a document server**: several people edit the same file, with
  live cursors and comments; the editor runs in the browser, the server only relays the changes.
- **Your server, your data**: one container with a SQLite database and a data folder; backing up
  that folder backs up everything. No tracking, no telemetry.
- **Browser, desktop and AI assistants**: the same editors in the browser and as a desktop app for
  Windows, macOS and Linux that works offline with the files on your computer; Claude Code and other MCP clients work in your
  files with your rights.
- **On the phone too**: a text document flows in the width of the screen at a size to read, with
  the menus and the toolbar one tap away.

Runs on any Linux server or VPS with Docker or Podman (amd64), on a home server, or without any
server as the desktop app on your computer.

## 🚀 Install

```bash
docker run -d --name schreibzeug -p 127.0.0.1:3000:3000 -v schreibzeug-data:/data tristanteu/schreibzeug
```

Open http://localhost:3000 and create the first account (on a server through an SSH tunnel; the port stays on 127.0.0.1 so plain HTTP never reaches the internet).
More accounts are created through invitation links, or by anyone when `SCHREIBZEUG_OPEN_SIGNUP=true`.
Behind a domain, set `SCHREIBZEUG_URL=https://office.example.org`.

Settings, reverse proxy, backups and updates are in the [installation guide](https://firsttris.github.io/schreibzeug/installation.html).
The desktop app is described under [Desktop app](https://firsttris.github.io/schreibzeug/desktop.html); its installers for Windows, macOS and Linux are attached to every [release](https://github.com/firsttris/schreibzeug/releases).

## ✨ Features

| | |
|---|---|
| 📝 **Documents** (.docx) | Styles, fonts, lists, tables, images, page layout, **headers, footers, table of contents and footnotes**, **comments and tracked changes**, spell checking in German and English, templates, **mail merge**, **e-invoices** (ZUGFeRD), export as PDF and PDF/A · [more →](https://firsttris.github.io/schreibzeug/engine.html#mail-merge) |
| 📊 **Spreadsheets** (.xlsx) | Formulas, number formats, sorting and filters, frozen rows, **charts**, **pivot tables**, dropdown lists, conditional formats, CSV · [more →](https://firsttris.github.io/schreibzeug/engine.html#spreadsheets) |
| 📽️ **Presentations** (.pptx) | Slide layouts, shapes, designs, transitions, speaker notes and a full-screen **slide show** · [more →](https://firsttris.github.io/schreibzeug/engine.html#presentations) |
| 📄 **PDFs** | **Fill in forms and sign**, by hand or **digitally** with your certificate (PKCS#12, not a qualified signature), notes, highlighting, **black out** (older versions keep the original: share a fresh copy), turn, add and remove pages, **OCR** for scans, the e-invoice inside a ZUGFeRD PDF · [more →](https://firsttris.github.io/schreibzeug/pdf.html) |
| 🗒️ **Markdown & text** (.md, .txt) | A **live view** that keeps the text Markdown, or source and preview side by side; encoding and line endings kept byte for byte · [more →](https://firsttris.github.io/schreibzeug/text.html) |
| 📁 **Files & teamwork** | File browser with folders, upload, recent files and trash, **versions** thinned out with age, the ones you keep stay, storage at a glance, **sharing** with accounts or by link, **real-time co-editing** with live cursors, OpenDocument edited as it is · [more →](https://firsttris.github.io/schreibzeug/files.html) |
| 🤖 **AI & Kontext** | **MCP server** for Claude Code and other MCP clients, with your rights, asking before it edits a document you have open; **sign in with [Kontext](https://github.com/firsttris/kontext)** and use Schreibzeug as its documents module · [more →](https://firsttris.github.io/schreibzeug/mcp.html) |
| 🖥️ **Desktop app** | **Windows, macOS and Linux** (Tauri): the files in your documents folder without any server, or a window onto a Schreibzeug server (builds not signed yet) · [more →](https://firsttris.github.io/schreibzeug/desktop.html) |

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

## 📚 Documentation

The full documentation, with search, is at **[firsttris.github.io/schreibzeug](https://firsttris.github.io/schreibzeug/)**: every feature
in detail, [installation](https://firsttris.github.io/schreibzeug/installation.html), [accounts and sharing](https://firsttris.github.io/schreibzeug/accounts.html),
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
