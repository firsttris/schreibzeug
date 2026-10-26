import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { docx, MAX_UNZIPPED_BYTES, paragraphXml, xlsx } from "@schreibzeug/ooxml";
import { zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type TestServer } from "./harness";
import { call, connect, tokenFor, upload } from "./mcp-client";

/** The reading tools against the test files (test-files/README.md) and files written here. */

let server: TestServer;
let anna: string;
let client: Client;
beforeAll(async () => {
  server = await startServer();
  anna = await server.signUp("Anna");
  client = await connect(server, await tokenFor(server, anna, "read"));
});
afterAll(() => server?.stop());

const testFile = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, "../../../test-files", name)));
const uploaded = async (name: string, bytes: Uint8Array = testFile(name)) =>
  (await upload(server, anna, name, bytes)).id;

describe("reading over MCP", () => {
  it("reads a Word document as Markdown", async () => {
    const id = await uploaded(
      "Bericht.docx",
      docx([
        paragraphXml([{ text: "Bericht" }], '<w:pStyle w:val="Heading1"/>'),
        paragraphXml(
          [{ text: "Erster Punkt" }],
          '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>',
        ),
        paragraphXml(
          [{ text: "Zweiter Punkt" }],
          '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>',
        ),
        paragraphXml([{ text: "Text | mit Strich" }]),
      ]),
    );
    expect(await call(client, "read_document", { id })).toEqual({
      isError: false,
      text: "# Bericht\n\n- Erster Punkt\n- Zweiter Punkt\n\nText | mit Strich",
    });
    expect((await call(client, "read_document", { id: await uploaded("hello.docx") })).text).toContain(
      "Hallo Schreibzeug",
    );
  });

  it("gives long texts in parts", async () => {
    const long = Array.from({ length: 2000 }, (_, index) => `Zeile ${index} mit Text`).join("\n");
    const id = await uploaded("lang.txt", new TextEncoder().encode(long));
    const first = await call(client, "read_document", { id });
    const next = Number(/offset=(\d+)/.exec(first.text)?.[1]);
    expect(next).toBeGreaterThan(19_000);
    const second = await call(client, "read_document", { id, offset: next });
    expect(second.text.startsWith("Zeile ")).toBe(true);
    expect(second.text).toContain(", Ende.]");
  });

  it("reads a sheet by name and range, and names the sheets", async () => {
    const id = await uploaded("preise.xlsx");
    const all = await call(client, "read_sheet", { id });
    expect(all.text).toContain("Blatt „Preise“ (Blätter: „Preise“, „Notizen“)");
    expect(all.text).toContain("| 2 | Barcode-Scanner | 4 | 189 |");
    const part = await call(client, "read_sheet", { id, sheet: "Preise", range: "A2:B3" });
    expect(part.text).toContain(
      "|  | A | B |\n| --- | --- | --- |\n| 2 | Barcode-Scanner | 4 |\n| 3 | Etikettendrucker | 2 |",
    );
    expect(await call(client, "read_sheet", { id, sheet: "Gibt es nicht" })).toEqual({
      isError: true,
      text: "Ein Blatt „Gibt es nicht“ gibt es nicht. Blätter: „Preise“, „Notizen“.",
    });
    const numbers = await uploaded(
      "zahlen.xlsx",
      xlsx([{ name: "Z", rows: [[1.5, { value: 46318, style: "date" }]] }]),
    );
    expect((await call(client, "read_sheet", { id: numbers })).text).toContain("| 1 | 1,5 | 23.10.2026 |");
  });

  it("reads a presentation slide by slide", async () => {
    const text = (await call(client, "read_presentation", { id: await uploaded("vortrag.pptx") })).text;
    expect(text).toContain("## Folie 1: Lagerverwaltung\n- Projektstart · Oktober 2026");
    expect(text).toContain("## Folie 2: Ziele\n- Bestände in Echtzeit");
  });

  it("reads a PDF's text, its form fields and the e-invoice it carries", async () => {
    const form = await call(client, "read_pdf", { id: await uploaded("formular.pdf") });
    expect(form.text).toContain("Auftragsformular");
    expect(form.text).toContain("## Formularfelder\n\n- name: (leer)");
    const invoice = await call(client, "read_pdf", { id: await uploaded("rechnung.pdf"), pages: "1" });
    expect(invoice.text).toContain("## E-Rechnung (factur-x.xml)");
    expect((await call(client, "read_pdf", { id: await uploaded("anhang.pdf"), pages: "x" })).isError).toBe(
      true,
    );
  });

  it("refuses an archive that claims more than it may inflate to, without inflating it", async () => {
    // A small .docx whose central directory declares a part of 4 GiB: a zip bomb's signature.
    const bomb = zipSync({ "word/document.xml": new Uint8Array(1024) });
    const view = new DataView(bomb.buffer);
    const header = bomb.findLastIndex(
      (_, at) => at + 4 <= bomb.length && view.getUint32(at, true) === 0x02014b50,
    );
    view.setUint32(header + 24, 0xfffffff0, true);
    const id = await uploaded("bombe.docx", bomb);
    expect(await call(client, "read_document", { id })).toEqual({
      isError: true,
      text: `„bombe.docx“ ist entpackt größer als ${MAX_UNZIPPED_BYTES / 1024 / 1024} MB; das liest dieses Werkzeug nicht. Öffne die Datei in Schreibzeug.`,
    });
  });

  it("says which tool reads a file of another kind", async () => {
    const id = await uploaded("vortrag2.pptx", testFile("vortrag.pptx"));
    expect(await call(client, "read_document", { id })).toEqual({
      isError: true,
      text: "„vortrag2.pptx“ liest read_presentation.",
    });
  });
});
