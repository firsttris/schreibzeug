import { expect, type Page, test } from "@playwright/test";
import { collectErrors, createFile, openFileId, openOwnFolder, row, storedDocx } from "./app";

/** The text editor's content, where typing goes. */
const text = (page: Page) => page.getByTestId("text-editor").locator(".cm-content");

const status = (page: Page) => page.getByTestId("editor-status");

/** Waits until the editor says the text is stored. */
const expectSaved = async (page: Page) => {
  await expect(status(page)).toHaveAttribute("data-modified", "false");
  await expect(status(page)).toHaveText("Gespeichert");
};

const stored = async (page: Page, fileId: string) => new TextDecoder().decode(await storedDocx(page, fileId));

/** Uploads a file with these bytes into the open folder and opens it. */
const uploadAndOpen = async (page: Page, name: string, bytes: Uint8Array) => {
  await page
    .getByTestId("upload-input")
    .setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from(bytes) });
  await expect(row(page, name)).toBeVisible();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(text(page)).toBeVisible();
};

test.describe("text files", () => {
  test("creates a Markdown note, formats it from the toolbar and saves it on its own", async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    await openOwnFolder(page, testInfo);
    await createFile(page, "Notiz (Markdown)", "Projektnotizen");
    await expect(page.getByLabel("Dateiname")).toHaveValue("Projektnotizen");
    await expect(page.getByTestId("text-status")).toContainText("UTF-8");
    const fileId = openFileId(page);

    await text(page).click();
    await page.keyboard.type("Offene Punkte");
    await page.getByLabel("Absatzart").selectOption("h2");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Aufgabenliste" }).click();
    await page.keyboard.type("Scanner testen");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Ein ");
    await page.getByRole("button", { name: "Fett" }).click();
    await page.keyboard.type("wichtiger");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.type(" Punkt");

    // Saved a few seconds after the last change, without the button.
    await expectSaved(page);
    expect(await stored(page, fileId)).toBe(
      "## Offene Punkte\n- [ ] Scanner testen\n- [ ] Ein **wichtiger** Punkt",
    );
    expect(errors).toEqual([]);

    // The live view shows the heading as one, and the task as a checkbox to tick.
    await page.getByLabel("Dateiname").click();
    await expect(text(page).locator(".cm-md-h2")).toHaveText("Offene Punkte");
    await text(page).getByRole("checkbox").first().check();
    await expectSaved(page);
    expect(await stored(page, fileId)).toContain("- [x] Scanner testen");

    await page.reload();
    await expect(text(page)).toContainText("Scanner testen");
  });

  test("shows the source beside a preview in the split view", async ({ page }, testInfo) => {
    await openOwnFolder(page, testInfo);
    await uploadAndOpen(
      page,
      "Plan.md",
      new TextEncoder().encode("# Plan\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n"),
    );
    await page.getByRole("button", { name: "Geteilt" }).click();
    const preview = page.getByTestId("text-preview");
    await expect(preview.getByRole("heading", { level: 1 })).toHaveText("Plan");
    await expect(preview.getByRole("cell", { name: "2" })).toBeVisible();
    await expect(text(page)).toContainText("# Plan");

    await text(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\nNeu dazu");
    await expect(preview).toContainText("Neu dazu");
  });

  test("keeps a Windows text file's encoding and line endings", async ({ page }, testInfo) => {
    await openOwnFolder(page, testInfo);
    // "Grüße\r\naus Köln\r\n" in Windows-1252
    const original = new Uint8Array([
      0x47, 0x72, 0xfc, 0xdf, 0x65, 0x0d, 0x0a, 0x61, 0x75, 0x73, 0x20, 0x4b, 0xf6, 0x6c, 0x6e, 0x0d, 0x0a,
    ]);
    await uploadAndOpen(page, "Gruß.txt", original);
    const fileId = openFileId(page);
    await expect(page.getByTestId("text-status")).toContainText("Windows-1252");
    await expect(page.getByTestId("text-status")).toContainText("CRLF");
    await expect(
      page.getByRole("toolbar", { name: "Formatierung" }).getByRole("button", { name: "Fett" }),
    ).toHaveCount(0);

    await text(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Tschüß");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expectSaved(page);
    expect([...(await storedDocx(page, fileId))]).toEqual([...original, 0x54, 0x73, 0x63, 0x68, 0xfc, 0xdf]);
  });

  test("asks before one window's save overwrites another's, and keeps the text as a copy", async ({
    page,
    context,
  }, testInfo) => {
    await openOwnFolder(page, testInfo);
    await uploadAndOpen(page, "Geteilt.md", new TextEncoder().encode("Anfang\n"));
    const fileId = openFileId(page);
    const other = await context.newPage();
    await other.goto(`/edit/${fileId}`);
    await expect(text(other)).toContainText("Anfang");

    await text(other).click();
    await other.keyboard.press("Control+End");
    await other.keyboard.type("Von nebenan");
    await expectSaved(other);

    await text(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Von hier");
    const dialog = page.getByRole("dialog", { name: "Inzwischen geändert" });
    await expect(dialog).toBeVisible();
    expect(await stored(page, fileId)).toBe("Anfang\nVon nebenan");

    await dialog.getByRole("button", { name: "Als Kopie speichern" }).click();
    await expect(page.getByLabel("Dateiname")).toHaveValue("Geteilt (Kopie)");
    expect(await stored(page, openFileId(page))).toBe("Anfang\nVon hier");

    // Back on the original, a save from here; the other window, still on its version, is asked.
    await page.goto(`/edit/${fileId}`);
    await text(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" und mehr");
    await expectSaved(page);
    await text(other).click();
    await other.keyboard.type("?");
    await expect(other.getByRole("dialog", { name: "Inzwischen geändert" })).toBeVisible();
    await other.getByRole("button", { name: "Neue Fassung laden" }).click();
    await expect(text(other)).toHaveText("AnfangVon nebenan und mehr");
  });
});
