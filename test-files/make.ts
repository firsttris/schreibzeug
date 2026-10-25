/**
 * Writes the test documents in this folder. They are built from XML here, so their content and
 * license are ours (see README.md). Run: bun run test-files
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { docx, paragraphXml, pptx, type Run, xlsx } from "@schreibzeug/ooxml";
import { pdf } from "./pdf";
import { rechnungDocx, rechnungPdf } from "./rechnung";

/** Run properties (ECMA-376 Part 1, 17.3.2); sizes are in half-points. */
const bold = "<w:b/>";
const size = (points: number) => `<w:sz w:val="${points * 2}"/>`;
const spaced = (after: number) => `<w:spacing w:after="${after * 20}"/>`;

const paragraph = (text: string, properties = spaced(8), run?: string) =>
  paragraphXml([{ text, ...(run ? { properties: run } : {}) } satisfies Run], properties);

/** A merge field as Word writes it: a complex field (ECMA-376 Part 1, 17.16.18) showing «Name». */
const mergeField = (name: string) =>
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  `<w:r><w:instrText xml:space="preserve"> MERGEFIELD ${name} \\* MERGEFORMAT </w:instrText></w:r>` +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  `<w:r><w:t>«${name}»</w:t></w:r>` +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>';

/** A paragraph of merge fields and the text between them, e.g. ["PLZ", " ", "Ort"]. */
const mergeLine = (parts: string[]) =>
  `<w:p><w:pPr>${spaced(0)}</w:pPr>${parts
    .map((part, index) =>
      index % 2 === 0 ? mergeField(part) : `<w:r><w:t xml:space="preserve">${part}</w:t></w:r>`,
    )
    .join("")}</w:p>`;

const files: Record<string, Uint8Array> = {
  "hello.docx": docx([
    paragraphXml([{ text: "Hallo Schreibzeug" }]),
    paragraphXml([{ text: "Zweiter Absatz mit kursivem Text.", properties: "<w:i/>" }]),
  ]),
  // A short business letter with a title, headings, emphasis and justified text: the document the
  // screenshots show in the editor.
  "angebot.docx": docx([
    paragraph("Angebot Lagerverwaltung", spaced(4), `${bold}${size(20)}`),
    paragraph("Angebotsnummer 2026-041 · 23. Oktober 2026", spaced(18), size(10)),
    paragraph("Ausgangslage", spaced(6), `${bold}${size(13)}`),
    paragraph(
      "Die Lagerverwaltung erfasst heute Wareneingänge, Lagerplätze und Auslieferungen in mehreren Tabellen. Ziel ist eine Anwendung, in der alle Mitarbeitenden denselben Stand sehen und Bestände ohne Nacharbeit stimmen.",
      `<w:jc w:val="both"/>${spaced(10)}`,
    ),
    paragraph("Leistungsumfang", spaced(6), `${bold}${size(13)}`),
    paragraphXml(
      [
        { text: "Erfassung per Barcode: ", properties: bold },
        { text: "Wareneingang und Umlagerung direkt am Regal, auch offline auf dem Handscanner." },
      ],
      spaced(6),
    ),
    paragraphXml(
      [
        { text: "Bestandsübersicht: ", properties: bold },
        { text: "Mengen, Mindestbestände und offene Lieferungen auf einen Blick." },
      ],
      spaced(6),
    ),
    paragraphXml(
      [
        { text: "Schnittstellen: ", properties: bold },
        { text: "Übergabe der Buchungen an die bestehende Warenwirtschaft." },
      ],
      spaced(10),
    ),
    paragraph("Zeitplan", spaced(6), `${bold}${size(13)}`),
    paragraphXml(
      [
        { text: "Die Umsetzung dauert " },
        { text: "zehn Wochen", properties: "<w:i/>" },
        { text: " ab Auftrag, mit einer ersten nutzbaren Version nach vier Wochen." },
      ],
      `<w:jc w:val="both"/>${spaced(10)}`,
    ),
  ]),
  // A small price list with a formula: the spreadsheet the tests and the screenshots open.
  "preise.xlsx": xlsx([
    {
      name: "Preise",
      rows: [
        ["Artikel", "Menge", "Preis", "Summe"],
        ["Barcode-Scanner", 4, 189, "=B2*C2"],
        ["Etikettendrucker", 2, 349, "=B3*C3"],
        ["Regaletiketten", 500, 0.12, "=B4*C4"],
        ["Gesamt", "", "", "=SUM(D2:D4)"],
      ],
      widths: [22, 10, 10, 12],
    },
    { name: "Notizen", rows: [["Angebot gültig bis 30.11.2026"]] },
  ]),
  // Invoices of a few months, with customers and services repeating: the source of the pivot tests.
  "umsatz.xlsx": xlsx([
    {
      name: "Umsatz",
      rows: [
        ["Monat", "Kunde", "Leistung", "Betrag"],
        ["Januar", "Geißer", "Wartung", 450],
        ["Januar", "Roth", "Entwicklung", 1200],
        ["Februar", "Geißer", "Entwicklung", 800],
        ["Februar", "Roth", "Wartung", 300],
        ["März", "Geißer", "Wartung", 450],
        ["März", "Roth", "Entwicklung", 950],
      ],
      widths: [12, 12, 14, 10],
    },
  ]),
  // A short talk: a title slide and two content slides, for the presentation tests and screenshots.
  "vortrag.pptx": pptx([
    { layout: "title", title: "Lagerverwaltung", subtitle: "Projektstart · Oktober 2026" },
    {
      layout: "content",
      title: "Ziele",
      bullets: ["Bestände in Echtzeit", "Barcode am Regal", "Anbindung an die Warenwirtschaft"],
    },
    { layout: "content", title: "Zeitplan", bullets: ["Woche 1–4: erste Version", "Woche 5–10: Ausbau"] },
  ]),
  // A two-page form with text fields: the PDF the PDF tests open, fill in and edit.
  "formular.pdf": pdf([
    {
      lines: ["Auftragsformular", "Name:", "Ort:", "Bitte ausfüllen und unterschreiben."],
      fields: [
        { name: "name", x: 130, y: 707, width: 220, height: 18 },
        { name: "ort", x: 130, y: 689, width: 220, height: 18 },
      ],
    },
    { lines: ["Seite zwei", "Allgemeine Bedingungen"] },
  ]),
  // A letter with merge fields as Word writes them (complex fields), and its recipients: the mail
  // merge tests (e2e/mail-merge.spec.ts).
  "einladung.docx": docx([
    paragraph("Einladung zum Projektstart", spaced(12), `${bold}${size(16)}`),
    mergeLine(["Anrede", " ", "Name"]),
    mergeLine(["Straße"]),
    mergeLine(["PLZ", " ", "Ort"]),
    paragraph(""),
    paragraph("wir laden Sie herzlich zum Start der neuen Lagerverwaltung ein."),
  ]),
  "empfaenger.xlsx": xlsx([
    {
      name: "Empfänger",
      rows: [
        ["Anrede", "Name", "Straße", "PLZ", "Ort"],
        ["Frau", "Anna Berger", "Lindenweg 3a", "76530", "Baden-Baden"],
        ["Herr", "Ben Krüger", "Hauptstraße 7", "77815", "Bühl"],
        ["Frau", "Clara Hoffmann", "Am Markt 1", "76437", "Rastatt"],
      ],
      widths: [8, 18, 18, 8, 14],
    },
  ]),
  // A one-page PDF to append to another one.
  "anhang.pdf": pdf([{ lines: ["Anhang", "Lieferschein 2026-117"] }]),
};

// A ZUGFeRD invoice: the PDF with its Factur-X XML attached (rechnung.ts).
files["rechnung.pdf"] = await rechnungPdf();
// The same invoice in Schreibzeug's invoice template, to make an e-invoice from.
files["rechnung.docx"] = rechnungDocx();

for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(join(import.meta.dir, name), bytes);
  console.log(`wrote test-files/${name}`);
}
