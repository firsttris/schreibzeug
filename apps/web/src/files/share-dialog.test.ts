import { describe, expect, it } from "vitest";
import { detailOf } from "./share-dialog";

const entry = { userId: "u1", name: "Ben", email: "ben@example.org", role: "view" as const };

describe("detailOf", () => {
  it("shows the address, marks one nobody confirmed, and says when the account is still missing", () => {
    expect(detailOf(entry)).toBe("ben@example.org");
    expect(detailOf({ ...entry, unverified: true })).toBe("ben@example.org · Adresse nicht bestätigt");
    expect(detailOf({ ...entry, pending: true })).toBe(
      "Noch ohne Konto: gilt ab der ersten Anmeldung über Kontext",
    );
  });
});
