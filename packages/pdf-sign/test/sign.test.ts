import { readFileSync } from "node:fs";
import { join } from "node:path";
import forge from "node-forge";
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
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

const signed = async (changes: Partial<typeof details> = {}, who = identity) => {
  const result = await signPdf(formular, who, { ...details, ...changes });
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

/** An entry of the signature dictionary as a PDF reader reads it. */
const signatureEntry = async (pdf: Uint8Array, key: string) => {
  const doc = await PDFDocument.load(pdf);
  const signature = doc.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .find((object) => object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Sig"));
  const value = signature instanceof PDFDict ? signature.lookup(PDFName.of(key)) : undefined;
  return value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : undefined;
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

  it("keeps parentheses and backslashes in the reason and location", async () => {
    const pdf = await signed({ reason: "Punkt 1) erledigt", location: "Pfad C:\\Akten (alt" });
    expect(await signatureEntry(pdf, "Reason")).toBe("Punkt 1) erledigt");
    expect(checkSignatures(pdf)[0]).toMatchObject({
      reason: "Punkt 1) erledigt",
      location: "Pfad C:\\Akten (alt",
      intact: true,
    });
  });

  it("keeps a signer's name and a reason beyond Latin-1", async () => {
    const pdf = await signed({ reason: "Zgoda – Łódź" }, { ...identity, name: "Łukasz Dvořák" });
    expect(await signatureEntry(pdf, "Name")).toBe("Łukasz Dvořák");
    expect(checkSignatures(pdf)[0]?.reason).toBe("Zgoda – Łódź");
  });

  it("reads a signature whose DER ends in a zero byte", async () => {
    const pdf = await signed();
    const text = new TextDecoder("latin1").decode(pdf);
    const [, start = 0, end = 0] = (/\/ByteRange \[0 (\d+) (\d+) \d+\]/.exec(text) ?? []).map(Number);
    const { asn1, util } = forge;
    const der = util.hexToBytes(text.slice(start + 1, end - 1));
    // node-forge takes options here, though its types say a boolean: the zeros after the DER stay.
    const message = asn1.fromDer(der, { parseAllBytes: false } as unknown as boolean);
    const child = (node: forge.asn1.Asn1, index: number) =>
      (node.value as forge.asn1.Asn1[]).at(index) as forge.asn1.Asn1;
    // ContentInfo → [0] SignedData → signerInfos → the SignerInfo. An unsigned attribute after the
    // signature (RFC 2315 9.2) ending in 0x00 leaves it valid, as a signature value ending in 0x00
    // does about once in 256 signatures.
    const signerInfo = child(child(child(child(message, 1), 0), -1), 0);
    const universal = (type: number, value: string | forge.asn1.Asn1[]) =>
      asn1.create(asn1.Class.UNIVERSAL, type, Array.isArray(value), value);
    (signerInfo.value as forge.asn1.Asn1[]).push(
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 1, true, [
        universal(asn1.Type.SEQUENCE, [
          universal(asn1.Type.OID, asn1.oidToDer("1.2.3.4").getBytes()),
          universal(asn1.Type.SET, [universal(asn1.Type.OCTETSTRING, "\0")]),
        ]),
      ]),
    );
    const hex = util.bytesToHex(asn1.toDer(message).getBytes());
    expect(hex.endsWith("00")).toBe(true);
    const changed = pdf.slice();
    changed.set(new TextEncoder().encode(hex.padEnd(end - start - 2, "0")), start + 1);
    expect(checkSignatures(changed)[0]).toMatchObject({ intact: true, problem: null });
  });

  it("finds no signature in an unsigned PDF", () => {
    expect(checkSignatures(formular)).toEqual([]);
  });
});
