import { draftProblems, facturXml, type InvoiceDraft, UNITS, type UnitCode } from "@schreibzeug/einvoice";
import { nodeIdSchema, nodeNameSchema, nodeSchema } from "@schreibzeug/files-api";
import { z } from "zod";
import { failure, json, mapOutcome, withFile } from "../api";
import { asText, presentNode } from "../present";
import { defineTool } from "../tool";

/*
 * An e-invoice as Factur-X XML (CII, EN 16931), from the invoice's data. The amounts are given as a
 * person states them (euros, percent) and kept as integers (cents, basis points, thousandths), as
 * packages/einvoice reckons; draftProblems checks what EN 16931 needs before anything is written.
 * The PDF/A-3 with the XML inside needs the engine (phase 4); the XML alone is what XRechnung and
 * many portals take.
 */

const date = z.iso.date().describe("Datum JJJJ-MM-TT");
const party = z.object({
  name: z.string(),
  street: z.string(),
  postcode: z.string(),
  city: z.string(),
  country: z.string().length(2).default("DE").describe("Ländercode, z. B. DE"),
  vatId: z.string().optional().describe("USt-IdNr."),
  email: z.string().optional(),
});
const unitCodes = Object.keys(UNITS) as [UnitCode, ...UnitCode[]];

const cents = (euros: number) => Math.round(euros * 100);

export const einvoiceXml = defineTool({
  name: "einvoice_xml",
  title: "E-Rechnung (XML)",
  description: `Schreibt eine E-Rechnung als Factur-X-XML (EN 16931, wie ZUGFeRD und XRechnung sie lesen) aus den Rechnungsdaten und legt sie als .xml-Datei ab. Prüft vorher, was EN 16931 verlangt, und nennt, was fehlt. Beträge in Euro (netto je Einheit), Steuersätze in Prozent, Einheiten: ${unitCodes.map((code) => `${code} (${UNITS[code]})`).join(", ")}.`,
  input: {
    name: nodeNameSchema.describe("Der Dateiname; „.xml“ wird ergänzt"),
    parentId: nodeIdSchema.nullable().default(null).describe("Der Zielordner; leer für „Meine Dateien“"),
    number: z.string().describe("Rechnungsnummer"),
    issueDate: date,
    dueDate: date.optional(),
    serviceFrom: date.optional(),
    serviceTo: date.optional(),
    currency: z.string().length(3).default("EUR"),
    seller: party.extend({
      taxNumber: z.string().optional().describe("Steuernummer, wenn keine USt-IdNr."),
      iban: z.string().optional(),
      bic: z.string().optional(),
    }),
    buyer: party,
    buyerReference: z.string().optional().describe("Leitweg-ID oder Bestellnummer des Käufers"),
    lines: z
      .array(
        z.object({
          description: z.string(),
          quantity: z.number(),
          unit: z.enum(unitCodes).default("H87"),
          unitPrice: z.number().describe("Netto je Einheit in Euro"),
          taxRate: z.number().min(0).max(100).default(19).describe("Prozent"),
        }),
      )
      .min(1),
    smallBusiness: z.boolean().default(false).describe("Kleinunternehmer nach § 19 UStG: keine Umsatzsteuer"),
    paymentReference: z.string().optional(),
    note: z.string().optional(),
  },
  writes: true,
  run: async ({ api, origin }, { name, parentId, lines, smallBusiness, ...invoice }) => {
    const draft = {
      ...invoice,
      taxMode: smallBusiness ? "small-business" : "regular",
      lines: lines.map((line) => ({
        description: line.description,
        quantity: Math.round(line.quantity * 1000),
        unit: line.unit,
        unitPrice: cents(line.unitPrice),
        taxRate: Math.round(line.taxRate * 100),
      })),
    } satisfies InvoiceDraft;
    const problems = draftProblems(draft);
    if (problems.length > 0)
      return failure(`Die Rechnung ist noch nicht vollständig:\n- ${problems.join("\n- ")}`);
    const fileName = name.toLowerCase().endsWith(".xml") ? name : `${name}.xml`;
    const xml = new TextEncoder().encode(facturXml(draft));
    return mapOutcome(await json(api("/api/files", withFile(fileName, xml, parentId)), nodeSchema), (node) =>
      asText(presentNode(origin, node)),
    );
  },
});
