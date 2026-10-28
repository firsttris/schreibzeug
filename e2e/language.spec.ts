import { expect, type Page, test } from "@playwright/test";
import { credentialsFor, expectEditorReady, openOwnFolder, signUp } from "./app";

/** A page whose browser asks for English (the other specs run in a German one). */
const englishPage = async (browser: import("@playwright/test").Browser): Promise<Page> => {
  const context = await browser.newContext({ locale: "en-US" });
  return context.newPage();
};

test.describe("language", () => {
  test("follows an English browser", async ({ browser }, testInfo) => {
    const page = await englishPage(browser);
    await signUp(page, credentialsFor(testInfo));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
    await page.context().close();
  });

  test("is switched in the settings and stays for the next page", async ({ page }, testInfo) => {
    await openOwnFolder(page, testInfo);
    await page.getByRole("link", { name: "Einstellungen", exact: true }).click();
    await page.getByRole("combobox", { name: "Sprache" }).selectOption("en");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.goto("/");
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox", { name: "Language" }).selectOption("de");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Einstellungen");
  });

  test("opens a document with English menus", async ({ browser }, testInfo) => {
    const page = await englishPage(browser);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await signUp(page, credentialsFor(testInfo));
    await page.goto("/");
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("menuitem", { name: "Document" }).click();
    await page.getByLabel("Document name").fill("Letter");
    await page.getByRole("button", { name: "Create and open", exact: true }).click();
    await expectEditorReady(page, errors);

    const menubar = page.getByRole("menubar");
    await expect(menubar.getByRole("menuitem", { name: "Edit", exact: true })).toBeVisible();
    await menubar.getByRole("menuitem", { name: "Insert", exact: true }).click();
    await expect(
      page.getByRole("menu", { name: "Insert" }).getByRole("menuitem", { name: "Comment" }),
    ).toBeVisible();
    await page.context().close();
  });
});
