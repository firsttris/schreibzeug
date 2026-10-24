import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { collectErrors, createDocument, expectEditorReady, rename, row, save } from "./app";
import { E2E_LOCAL_ROOT, E2E_LOCAL_TOKEN, E2E_LOCAL_URL } from "./local";

test.use({ baseURL: E2E_LOCAL_URL });

/** A folder of the test's own in "Dokumente", opened the way the desktop app opens the window. */
const openOwnFolder = async (page: Page, name: string) => {
  await mkdir(join(E2E_LOCAL_ROOT, name), { recursive: true });
  await page.goto(`/api/local/unlock?token=${E2E_LOCAL_TOKEN}`);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
};

const folderName = (title: string) => title.replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 60);

test.describe("files on this computer", () => {
  test("refuses the app to anyone without the desktop app's key", async ({ page }) => {
    const response = await page.request.get("/api/nodes");
    expect(response.status()).toBe(401);
  });

  test("shows the folder as Dokumente, without sharing, versions or a trash of its own", async ({
    page,
  }, testInfo) => {
    const name = folderName(testInfo.title);
    await writeFile(join(E2E_LOCAL_ROOT, `${name}.txt`), "x");
    await openOwnFolder(page, name);

    const areas = page.getByRole("navigation", { name: "Bereiche" });
    await expect(areas.getByRole("link")).toHaveText(["Dokumente", "Zuletzt"]);
    await expect(page.getByTestId("user-name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Abmelden" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Pfad" })).toContainText(`Dokumente${name}`);

    await page.getByRole("link", { name: "Dokumente", exact: true }).first().click();
    const file = row(page, `${name}.txt`);
    await expect(file).toBeVisible();
    await expect(file.getByRole("button", { name: `${name}.txt teilen` })).toHaveCount(0);
    await expect(file.getByRole("button", { name: `Versionen von ${name}.txt` })).toHaveCount(0);
  });

  test("creates a document in the folder on disk and saves into it", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    const name = folderName(testInfo.title);
    await openOwnFolder(page, name);
    await createDocument(page, "Brief");
    await expectEditorReady(page, errors);
    const path = join(E2E_LOCAL_ROOT, name, "Brief.docx");
    expect(existsSync(path)).toBe(true);

    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
    await page.keyboard.type("Hallo vom Computer");
    await save(page);
    const document = unzipSync(new Uint8Array(await readFile(path)))["word/document.xml"];
    expect(new TextDecoder().decode(document)).toContain("Hallo vom Computer");
  });

  test("renames a file on disk", async ({ page }, testInfo) => {
    const name = folderName(testInfo.title);
    await mkdir(join(E2E_LOCAL_ROOT, name), { recursive: true });
    await writeFile(join(E2E_LOCAL_ROOT, name, "alt.txt"), "x");
    await openOwnFolder(page, name);
    await rename(page, "alt.txt", "neu.txt");
    await expect(row(page, "neu.txt")).toBeVisible();
    expect(existsSync(join(E2E_LOCAL_ROOT, name, "neu.txt"))).toBe(true);
    expect(existsSync(join(E2E_LOCAL_ROOT, name, "alt.txt"))).toBe(false);
  });
});
