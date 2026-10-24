import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { checkSignatures, readIdentity, type SigningIdentity, signPdf } from "../src";
import { makeP12 } from "./identity";

const formular = new Uint8Array(readFileSync(join(import.meta.dirname, "../../../test-files/formular.pdf")));
const details = { reason: "Auftrag bestätigt", location: "Bühl", date: new Date("2026-10-24T18:30:00Z") };

let p12: Uint8Array;
let identity: SigningIdentity;

beforeAll(async () => {
  p12 = makeP12("Anna Berger", "geheim");
  const read = await readIdentity(p12, "geheim");
  if (!read.ok) throw new Error(read.error);
  identity = read.value;
}, 60_000);

const signed = async () => {
  const result = await signPdf(formular, identity, details);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("readIdentity", () => {
  it("reads key and certificate and names the signer", () => {
    expect(identity.name).toBe("Anna Berger");
  });

  it("says when the password is wrong", async () => {
    const read = await readIdentity(p12, "falsch");
    expect(read).toEqual({ ok: false, error: "Das Passwort passt nicht zur Zertifikatsdatei." });
  });

  it("says when the file is no certificate", async () => {
    const read = await readIdentity(new Uint8Array([1, 2, 3]), "geheim");
    expect(read.ok).toBe(false);
  });
});

describe("signPdf and checkSignatures", () => {
  it("signs the whole file and the signature holds", async () => {
    const pdf = await signed();
    expect(checkSignatures(pdf)).toEqual([
      {
        signer: "Anna Berger",
        signedAt: details.date,
        reason: "Auftrag bestätigt",
        location: "Bühl",
        issuer: "Anna Berger",
        selfSigned: true,
        intact: true,
        coversWholeFile: true,
        problem: null,
      },
    ]);
  });

  it("keeps the PDF readable, its pages and its form", async () => {
    const pdf = await PDFDocument.load(await signed());
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getForm().getTextField("name")).toBeTruthy();
  });

  it("notices a change to the signed bytes", async () => {
    const pdf = await signed();
    const text = new TextDecoder("latin1").decode(pdf);
    const changed = pdf.slice();
    changed[text.indexOf("Auftragsformular")] = "B".charCodeAt(0);
    const [check] = checkSignatures(changed);
    expect(check?.intact).toBe(false);
    expect(check?.problem).toBe("Das PDF wurde nach dem Signieren verändert.");
  });

  it("notices what was added after signing", async () => {
    const pdf = await signed();
    const appended = new Uint8Array([...pdf, ...new TextEncoder().encode("\n% später\n")]);
    const [check] = checkSignatures(appended);
    expect(check?.intact).toBe(true);
    expect(check?.coversWholeFile).toBe(false);
  });

  it("finds no signature in an unsigned PDF", () => {
    expect(checkSignatures(formular)).toEqual([]);
  });
});
