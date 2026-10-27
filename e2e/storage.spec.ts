import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { credentialsFor, openOwnFolder, signUp, upload } from "./app";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

test.describe("storage", () => {
  test("shows the room on the server beside the files and what they take in the settings", async ({
    page,
  }, testInfo) => {
    await openOwnFolder(page, testInfo);
    await upload(page, helloDocx, "hello.docx");

    const meter = page.getByTestId("storage-meter");
    await expect(meter).toContainText(/KB deine Dateien · .+ frei/);
    await meter.click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Einstellungen");
    const section = page.getByRole("region", { name: "Speicher" });
    await expect(section.getByRole("definition").first()).toContainText("KB");
    await expect(section.getByTestId("disk-free")).toContainText(/frei von/);
    await expect(section.getByRole("meter", { name: "Belegter Platz auf dem Server" })).toBeAttached();
  });

  test("warns once the server has hardly any room left", async ({ page }, testInfo) => {
    // A full drive cannot be made in the test; the answer stands in for one.
    await page.route("**/api/storage", (route) =>
      route.fulfill({
        json: {
          usage: { files: 0, versions: 0, trash: 0 },
          disk: { free: 300 * 1024 ** 2, total: 80 * 1024 ** 3 },
          uploadLimit: 512 * 1024 ** 2,
        },
      }),
    );
    await signUp(page, credentialsFor(testInfo));
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("Auf dem Server ist kaum noch Platz: 300 MB frei.");
  });
});
