import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { documentXml, paragraphTexts, runPropertiesOf } from "./docx";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

const openHello = async (page: Page) => {
  // The engine reports its errors only to the console; keep them for the failure message.
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));

  await page.goto("/");
  await page.getByTestId("open-file").setInputFiles(helloDocx);
  const status = page.getByTestId("editor-status");
  await expect(status).not.toHaveAttribute("data-status", "loading", { timeout: 90_000 });
  if ((await status.getAttribute("data-status")) !== "ready") {
    throw new Error(`The document did not open: ${await status.textContent()}\n${errors.join("\n")}`);
  }
};

const saveAndRead = async (page: Page): Promise<string> => {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Speichern" }).click();
  const file = await (await download).path();
  return documentXml(new Uint8Array(await readFile(file)));
};

const selectAllInDocument = async (page: Page) => {
  const engine = page.frameLocator('[data-testid="engine-frame"]');
  await engine.locator("#editor_sdk").click({ position: { x: 400, y: 200 } });
  await page.keyboard.press("ControlOrMeta+A");
};

test.describe("text document round trip without a document server", () => {
  test("opens a .docx and saves it back with its content", async ({ page }) => {
    await openHello(page);

    const xml = await saveAndRead(page);

    expect(paragraphTexts(xml)).toEqual(["Hallo Stapel", "Zweiter Absatz mit kursivem Text."]);
    expect(runPropertiesOf(xml, "kursivem").join("")).toContain("<w:i");
  });

  test("makes the selection bold and writes it into the .docx", async ({ page }) => {
    await openHello(page);
    await selectAllInDocument(page);

    const bold = page.getByRole("button", { name: "Fett" });
    await bold.click();
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Rückgängig" })).toBeEnabled();

    const xml = await saveAndRead(page);

    expect(runPropertiesOf(xml, "Hallo Stapel").join("")).toContain("<w:b");
  });

  test("undoes a change", async ({ page }) => {
    await openHello(page);
    await selectAllInDocument(page);

    await page.getByRole("button", { name: "Fett" }).click();
    await page.getByRole("button", { name: "Rückgängig" }).click();

    await expect(page.getByRole("button", { name: "Fett" })).toHaveAttribute("aria-pressed", "false");
    const xml = await saveAndRead(page);
    expect(runPropertiesOf(xml, "Hallo Stapel").join("")).not.toContain("<w:b");
  });

  test("shows the font size of the selection", async ({ page }) => {
    await openHello(page);
    await selectAllInDocument(page);

    const size = page.getByTestId("font-size");
    await expect(size).not.toHaveText("–");
    const before = Number(await size.textContent());
    await page.getByRole("button", { name: "Schrift vergrößern" }).click();
    await expect(size).toHaveText(String(before + 1));
  });
});
