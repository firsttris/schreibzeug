import { expect, test } from "@playwright/test";
import { collectErrors, credentialsFor, expectEditorReady, row, save, signUp, storedDocx } from "./app";
import { documentXml, paragraphTexts, styleNameOf } from "./docx";
import { callTool, rpc, writeToken } from "./mcp";

/*
 * Claude Code's way in: a personal access token made in the settings, then the MCP endpoint over
 * Streamable HTTP. The client's requests are written out here as JSON-RPC (MCP 2025-06-18), so the
 * test sees what goes over the wire; the server is stateless, so every call stands alone.
 */

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

test("files made over MCP open in the editor and keep their structure through a save", async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await signUp(page, credentialsFor(testInfo));
  const token = await writeToken(page.request);
  const made = async (tool: string, args: Record<string, unknown>) => {
    const result = await callTool(page.request, token, tool, args);
    expect(result.isError ?? false, result.content[0]?.text).toBe(false);
    return JSON.parse(result.content[0]?.text ?? "{}") as { id: string; link: string };
  };

  const document = await made("create_document", {
    name: "Angebot",
    markdown:
      "# Angebot für Musterhandel\n\n- Beratung\n- Schulung\n\n| Pos. | Preis |\n| --- | --- |\n| 1 | 189 € |",
  });
  await page.goto(new URL(document.link).pathname);
  await expectEditorReady(page, errors);
  await save(page);
  const saved = await storedDocx(page, document.id);
  expect(paragraphTexts(documentXml(saved))).toEqual(
    expect.arrayContaining(["Angebot für Musterhandel", "Beratung", "Schulung", "189 €"]),
  );
  // The engine writes Word's built-in name back as "Heading 1".
  expect(styleNameOf(saved, "Angebot für Musterhandel")?.toLowerCase()).toBe("heading 1");

  for (const [tool, args] of [
    [
      "create_sheet",
      {
        name: "Preise",
        sheets: [
          {
            name: "Preise",
            rows: [
              ["Artikel", "Preis"],
              ["Stift", 1.5],
            ],
          },
        ],
      },
    ],
    ["create_presentation", { name: "Vortrag", slides: [{ layout: "title", title: "Lager" }] }],
    ["create_from_template", { template: "rechnung", name: "Rechnung", values: { "Nr.": "2026-042" } }],
  ] as const) {
    const file = await made(tool, args);
    await page.goto(new URL(file.link).pathname);
    await expectEditorReady(page, errors);
  }
});
