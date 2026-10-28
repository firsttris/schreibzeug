# Schreibzeug

Schreibzeug is a self-hosted, open-source office suite: documents, spreadsheets, presentations and
PDFs, edited together in real time in the browser or in a desktop app for Windows, macOS and Linux.
It uses the Euro-Office engine (the open-source fork of ONLYOFFICE) without a document server, and
it keeps your files as what they are: .docx, .xlsx, .pptx, .odt, .ods, .odp and .pdf, and Markdown
notes and text files (.md, .txt).

A tour in pictures for customers and colleagues, in German: [Schreibzeug entdecken](entdecken.md).

![The Schreibzeug editor with a Word document open, toolbar above the page](screenshots/editor-light.png)

## Start here

| | |
|---|---|
| [Installation](installation.md) | run the server with Docker: settings, reverse proxy, backups, updates, troubleshooting |
| [Accounts and sharing](accounts.md) | sign-up, roles, sharing with accounts and by link |
| [Sign-in through Kontext](kontext.md) | OpenID Connect, Schreibzeug as Kontext's "Dokumente" |
| [Desktop app](desktop.md) | files on your computer without a server, or a window onto a server |

## Using it

| | |
|---|---|
| [Files and versions](files.md) | folders, uploads, versions, trash, search (API and MCP) and the files API |
| [Collaboration](collaboration.md) | several people in one file, through the server's relay |
| [PDFs](pdf.md) | forms, notes, signatures, OCR, pages, PDF/A |
| [Markdown and text files](text.md) | notes with a live preview, kept in their own encoding and line endings |
| [E-invoices](e-invoice.md) | ZUGFeRD and Factur-X: reading them, making them from an invoice |
| [MCP server](mcp.md) | Claude Code and other AI assistants in your files |

## How it is built

| | |
|---|---|
| [Architecture](architecture.md) | the workspaces, the web app, screenshots and format fidelity |
| [The editing engine](engine.md) | how the interface drives `sdkjs`, feature by feature |
| [Development](development.md) | running it from source, checks, tests, releases |
