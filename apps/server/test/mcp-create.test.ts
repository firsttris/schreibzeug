import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readInvoiceXml } from "@schreibzeug/einvoice";
import { docx, paragraphXml } from "@schreibzeug/ooxml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type TestServer } from "./harness";
import { call, connect, tokenFor, upload } from "./mcp-client";

/** The tools that create files, each checked by reading the result back through MCP or the API. */

let server: TestServer;
let anna: string;
let client: Client;
beforeAll(async () => {
  server = await startServer();
  anna = await server.signUp("Anna");
  client = await connect(server, await tokenFor(server, anna, "write"));
});
afterAll(() => server?.stop());

/** Calls a tool that answers a node, and returns it. */
const created = async (name: string, args: Record<string, unknown>) => {
  const reply = await call(client, name, args);
  expect(reply.isError, reply.text).toBe(false);
  return JSON.parse(reply.text) as { id: string; name: string; version: number; [key: string]: unknown };
};

const readBack = async (tool: string, id: string) => (await call(client, tool, { id })).text;

describe("creating over MCP", () => {
  it("writes a Word document from Markdown", async () => {
    const node = await created("create_document", {
      name: "Angebot Musterhandel",
      markdown: "# Angebot\n\n- Beratung\n- **Schulung**\n\n| Pos. | Preis |\n| --- | --- |\n| 1 | 189 € |",
    });
    expect(node.name).toBe("Angebot Musterhandel.docx");
    expect(await readBack("read_document", node.id)).toBe(
      "# Angebot\n\n- Beratung\n- Schulung\n\n| Pos. | Preis |\n| --- | --- |\n| 1 | 189 € |",
    );
  });

  it("fills a built-in template and says what is left to fill", async () => {
    const node = await created("create_from_template", {
      template: "rechnung",
      name: "Rechnung 2026-042",
      values: { "Nr.": "2026-042", Gibtsnicht: "x" },
    });
    expect(node.notInTemplate).toEqual(["Gibtsnicht"]);
    expect(node.stillToFill).toEqual(expect.arrayContaining(["Datum"]));
    expect(node.stillToFill).not.toContain("Nr.");
    expect(await readBack("read_document", node.id)).toContain("2026-042");
  });

  it("lists and fills the user's own templates from the folder Vorlagen", async () => {
    const folder = await created("create_folder", { name: "Vorlagen" });
    const own = await upload(
      server,
      anna,
      "Mahnung.docx",
      docx([paragraphXml([{ text: "Sehr geehrte(r) [Kunde]," }])]),
    );
    await server.app.request(`/api/nodes/${own.id}`, {
      method: "PATCH",
      headers: { cookie: anna, "content-type": "application/json" },
      body: JSON.stringify({ parentId: folder.id }),
    });
    const templates = JSON.parse((await call(client, "list_templates")).text) as {
      builtIn: { template: string; placeholders: string[] }[];
      own: { template: string; placeholders: string[] }[];
    };
    expect(templates.builtIn.map((entry) => entry.template)).toContain("angebot");
    expect(templates.own).toEqual([{ template: own.id, name: "Mahnung.docx", placeholders: ["Kunde"] }]);
    const node = await created("create_from_template", {
      template: own.id,
      name: "Mahnung Müller",
      values: { Kunde: "Frau Müller" },
    });
    expect(node.name).toBe("Mahnung Müller.docx");
    expect(await readBack("read_document", node.id)).toBe("Sehr geehrte(r) Frau Müller,");
    expect((await call(client, "create_from_template", { template: "gibtsnicht", name: "x" })).isError).toBe(
      true,
    );
  });

  it("writes a spreadsheet and appends rows as a new version", async () => {
    const node = await created("create_sheet", {
      name: "Preise",
      sheets: [
        {
          name: "Artikel",
          rows: [
            [{ value: "Artikel", style: "bold" }, "Preis"],
            ["Stift", { value: 1.5, style: "currency" }],
          ],
        },
      ],
    });
    const appended = await created("append_rows", { id: node.id, rows: [["Block", 2.25]] });
    expect(appended).toMatchObject({ version: 2, sheet: "Artikel", rows: "3–3" });
    expect(await readBack("read_sheet", node.id)).toContain("| 3 | Block | 2,25 |");
    const versions = JSON.parse(await readBack("list_versions", node.id)) as { number: number }[];
    expect(versions.map((version) => version.number)).toEqual([2, 1]);
  });

  it("writes a presentation", async () => {
    const node = await created("create_presentation", {
      name: "Vortrag",
      slides: [
        { layout: "title", title: "Lager", subtitle: "Oktober" },
        { layout: "content", title: "Ziele", bullets: ["Eins", "Zwei"] },
      ],
    });
    expect(await readBack("read_presentation", node.id)).toBe(
      "## Folie 1: Lager\n- Oktober\n\n## Folie 2: Ziele\n- Eins\n- Zwei",
    );
  });

  it("writes an e-invoice as Factur-X XML, after checking it", async () => {
    const seller = {
      name: "Schreibzeug GmbH",
      street: "Hauptstr. 1",
      postcode: "77815",
      city: "Bühl",
      vatId: "DE123456789",
    };
    const buyer = { name: "Musterhandel KG", street: "Marktplatz 2", postcode: "76530", city: "Baden-Baden" };
    const incomplete = await call(client, "einvoice_xml", {
      name: "Rechnung",
      number: "",
      issueDate: "2026-10-25",
      seller,
      buyer,
      lines: [{ description: "Scanner", quantity: 2, unitPrice: 189 }],
    });
    expect(incomplete.isError).toBe(true);
    expect(incomplete.text).toContain("Die Rechnungsnummer fehlt.");

    const node = await created("einvoice_xml", {
      name: "Rechnung 2026-042",
      number: "2026-042",
      issueDate: "2026-10-25",
      dueDate: "2026-11-08",
      seller,
      buyer,
      lines: [{ description: "Scanner", quantity: 2, unitPrice: 189 }],
    });
    expect(node.name).toBe("Rechnung 2026-042.xml");
    const xml = await (
      await server.app.request(`/api/files/${node.id}/content`, { headers: { cookie: anna } })
    ).text();
    const invoice = readInvoiceXml(xml);
    expect(invoice).toMatchObject({
      ok: true,
      value: { number: "2026-042", net: 37800, tax: 7182, gross: 44982 },
    });
  });

  it("stores small files from the conversation, and only small ones", async () => {
    const text = await created("upload_file", { name: "notiz.md", text: "# Hallo" });
    expect(await readBack("read_document", text.id)).toBe("# Hallo");
    const png = await created("upload_file", { name: "punkt.png", base64: "iVBORw0KGgo=" });
    const stored = await server.app.request(`/api/files/${png.id}/content`, { headers: { cookie: anna } });
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect((await call(client, "upload_file", { name: "a.txt" })).isError).toBe(true);
    expect((await call(client, "upload_file", { name: "b.bin", base64: "%%%" })).isError).toBe(true);
  });
});
