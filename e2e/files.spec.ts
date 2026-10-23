import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  collectErrors,
  createDocument,
  createFolder,
  expectEditorReady,
  openOwnFolder,
  rename,
  row,
  upload,
} from "./app";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

test.describe("files", () => {
  test("goes into a folder and back along the path", async ({ page }, testInfo) => {
    const own = await openOwnFolder(page, testInfo);
    await createFolder(page, "Innen");
    await page.getByRole("link", { name: "Innen", exact: true }).click();

    const path = page.getByRole("navigation", { name: "Pfad" });
    await expect(path).toContainText(`Meine Dateien${own}Innen`);
    await expect(page.getByText("Dieser Ordner ist leer.")).toBeVisible();

    await path.getByRole("link", { name: own, exact: true }).click();
    await expect(row(page, "Innen")).toBeVisible();
  });

  test("uploads a file and says why a second one with the same name is refused", async ({
    page,
  }, testInfo) => {
    await openOwnFolder(page, testInfo);
    await upload(page, helloDocx, "hello.docx");
    await expect(row(page, "hello.docx")).toContainText("KB");

    await page.getByTestId("upload-input").setInputFiles(helloDocx);
    await expect(page.getByRole("alert")).toContainText(
      "hello.docx: In diesem Ordner gibt es schon etwas mit diesem Namen.",
    );
  });

  test("creates a blank document and opens it", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    const own = await openOwnFolder(page, testInfo);
    await createDocument(page, "Brief");

    await expectEditorReady(page, errors);
    await expect(page.getByText("Brief.docx")).toBeVisible();

    await page.getByRole("button", { name: "Zurück" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(own);
    await expect(row(page, "Brief.docx")).toBeVisible();
  });

  test("renames, and keeps the name when it is taken", async ({ page }, testInfo) => {
    await openOwnFolder(page, testInfo);
    await createFolder(page, "Alt");
    await createFolder(page, "Belegt");

    await rename(page, "Alt", "Belegt");
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
      "In diesem Ordner gibt es schon etwas mit diesem Namen.",
    );
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();

    await rename(page, "Alt", "Neu");
    await expect(row(page, "Neu")).toBeVisible();
    await expect(row(page, "Alt")).toHaveCount(0);
  });

  test("moves a folder to the trash and brings it back", async ({ page }, testInfo) => {
    const own = await openOwnFolder(page, testInfo);
    await createFolder(page, "Weg damit");

    await page.getByRole("button", { name: "Weg damit in den Papierkorb" }).click();
    await expect(row(page, "Weg damit")).toHaveCount(0);

    await page.getByRole("link", { name: "Papierkorb", exact: true }).click();
    await page.getByRole("button", { name: "Weg damit wiederherstellen" }).click();
    await expect(row(page, "Weg damit")).toHaveCount(0);

    await page.getByRole("link", { name: "Meine Dateien", exact: true }).click();
    await page.getByRole("link", { name: own, exact: true }).click();
    await expect(row(page, "Weg damit")).toBeVisible();
  });

  test("moves a folder into another one through the folder picker", async ({ page }, testInfo) => {
    await openOwnFolder(page, testInfo);
    await createFolder(page, "Ziel");
    await createFolder(page, "Wandert");

    await page.getByRole("button", { name: "Wandert verschieben" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Ordner Wandert öffnen" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Ordner Ziel öffnen" }).click();
    await expect(dialog.getByTestId("move-target")).toHaveText("Ziel");
    await dialog.getByRole("button", { name: "Hierher verschieben" }).click();

    await expect(row(page, "Wandert")).toHaveCount(0);
    await page.getByRole("link", { name: "Ziel", exact: true }).click();
    await expect(row(page, "Wandert")).toBeVisible();
  });

  test("lists the versions of a file and restores an older one", async ({ page }, testInfo) => {
    await openOwnFolder(page, testInfo);
    await upload(page, helloDocx, "hello.docx");
    const fileId = (await row(page, "hello.docx").getByRole("link").getAttribute("href"))?.split("/").at(-1);
    // A second version, as a save from the editor would store it.
    const saved = await page.request.put(`/api/files/${fileId}/content`, {
      data: Buffer.from("zweite Fassung"),
    });
    expect(saved.ok()).toBe(true);
    await page.reload();

    await page.getByRole("button", { name: "Versionen von hello.docx" }).click();
    const versions = page.getByRole("list", { name: "Versionen" });
    await expect(versions.getByRole("listitem")).toHaveCount(2);
    await expect(versions.locator('[data-version="2"]')).toContainText("aktuell");
    await page.getByRole("button", { name: "Version 1 wiederherstellen" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const content = await page.request.get(`/api/files/${fileId}/content`);
    expect(new Uint8Array(await content.body())).toEqual(new Uint8Array(await readFile(helloDocx)));
    await page.getByRole("button", { name: "Versionen von hello.docx" }).click();
    await expect(versions.getByRole("listitem")).toHaveCount(3);
    await expect(versions.locator('[data-version="3"]')).toContainText("aktuell");
  });
});
