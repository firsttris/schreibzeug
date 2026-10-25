import { describe, expect, it } from "vitest";
import { CSV_DELIMITER_CODES, decodeCsv, detectDelimiter, encodeCsv } from "../src/csv";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("the delimiter of a CSV file", () => {
  it("is the one its lines use most", () => {
    expect(detectDelimiter(bytes("Name;Betrag\nMiete;1.200,50\n"))).toBe("semicolon");
    expect(detectDelimiter(bytes("name,amount\nrent,1200.50\n"))).toBe("comma");
    expect(detectDelimiter(bytes("a\tb\tc\n1\t2\t3"))).toBe("tab");
  });

  it("does not count what is quoted, nor the byte order mark", () => {
    expect(detectDelimiter(bytes('﻿"Müller, Hans";Köln\n"Schmidt, Eva";Bonn'))).toBe("semicolon");
  });

  it("does not count what is quoted across a line break", () => {
    const file = bytes('name,note\r\nMüller,"Zeile eins\r\nx;y;z;w"\r\n');
    expect(detectDelimiter(file)).toBe("comma");
    expect(decodeCsv(file)).toEqual([
      ["name", "note"],
      ["Müller", "Zeile eins\r\nx;y;z;w"],
    ]);
  });

  it("takes a quote inside a field for a character, not for the start of a quoted part", () => {
    const file = 'Artikel;Preis\nMonitor, schwarz, matt, 27";199\nMaus;19\nTastatur;29\nKabel;5\nHub;25';
    expect(detectDelimiter(bytes(file))).toBe("semicolon");
    expect(detectDelimiter(bytes('a;b\n"x ""y"", z, w";1\n'))).toBe("semicolon");
    expect(detectDelimiter(bytes('id, text\n1, "a; b; c"\n2, "d; e; f"\n'))).toBe("comma");
  });

  it("looks at the first 20 lines with content only", () => {
    const head = "a,b\n\n".repeat(20);
    expect(detectDelimiter(bytes(`${head}${"x;y;z\n".repeat(30)}`))).toBe("comma");
  });

  it("is ; for one column, as German Excel writes", () => {
    expect(detectDelimiter(bytes("Werte\n1\n2"))).toBe("semicolon");
  });

  it("is told to x2t as its numbers", () => {
    expect(CSV_DELIMITER_CODES).toEqual({ tab: 1, semicolon: 2, comma: 4 });
  });
});

describe("a CSV file written from the sheet", () => {
  const text = (bytes: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);

  it("is UTF-8 with a byte order mark and CR LF, as Excel reads it", () => {
    const bytes = encodeCsv(
      [
        ["Datum", "Empfänger", "Betrag"],
        ["01.10.2026", "Bäckerei Müller", "-4,20 €"],
      ],
      "semicolon",
    );
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text(bytes)).toBe("\uFEFFDatum;Empfänger;Betrag\r\n01.10.2026;Bäckerei Müller;-4,20 €\r\n");
  });

  it("quotes what holds the delimiter, a quote or a line break", () => {
    const bytes = encodeCsv([["Müller, Hans", 'sagt "Hallo"', "a\nb", "1,5"]], "comma");
    expect(text(bytes)).toBe('\uFEFF"Müller, Hans","sagt ""Hallo""","a\nb","1,5"\r\n');
    expect(text(encodeCsv([["1,5", "x\ty"]], "tab"))).toBe('\uFEFF1,5\t"x\ty"\r\n');
  });
});
