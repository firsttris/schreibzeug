/**
 * Writes the test documents in this folder. They are built from XML here, so their content and
 * license are ours (see README.md). Run: bun run test-files
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { docx, paragraphXml, type Run } from "@stapel/ooxml";

/** Run properties (ECMA-376 Part 1, 17.3.2); sizes are in half-points. */
const bold = "<w:b/>";
const size = (points: number) => `<w:sz w:val="${points * 2}"/>`;
const spaced = (after: number) => `<w:spacing w:after="${after * 20}"/>`;

const paragraph = (text: string, properties = spaced(8), run?: string) =>
  paragraphXml([{ text, ...(run ? { properties: run } : {}) } satisfies Run], properties);

const files: Record<string, Uint8Array> = {
  "hello.docx": docx([
    paragraphXml([{ text: "Hallo Stapel" }]),
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
};

for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(join(import.meta.dir, name), bytes);
  console.log(`wrote test-files/${name}`);
}
