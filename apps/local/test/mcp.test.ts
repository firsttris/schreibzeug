import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localMcpRoutes } from "../src/mcp";
import { type Local, startLocal, TOKEN } from "./harness";

let local: Local;
let mcp: ReturnType<typeof localMcpRoutes>;
beforeEach(async () => {
  local = await startLocal();
  mcp = localMcpRoutes({ api: local.app, token: TOKEN });
});
afterEach(() => local.stop());

const connect = async (url = "http://127.0.0.1:4123/mcp") => {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    fetch: (input, init) =>
      Promise.resolve(mcp.request(input instanceof Request ? input : String(input), init)),
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  // The SDK's types assume exactOptionalPropertyTypes off (sessionId?: string on the transport).
  await client.connect(transport as Parameters<Client["connect"]>[0]);
  return client;
};

describe("the MCP endpoint on this computer", () => {
  it("works on the folder without a token, as its one person", async () => {
    const client = await connect();
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toEqual(expect.arrayContaining(["create_folder", "create_document", "read_document"]));
    const created = await client.callTool({ name: "create_folder", arguments: { name: "Von Claude" } });
    expect(created.isError).toBeFalsy();
    expect((await stat(join(local.root, "Von Claude"))).isDirectory()).toBe(true);
  });

  it("says what only a server has", async () => {
    const client = await connect();
    const folder = JSON.parse(
      (
        (await client.callTool({ name: "create_folder", arguments: { name: "Teilen" } })).content as {
          text: string;
        }[]
      )[0]?.text ?? "{}",
    ) as { id: string };
    const shared = await client.callTool({
      name: "share",
      arguments: { id: folder.id, email: "ben@example.org", role: "view" },
    });
    expect(shared.isError).toBe(true);
    expect((shared.content as { text: string }[])[0]?.text).toContain("nur auf einem Schreibzeug-Server");
  });

  it("refuses requests for another host and from web pages elsewhere", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    expect((await mcp.request("http://evil.example/mcp", { method: "POST", headers, body })).status).toBe(
      403,
    );
    expect(
      (
        await mcp.request("http://127.0.0.1/mcp", {
          method: "POST",
          headers: { ...headers, origin: "https://evil.example" },
          body,
        })
      ).status,
    ).toBe(403);
    expect((await mcp.request("http://127.0.0.1/mcp", { method: "POST", headers, body })).status).toBe(200);
  });
});
