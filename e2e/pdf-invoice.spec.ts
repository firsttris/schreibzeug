import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { readEmbeddedInvoice } from "@schreibzeug/einvoice";
import { RECHNUNG_XML } from "../test-files/rechnung";
import { collectErrors, openDocument, openFileId, openOwnFolder, save, storedDocx, upload } from "./app";

const rechnung = join(import.meta.dirname, "../test-files/rechnung.pdf");

test("shows the e-invoice a ZUGFeRD PDF carries, gives its XML and keeps it on saving", async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, rechnung, "rechnung.pdf");
  await openDocument(page, "rechnung.pdf", errors);
  const fileId = openFileId(page);

  const card = page.getByRole("region", { name: "E-Rechnung" });
  await expect(card).toContainText("Rechnung RE-2026-0042 vom 23.10.2026");
  await expect(card).toContainText("E-Rechnung (ZUGFeRD / Factur-X) · factur-x.xml");
  await expect(card).toContainText("Lagertechnik Weber GmbH, 01067 Dresden");
  await expect(card).toContainText("1.125,74 € bis 06.11.2026");
  await expect(card).not.toContainText("DE02 1203");

  await card.getByRole("button", { name: "Details" }).click();
  await expect(card).toContainText("DE02 1203 0000 0000 2020 51");
  await expect(card).toContainText("4 × Barcode-Scanner: 756,00 €");
  await expect(card).toContainText("2 × Einrichtung vor Ort: 190,00 €");

  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "XML herunterladen" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("factur-x.xml");
  expect(await readFile((await file.path()) as string, "utf8")).toBe(RECHNUNG_XML);

  // Saving a change keeps the invoice in the PDF.
  await page
    .getByRole("toolbar", { name: "PDF-Werkzeuge" })
    .getByRole("button", { name: "Seite nach rechts drehen" })
    .click();
  await save(page);
  const stored = await readEmbeddedInvoice(await storedDocx(page, fileId));
  expect(stored).toMatchObject({ filename: "factur-x.xml", xml: RECHNUNG_XML });
  expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);
});

test("shows no card for a PDF without invoice", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, join(import.meta.dirname, "../test-files/formular.pdf"), "formular.pdf");
  await openDocument(page, "formular.pdf", errors);
  await expect(page.getByTestId("pdf-position")).toBeVisible();
  await expect(page.getByRole("region", { name: "E-Rechnung" })).toHaveCount(0);
});
