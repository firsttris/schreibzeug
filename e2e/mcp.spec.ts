import { type APIRequestContext, expect, test } from "@playwright/test";
import { credentialsFor, row, signUp } from "./app";

/*
 * Claude Code's way in: a personal access token made in the settings, then the MCP endpoint over
 * Streamable HTTP. The client's requests are written out here as JSON-RPC (MCP 2025-06-18), so the
 * test sees what goes over the wire; the server is stateless, so every call stands alone.
 */

const MCP_HEADERS = { accept: "application/json, text/event-stream", "content-type": "application/json" };

let nextId = 1;
const rpc = (request: APIRequestContext, token: string, method: string, params: Record<string, unknown>) =>
  request.post("/mcp", {
    headers: { ...MCP_HEADERS, authorization: `Bearer ${token}` },
    data: { jsonrpc: "2.0", id: nextId++, method, params },
  });

const callTool = async (
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

test("a token from the settings lets an MCP client work as the person, until it is revoked", async ({
  page,
}, testInfo) => {
  await signUp(page, credentialsFor(testInfo));
  await page.goto("/");
  await page.getByRole("link", { name: "Einstellungen" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Einstellungen");

  await page.getByLabel("Name des Schlüssels").fill("Claude Code Test");
  await page.getByLabel("Umfang").selectOption({ label: "Lesen und schreiben" });
  await page.getByRole("button", { name: "Schlüssel anlegen" }).click();
  const token = await page.getByRole("textbox", { name: "Zugangsschlüssel", exact: true }).inputValue();
  expect(token).toMatch(/^sz_/);
  await expect(page.getByRole("textbox", { name: "Befehl für Claude Code" })).toHaveValue(
    `claude mcp add --transport http schreibzeug ${new URL(page.url()).origin}/mcp --header "Authorization: Bearer ${token}"`,
  );
  await page.getByRole("button", { name: "Fertig" }).click();
  // Shown once: afterwards the list names the token, never the token itself.
  await expect(page.locator('[data-token="Claude Code Test"]')).toContainText("noch nie benutzt");
  await expect(page.getByText(token)).toHaveCount(0);

  const tools = await rpc(page.request, token, "tools/list", {});
  expect(
    ((await tools.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name),
  ).toContain("create_folder");
  const created = await callTool(page.request, token, "create_folder", { name: "Von Claude" });
  expect(created.isError ?? false).toBe(false);

  await page.goto("/");
  await expect(row(page, "Von Claude")).toBeVisible();

  await page.goto("/settings");
  await expect(page.locator('[data-token="Claude Code Test"]')).toContainText("zuletzt benutzt");
  await page.getByRole("button", { name: "Claude Code Test widerrufen" }).click();
  await expect(page.getByText("Noch keine Zugangsschlüssel.")).toBeVisible();
  expect((await rpc(page.request, token, "tools/list", {})).status()).toBe(401);
});
