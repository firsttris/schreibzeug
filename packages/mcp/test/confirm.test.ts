import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import type { Api } from "../src/api";
import { createMcpServer } from "../src/server";

/*
 * Sharing over a session that keeps its server, where the client can be asked (MCP elicitation):
 * the person, not the model, confirms who gets what. The API is a stand-in that records requests.
 */

const NODE_ID = "0b6f9d0e-8d1c-4c43-9a4e-2f1e8a3c5d7b";
const NOW = "2026-10-26T10:00:00.000Z";
const node = {
  id: NODE_ID,
  parentId: null,
  kind: "file",
  name: "Gehälter.xlsx",
  mime: null,
  size: 10,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
  trashedAt: null,
  role: "owner",
};

const recordingApi = () => {
  const calls: string[] = [];
  const api: Api = (path, init) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const body = path.endsWith("/shares")
      ? [{ userId: "u", name: "Eve", email: "eve@example.org", role: "view" }]
      : path.endsWith("/invites")
        ? { token: "t", role: "view", createdAt: NOW, expiresAt: NOW }
        : node;
    return Promise.resolve(Response.json(body));
  };
  return { api, calls };
};

/** A client that can be asked, answering every question with `action`, and what it was asked. */
const connected = async (api: Api, action: ElicitResult["action"] | null) => {
  const server = createMcpServer({ api, origin: "https://office.example.org", canWrite: true });
  const client = new Client(
    { name: "test", version: "1.0.0" },
    action ? { capabilities: { elicitation: { form: {} } } } : {},
  );
  const asked: string[] = [];
  if (action) {
    client.setRequestHandler(ElicitRequestSchema, (request) => {
      asked.push(request.params.message);
      return { action };
    });
  }
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const [first] = result.content as { text: string }[];
    return { text: first?.text ?? "", isError: result.isError === true };
  };
  return { call, asked };
};

const SHARE = { id: NODE_ID, email: "eve@example.org", role: "view" };

describe("sharing asks the person first", () => {
  it("shares once the person confirms the node, the address and the role", async () => {
    const { api, calls } = recordingApi();
    const { call, asked } = await connected(api, "accept");
    expect((await call("share", SHARE)).isError).toBe(false);
    expect(asked).toEqual([
      "Schreibzeug: die Datei „Gehälter.xlsx“ mit eve@example.org teilen, zum Ansehen?",
    ]);
    expect(calls).toContain(`PUT /api/nodes/${NODE_ID}/shares`);
  });

  it("shares nothing when the person declines or cancels", async () => {
    for (const action of ["decline", "cancel"] as const) {
      const { api, calls } = recordingApi();
      const { call } = await connected(api, action);
      expect(await call("share", SHARE)).toEqual({
        isError: true,
        text: "Du hast das abgelehnt; es wurde nichts freigegeben.",
      });
      const link = await call("create_link", { id: NODE_ID, role: "edit", days: 1 });
      expect(link.isError).toBe(true);
      expect(calls.filter((entry) => !entry.startsWith("GET"))).toEqual([]);
    }
  });

  it("names the link's role and lifetime in the question", async () => {
    const { api } = recordingApi();
    const { call, asked } = await connected(api, "accept");
    expect((await call("create_link", { id: NODE_ID, role: "edit", days: 30 })).isError).toBe(false);
    expect(asked).toEqual([
      "Schreibzeug: einen Link zur Datei „Gehälter.xlsx“ erstellen, 30 Tage gültig? Jeder, der den Link öffnet, bekommt Zugriff zum Bearbeiten.",
    ]);
  });

  it("leaves it to the client's approval when the client cannot be asked", async () => {
    const { api, calls } = recordingApi();
    const { call } = await connected(api, null);
    expect((await call("share", SHARE)).isError).toBe(false);
    expect(calls).toContain(`PUT /api/nodes/${NODE_ID}/shares`);
  });
});
