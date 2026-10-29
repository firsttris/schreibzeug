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
| `preview` | The built web app on http://localhost:4173, with `/api` and `/mcp` forwarded like `dev` |
| `typecheck`, `lint` | The interface texts compiled, then `tsc -b`; Biome |
| `i18n`, `i18n:check` | Compiles the interface texts (`apps/web/messages`) with Paraglide; the same, then checks that every text is in German and English and none is left in the code (a step of its own in CI) ([interface texts](architecture.md#interface-texts)) |
| `format` | Biome with `--write`: fixes formatting and what else it can |
| `test`, `test:watch` | Vitest once, including the check that every interface text is in German and English; Vitest watching the files |
| `test:e2e` | Playwright, projects `chromium` (the specs) and `fidelity`; a spec path after it runs only that spec |
| `test:fidelity`, `fidelity:update` | Only the format-fidelity project; the same, taking new reference pictures |
| `screenshots` | The pictures in `docs/screenshots` (`e2e/screenshots.shot.ts`) |
| `test-files` | Writes the test documents in `test-files/` again (`test-files/make.ts`) |

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
| `docs.yml` | Publishes this documentation on GitHub Pages when `docs/` changes on `main`: English at `/`, German at `/de/` (mkdocs-static-i18n). A page is translated by a file next to it (`index.de.md` for `index.md`); without one the German site shows the English text. The start page is the tour in pictures, `overview.md` the overview |

## Stack

A React SPA with TanStack Router and Query, Tailwind and shadcn-style components (`apps/web`);
Euro-Office `sdkjs` as the editing engine, driven only from `packages/editor-core`; a Bun server
with Hono, Drizzle and SQLite (`apps/server`); Tauri 3 (alpha) for the desktop app (`apps/desktop`). Why it
is built this way: [Architecture](architecture.md); how the interface talks to the engine:
[The editing engine](engine.md).
