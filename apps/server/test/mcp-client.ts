import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createdAccessTokenSchema, type FileNode, nodeSchema } from "@schreibzeug/files-api";
import type { TestServer } from "./harness";

/*
 * The SDK's own MCP client over Streamable HTTP, through the server in memory: its fetch goes to
 * `mcp.request`, as a real one would go over the network.
 */

export const ORIGIN = "https://office.example.org";

export const tokenFor = async (server: TestServer, cookie: string, scope: "read" | "write") => {
  const reply = await server.app.request("/api/tokens", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Claude Code", scope }),
  });
  return createdAccessTokenSchema.parse(await reply.json()).token;
};

export const connect = async (server: TestServer, token: string) => {
  const transport = new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
    fetch: (input, init) =>
      Promise.resolve(server.mcp.request(input instanceof Request ? input : String(input), init)),
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  // The SDK's types assume exactOptionalPropertyTypes off (sessionId?: string on the transport).
  await client.connect(transport as Parameters<Client["connect"]>[0]);
  return client;
};

/** The text a tool answered, and whether it was an error. */
export const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as { type: string; text: string }[];
  return { text: first?.text ?? "", isError: result.isError === true };
};

/** Uploads a file as the interface does. */
export const upload = async (
  server: TestServer,
  cookie: string,
  name: string,
  bytes: Uint8Array,
): Promise<FileNode> => {
  const form = new FormData();
  form.append("file", new File([bytes as Uint8Array<ArrayBuffer>], name));
  const reply = await server.app.request("/api/files", { method: "POST", headers: { cookie }, body: form });
  return nodeSchema.parse(await reply.json());
};
