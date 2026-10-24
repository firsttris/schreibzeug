import { describe, expect, it } from "vitest";
import { decodeWebFont, fontsForPdf, loadedFontFiles } from "../src/print";

const loader = {
  fontFilesPath: "../../../../fonts/",
  fontFiles: [
    { Id: "000", Status: 0 },
    { Id: "001", Status: -1 },
    { Id: "002", Status: 1 },
  ],
};

describe("fonts for a PDF", () => {
  it("takes the fonts the engine has loaded", () => {
    expect(loadedFontFiles(loader)).toEqual(["000", "002"]);
  });

  it("undoes the obfuscation of the first 32 bytes, as the engine does", () => {
    // The start of an obfuscated TrueType font: 00 01 00 00 after decoding.
    const obfuscated = new Uint8Array([0xa0, 0x67, 0xd6, 0x20, ...new Array(40).fill(7)]);
    const plain = decodeWebFont(obfuscated);
    expect([...plain.slice(0, 4)]).toEqual([0, 1, 0, 0]);
    expect(plain[33]).toBe(7);
    expect(obfuscated[1]).toBe(0x67);
  });

  it("fetches them from the engine's font folder", async () => {
    const urls: string[] = [];
    const fonts = await fontsForPdf(
      loader,
      "https://office.example.org/engine/frame/editor/word/main/index.html",
      async (url) => {
        urls.push(url);
        return new Uint8Array(4).buffer;
      },
    );
    expect(urls).toEqual([
      "https://office.example.org/engine/fonts/000",
      "https://office.example.org/engine/fonts/002",
    ]);
    expect(fonts.map((font) => font.name)).toEqual(["000", "002"]);
  });
});
