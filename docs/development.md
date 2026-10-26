# Development

Requires [Bun](https://bun.sh) 1.4 or newer. Preparing the editing engine runs its font generator,
a Linux x86_64 binary, so the engine is prepared on Linux (CI does it too); the database is a
SQLite file, nothing else needs installing.

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
bun run lint             # Biome
bun run typecheck        # tsc in every workspace
bun run test             # Vitest on Bun: unit and integration tests (SQLite)
bun run test:e2e         # Playwright with the real engine: E2E and format fidelity
bun run build            # the web app
mkdocs build --strict    # this documentation (pip install -r requirements-docs.txt)
```

Without Playwright's own browser download, an installed Chromium can be used:
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome bun run test:e2e`. CI (`.github/workflows/ci.yml`)
runs all of it, the E2E suite in three shards, plus the desktop app's Rust checks and a validation
of the e-invoices against EN 16931 and PDF/A-3. Draft pull requests and changes to Markdown or
`docs/` alone do not start it; "Ready for review" does.

## Releases

A release is a button: **Actions → Bump version → Run workflow**, with `patch`, `minor` or `major`
(or a pre-release: `preminor` gives `v0.2.0-rc.1`, `prerelease` the next candidate, `patch` then
`v0.2.0`). It raises the version in `package.json`, `apps/desktop/package.json` and
`apps/desktop/src-tauri/Cargo.toml` (with `Cargo.lock`), commits "Release vX.Y.Z" on `main`, tags
it and starts `release.yml` on the tag. That workflow skips the checks when `main`'s CI already
passed on the commit before the release commit (so wait for `main`'s CI after a merge, or the
release runs the checks again), builds the desktop app meanwhile, publishes the Docker image
and creates the GitHub release with the installers attached. The shared workflows come from
[firsttris/workflows](https://github.com/firsttris/workflows) (`bump-version.yml`,
`tested-on-main.yml`, `docker-release.yml`).

| Workflow | What it does |
|---|---|
| `bump.yml` | **Actions → Bump version**: the next version, its tag, and the release on it |
| `release.yml` | On a tag `vX.Y.Z`: the checks (unless `main` ran them), the desktop app, the Docker image (`docker/Dockerfile`, amd64) and the GitHub release |
| `desktop.yml` | **Actions → Desktop app** builds the desktop app for Windows, macOS and Linux, unsigned for now; also part of every release |
| `screenshots.yml` | **Actions → Update screenshots** takes the README and documentation pictures and the format-fidelity references |
| `docs.yml` | Publishes this documentation on GitHub Pages when `docs/` changes on `main` |

## Stack

A React SPA with TanStack Router and Query, Tailwind and shadcn-style components (`apps/web`);
Euro-Office `sdkjs` as the editing engine, driven only from `packages/editor-core`; a Bun server
with Hono, Drizzle and SQLite (`apps/server`); Tauri 2 for the desktop app (`apps/desktop`). Why it
is built this way: [Architecture](architecture.md); how the interface talks to the engine:
[The editing engine](engine.md).
