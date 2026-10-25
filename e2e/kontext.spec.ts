import { expect, type Page, test } from "@playwright/test";
import { E2E_EMBEDDED_URL, E2E_KONTEXT_URL, kontextNameOf } from "./kontext";

/**
 * Schreibzeug with Kontext (docs/kontext.md): signing in through Kontext, and the module
 * "Dokumente", where Kontext shows Schreibzeug in a frame (here its stand-in, fake-kontext.ts).
 */

/** Signs in at "Kontext" (its own sign-in form), as each test's person of its own. */
const signInAtKontext = async (page: Page, email: string) => {
  await page.goto(`${E2E_KONTEXT_URL}/login?return=/health`);
  await page.getByLabel("E-Mail bei Kontext").fill(email);
  await page.getByRole("button", { name: "Bei Kontext anmelden" }).click();
};

const emailFor = (title: string) => `${title.replace(/\W+/g, "-").toLowerCase()}-${Date.now()}@weber.test`;

/** The messages Kontext's page got from the frame. */
const received = (page: Page) =>
  page.evaluate(() => (window as unknown as { received: { type: string }[] }).received);

const tell = (page: Page, message: Record<string, unknown>) =>
  page.evaluate((data) => (window as unknown as { tell: (m: unknown) => void }).tell(data), message);

test("signs in with Kontext instead of a password", async ({ page }, testInfo) => {
  await page.goto(`${E2E_EMBEDDED_URL}/login`);
  await page.getByRole("button", { name: "Anmelden mit Kontext" }).click();
  // No session at Kontext yet: its sign-in, then back.
  const email = emailFor(testInfo.title);
  await page.getByLabel("E-Mail bei Kontext").fill(email);
  await page.getByRole("button", { name: "Bei Kontext anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Meine Dateien" })).toBeVisible();
  await expect(page.getByTestId("user-name")).toHaveText(kontextNameOf(email));
});

test("shows itself in Kontext's frame, signed in without a question", async ({ page }, testInfo) => {
  await signInAtKontext(page, emailFor(testInfo.title));
  await page.goto(`${E2E_KONTEXT_URL}/host`);
  const frame = page.frameLocator("iframe[title=Dokumente]");
  await expect(frame.getByRole("heading", { name: "Meine Dateien" })).toBeVisible();
  // Kontext shows the name, the account and the way out; the frame shows the files only.
  await expect(frame.getByText("Schreibzeug", { exact: true })).toHaveCount(0);
  await expect(frame.getByRole("button", { name: "Abmelden" })).toHaveCount(0);
  await expect.poll(async () => (await received(page)).map((message) => message.type)).toContain("ready");
  expect(await received(page)).toContainEqual({ source: "schreibzeug", type: "route", path: "/" });

  // Kontext's theme, its back button and links, its sign-out.
  await tell(page, { type: "theme", theme: "dark" });
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  await tell(page, { type: "navigate", path: "/recent" });
  await expect(frame.getByRole("heading", { name: "Zuletzt" })).toBeVisible();
  await expect
    .poll(() => received(page))
    .toContainEqual({ source: "schreibzeug", type: "route", path: "/recent" });
  await tell(page, { type: "navigate", path: "//evil.example/" });
  await tell(page, { type: "logout" });
  await expect.poll(() => received(page)).toContainEqual({ source: "schreibzeug", type: "signed-out" });
  await expect(frame.getByRole("heading", { name: "Anmelden" })).toBeVisible();
});

test("shows the sign-in page in the frame when nobody is signed in at Kontext", async ({ page }) => {
  await page.goto(`${E2E_KONTEXT_URL}/host`);
  const frame = page.frameLocator("iframe[title=Dokumente]");
  await expect(frame.getByRole("button", { name: "Anmelden mit Kontext" })).toBeVisible();
});

test("ignores the frame parameter outside a frame", async ({ page }, testInfo) => {
  await signInAtKontext(page, emailFor(testInfo.title));
  await page.goto(`${E2E_EMBEDDED_URL}/login`);
  await page.getByRole("button", { name: "Anmelden mit Kontext" }).click();
  await expect(page.getByRole("heading", { name: "Meine Dateien" })).toBeVisible();
  await page.goto(`${E2E_EMBEDDED_URL}/?embedded=kontext`);
  await expect(page.getByText("Schreibzeug", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
});
