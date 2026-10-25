import { handleMcpRequest } from "@schreibzeug/mcp";
import { Hono } from "hono";
import { COOKIE, refuseForeign } from "./gate";

type LocalApp = { request: (path: string, init?: RequestInit) => Response | Promise<Response> };

/**
 * `/mcp` for the files on this computer (packages/mcp, as on a server: apps/server src/mcp.ts).
 * There is one person and no account, so no access token: like the rest of the local server it
 * answers only requests for 127.0.0.1 and never one a web page sends from elsewhere (gate.ts).
 * Its tools call the local API with the desktop app's own token, so what the local server does not
 * have (sharing, versions, the trash) they answer as not there.
 */
export const localMcpRoutes = ({ api, token }: { api: LocalApp; token: string }) =>
  new Hono().all("/mcp", (c) => {
    const foreign = refuseForeign(c);
    if (foreign) return foreign;
    return handleMcpRequest(c.req.raw, {
      api: async (path, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set("cookie", `${COOKIE}=${token}`);
        return api.request(path, { ...init, headers });
      },
      origin: new URL(c.req.url).origin,
      canWrite: true,
    });
  });
