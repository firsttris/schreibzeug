import { describe, expect, it } from "vitest";
import { decodeText, encodeText, lineEndingOf, NEW_TEXT_FORM, sha256Hex } from "../src/codec";

const bytesOf = (...parts: Array<string | number[]>) =>
  new Uint8Array(
    parts.flatMap((part) => (typeof part === "string" ? [...new TextEncoder().encode(part)] : part)),
  );

const roundTrip = (bytes: Uint8Array) => {
  const { text, form } = decodeText(bytes);
  const encoded = encodeText(text, form);
  if (!encoded.ok) throw new Error(`cannot encode ${encoded.character}`);
  return encoded.bytes;
};

describe("reading and writing a text file", () => {
  it("gives the editor lines ended by \\n and keeps the file's own line ending", () => {
    const windows = decodeText(bytesOf("Zeile 1\r\nZeile 2\r\n"));
    expect(windows).toEqual({
      text: "Zeile 1\nZeile 2\n",
      form: { encoding: "utf-8", bom: false, lineEnding: "crlf" },
    });
    expect(decodeText(bytesOf("a\rb")).form.lineEnding).toBe("cr");
    expect(decodeText(bytesOf("a\nb")).form.lineEnding).toBe("lf");
  });

  it("writes an unchanged file back to the same bytes", () => {
    const files = [
      bytesOf("# Notiz\n\n- eins\n- zwei\n"),
      bytesOf("Grüße\r\naus Köln\r\n"),
      bytesOf([0xef, 0xbb, 0xbf], "Mit BOM\r\n"),
      bytesOf([0xff, 0xfe], [0x48, 0, 0xe4, 0, 0x0d, 0, 0x0a, 0]),
      bytesOf([0xfe, 0xff], [0, 0x48, 0, 0xe4]),
      new Uint8Array([0x47, 0x72, 0xfc, 0xdf, 0x65, 0x20, 0x80, 0x0d, 0x0a]), // "Grüße €" in Windows-1252
      new Uint8Array(),
    ];
    for (const file of files) expect(roundTrip(file)).toEqual(file);
  });

  it("reads a file that is not UTF-8 as Windows-1252", () => {
    const { text, form } = decodeText(new Uint8Array([0x47, 0x72, 0xfc, 0xdf, 0x65, 0x20, 0x80, 0x93, 0x94]));
    expect(text).toBe("Grüße €“”");
    expect(form).toEqual({ encoding: "windows-1252", bom: false, lineEnding: "lf" });
  });

  it("refuses a character the file's encoding has no byte for, instead of dropping it", () => {
    const form = { encoding: "windows-1252", bom: false, lineEnding: "lf" } as const;
    expect(encodeText("Ok 😀", form)).toEqual({ ok: false, character: "😀" });
    expect(encodeText("Ok €", form)).toEqual({ ok: true, bytes: new Uint8Array([0x4f, 0x6b, 0x20, 0x80]) });
  });

  it("writes new lines with the file's line ending, also lines pasted with another one", () => {
    const encoded = encodeText("a\nb\r\nc", { encoding: "utf-8", bom: false, lineEnding: "crlf" });
    expect(encoded).toEqual({ ok: true, bytes: bytesOf("a\r\nb\r\nc") });
  });

  it("starts a new file as UTF-8 without a byte order mark, with LF", () => {
    expect(NEW_TEXT_FORM).toEqual({ encoding: "utf-8", bom: false, lineEnding: "lf" });
  });

  it("takes the line ending most lines have", () => {
    expect(lineEndingOf("a\r\nb\r\nc\nd")).toBe("crlf");
    expect(lineEndingOf("a\nb\nc\r\nd")).toBe("lf");
    expect(lineEndingOf("ohne Zeilenende")).toBe("lf");
  });
});

describe("the version a save is made over", () => {
  it("is the SHA-256 of the bytes, as the server keeps it", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
