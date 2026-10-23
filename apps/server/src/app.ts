import { Hono } from "hono";
import { type FilesDeps, filesRoutes } from "./files/routes";

export type AppDeps = FilesDeps & { log?: (message: string, error: unknown) => void };

/**
 * The whole HTTP surface under /api. Built from its dependencies, so the tests run it against a
 * test database and a temporary blob folder with `app.request()` and no open port.
 */
export const createApp = ({ log = console.error, ...deps }: AppDeps) =>
  new Hono()
    .basePath("/api")
    .get("/health", (c) => c.json({ ok: true }))
    .route("/", filesRoutes(deps))
    .onError((error, c) => {
      log("[api]", error);
      return c.json({ error: { kind: "internal" as const, message: "Interner Fehler." } }, 500);
    });

/** The route types the web app's `hc` client is built from. */
export type AppType = ReturnType<typeof createApp>;
