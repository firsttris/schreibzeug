# Notes for Claude

## Documentation

The documentation is in `docs/` (<https://firsttris.github.io/stapel/>). Read the pages that touch the
change before starting: `architecture.md` for how the pieces fit, `engine.md` for how the UI talks to
`sdkjs`, `collaboration.md` for the relay protocol. Links in the README and the docs point to the
GitHub Pages site, not to `docs/*.md`.

## Reference implementations

Base details on the sources, not on memory. The engine API is undocumented, so every call into it
must be traceable to one of these. Clone them shallowly (`git clone --depth 1`) into the scratchpad
and name the source file in comments and commit messages where it settles a detail.

- **Euro-Office/sdkjs** — the engine itself: `word/api.js`, `cell/api.js`, `slide/api.js`,
  `common/apiBase.js` (`asc_openDocumentFromBytes`, permissions, load chain), `common/docscoapi.js`
  (co-editing transport).
- **Euro-Office/web-apps** — how a UI drives the engine. The mobile editors
  (`apps/documenteditor/mobile`, `apps/spreadsheeteditor/mobile`, `apps/presentationeditor/mobile`)
  are React and the closest model; the desktop UI (Backbone) is the reference for every toolbar
  button and dialog.
- **Euro-Office/server** — `DocService/sources/DocsCoServer.js`: the message types the relay must
  speak (`auth`, `saveChanges`, `getLock`, `cursor`, …).
- **cryptpad/onlyoffice-editor** and **cryptpad/cryptpad** (`www/common/onlyoffice/inner.js`) — a
  serverless transport, locks and checkpoints without the Document Server.
- **cryptpad/onlyoffice-x2t-wasm** — the converter as WebAssembly.
- **ranuts/document** — `docs/explorations/` records the pitfalls of running the engine without a
  server (fonts, save path, permissions).

## With every change

Update what the change affects, in the same pull request, and only that:

- the tests for what changed (unit, integration, engine, E2E, collaboration, format fidelity);
- the docs in `docs/` that describe it;
- the README when a feature a user sees is added, changed or removed;
- the screenshots after a change to the look: **Actions → Update screenshots → Run workflow**, then
  look at the new pictures.

## Checks

Green before every push, then check CI:

```sh
bun install --frozen-lockfile
bun run typecheck        # tsc --noEmit in every workspace
bun run lint             # biome check
bun run test             # vitest on Bun: unit + integration (SQLite, see docs/files.md)
bun run test:e2e         # playwright: engine, flows, collaboration, format fidelity
bun run build
cargo fmt --check && cargo clippy -- -D warnings && cargo test   # in apps/desktop, when it changed
mkdocs build --strict    # when docs/ or mkdocs.yml changed
```

## Commits

- Work happens directly on `main`; no pull requests. One commit per self-contained change.
- `bun run engine:prepare` once before the first dev server or E2E run (Linux x86_64: it runs the
  engine's font generator). Before every push the checks above are green, and after it the CI run
  on `main` is watched until it is green; a red run is fixed in the next commit right away.
- Never force-push `main`.

## Working rules

- Commands as root (`sudo`, `pkexec`) are run by the user; don't work around that.
- The user's running processes are not stopped; use other ports for tests.
- Language: code, comments, docs and commits in English; the app's interface in
  German first (Paraglide), English later.

## Code style

Technology choices follow `tech-stack.md` in firsttris/workflows. Deviations of this project and why:

- **Bun** is package manager and runtime (allowed by the stack where Bun is the runtime). Node stays
  only inside the Playwright image and, if needed, for the engine build.
- **A SPA and a Hono API instead of TanStack Start.** Server functions only exist while the Start
  server runs; the Tauri app ships the interface as static files and needs a plain HTTP API anyway.
  So `apps/web` is a Vite SPA (TanStack Router and Query) and `apps/server` is Hono on Bun, whose
  typed client (`hc<AppType>`) gives the same end-to-end types. The collaboration relay goes into
  the same server (Hono WebSocket upgrade). Details in `docs/architecture.md`.
- **`sdkjs` is vendored, not rewritten.** It is not React and keeps its own canvas; Tailwind applies
  to the UI around it only.
- **`packages/editor-core` is framework-free TypeScript.** It is the only code that calls `sdkjs`;
  it turns engine events into a store. React lives in `packages/editors` and `apps/*`. This keeps an
  engine update in one place and a later UI framework change out of the engine binding.

Clean Code, written functionally: clear names, small functions that do one thing, dependencies
passed in, no duplication or dead code, comments that say why; the ideas behind SOLID and the
design patterns are welcome as functions, data and closures, but not as classes, inheritance or
class hierarchies.

Functional, not object-oriented: pure functions that take data and return data, side effects at
the edges; function components and hooks, no classes; errors as values. A file does one thing:
split it past ~400 lines, a function past ~80. A refactor changes no behaviour.

## Project specifics

- **Engine version:** `engine/` pins one Euro-Office tag. An engine update is its own pull request
  and passes only when the format-fidelity screenshots stay the same.
- **Files are files:** documents are always saved in their original format (.docx, .xlsx, .pptx);
  no own storage format.
- **Licensing:** the whole repository is AGPL-3.0-only because the UI links `sdkjs`. The About
  dialog links to the running source. No ONLYOFFICE or Euro-Office logos, names or GUI assets
  (CC BY-SA) in the product; icons come from lucide.
- **Test files and fonts:** only files we may redistribute. Fonts under OFL or Apache 2.0; test
  documents written by us or under a free license, with the source noted in `test-files/README.md`.
