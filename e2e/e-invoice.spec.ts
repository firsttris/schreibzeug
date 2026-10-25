import { copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { readEmbeddedInvoice } from "@schreibzeug/einvoice";
import { decodePDFRawStream, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { collectErrors, openDocument, openOwnFolder, upload } from "./app";

const rechnung = join(import.meta.dirname, "../test-files/rechnung.docx");

const openDialog = async (page: Page) => {
  await page.getByRole("menubar").getByRole("button", { name: "Datei", exact: true }).click();
  await page.getByRole("menuitem", { name: "Als E-Rechnung (ZUGFeRD) …" }).click();
  return page.getByRole("dialog", { name: "Als E-Rechnung (ZUGFeRD)" });
};

const xmpOf = async (pdf: Uint8Array) => {
  const stream = (await PDFDocument.load(pdf)).catalog.lookup(PDFName.of("Metadata"));
  if (!(stream instanceof PDFRawStream)) return "";
  return new TextDecoder().decode(
    stream.dict.has(PDFName.of("Filter")) ? decodePDFRawStream(stream).decode() : stream.contents,
  );
};

test("makes a ZUGFeRD invoice from the filled-in invoice template", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, rechnung, "rechnung.docx");
  await openDocument(page, "rechnung.docx", errors);

  const dialog = await openDialog(page);
  // What the document says, read from it.
  await expect(dialog.getByLabel("Rechnungsnummer")).toHaveValue("RE-2026-0042");
  await expect(dialog.getByLabel("Rechnungsdatum")).toHaveValue("2026-10-23");
  await expect(dialog.getByLabel("Fällig am")).toHaveValue("2026-11-06");
  const seller = dialog.getByRole("group", { name: "Rechnungssteller" });
  const buyer = dialog.getByRole("group", { name: "Empfänger" });
  await expect(seller.getByLabel("Name")).toHaveValue("Lagertechnik Weber GmbH");
  await expect(seller.getByLabel("IBAN")).toHaveValue("DE02 1203 0000 0000 2020 51");
  await expect(buyer.getByLabel("Ort")).toHaveValue("Bühl");
  await expect(dialog.getByLabel("Beschreibung, Position 2")).toHaveValue("Einrichtung vor Ort");
  await expect(dialog.getByLabel("Summen")).toContainText("1.125,74 €");
  // The lines add up to the total the document states: no warning.
  await expect(dialog.getByRole("status")).toHaveCount(0);

  // What the document does not say, or says loosely, completed by hand.
  await dialog.getByLabel("Einheit, Position 2").selectOption("HUR");
  await seller.getByLabel("E-Mail").fill("rechnung@lagertechnik-weber.example");

  const download = page.waitForEvent("download", { timeout: 90_000 });
  await dialog.getByRole("button", { name: "E-Rechnung erstellen" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("rechnung (E-Rechnung).pdf");
  const path = (await file.path()) as string;
  // Kept for CI, which checks it with the Mustang validator (EN 16931 rules and PDF/A-3).
  await copyFile(path, testInfo.outputPath("rechnung.zugferd.pdf"));
  const pdf = new Uint8Array(await readFile(path));

  const embedded = await readEmbeddedInvoice(pdf);
  expect(embedded?.filename).toBe("factur-x.xml");
  expect(embedded?.invoice).toMatchObject({
    ok: true,
    value: {
      number: "RE-2026-0042",
      issueDate: "2026-10-23",
      dueDate: "2026-11-06",
      seller: {
        name: "Lagertechnik Weber GmbH",
        vatId: "DE123456789",
        email: "rechnung@lagertechnik-weber.example",
      },
      buyer: "Musterhandel KG",
      net: 94600,
      tax: 17974,
      gross: 112574,
      lines: [
        { description: "Barcode-Scanner", quantity: 4000, net: 75600 },
        { description: "Einrichtung vor Ort", quantity: 2000, unitCode: "HUR", net: 19000 },
      ],
    },
  });
  const xmp = await xmpOf(pdf);
  expect(xmp).toContain("<pdfaid:part>3</pdfaid:part>");
  expect(xmp).toContain("<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>");

  // The seller's details are remembered in this browser: what the document lacks comes from there.
  const again = await openDialog(page);
  await expect(again.getByRole("group", { name: "Rechnungssteller" }).getByLabel("E-Mail")).toHaveValue(
    "rechnung@lagertechnik-weber.example",
  );
  await again.getByRole("button", { name: "Abbrechen" }).click();
  expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);
});

test("says what a document that is no invoice lacks", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, join(import.meta.dirname, "../test-files/hello.docx"), "hello.docx");
  await openDocument(page, "hello.docx", errors);

  const dialog = await openDialog(page);
  await dialog.getByRole("button", { name: "E-Rechnung erstellen" }).click();
  const problems = dialog.getByRole("alert");
  await expect(problems).toContainText("Die Rechnungsnummer fehlt.");
  await expect(problems).toContainText("Die Rechnung hat keine Positionen.");
  await expect(problems).toContainText("Der Rechnungssteller braucht eine USt-IdNr. oder eine Steuernummer.");
});
