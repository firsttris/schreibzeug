import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { collectErrors, createDocument, createFile, expectEditorReady, openOwnFolder } from "./app";

/**
 * WCAG 2.2 AA as far as a machine can check it (axe-core): the file list and every editor, in
 * light and dark. The document itself is a canvas; what a screen reader hears of it comes from the
 * engine's screen reader support, tested below. docs/accessibility.md has what a machine cannot judge.
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const violations = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(" ")).join(", ")}`);
};

const EDITORS = [
  ["Dokument", true],
  ["Tabelle", true],
  ["Präsentation", true],
  ["Notiz (Markdown)", false],
] as const;

for (const scheme of ["light", "dark"] as const) {
  test(`file list and editors keep to WCAG 2.2 AA as far as axe checks (${scheme})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    expect(await violations(page), "sign-in").toEqual([]);
    await openOwnFolder(page, testInfo);
    const folder = page.url();
    expect(await violations(page), "folder").toEqual([]);
    for (const [kind, engine] of EDITORS) {
      const errors = collectErrors(page);
      await createFile(page, kind, `Barrierefrei ${kind.replace(/\W.*/, "")}`);
      if (engine) await expectEditorReady(page, errors);
      else await expect(page.getByRole("menubar")).toBeVisible();
      expect(await violations(page), kind).toEqual([]);
      await page.goto(folder);
    }
  });
}

test("the menu bar works with the arrow keys", async ({ page }, testInfo) => {
  await openOwnFolder(page, testInfo);
  const errors = collectErrors(page);
  await createDocument(page, "Tastatur");
  await expectEditorReady(page, errors);
  const bar = page.getByRole("menubar");
  await bar.getByRole("menuitem", { name: "Datei", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(bar.getByRole("menuitem", { name: "Hilfe", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const help = page.getByRole("menu", { name: "Hilfe" });
  await expect(help.getByRole("menuitem", { name: "Tastenkürzel" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(help.getByRole("menuitemcheckbox", { name: /Screenreader/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(bar.getByRole("menuitem", { name: "Hilfe", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(bar.getByRole("menuitem", { name: "Datei", exact: true })).toBeFocused();
});

test("left and right in a menu opened with the keyboard switch to the neighbouring menu", async ({
  page,
}, testInfo) => {
  await openOwnFolder(page, testInfo);
  const errors = collectErrors(page);
  await createDocument(page, "Nachbarmenü");
  await expectEditorReady(page, errors);
  const bar = page.getByRole("menubar");
  await bar.getByRole("menuitem", { name: "Hilfe", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu", { name: "Hilfe" }).getByRole("menuitem").first()).toBeFocused();
  // ARIA menu bar pattern: right in an open menu opens the next one (around to "Datei").
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menu", { name: "Hilfe" })).toHaveCount(0);
  await expect(page.getByRole("menu", { name: "Datei" }).getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("menu", { name: "Hilfe" }).getByRole("menuitem").first()).toBeFocused();
});

test("the screen reader support reads the document out, in German, and is remembered", async ({
  page,
}, testInfo) => {
  await openOwnFolder(page, testInfo);
  const errors = collectErrors(page);
  await createDocument(page, "Vorlesen");
  await expectEditorReady(page, errors);
  const frame = page.frameLocator('[data-testid="engine-frame"]');
  const input = frame.locator("#area_id");
  await expect(input).toHaveAttribute("aria-label", "Vorlesen.docx");
  await expect(input).toHaveAttribute("autocomplete", "off");

  const toggle = async () => {
    await page.getByRole("menubar").getByRole("menuitem", { name: "Hilfe", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: /Screenreader/ }).click();
  };
  const checked = async () => {
    await page.getByRole("menubar").getByRole("menuitem", { name: "Hilfe", exact: true }).click();
    const value = await page
      .getByRole("menuitemcheckbox", { name: /Screenreader/ })
      .getAttribute("aria-checked");
    await page.keyboard.press("Escape");
    return value;
  };
  // Off unless switched on: the engine has not even made its live region.
  await expect(frame.locator("#area_id_screen_reader")).toHaveCount(0);
  await toggle();

  await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
  await page.keyboard.type("Hallo Welt");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  const live = frame.locator("#area_id_screen_reader");
  await expect(live).toHaveAttribute("aria-live", "assertive");
  // Selecting reads the text with the German word for it (apps/web/src/editor/engine-texts.ts).
  await expect(live).toContainText("Hallo Welt");
  await expect(live).toContainText("ausgewählt");

  // Kept for the next document, and Strg+Alt+Z in the document switches it as the menu does.
  await page.reload();
  await expectEditorReady(page, errors);
  expect(await checked()).toBe("true");
  await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
  await page.keyboard.press("Control+Alt+KeyZ");
  await expect.poll(checked).toBe("false");
});

test("F6 leads out of the document to the menus and the toolbar, and back", async ({ page }, testInfo) => {
  await openOwnFolder(page, testInfo);
  const errors = collectErrors(page);
  await createDocument(page, "Ausweg");
  await expectEditorReady(page, errors);
  const input = page.frameLocator('[data-testid="engine-frame"]').locator("#area_id");
  await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
  await page.keyboard.type("Hallo");
  // Tab stays in the document, as a tab; F6 is the way out.
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("F6");
  await expect(page.getByRole("menubar").getByRole("menuitem", { name: "Datei", exact: true })).toBeFocused();
  // The toolbar's stop for Tab: its first button that can be used, "Rückgängig" after typing.
  const undo = page.getByRole("toolbar").getByRole("button", { name: "Rückgängig", exact: true });
  await page.keyboard.press("F6");
  await expect(undo).toBeFocused();
  await page.keyboard.press("F6");
  await expect(input).toBeFocused();
  await page.keyboard.press("Shift+F6");
  await expect(undo).toBeFocused();
  // Back into the document, where typing goes on.
  await page.keyboard.press("F6");
  await page.keyboard.type(" Welt");
  await expect(input).toBeFocused();
});

test("F6 also leads out of a spreadsheet", async ({ page }, testInfo) => {
  await openOwnFolder(page, testInfo);
  const errors = collectErrors(page);
  await createFile(page, "Tabelle", "Ausweg");
  await expectEditorReady(page, errors);
  await page.getByTestId("engine-frame").click({ position: { x: 300, y: 300 } });
  await page.keyboard.press("F6");
  await expect(page.getByRole("menubar").getByRole("menuitem", { name: "Datei", exact: true })).toBeFocused();
});

test("the toolbar is one stop for Tab, with the arrow keys inside", async ({ page }, testInfo) => {
  await openOwnFolder(page, testInfo);
  const errors = collectErrors(page);
  await createDocument(page, "Leiste");
  await expectEditorReady(page, errors);
  const toolbar = page.getByRole("toolbar").first();
  const stops = () =>
    toolbar.locator("button").evaluateAll(
      (buttons) =>
        buttons.filter(
          // A disabled button is no stop for Tab, whatever its tabIndex.
          (button) =>
            !(button as HTMLButtonElement).disabled &&
            (button as HTMLButtonElement).tabIndex === 0 &&
            !button.closest("[data-panel]"),
        ).length,
    );
  // Buttons turn usable once the document is there; the toolbar follows them.
  await expect.poll(stops).toBe(1);
  const bold = toolbar.getByRole("button", { name: "Fett", exact: true });
  await bold.focus();
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Kursiv", exact: true })).toBeFocused();
  await expect.poll(stops).toBe(1);
  // Tab leaves the toolbar from any of its buttons.
  await page.keyboard.press("Tab");
  await expect(toolbar.locator("button:focus")).toHaveCount(0);
});

test("F6 reaches the toolbar after everything typed was undone", async ({ page }, testInfo) => {
  await openOwnFolder(page, testInfo);
  const errors = collectErrors(page);
  await createDocument(page, "Rueckgaengig");
  await expectEditorReady(page, errors);
  await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
  const undo = page.getByRole("toolbar").getByRole("button", { name: "Rückgängig", exact: true });
  await page.keyboard.type("a");
  await expect(undo).toBeEnabled();
  await page.keyboard.press("Control+KeyZ");
  await expect(undo).toBeDisabled();
  await page.keyboard.press("Shift+F6");
  await expect(page.getByRole("toolbar").locator("button:focus")).toHaveCount(1);
});
