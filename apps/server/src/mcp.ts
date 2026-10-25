import { handleMcpRequest } from "@schreibzeug/mcp";
import { type Context, Hono } from "hono";
import { bearerToken } from "./auth/middleware";
import { verifyToken } from "./auth/tokens";
import type { Database } from "./db/database";

/** What the MCP endpoint calls: the API app (app.ts), as the interface would. */
type ApiApp = { request: (path: string, init?: RequestInit) => Response | Promise<Response> };

export type McpDeps = {
  db: Database;
  api: ApiApp;
  /** The address people open the app at; absent: the one this request came to. */
  publicUrl?: string | undefined;
};

/** The request's origin as the client saw it, behind a reverse proxy too. */
const originOf = (c: Context): string => {
  const url = new URL(c.req.url);
  const protocol = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host")?.split(",")[0]?.trim() ?? c.req.header("host") ?? url.host;
  return `${protocol}://${host}`;
};

const unauthorized = (c: Context, message: string) =>
  c.json({ error: { kind: "unauthorized" as const, message } }, 401, {
    "www-authenticate": 'Bearer realm="schreibzeug"',
  });

/**
 * `/mcp`: the MCP server (packages/mcp) for Claude Code and other clients, Streamable HTTP. Only with
 * a personal access token: a session cookie is not enough, so no web page can drive it for the
 * person. Every tool calls the API with that same token, so it may do what the token may and
 * nothing else; a "read" token does not even see the tools that write.
 */
export const mcpRoutes = ({ db, api, publicUrl }: McpDeps) =>
  new Hono().all("/mcp", async (c) => {
    const bearer = bearerToken(c.req.raw.headers);
    if (!bearer) return unauthorized(c, "Bitte verbinde dich mit einem Zugangsschlüssel (Einstellungen).");
    const access = verifyToken(db, bearer);
    if (!access) return unauthorized(c, "Der Zugangsschlüssel gilt nicht (mehr).");
    return handleMcpRequest(c.req.raw, {
      api: async (path, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set("authorization", `Bearer ${bearer}`);
        return api.request(path, { ...init, headers });
      },
      origin: (publicUrl ?? originOf(c)).replace(/\/$/, ""),
      canWrite: access.scope === "write",
    });
  });
