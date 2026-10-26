/**
 * The pictures in docs/screenshots, light and dark: `bun run screenshots`, in CI by hand with
 * Actions → Update screenshots. The server is seeded with the same folders and files every run and
 * their dates are pinned, as is the browser's clock, so an unchanged page gives an unchanged picture.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { collectErrors, expectEditorReady, row, withoutSpellCheck } from "./app";
import { runSql } from "./database";

const NOW = new Date("2026-10-23T16:00:00+02:00");
const out = (name: string) => join(import.meta.dirname, "../docs/screenshots", `${name}.png`);
const testFile = (name: string) => readFile(join(import.meta.dirname, "../test-files", name));

const LETTER = "Angebot Lagerverwaltung.docx";
const PRICES = "Preisliste Hardware.xlsx";
const TALK = "Projektstart Lagerverwaltung.pptx";
const FORM = "Auftragsformular.pdf";
const NOTE = "Projektnotizen Lager.md";

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
  { name: PRICES, file: "preise.xlsx", ago: { hours: 1, minutes: 5 } },
  { name: TALK, file: "vortrag.pptx", ago: { days: 1, hours: 6 } },
  { name: FORM, file: "formular.pdf", ago: { days: 2, hours: 2 } },
  { name: NOTE, file: "notiz.md", ago: { hours: 2, minutes: 30 } },
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
    const mimeType =
      {
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        pdf: "application/pdf",
        md: "text/markdown",
      }[name.slice(name.lastIndexOf(".") + 1)] ?? "application/octet-stream";
    expect((await api.post("/api/files", { multipart: { file: { name, mimeType, buffer } } })).ok()).toBe(
      true,
    );
  }
  // The server stamps nodes with the time of the run; the pictures need the same dates every time.
  runSql(
    [...FOLDERS, ...DOCUMENTS].map(({ name, ago }) => {
      const at = before(ago).getTime();
      return {
        sql: "update nodes set created_at = ?, updated_at = ? where name = ?",
        params: [at, at, name],
      };
    }),
  );
};

/** The account the pictures show. */
const ACCOUNT = { name: "Anna Berger", email: "anna.berger@example.org", password: "geheim-genug" };
/** Someone Anna shares a folder with. */
const COLLEAGUE = { name: "Ben Krämer", email: "ben.kraemer@example.org", password: "geheim-genug" };
const SHARED = "Projekte";
const INVITE_TOKEN = "k7Rf2mQ9vXcL4tYh8NpZ3sBw6dGj1aEu";

/** Shares SHARED with the colleague, who gets an account of their own first. */
const shareWithColleague = async (api: APIRequestContext, newContext: () => Promise<APIRequestContext>) => {
  const colleague = await newContext();
  expect((await colleague.post("/api/auth/sign-up/email", { data: COLLEAGUE })).ok()).toBe(true);
  await colleague.dispose();
  const root = (await (await api.get("/api/nodes?parent=root")).json()) as {
    children: { id: string; name: string }[];
  };
  const folder = root.children.find((node) => node.name === SHARED);
  if (!folder) throw new Error(`No folder ${SHARED}.`);
  const shared = await api.put(`/api/nodes/${folder.id}/shares`, {
    data: { email: COLLEAGUE.email, role: "edit" },
  });
  expect(shared.ok()).toBe(true);
  // A link to the same folder, with a token and dates that are the same every run.
  const invite = await api.post(`/api/nodes/${folder.id}/invites`, { data: { role: "view", days: 7 } });
  expect(invite.ok()).toBe(true);
  const created = before({ hours: 2 }).getTime();
  runSql([
    {
      sql: "update invites set token = ?, created_at = ?, expires_at = ?",
      params: [INVITE_TOKEN, created, created + 7 * 24 * 60 * 60 * 1000],
    },
  ]);
};

test.beforeAll(async ({ playwright }, testInfo) => {
  const { baseURL } = testInfo.project.use;
  const newContext = () => playwright.request.newContext(baseURL ? { baseURL } : {});
  const api = await newContext();
  expect((await api.post("/api/auth/sign-up/email", { data: ACCOUNT })).ok()).toBe(true);
  await seed(api);
  await shareWithColleague(api, newContext);
  await api.dispose();
});

// Every picture but the sign-in page shows Anna's files.
test.beforeEach(async ({ page }, testInfo) => {
  await withoutSpellCheck(page);
  // The sign-in and the invitation are what someone without a session sees.
  if (testInfo.title === "login" || testInfo.title === "invitation") return;
  const { email, password } = ACCOUNT;
  expect((await page.request.post("/api/auth/sign-in/email", { data: { email, password } })).ok()).toBe(true);
});

/**
 * Fixes the time in the app's window only. The comment's time comes from Date.now there, but the
 * engine in its frame stops drawing under a frozen clock (page.clock applies to every frame).
 */
const fixAppTime = (page: Page, now: Date) =>
  page.addInitScript((fixed) => {
    if (window !== window.top) return;
    Date.now = () => fixed;
    window.Date = new Proxy(Date, {
      construct: (RealDate, args: [] | [number]) =>
        args.length === 0 ? new RealDate(fixed) : new RealDate(...args),
    });
  }, now.getTime());

const schemes = ["light", "dark"] as const;

const shoot = async (page: Page, name: string, scheme: (typeof schemes)[number]) =>
  page.screenshot({ path: out(`${name}-${scheme}`), animations: "disabled", caret: "hide" });

for (const scheme of schemes) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("login", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await shoot(page, "login", scheme);
    });

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
      await page.getByRole("button", { name: "Neu", exact: true }).click();
      await page.getByRole("menuitem", { name: "Dokument" }).click();
      await expect(page.getByLabel("Name des Dokuments")).toBeFocused();
      await shoot(page, "new-document", scheme);
    });

    test("share", async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await page.goto("/");
      await page.getByRole("button", { name: `${SHARED} teilen` }).click();
      await expect(page.getByRole("dialog").locator(`[data-share="${COLLEAGUE.email}"]`)).toBeVisible();
      await expect(page.getByRole("dialog").locator(`[data-invite="${INVITE_TOKEN}"]`)).toBeVisible();
      await page.getByRole("dialog").getByLabel("E-Mail des Kontos").blur();
      await page.evaluate(() => document.fonts.ready);
      await shoot(page, "share", scheme);
    });

    test("invitation", async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await page.goto(`/invite/${INVITE_TOKEN}`);
      await expect(page.getByTestId("invitation")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await shoot(page, "invitation", scheme);
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

    test("spreadsheet", async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto("/");
      await page.getByRole("link", { name: PRICES, exact: true }).click();
      await expectEditorReady(page, errors);
      // The total, so the formula bar shows a formula.
      const nameBox = page.frameLocator('[data-testid="engine-frame"]').locator("#name-box");
      await nameBox.fill("D5");
      await nameBox.press("Enter");
      await page.waitForTimeout(2_000);
      await shoot(page, "spreadsheet", scheme);
    });

    test("presentation", async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto("/");
      await page.getByRole("link", { name: TALK, exact: true }).click();
      await expectEditorReady(page, errors);
      await page.waitForTimeout(2_000);
      await shoot(page, "presentation", scheme);
    });

    test("pdf", async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto("/");
      await page.getByRole("link", { name: FORM, exact: true }).click();
      await expectEditorReady(page, errors);
      await page.waitForTimeout(2_000);
      // The form filled in: the name field, as e2e/pdf.spec.ts finds it on the fitted page.
      const box = await page.getByTestId("engine-frame").boundingBox();
      if (!box) throw new Error("The engine frame is not visible.");
      const scale = (box.width - 180 - 40 - 14) / 595;
      await page.mouse.click(box.x + 200 + 240 * scale, box.y + 20 + (842 - 716) * scale);
      await page.keyboard.type("Anna Berger");
      await page.keyboard.press("Tab");
      await page.keyboard.type("Bühl");
      await page.mouse.click(box.x + 200 + 300 * scale, box.y + 20 + 400 * scale);
      await page.waitForTimeout(1_000);
      await shoot(page, "pdf", scheme);
    });

    test("text", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: NOTE, exact: true }).click();
      // The cursor in the heading "Offene Punkte": that line shows its marks, the others not.
      const heading = page.getByTestId("text-editor").locator(".cm-md-h2").first();
      await heading.click();
      await page.keyboard.press("End");
      await page.evaluate(() => document.fonts.ready);
      await shoot(page, "text", scheme);
    });

    test("comments", async ({ page }) => {
      const errors = collectErrors(page);
      await fixAppTime(page, NOW);
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
