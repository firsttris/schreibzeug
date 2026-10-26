import type { SignatureCheck } from "@schreibzeug/pdf-sign";
import { describe, expect, it } from "vitest";
import { signatureLine } from "../src/signature";

const check = (changes: Partial<SignatureCheck> = {}): SignatureCheck => ({
  signer: "Anna Berger",
  signedAt: new Date("2026-10-24T18:30:00Z"),
  reason: null,
  location: null,
  issuer: "Beispiel-CA",
  selfSigned: false,
  intact: true,
  coversWholeFile: true,
  problem: null,
  ...changes,
});

describe("signatureLine", () => {
  it("names the issuer of a valid signature and that nobody checked the chain", () => {
    expect(signatureLine(check())).toBe(
      "- Anna Berger, 2026-10-24: gültig (Zertifikat von Beispiel-CA, die Vertrauenskette prüft Schreibzeug nicht; der Name ist nicht bestätigt)",
    );
  });

  it("says that nobody vouches for a self-signed certificate", () => {
    expect(signatureLine(check({ selfSigned: true, issuer: "Anna Berger" }))).toBe(
      "- Anna Berger, 2026-10-24: gültig (selbst ausgestelltes Zertifikat, niemand bestätigt den Namen)",
    );
  });

  it("gives the trust also for a signature that does not hold", () => {
    expect(signatureLine(check({ intact: false, problem: "Die Signatur passt nicht zum Zertifikat." }))).toBe(
      "- Anna Berger, 2026-10-24: ungültig (Die Signatur passt nicht zum Zertifikat.) (Zertifikat von Beispiel-CA, die Vertrauenskette prüft Schreibzeug nicht; der Name ist nicht bestätigt)",
    );
  });
});
