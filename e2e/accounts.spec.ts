import { expect, test } from "@playwright/test";
import { credentialsFor } from "./app";

test("signs up through the form, signs out and back in", async ({ page }, testInfo) => {
  const { email, password } = credentialsFor(testInfo);

  await page.goto("/recent");
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  await page.getByLabel("Name").fill("Clara Fuchs");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  // Back where the person wanted to go, with their name in the navigation.
  await expect(page).toHaveURL(/\/recent$/);
  await expect(page.getByTestId("user-name")).toHaveText("Clara Fuchs");

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill("falsches-passwort");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("E-Mail oder Passwort stimmen nicht.");

  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Meine Dateien");
});

test("someone else's file is not found", async ({ page, browser }, testInfo) => {
  const anna = credentialsFor(testInfo);
  await page.request.post("/api/auth/sign-up/email", { data: anna });
  const folder = await page.request.post("/api/folders", { data: { name: "Privat", parentId: null } });
  const { id } = (await folder.json()) as { id: string };

  const other = await browser.newContext();
  const ben = await other.newPage();
  const signUp = await ben.request.post("/api/auth/sign-up/email", {
    data: { ...anna, name: "Ben", email: `ben-${anna.email}` },
  });
  expect(signUp.ok()).toBe(true);
  await ben.goto(`/folders/${id}`);
  await expect(ben.getByText("existiert nicht")).toBeVisible();
  await other.close();
});
