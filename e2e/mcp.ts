import { type APIRequestContext, expect } from "@playwright/test";

/*
 * An MCP client as Claude Code is one: JSON-RPC over Streamable HTTP (MCP 2025-06-18) to /mcp,
 * written out so the tests see what goes over the wire; the server is stateless, so every call
 * stands alone.
 */

const MCP_HEADERS = { accept: "application/json, text/event-stream", "content-type": "application/json" };

let nextId = 1;
export const rpc = (
  request: APIRequestContext,
  token: string,
  method: string,
  params: Record<string, unknown>,
) =>
  request.post("/mcp", {
    headers: { ...MCP_HEADERS, authorization: `Bearer ${token}` },
    data: { jsonrpc: "2.0", id: nextId++, method, params },
  });

export const callTool = async (
  request: APIRequestContext,
  token: string,
  name: string,
  args: Record<string, unknown>,
) => {
  const reply = await rpc(request, token, "tools/call", { name, arguments: args });
  expect(reply.ok(), await reply.text()).toBe(true);
  const body = (await reply.json()) as { result: { content: { text: string }[]; isError?: boolean } };
  return body.result;
};

/** A token made through the API, for the tests that are not about the settings page. */
export const writeToken = async (request: APIRequestContext) => {
  const reply = await request.post("/api/tokens", { data: { name: "E2E", scope: "write" } });
  expect(reply.ok(), await reply.text()).toBe(true);
  return ((await reply.json()) as { token: string }).token;
};
