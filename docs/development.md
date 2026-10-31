# Development

Requires [Bun](https://bun.sh) 1.4 or newer and Linux x86_64. Preparing the editing engine
(`engine/scripts/prepare.ts`) downloads the pinned Euro-Office release, about 630 MB, unpacks it with
`ar`, `tar -xJ` and `unzip` (on Debian and Ubuntu: `binutils`, `xz-utils`, `unzip`) and runs its
font generator, a Linux x86_64 binary. `bun run dev` runs that step first, so on macOS or Windows
work in a Linux VM or container. The database is a SQLite file; nothing else needs installing.

```bash
git clone https://github.com/firsttris/schreibzeug && cd schreibzeug
bun install
bun run dev              # http://localhost:5173, with the API on http://localhost:3000
```

`bun run dev` prepares the engine first (`bun run engine:prepare`: downloads the pinned Euro-Office
release and generates its fonts; a no-op once it is up to date), then starts the server (data:
`SCHREIBZEUG_DATA_DIR`) and the web app together. `bun run server` starts the server alone. The
Vite server forwards `/api` (WebSockets included) and `/mcp` to the API server.

## Checks

```bash
bun run engine:prepare   # once, and after a change in engine/: build and E2E need the engine
bunx playwright install chromium   # once: Playwright's browser for the E2E tests
bun run lint             # Biome
bun run typecheck        # tsc in every workspace
bun run i18n:check       # every interface text in German and English
bun run test             # Vitest on Bun: unit and integration tests (SQLite)
bun run test:e2e         # Playwright with the real engine: E2E and format fidelity
bun run build            # the web app
mkdocs build --strict    # this documentation (pip install -r requirements-docs.txt)
```

`bun run build` and the E2E tests do not prepare the engine themselves, and the build quietly leaves
it out when `engine/dist` is missing (`apps/web/engine-plugin.ts`): the app then builds, but opens
no document. Without Playwright's own browser download, an installed Chromium can be used:
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome bun run test:e2e`. CI (`.github/workflows/ci.yml`)
runs all of it, the E2E suite in three shards, plus the desktop app's Rust checks and a validation
of the e-invoices against EN 16931 and PDF/A-3. Draft pull requests and changes to Markdown or
`docs/` alone do not start it; "Ready for review" does.

All scripts of the root `package.json`:

| Script | What it does |
|---|---|
| `dev` | Prepares the engine, then the server and the web app's dev server together |
| `server` | The server alone, restarting on changes |
| `engine:prepare` | The engine in `engine/dist` (`--force` to prepare it again) |
| `build` | The web app in `apps/web/dist`, the prepared engine copied in |
| `build:demo` | The [demo](#the-demo) in `apps/web/dist-demo`, for GitHub Pages under `/schreibzeug/demo/` |
| `preview` | The built web app on http://localhost:4173, with `/api` and `/mcp` forwarded like `dev` |
| `typecheck`, `lint` | The interface texts compiled, then `tsc -b`; Biome |
| `i18n`, `i18n:check` | Compiles the interface texts (`apps/web/messages`) with Paraglide; the same, then checks that every text is in German and English and none is left in the code (a step of its own in CI) ([interface texts](architecture.md#interface-texts)) |
| `format` | Biome with `--write`: fixes formatting and what else it can |
| `test`, `test:watch` | Vitest once, including the check that every interface text is in German and English; Vitest watching the files |
| `test:e2e` | Playwright, projects `chromium` (the specs) and `fidelity`; a spec path after it runs only that spec |
| `test:fidelity`, `fidelity:update` | Only the format-fidelity project; the same, taking new reference pictures |
| `screenshots` | The pictures in `docs/screenshots` (`e2e/screenshots.shot.ts`) |
| `test-files` | Writes the test documents in `test-files/` again (`test-files/make.ts`) |

## The demo

The [demo](https://firsttris.github.io/schreibzeug/demo/) is the web app without a server: a build
of its own (`bun run build:demo`, Vite mode `demo`, into `apps/web/dist-demo`) answers the app's
requests to `/api` in the page itself (`apps/web/src/demo/`). The engine runs in the browser anyway;
the server only stores the files and relays the editing sessions, and both run in the page here:

- **The API** is the desktop app's local API (`apps/local` `createLocalApp`, [desktop
  app](desktop.md#files-on-this-computer)) over files held in memory (`src/demo/folder.ts`) instead
  of a folder on disk, with a gate that lets everyone in (the page is the server). So the app sees
  `/api/info` answer `local` and leaves out what only a server has, as on the computer: accounts,
  sharing, versions, the trash, access tokens.
- **The editing session** is the server's own hub (`apps/server/src/collab/hub.ts`) behind the same
  collaboration route. `src/demo/page-socket.ts` is the WebSocket between them: Hono's WebSocket
  helper on the API's side, what `joinSession` (`packages/editor-core/src/collab.ts`) expects of a
  browser WebSocket on the app's side. The editors open, save and autosave exactly as on a server.
- **Images** put into a document are shown from blob URLs (`src/demo/media.ts`): the engine loads
  them from an `<img>` in its frame, which no swapped `fetch` reaches.
- **Start:** `src/main.tsx` imports `src/demo/install.ts` before the first request. It seeds the
  folder with test files (`test-files/angebot.docx`, `preise.xlsx`, `vortrag.pptx`, `notiz.md`,
  `formular.pdf`), swaps `window.fetch` and `window.WebSocket` for those to `/api`, and hands the
  app the blob URLs for images. `import.meta.env.MODE === "demo"` is written out at every check, so
  Vite leaves the demo out of every other build.
- **What it cannot do:** the files are gone when the tab is reloaded; nobody else can join an
  editing session; uploads and new files live in the same memory.
- **Paths:** the routes live after the `#` (`createHashHistory`), as GitHub Pages has no fallback to
  `index.html`; the app, the engine (`engine-plugin.ts` `underBase`) and the text recognition sit
  under Vite's `base`, `/schreibzeug/demo/` (another one with `DEMO_BASE=/ bun run build:demo`). The
  build carries the whole engine, about 350 MB, of which the browser loads what it opens.
- **Publishing:** `docs.yml` builds it on every push to `main` with the engine from CI's cache and
  puts it into the site at `/demo/`.
- **Tests:** `apps/web/src/demo/*.test.ts` (the folder, the API with its WebSocket),
  `e2e/demo.spec.ts` on the dev server in demo mode under the same path (`bunx vite --mode demo`).

## Releases

A release is a button: **Actions → Bump version → Run workflow**, with `patch`, `minor` or `major`
(or a pre-release: `preminor` gives `v0.2.0-rc.1`, `prerelease` the next candidate, `patch` then
`v0.2.0`). It raises the version in `package.json`, `apps/desktop/package.json` and
`apps/desktop/src-tauri/Cargo.toml` (with `Cargo.lock`), commits "Release vX.Y.Z" on `main`, tags
it and starts `release.yml` on the tag. That workflow skips the checks when `main`'s CI already
passed on the commit before the release commit (so wait for `main`'s CI after a merge, or the
release runs the checks again) and builds the Docker image and the desktop app at the same time.
The image is published as soon as the checks pass, a few minutes after the tag, without waiting
for the installers (about a quarter of an hour); the GitHub release with the installers attached
follows once both are there. A failed installer build leaves the image published and makes no
GitHub release. The shared workflows come from
[firsttris/workflows](https://github.com/firsttris/workflows) (`bump-version.yml`,
`tested-on-main.yml`, `docker-release.yml`, `github-release.yml`).

| Workflow | What it does |
|---|---|
| `bump.yml` | **Actions → Bump version**: the next version, its tag, and the release on it |
| `release.yml` | On a tag `vX.Y.Z`: the checks (unless `main` ran them), the desktop app, the Docker image (`docker/Dockerfile`, amd64) and the GitHub release |
| `desktop.yml` | **Actions → Desktop app** builds the desktop app for Windows, macOS and Linux, unsigned for now; also part of every release |
| `screenshots.yml` | **Actions → Update screenshots** takes the README and documentation pictures and the format-fidelity references |
| `engine-pin.yml` | On a Renovate branch that moves the engine or the converter: sets `asset` and `sha256` of the new release in `engine/engine.json` and starts CI on that commit |
| `docs.yml` | Publishes this documentation and the [demo](#the-demo) on GitHub Pages on every push to `main` (a pull request that changes `docs/` only builds the documentation): English at `/`, German at `/de/` (mkdocs-static-i18n). A page is translated by a file next to it (`index.de.md` for `index.md`); without one the German site shows the English text. The start page is the tour in pictures, `overview.md` the overview |

## Dependency updates

[Renovate](https://github.com/apps/renovate) (`.github/renovate.json5`) opens a pull request for each
new release of what Schreibzeug builds on, and lists what is open in the "Dependency Dashboard"
issue. Only these, nothing merges itself:

| Pull request | What it moves |
|---|---|
| Euro-Office engine | `version` of the engine in `engine/engine.json` (Euro-Office Document Server releases; release candidates are left out); `engine-pin.yml` adds `asset` and `sha256`. Like every engine update it passes only when the format-fidelity screenshots stay the same |
| x2t converter | `converter.version` in `engine/engine.json` (cryptpad/onlyoffice-x2t-wasm), the same way |
| Tauri | the Tauri 3 alphas of `apps/desktop` (crates and npm packages together); `scripts/tauri.ts` stops when the CLI patch no longer applies ([Patched Tauri CLI](desktop.md#patched-tauri-cli)) |
| Bun | the Bun images in `docker/Dockerfile`, `BUN_VERSION` in the workflows and `@types/bun` |
| Caddy | the reverse proxy in `deploy/compose.yaml` |
| Mustang-CLI | the validator of the `einvoice` job in `ci.yml` |

The other packages and the actions are not tracked by Renovate.

## Stack

A React SPA with TanStack Router and Query, Tailwind and shadcn-style components (`apps/web`);
Euro-Office `sdkjs` as the editing engine, driven only from `packages/editor-core`; a Bun server
with Hono, Drizzle and SQLite (`apps/server`); Tauri 3 (alpha) for the desktop app (`apps/desktop`). Why it
is built this way: [Architecture](architecture.md); how the interface talks to the engine:
[The editing engine](engine.md).
