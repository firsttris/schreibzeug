import { expect, type Page } from "@playwright/test";

/** The engine's frame, where the spreadsheet's name box and formula bar are. */
const frame = (page: Page) => page.frameLocator('[data-testid="engine-frame"]');

/** Selects a cell through the name box, as a person types a reference there. */
export const goTo = async (page: Page, reference: string) => {
  const box = frame(page).locator("#name-box");
  await box.fill(reference);
  await box.press("Enter");
  await expect(box).toHaveValue(reference);
};

/** The formula bar: what the active cell holds. */
export const formulaBar = (page: Page) => frame(page).locator("#ce-cell-content");
