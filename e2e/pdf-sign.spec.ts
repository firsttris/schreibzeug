import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { checkSignatures } from "@schreibzeug/pdf-sign";
import { makeP12 } from "@schreibzeug/pdf-sign/testing";
import { collectErrors, openDocument, openFileId, openOwnFolder, storedDocx, upload } from "./app";

const formular = join(import.meta.dirname, "../test-files/formular.pdf");

test("signs a PDF with a certificate, shows the signature checked and warns before it breaks", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const certificate = testInfo.outputPath("anna.p12");
  writeFileSync(certificate, makeP12("Anna Berger", "geheim"));

  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, formular, "formular.pdf");
  await openDocument(page, "formular.pdf", errors);
  const fileId = openFileId(page);
  await expect(page.getByTestId("signature-notice")).toHaveCount(0);

  await page.getByRole("menubar").getByRole("button", { name: "Kommentieren", exact: true }).click();
  await page.getByRole("menuitem", { name: "Digital signieren …" }).click();
  const dialog = page.getByRole("dialog", { name: "Digital signieren" });
  await dialog.getByLabel("Zertifikat (.p12 oder .pfx)").setInputFiles(certificate);
  await dialog.getByLabel("Passwort des Zertifikats").fill("falsch");
  await dialog.getByLabel("Grund").fill("Auftrag bestätigt");
  await dialog.getByRole("button", { name: "Signieren" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Das Passwort passt nicht zur Zertifikatsdatei.");

  await dialog.getByLabel("Passwort des Zertifikats").fill("geheim");
  await dialog.getByRole("button", { name: "Signieren" }).click();
  await expect(dialog).toHaveCount(0);

  // The signed version opens in place of the old one, with its signature checked.
  const notice = page.getByTestId("signature-notice");
  await expect(notice).toContainText("Digital signiert von Anna Berger", { timeout: 60_000 });
  await expect(notice).toContainText("Grund: Auftrag bestätigt");
  await expect(notice).toContainText("Signatur gültig (selbst ausgestelltes Zertifikat");

  const [check] = checkSignatures(await storedDocx(page, fileId));
  expect(check).toMatchObject({ signer: "Anna Berger", intact: true, coversWholeFile: true });

  // Changing the signed PDF says what saving it would do.
  await page
    .getByRole("toolbar", { name: "PDF-Werkzeuge" })
    .getByRole("button", { name: "Seite nach rechts drehen" })
    .click();
  await expect(notice).toContainText("Beim Speichern wird die Signatur ungültig.");
  expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);
});
