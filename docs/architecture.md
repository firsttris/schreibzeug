# Architecture

Stapel is a single-page app that edits Office files in the browser with the Euro-Office engine, and
one Bun server that stores the files and, later, relays collaboration. The same app runs in the
browser and in the Tauri desktop app.

```
apps/web (React SPA) ──HTTP /api──▶ apps/server (Bun + Hono) ──▶ PostgreSQL (tree, versions)
   │                                         │                └─▶ data/blobs (file bytes)
   └─ iframe: engine (sdkjs + x2t)           └─ WebSocket relay (collaboration, planned)
```

## Workspaces

| Workspace | What it does |
|---|---|
| `packages/editor-core` | The only code that calls `sdkjs`: loads the engine, opens and saves files, turns engine events into a store. Framework-free. See [the engine](engine.md). |
| `packages/files-api` | The contract between server and clients: Zod schemas for names, nodes, versions and errors. |
| `packages/ooxml` | Builds minimal Office Open XML packages: blank documents for the server, test documents for the tests. |
| `apps/server` | The files API on Bun with Hono, Drizzle and PostgreSQL. See [files](files.md). |
| `apps/web` | The React interface. |

## Why a SPA and a Hono API, not TanStack Start

The plan started with TanStack Start, whose server functions call server code like local
functions. They only exist while the Start server runs. The desktop app ships the interface as
static files, without that server, and would still need a plain HTTP API to reach a Stapel server.
So the interface is a plain SPA (Vite, TanStack Router and Query), and the server is a small API
that browser and desktop call the same way.

Hono is a thin layer over `Bun.serve`: routing, middleware, Zod validation, and a typed client
(`hc<AppType>`) that takes its types from the server's routes. That client gives the web app the
same end-to-end types server functions would. The collaboration relay will run in the same process
on Hono's WebSocket upgrade, so access checks for files and editing sessions live in one place.
