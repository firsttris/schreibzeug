/**
 * Format fidelity: every document in test-files/fidelity opens as its reference picture, and
 * looks the same again after Stapel saved it and opened the saved file. The references are taken in
 * CI (Actions → Update screenshots, `bun run fidelity:update`) in the Playwright image, so the
 * browser and fonts match; an engine update passes only when they stay the same.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { collectErrors, expectEditorReady, openDocument, openOwnFolder, save, upload } from "./app";

const folder = join(import.meta.dirname, "../test-files/fidelity");
const documents = readdirSync(folder).filter((name) => /\.(docx|xlsx|pptx)$/.test(name));

/** The first screen of the document, with the blinking cursor hidden (fidelity.css). */
const expectPicture = (page: Page, name: string) =>
  expect(page.getByTestId("engine-frame")).toHaveScreenshot(`${name}.png`, {
    stylePath: join(import.meta.dirname, "fidelity.css"),
    timeout: 30_000,
  });

for (const name of documents) {
  test(name, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openOwnFolder(page, testInfo);
    await upload(page, join(folder, name), name);
    await openDocument(page, name, errors);
    await expectPicture(page, name);

    // Taking the references (--update-snapshots) records only how a file opens; the round trip is
    // compared against that reference in every normal run.
    if (testInfo.config.updateSnapshots !== "none" && testInfo.config.updateSnapshots !== "missing") return;

    // Save without a change, so the file goes through the engine and x2t once, then open it again.
    if (name.endsWith(".docx")) await page.getByRole("button", { name: "Alles auswählen" }).click();
    await save(page);
    await page.reload();
    await expectEditorReady(page, errors);
    await expectPicture(page, name);
  });
}
