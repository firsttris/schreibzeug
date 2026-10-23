/**
 * The pictures in docs/screenshots, light and dark: `bun run screenshots`, in CI by hand with
 * Actions → Update screenshots. The server is seeded with the same folders and files every run and
 * their dates are pinned, as is the browser's clock, so an unchanged page gives an unchanged picture.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { collectErrors, expectEditorReady, row } from "./app";
import { e2eDatabaseUrl } from "./database";

const NOW = new Date("2026-10-23T16:00:00+02:00");
const out = (name: string) => join(import.meta.dirname, "../docs/screenshots", `${name}.png`);
const testFile = (name: string) => readFile(join(import.meta.dirname, "../test-files", name));

const LETTER = "Angebot Lagerverwaltung.docx";

/** What "Meine Dateien" holds, with how long before NOW each was last changed. */
const FOLDERS = [
  { name: "Angebote 2026", ago: { days: 1, hours: 3 } },
  { name: "Projekte", ago: { days: 6 } },
  { name: "Rechnungen", ago: { days: 30 } },
];
const DOCUMENTS = [
  { name: LETTER, file: "angebot.docx", ago: { minutes: 12 } },
  { name: "Protokoll Kick-off.docx", file: "hello.docx", ago: { hours: 4, minutes: 40 } },
  { name: "Wartungsvertrag Entwurf.docx", file: "hello.docx", ago: { days: 3 } },
];

type Ago = { days?: number; hours?: number; minutes?: number };
const before = ({ days = 0, hours = 0, minutes = 0 }: Ago) =>
  new Date(NOW.getTime() - ((days * 24 + hours) * 60 + minutes) * 60_000);

const seed = async (api: APIRequestContext) => {
  for (const { name } of FOLDERS) {
    expect((await api.post("/api/folders", { data: { parentId: null, name } })).ok()).toBe(true);
  }
  for (const { name, file } of DOCUMENTS) {
    const buffer = await testFile(file);
    const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect((await api.post("/api/files", { multipart: { file: { name, mimeType, buffer } } })).ok()).toBe(
      true,
    );
  }
  // The server stamps nodes with the time of the run; the pictures need the same dates every time.
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  for (const { name, ago } of [...FOLDERS, ...DOCUMENTS]) {
    const at = before(ago);
    await sql`update nodes set created_at = ${at}, updated_at = ${at} where name = ${name}`;
  }
  await sql.end();
};

test.beforeAll(async ({ playwright }, testInfo) => {
  const { baseURL } = testInfo.project.use;
  const api = await playwright.request.newContext(baseURL ? { baseURL } : {});
  await seed(api);
  await api.dispose();
});

const schemes = ["light", "dark"] as const;

const shoot = async (page: Page, name: string, scheme: (typeof schemes)[number]) =>
  page.screenshot({ path: out(`${name}-${scheme}`), animations: "disabled", caret: "hide" });

for (const scheme of schemes) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("files", async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await page.goto("/");
      await expect(row(page, LETTER)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await shoot(page, "files", scheme);
    });

    test("new document", async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await page.goto("/");
      await expect(row(page, LETTER)).toBeVisible();
      await page.getByRole("button", { name: "Neues Dokument" }).click();
      await expect(page.getByLabel("Name des Dokuments")).toBeFocused();
      await shoot(page, "new-document", scheme);
    });

    test("editor", async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto("/");
      await page.getByRole("link", { name: LETTER, exact: true }).click();
      await expectEditorReady(page, errors);
      // The engine draws on a canvas after "ready" and loads its fonts one by one; there is no event
      // for "all pages drawn", so give it a moment.
      await page.waitForTimeout(2_000);
      await shoot(page, "editor", scheme);
    });

    test("comments", async ({ page }) => {
      const errors = collectErrors(page);
      // Fixed before loading: the comment's time comes from Date.now in the app.
      await page.clock.setFixedTime(NOW);
      await page.goto("/");
      await page.getByRole("link", { name: LETTER, exact: true }).click();
      await expectEditorReady(page, errors);
      await page.waitForTimeout(2_000);
      // Selects the word "Lagerverwaltung" in the title, where the editor picture shows it.
      await page.getByTestId("engine-frame").dblclick({ position: { x: 440, y: 212 } });
      await page.getByRole("button", { name: "Kommentar hinzufügen" }).click();
      await page
        .getByRole("textbox", { name: "Kommentar zur Auswahl" })
        .fill("Können wir hier den Namen des Kunden ergänzen?");
      await page.getByRole("button", { name: "Kommentieren", exact: true }).click();
      await expect(page.getByRole("article")).toHaveCount(1);
      await page.waitForTimeout(1_000);
      await shoot(page, "comments", scheme);
    });
  });
}
