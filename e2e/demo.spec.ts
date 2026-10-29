import { expect, type Page, test } from "@playwright/test";
import { unzipSync } from "fflate";
import {
  collectErrors,
  createDocument,
  createFolder,
  expectEditorReady,
  insertImageFromMenu,
  openDocument,
  row,
} from "./app";
import { E2E_DEMO_URL } from "./demo";
import { documentXml, paragraphTexts } from "./docx";
import { solidPng } from "./png";

/**
 * The demo: the app as static files, its server in the page (apps/web src/demo). Nothing here
 * reaches a Schreibzeug server; the files are the samples, held in memory.
 */
test.use({ baseURL: E2E_DEMO_URL });

const SAMPLES = ["Angebot.docx", "Formular.pdf", "Preise.xlsx", "Projektnotizen.md", "Vortrag.pptx"];

/** The id of the file open in the editor, from the route after the "#": #/edit/<id>. */
const openFileId = (page: Page): string => {
  const id = new URL(page.url()).hash.match(/^#\/edit\/([0-9a-f-]{36})$/)?.[1];
  if (!id) throw new Error(`Not in the editor: ${page.url()}`);
  return id;
};

/** The file as the demo holds it now, read through the page, as the app reads it. */
const heldBytes = async (page: Page, fileId: string): Promise<Uint8Array> =>
  new Uint8Array(
    await page.evaluate(
      async (id) => [...new Uint8Array(await (await fetch(`/api/files/${id}/content`)).arrayBuffer())],
      fileId,
    ),
  );

/** Saves into the page (no request leaves it, so app.ts `save` has nothing to wait for) and reads the first paragraph back. */
const saveAndReadFirstParagraph = async (page: Page, fileId: string): Promise<string | undefined> => {
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  const status = page.getByTestId("editor-status");
  await expect(status).toHaveAttribute("data-modified", "false");
  await expect(status).toHaveText("Gespeichert");
  return paragraphTexts(documentXml(await heldBytes(page, fileId)))[0];
};

test.describe("the demo without a server", () => {
  test("shows the sample files without signing in, and leaves out what needs a server", async ({ page }) => {
    await page.goto("");
    const areas = page.getByRole("navigation", { name: "Bereiche" });
    await expect(areas.getByRole("link")).toHaveText(["Meine Dateien", "Zuletzt", "Einstellungen"]);
    for (const name of SAMPLES) await expect(row(page, name)).toBeVisible();
    await expect(page.getByTestId("demo-notice")).toContainText("nur in diesem Tab");
    await expect(page.getByTestId("user-name")).toHaveText("Anna Berger");
    await expect(page.getByRole("button", { name: "Abmelden" })).toHaveCount(0);
    await expect(row(page, "Angebot.docx").getByRole("button", { name: "Angebot.docx teilen" })).toHaveCount(
      0,
    );
  });

  test("edits the offer and keeps the change in the page, also when it is opened again", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("");
    await openDocument(page, "Angebot.docx", errors);
    const fileId = openFileId(page);

    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 400 } });
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("Neu: ");
    await expect.poll(() => saveAndReadFirstParagraph(page, fileId)).toBe("Neu: Angebot Lagerverwaltung");

    await page.goBack();
    await openDocument(page, "Angebot.docx", errors);
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 400 } });
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("2 ");
    await expect.poll(() => saveAndReadFirstParagraph(page, fileId)).toBe("2 Neu: Angebot Lagerverwaltung");
  });

  test("opens the spreadsheet and the presentation, and makes a new document", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("");
    await openDocument(page, "Preise.xlsx", errors);
    await page.goBack();
    await openDocument(page, "Vortrag.pptx", errors);
    await page.goBack();
    await createDocument(page, "Brief");
    await expectEditorReady(page, errors);
  });

  test("puts an image into a document and saves it into the file", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("");
    await createDocument(page, "Mit Bild");
    await expectEditorReady(page, errors);
    const fileId = openFileId(page);
    const logo = solidPng(80, 40, [20, 90, 200]);
    await insertImageFromMenu(page, logo);
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(page.getByTestId("editor-status")).toHaveAttribute("data-modified", "false");
    await expect
      .poll(async () =>
        Object.keys(unzipSync(await heldBytes(page, fileId))).filter((name) =>
          name.startsWith("word/media/"),
        ),
      )
      .toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test("opens a copy made from the file menu in the demo, where its files are", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("");
    await openDocument(page, "Angebot.docx", errors);
    await page.getByRole("menubar").getByRole("menuitem", { name: "Datei", exact: true }).click();
    // A new tab would start a demo of its own, without the copy: the copy opens where it was made.
    const popup = page.waitForEvent("popup", { timeout: 5_000 }).catch(() => null);
    await page
      .getByRole("menu", { name: "Datei" })
      .getByRole("menuitem", { name: "Kopie erstellen" })
      .click();
    const opened = (await popup) ?? page;
    await expectEditorReady(opened, collectErrors(opened));
    await expect(opened.getByLabel("Dateiname")).toHaveValue("Angebot (Kopie)");
  });

  test("starts over on reload", async ({ page }) => {
    await page.goto("");
    await createFolder(page, "Entwürfe");
    await page.reload();
    await expect(row(page, "Angebot.docx")).toBeVisible();
    await expect(row(page, "Entwürfe")).toHaveCount(0);
  });
});
