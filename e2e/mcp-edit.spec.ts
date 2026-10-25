import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  collectErrors,
  credentialsFor,
  expectEditorReady,
  openFileId,
  openOwnFolder,
  save,
  signIn,
  storedXml,
  upload,
} from "./app";
import { paragraphTexts } from "./docx";
import { callTool, writeToken } from "./mcp";

/*
 * Editing in the open tab (plan "MCP-Server", phase 4): an MCP client changes a document a person
 * has open; the engine runs the job as one step of the history, the person sees it, can undo it,
 * and it is stored as a new version. A second editor on the same document gets it through the relay.
 */

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

test("an MCP client edits the open document, visibly, undoably, saved and shared", async ({
  page,
  browser,
}, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, helloDocx, "hello.docx");
  await page.getByRole("link", { name: "hello.docx", exact: true }).click();
  await expectEditorReady(page, errors);
  const fileId = openFileId(page);
  const token = await writeToken(page.request);

  // A second tab of the same person, opened later: jobs go to the newest one.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const second = await context.newPage();
  await signIn(second, credentialsFor(testInfo));
  const secondErrors = collectErrors(second);
  await second.goto(page.url());
  await expectEditorReady(second, secondErrors);

  const outline = await callTool(page.request, token, "outline", { id: fileId });
  expect(outline.content[0]?.text).toBe("1. Hallo Schreibzeug\n2. Zweiter Absatz mit kursivem Text.");

  // The first change asks the person once.
  const replacing = callTool(page.request, token, "replace_text", {
    id: fileId,
    search: "Schreibzeug",
    replace: "Claude",
  });
  await second.getByRole("button", { name: "Erlauben" }).click();
  const replaced = await replacing;
  expect(replaced.isError ?? false, replaced.content[0]?.text).toBe(false);
  expect(replaced.content[0]?.text).toBe("1-mal ersetzt.");
  await expect(second.getByRole("region", { name: "Claude" })).toContainText(
    "Claude darf dieses Dokument bearbeiten.",
  );
  // Saved as a new version right away.
  expect(paragraphTexts(await storedXml(second, fileId))[0]).toBe("Hallo Claude");

  const inserted = await callTool(page.request, token, "insert_content", {
    id: fileId,
    markdown: "## Neu von Claude\n\n- erster Punkt",
    position: { after: 1 },
  });
  expect(inserted.content[0]?.text).toBe("2 Absätze eingefügt, ab Element 2.");
  expect(paragraphTexts(await storedXml(second, fileId))).toEqual([
    "Hallo Claude",
    "Neu von Claude",
    "erster Punkt",
    "Zweiter Absatz mit kursivem Text.",
  ]);

  // The first tab got the changes through the relay.
  await expect
    .poll(
      async () => {
        await save(page);
        return paragraphTexts(await storedXml(page, fileId)).join("|");
      },
      { timeout: 30_000, intervals: [1_000] },
    )
    .toContain("Hallo Claude|Neu von Claude");

  // Undo takes the insert back in one step.
  await second.bringToFront();
  await second.getByRole("button", { name: "Rückgängig" }).click();
  await save(second);
  expect(paragraphTexts(await storedXml(second, fileId))).toEqual([
    "Hallo Claude",
    "Zweiter Absatz mit kursivem Text.",
  ]);

  // Stopped, the tab refuses further jobs.
  await second.getByRole("button", { name: "Anhalten" }).click();
  const stopped = await callTool(page.request, token, "replace_text", {
    id: fileId,
    search: "Claude",
    replace: "X",
  });
  expect(stopped.isError).toBe(true);
  expect(stopped.content[0]?.text).toBe("Die Person hat Claude in diesem Dokument angehalten.");

  // Without an open tab the answer says to open it.
  await context.close();
  await page.goto("/");
  const closed = await callTool(page.request, token, "outline", { id: fileId });
  expect(closed.content[0]?.text).toContain("in keinem Tab geöffnet");
  expect([...errors, ...secondErrors].filter((line) => line.includes("[engine]"))).toEqual([]);
});

test("an MCP client fills cells of an open spreadsheet", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, join(import.meta.dirname, "../test-files/preise.xlsx"), "preise.xlsx");
  await page.getByRole("link", { name: "preise.xlsx", exact: true }).click();
  await expectEditorReady(page, errors);
  const fileId = openFileId(page);
  const token = await writeToken(page.request);

  const outline = await callTool(page.request, token, "outline", { id: fileId });
  expect(outline.content[0]?.text).toContain("Blatt „Preise“ (aktiv)");

  const setting = callTool(page.request, token, "set_cells", {
    id: fileId,
    sheet: "Notizen",
    range: "A3",
    values: [
      ["Rabatt", 0.05],
      ["Summe", "=1+2"],
    ],
  });
  await page.getByRole("button", { name: "Erlauben" }).click();
  const set = await setting;
  expect(set.content[0]?.text).toBe("A3:B4 auf Blatt „Notizen“ gesetzt.");

  const read = await callTool(page.request, token, "read_sheet", { id: fileId, sheet: "Notizen" });
  expect(read.content[0]?.text).toContain("| 3 | Rabatt | 0,05 |");
  expect(read.content[0]?.text).toContain("| 4 | Summe | 3 |");
});
