import { nodeSchema } from "@schreibzeug/files-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type TestServer } from "./harness";
import { call, connect as connectTo, tokenFor as makeToken, ORIGIN } from "./mcp-client";

let server: TestServer;
let anna: string;
beforeAll(async () => {
  server = await startServer();
  anna = await server.signUp("Anna");
});
afterAll(() => server?.stop());

const tokenFor = (cookie: string, scope: "read" | "write") => makeToken(server, cookie, scope);
const connect = (token: string) => connectTo(server, token);

const folder = async (cookie: string, name: string) =>
  nodeSchema.parse(
    await (
      await server.app.request("/api/folders", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name, parentId: null }),
      })
    ).json(),
  );

describe("the MCP endpoint", () => {
  it("refuses a client without a token or with a wrong one", async () => {
    const without = await server.mcp.request("/mcp", { method: "POST", headers: { cookie: anna } });
    expect(without.status).toBe(401);
    expect(without.headers.get("www-authenticate")).toContain("Bearer");
    const wrong = await server.mcp.request("/mcp", {
      method: "POST",
      headers: { authorization: "Bearer sz_nein" },
    });
    expect(wrong.status).toBe(401);
  });

  it("lists its tools; a read-only token sees none that write", async () => {
    const writer = await connect(await tokenFor(anna, "write"));
    const reader = await connect(await tokenFor(anna, "read"));
    const all = (await writer.listTools()).tools;
    const readable = (await reader.listTools()).tools;
    expect(all.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["list_folder", "create_folder", "trash"]),
    );
    expect(readable.map((tool) => tool.name)).toContain("list_folder");
    expect(readable.map((tool) => tool.name)).not.toContain("create_folder");
    expect(readable.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    expect(all.find((tool) => tool.name === "trash")?.annotations?.destructiveHint).toBe(true);
  });

  it("acts as the token's user, with the same checks as the app", async () => {
    const client = await connect(await tokenFor(anna, "write"));
    const created = await call(client, "create_folder", { name: "Angebote" });
    expect(created.isError).toBe(false);
    const { id, link } = JSON.parse(created.text) as { id: string; link: string };
    expect(link).toBe(`${ORIGIN}/folders/${id}`);

    const listing = await call(client, "list_folder", { folder: "root" });
    expect(listing.text).toContain("Angebote");

    const taken = await call(client, "create_folder", { name: "angebote" });
    expect(taken).toEqual({ isError: true, text: "In diesem Ordner gibt es schon etwas mit diesem Namen." });

    const ben = await server.signUp("Ben");
    const bens = await folder(ben, "Privat");
    const foreign = await call(client, "get_file", { id: bens.id });
    expect(foreign.isError).toBe(true);
    expect(foreign.text).toBe("Die Datei oder der Ordner existiert nicht.");
  });

  it("stops answering once the token is revoked", async () => {
    const token = await tokenFor(anna, "read");
    const client = await connect(token);
    expect((await call(client, "list_folder")).isError).toBe(false);
    const [entry] = (await (
      await server.app.request("/api/tokens", { headers: { cookie: anna } })
    ).json()) as { id: string }[];
    await server.app.request(`/api/tokens/${entry?.id}`, { method: "DELETE", headers: { cookie: anna } });
    await expect(call(client, "list_folder")).rejects.toThrow();
  });
});
