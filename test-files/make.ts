/**
 * Writes the test documents in this folder. They are built from XML here, so their content and
 * license are ours (see README.md). Run: bun run test-files
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { docx, paragraphXml } from "@stapel/ooxml";

const files: Record<string, Uint8Array> = {
  "hello.docx": docx([
    paragraphXml([{ text: "Hallo Stapel" }]),
    paragraphXml([{ text: "Zweiter Absatz mit kursivem Text.", properties: "<w:i/>" }]),
  ]),
};

for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(join(import.meta.dir, name), bytes);
  console.log(`wrote test-files/${name}`);
}
