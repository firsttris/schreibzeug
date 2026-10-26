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

`SCHREIBZEUG_URL`, the server's address (also the sign-in callback's base, [Kontext](kontext.md)),
is what the tools put into links (e.g. `https://office.example.org`); without it they use the address the request came to, honouring
`X-Forwarded-Proto` and `X-Forwarded-Host` behind a reverse proxy. In development the Vite server
forwards `/mcp` to the API server like `/api`.

### On this computer

The desktop app's local server (`apps/local src/mcp.ts`) has `/mcp` too, for the files in its folder.
There is one person and no account, so there is no token: like the rest of the local server it only
answers requests for 127.0.0.1 and refuses one a web page sends from another origin (`gate.ts`). Its
tools call the local API with the app's own key; what only a server has (sharing, links, versions,
the trash, `search_files`, and the tools for an open document: `outline`, `replace_text`,
`insert_content`, `set_cells`, `export_pdf`) they answer with the local server's "Das gibt es nur
auf einem Schreibzeug-Server".
The desktop app starts the local server on a free port; started by hand with a fixed one:

```sh
SCHREIBZEUG_LOCAL_ROOT=~/Dokumente PORT=3300 bun run --filter @schreibzeug/local start
claude mcp add --transport http schreibzeug-lokal http://127.0.0.1:3300/mcp
```

A fixed port in the desktop app's settings comes later.

## Access tokens

A personal access token (`src/auth/tokens.ts`, table `access_tokens`) is `sz_` and 32 random bytes in
base64url. The server keeps only its SHA-256: the token has too much entropy to guess, so a slow
password hash would add nothing. Each has a name, a scope, an optional expiry (30, 90 or 365 days, or
none) and the time it was last used.

| Scope | What it may do |
|---|---|
| `read` | Only `GET` requests, and not the links of a node (`GET /api/nodes/:id/invites`, `refuseReadToken`): their secret would let another account edit; over MCP it does not even see the tools that write |
| `write` | What its user may do |

`requireUser` (`src/auth/middleware.ts`) takes a session cookie or `Authorization: Bearer <token>`;
a token starting with `sz_` is a personal access token, any other one is Kontext's (with a sign-in
provider configured, [Kontext](kontext.md#tokens-from-kontext)). A request with a personal access
token is judged by it alone: a wrong, revoked or expired token is `401` with
`WWW-Authenticate: Bearer`, even with a valid cookie alongside. Three things need the person in the app
with a session (`requireSession`): managing tokens (`GET/POST /api/tokens`, `DELETE /api/tokens/:id`),
joining a live editing session (`/api/collab`) and taking jobs for an open document (`/api/agent`).
Neither a personal access token nor a token Kontext sends on someone's behalf will do, so a token
cannot make another and a short-lived one cannot become a lasting one. When Kontext ends someone's
sessions (`DELETE /api/sessions`), their personal access tokens end with them.

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

That is advice to the model, not a boundary: a document someone shared with the user can carry
text that asks the model to share the user's files. So `share` and `create_link`, the tools that
let someone else in, carry the annotations `destructiveHint` and `openWorldHint` (what an outsider
has seen cannot be taken back), so that a client which approves plain writes on its own still asks
for these. And before either acts on a node the user owns, it asks the person through MCP
elicitation, naming the node as stored and who gets which role ("die Datei „X“ mit … teilen, zum
Ansehen?"; for a link, its role and lifetime); a decline or a failed question shares nothing. A
client can only be asked when it announced elicitation at `initialize` to the same server: the
stateless `/mcp` endpoint gets a new server per request, which has not seen `initialize`, so there
the client's own approval of the call, guided by the annotations, is the safeguard
(`packages/mcp/src/tool.ts` `confirmWith`).

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
| `share`, `create_link` | Share with an account (or, with Kontext, an address that has none yet: the share is marked `pending`; an account whose address nobody confirmed is marked `unverified`), or a link to view or edit; asks the person first where the client can be asked (see above) | write |
| `read_document` | A .docx as Markdown (headings, lists, paragraphs, tables; headers and footers after), or a plain text file | read |
| `read_sheet` | One sheet of an .xlsx by name, optionally a range like `A1:D20`, as a Markdown table with column letters and row numbers; values as the sheet shows them in German | read |
| `read_presentation` | A .pptx slide by slide: title, text, notes | read |
| `read_pdf` | A PDF's text page by page (`pages`: `1-3`, `2,5`), its form fields, its digital signatures and whether they hold (each with its issuer, or "self-signed", and that the trust chain is not checked, so the name is not confirmed), and the e-invoice it carries | read |
| `list_templates` | The built-in templates and the user's own in the folder "Vorlagen", each with its placeholders | read |
| `create_document` | A .docx from Markdown | write |
| `create_from_template` | A file from a template with its placeholders (`[Nr.]`, `[Datum]` …) filled; says which are still open | write |
| `create_sheet` | An .xlsx from sheets of rows: numbers, texts, formulas, with the formats bold, currency, date, percent | write |
| `create_presentation` | A .pptx from slides (title, content, title only, blank) | write |
| `append_rows` | Rows below the last row of a sheet, as a new version | write |
| `einvoice_xml` | Factur-X XML (EN 16931) from an invoice's data, checked first (`draftProblems`) | write |
| `upload_file` | A small file from the conversation (up to 1 MB), as text or base64 | write |
| `outline` | The open document as it is in the editor: numbered paragraphs (with their style) and tables, sheets with their used range, slides with their text | read |
| `replace_text` | Find and replace in an open .docx; answers how often | write |
| `insert_content` | Markdown (headings, paragraphs, lists, bold, italic) into an open .docx, before or after element n of the outline, or at the end | write |
| `set_cells` | Values and formulas into an open .xlsx from the top left cell of a range | write |
| `export_pdf` | An open document as PDF or PDF/A, stored beside it | write |

The reading tools read the file itself, without the engine: `packages/ooxml` (`docxContent` with
heading levels from the styles' outline level and list levels from `w:numPr`, `xlsxSheets`,
`pptxSlides`), pdf.js (`pdfjs-dist`, its legacy build, which runs on Bun) for the text and form fields
of a PDF, `packages/pdf-sign` for signatures and `packages/einvoice` for the e-invoice. A text longer
than 20 000 characters comes in parts: the answer ends with the `offset` to ask for next, so a
document does not fill the conversation. An Office file is unpacked with a budget
(`packages/ooxml` `boundedUnzip`): the parts it needs may hold at most 128 MiB together, by the
sizes the zip declares, and each part stops inflating as soon as it gives more than it declared, so
a small zip bomb cannot block the server; the tool answers that the file is too large. The same
holds for `list_templates`, `create_from_template` and `append_rows`. A scan without a text layer reads as empty; text
recognition in the app gives it one. ODT and the older formats need x2t, which runs in the browser:
open them in Schreibzeug first.

The creating tools write the file on the server, without an editor open, and store it as an upload
from the interface would (`POST /api/files`; `append_rows` saves a new version with `PUT`):

- `create_document` turns Markdown into WordprocessingML (`packages/ooxml` `markdownDocx`): ATX
  headings become Word's own styles "heading 1"–"heading 6" with their outline level, so the
  navigation and a table of contents find them; bullet and numbered lists get a numbering part,
  each numbered list starting at 1; pipe tables, block quotes, fenced code, rules, bold, italic,
  code and links (as `w:hyperlink` with an external relationship).
- `create_from_template` fills placeholders in the text of the document, sheet or slide parts
  (`fillPlaceholders`). A placeholder Word split across runs is not found; the answer lists what is
  still open. Formulas stay as they are: the brackets of a structured reference such as
  `=SUM(Tabelle1[Betrag])` are no placeholder.
- `append_rows` writes plain values below the last row (`appendRows`), and the used range grows
  with them; the workbook's own styles stay as they are.
- `einvoice_xml` takes amounts as a person states them (euros, percent) and reckons in integers as
  `packages/einvoice` does. The ZUGFeRD PDF needs the engine for the PDF/A and comes with editing
  in an open tab.

## Editing in the open tab

What changes an existing document runs where the engine is: in the browser tab that has the
document open. The person sees the change, can undo it, and whoever edits along gets it through the
relay; it is saved as a new version at once.

```
MCP client ─▶ /mcp edit tool ─▶ POST /api/files/:id/agent ─▶ agent hub (src/agent/hub.ts)
                                                               │ job over /api/agent/:fileId (WebSocket)
                                                               ▼
                                          the open editor (apps/web src/editor/use-agent.tsx)
                                          └─ editor-core agent.ts ─▶ engine (builder API) ─▶ save
```

- **The hub** (`apps/server src/agent`): every editor with a document open for editing joins
  `/api/agent/:fileId` (WebSocket, session only, the right to edit checked when it opens and again
  after every change to shares, the trash or a move; a tab that lost it is closed with 4403). A job for a user and
  file goes to that user's tab that joined last and waits up to two minutes for its answer.
  Without a tab the answer is `Das Dokument ist gerade in keinem Tab geöffnet.`, and the tool adds
  the link to open it. `POST /api/files/:id/agent` checks "edit", `GET /api/files/:id/outline`
  "view", so a read-only token may read the outline.
- **Consent**: the first job that changes something asks the person in the tab ("Claude möchte
  dieses Dokument bearbeiten": Erlauben, Ablehnen), once per document and tab. Afterwards a bar says
  "Claude darf dieses Dokument bearbeiten." with "Anhalten"; stopped, the tab refuses every job until
  "Wieder zulassen". Reading the outline needs no consent.
- **The engine** (`packages/editor-core src/agent.ts`): jobs are scripts against the engine's
  builder API (`Api.GetDocument()`, `Api.GetSheet()`, `Api.GetPresentation()`), run through its
  plugin command (`common/apiBase.js callCommand` → `common/plugins.js callCommandInternal`), which
  wraps them in one action (`canRunBuilderScript`: `StartAction`, `CheckActionLock`;
  `_onEndBuilderScript`: `Recalculate`, `FinalizeAction`). One job is one step of the history.
  Its input goes in as a JSON literal; it returns plain data, which becomes the answer.
- **Replacing** uses the search bar's `asc_replaceText`, not the builder's `SearchAndReplace`. In
  a shared session `ReplaceSearchElement` asks the relay for its locks and holds the global lock
  until the answer comes; a builder action around it would see that lock and undo itself
  (`private_CheckActionLock`, `StartSelectionLockCheck`).
- **Cells**: `ApiRange.SetValue` writes every value as text the sheet reads in its language
  (`checkFormat`, `Range.setValue`), so numbers go in with the document's decimal separator
  (`AscCommon.g_oDefaultCultureInfo`), and true and false as `=TRUE()` and `=FALSE()`.
- **Inserting** gets paragraphs, not Markdown: `packages/mcp` turns the Markdown into them with
  `markdownParagraphs` (`packages/ooxml`), so the engine binding needs no parser. Headings get
  Word's "Heading n" style, list items a numbering of their own per list.

The engine's builder runs scripts with only a light sandbox (`common/macros.js` `_safePluginEval`
hides `window` and `document` but not `fetch`), so a free `run_script` tool is not offered; the
fixed tools are what an assistant can do. ZUGFeRD PDFs, the mail merge and formatting come next,
then editing without an open tab (a headless browser on the server).

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
PDF's form fields and e-invoice, and a zip bomb refused as too large. `apps/local/test/mcp.test.ts` uses the local endpoint without a token,
gets the local server's answer for sharing, and is refused for a foreign host or origin. `apps/server/test/mcp-create.test.ts` creates every kind and reads it back: Markdown to .docx and back,
a built-in and an own template, a sheet with appended rows as version 2, a presentation, an
e-invoice read back with `readInvoiceXml`, small uploads. The readers and writers have their own tests
in `packages/ooxml` and `packages/mcp`; `packages/mcp/test/confirm.test.ts` connects a client that
can be asked in memory: sharing and a link after a yes, nothing after a no, and without the question
for a client that cannot be asked. `mcp.test.ts` checks the annotations of `share` and `create_link`. `e2e/mcp.spec.ts` opens what the tools made in the editor,
saves the document through the engine and finds its heading style and table again.
`apps/server/test/mcp-edit.test.ts` stands in for the tab on the hub: the link when nothing is open,
the job and its answer, a refusal, the newest tab of the same person only, a tab that does not
answer, the outline for a read-only token. `packages/editor-core/test/agent.test.ts` covers the
scripts' input and answers. `e2e/mcp-edit.spec.ts` runs it with the engine: a document open in two
tabs, the outline, replacing after consent, inserting, the first tab getting both through the relay,
undo taking the insert back, "Anhalten", and the answer once no tab is open; and cells set in an
open spreadsheet, read back as numbers and a formula's result. `e2e/mcp.spec.ts` creates a token in the settings, calls
the endpoint as a client would, sees the folder it made in the file list, and revokes the token.
