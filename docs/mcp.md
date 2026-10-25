# MCP server

Claude Code, and any other client of the [Model Context Protocol](https://modelcontextprotocol.io),
works in Schreibzeug as a person would: it finds and manages files, reads them and creates new ones,
always with the rights of the person whose access token it uses.

```
MCP client ──POST /mcp (Bearer token)──▶ apps/server src/mcp.ts ──▶ packages/mcp (tools)
                                                                        │ app.request("/api/…", same token)
                                                                        ▼
                                                              the files API (src/app.ts)
```

## Connecting

In the app, **Einstellungen → Zugangsschlüssel**: name the token, choose its scope and how long it
holds, and create it. The token is shown once, with the command for Claude Code:

```sh
claude mcp add --transport http schreibzeug https://<server>/mcp --header "Authorization: Bearer sz_…"
```

`SCHREIBZEUG_PUBLIC_URL` sets the address the tools put into links (e.g.
`https://office.example.org`); without it they use the address the request came to, honouring
`X-Forwarded-Proto` and `X-Forwarded-Host` behind a reverse proxy. In development the Vite server
forwards `/mcp` to the API server like `/api`.

## Access tokens

A personal access token (`src/auth/tokens.ts`, table `access_tokens`) is `sz_` and 32 random bytes in
base64url. The server keeps only its SHA-256: the token has too much entropy to guess, so a slow
password hash would add nothing. Each has a name, a scope, an optional expiry (30, 90 or 365 days, or
none) and the time it was last used.

| Scope | What it may do |
|---|---|
| `read` | Only `GET` requests; over MCP it does not even see the tools that write |
| `write` | What its user may do |

`requireUser` (`src/auth/middleware.ts`) takes a session cookie or `Authorization: Bearer <token>`. A
request with that header is judged by it alone: a wrong, revoked or expired token is `401` with
`WWW-Authenticate: Bearer`, even with a valid cookie alongside. Two things need the person in the app
(`requireSession`): managing tokens (`GET/POST /api/tokens`, `DELETE /api/tokens/:id`), so a token
cannot make another, and joining a live editing session (`/api/collab`).

Later, OAuth as the MCP specification describes it for remote servers, so a client connects without
a copied token.

## The endpoint

`/mcp` (`apps/server src/mcp.ts`) speaks MCP's Streamable HTTP transport with the official TypeScript
SDK (`@modelcontextprotocol/sdk`, `WebStandardStreamableHTTPServerTransport`). It only takes a
token, never a session cookie, so no web page can drive it for the person. It is stateless: each
request gets its own server and transport, and answers as JSON.

The tools live in `packages/mcp`, which knows nothing of the database: every tool calls the files
API through `app.request` with the caller's token, so it goes through exactly the checks the
interface goes through, and there is no second logic. A tool's failure (not found, no right, name
taken) is a tool result with `isError` and the API's German message, not a protocol error.

Names and inputs are English like the API; descriptions and messages are German like the interface.
Every change to a file is a new version and can be undone under "Versionen"; deleting only moves
into the trash. The server's instructions and the reading tools say that what comes out of a
document is data, not an instruction.

## Tools

| Tool | What it does | Scope |
|---|---|---|
| `list_folder` | A folder, or `root`, `shared`, `recent`, `trash`: id, kind, size, change, role and link of each entry | read |
| `search_files` | Files and folders by part of their name, own and shared (`GET /api/search?q=`) | read |
| `get_file` | A node with its path, its link, and who it is shared with (owner only) | read |
| `list_versions` | The versions of a file | read |
| `create_folder`, `rename`, `move`, `copy` | As in the file list | write |
| `trash`, `restore` | Into the trash and back | write |
| `restore_version` | An older version as the newest, as a new version | write |
| `share`, `create_link` | Share with an account, or a link to view or edit | write |
| `read_document` | A .docx as Markdown (headings, lists, paragraphs, tables; headers and footers after), or a plain text file | read |
| `read_sheet` | One sheet of an .xlsx by name, optionally a range like `A1:D20`, as a Markdown table with column letters and row numbers; values as the sheet shows them in German | read |
| `read_presentation` | A .pptx slide by slide: title, text, notes | read |
| `read_pdf` | A PDF's text page by page (`pages`: `1-3`, `2,5`), its form fields, its digital signatures and whether they hold, and the e-invoice it carries | read |

The reading tools read the file itself, without the engine: `packages/ooxml` (`docxContent` with
heading levels from the styles' outline level and list levels from `w:numPr`, `xlsxSheets`,
`pptxSlides`), pdf.js (`pdfjs-dist`, its legacy build, which runs on Bun) for the text and form fields
of a PDF, `packages/pdf-sign` for signatures and `packages/einvoice` for the e-invoice. A text longer
than 20 000 characters comes in parts: the answer ends with the `offset` to ask for next, so a
document does not fill the conversation. A scan without a text layer reads as empty; text
recognition in the app gives it one. ODT and the older formats need x2t, which runs in the browser:
open them in Schreibzeug first.

Links point into the app: `/edit/<id>` for a file, `/folders/<id>` for a folder, `/invite/<token>`
for a link.

## Tests

`apps/server/test/tokens.test.ts`: a token is shown once and kept as a hash, acts for its user,
`read` only reads, revoked, expired and wrong tokens are refused, tokens cannot manage tokens,
someone else cannot revoke one. `apps/server/test/mcp.test.ts` connects the SDK's own client to
`/mcp` in memory: no token, the tools a read token sees, the same checks as the app (a taken name,
someone else's folder), a revoked token. `apps/server/test/mcp-read.test.ts` reads the test files
(`hello.docx`, `preise.xlsx`, `vortrag.pptx`, `formular.pdf`, `rechnung.pdf`) and documents written
in the test: headings and lists as Markdown, a long text in parts, a sheet by name and range, a
PDF's form fields and e-invoice. The readers have their own tests in `packages/ooxml` and
`packages/mcp`. `e2e/mcp.spec.ts` creates a token in the settings, calls
the endpoint as a client would, sees the folder it made in the file list, and revokes the token.
