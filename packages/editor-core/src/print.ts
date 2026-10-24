import type { FontFile } from "./converter";
import type { FontLoader } from "./engine-types";

/**
 * The key the engine's web fonts are obfuscated with over their first 32 bytes; the engine undoes
 * it when it loads a font (common/Drawings/Externals.js, `guidOdttf`). x2t needs the plain font.
 */
const ODTTF_KEY = [
  0xa0, 0x66, 0xd6, 0x20, 0x14, 0x96, 0x47, 0xfa, 0x95, 0x69, 0xb8, 0x50, 0xb0, 0x41, 0x49, 0x48,
];

export const decodeWebFont = (bytes: Uint8Array): Uint8Array => {
  const plain = bytes.slice();
  for (let i = 0; i < Math.min(32, plain.length); i += 1)
    plain[i] = (plain[i] ?? 0) ^ (ODTTF_KEY[i % 16] ?? 0);
  return plain;
};

/**
 * The font files the document has drawn with: the ones the engine loaded (common/Drawings/
 * Externals.js CFontFileLoader, Status 0 or 1 = loaded). Exactly these end up in a PDF of it.
 */
export const loadedFontFiles = (loader: FontLoader): string[] =>
  loader.fontFiles
    .filter((file) => file.Status === 0 || file.Status === 1)
    .map((file) => file.Id)
    // The PDF editor lists the fonts a PDF embeds too ("Embedded: Helvetica"); they have no file.
    .filter((id) => !id.includes(":"));

/**
 * Fetches the loaded fonts from where the engine got them (common/GlobalLoaders.js
 * `fontFilesPath`, relative to the frame's page), decoded for x2t. The browser has them cached.
 */
export const fontsForPdf = async (
  loader: FontLoader,
  base: string,
  fetchFont: (url: string) => Promise<ArrayBuffer>,
): Promise<FontFile[]> =>
  Promise.all(
    loadedFontFiles(loader).map(async (name) => ({
      name,
      bytes: decodeWebFont(
        new Uint8Array(await fetchFont(new URL(`${loader.fontFilesPath}${name}`, base).href)),
      ),
    })),
  );
