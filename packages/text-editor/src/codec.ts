/**
 * A text file's bytes as text and back, in the file's own form: its encoding, whether it starts
 * with a byte order mark, and its line endings. An unchanged text is written back to the same
 * bytes, so a file nobody edited stays what it was ("files are files", CLAUDE.md).
 */

export type TextEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";
export type LineEnding = "lf" | "crlf" | "cr";

/** What is kept of the file besides its text. */
export type TextForm = { encoding: TextEncoding; bom: boolean; lineEnding: LineEnding };

/** The text with "\n" between lines, as the editor holds it, and the form to write it back in. */
export type DecodedText = { text: string; form: TextForm };

export type EncodeResult = { ok: true; bytes: Uint8Array } | { ok: false; character: string };

/** A new file: UTF-8 without a byte order mark, lines ended by LF. */
export const NEW_TEXT_FORM: TextForm = { encoding: "utf-8", bom: false, lineEnding: "lf" };

export const LINE_SEPARATOR: Record<LineEnding, string> = { lf: "\n", crlf: "\r\n", cr: "\r" };

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) =>
  prefix.every((byte, index) => bytes[index] === byte);

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const UTF16LE_BOM = [0xff, 0xfe] as const;
const UTF16BE_BOM = [0xfe, 0xff] as const;

/** The encoding by the byte order mark, else UTF-8 when the bytes are valid UTF-8, else Windows-1252. */
const encodingOf = (bytes: Uint8Array): { encoding: TextEncoding; bom: boolean } => {
  if (startsWith(bytes, UTF8_BOM)) return { encoding: "utf-8", bom: true };
  if (startsWith(bytes, UTF16LE_BOM)) return { encoding: "utf-16le", bom: true };
  if (startsWith(bytes, UTF16BE_BOM)) return { encoding: "utf-16be", bom: true };
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { encoding: "utf-8", bom: false };
  } catch {
    // Older German text files from Windows: umlauts as single bytes.
    return { encoding: "windows-1252", bom: false };
  }
};

const BOM_LENGTH: Record<TextEncoding, number> = {
  "utf-8": 3,
  "utf-16le": 2,
  "utf-16be": 2,
  "windows-1252": 0,
};

/** The line ending most lines use; a file without any gets LF. */
export const lineEndingOf = (text: string): LineEnding => {
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  const lf = (text.match(/\n/g)?.length ?? 0) - crlf;
  const cr = (text.match(/\r/g)?.length ?? 0) - crlf;
  if (crlf > lf && crlf >= cr) return "crlf";
  if (cr > lf && cr > crlf) return "cr";
  return "lf";
};

export const decodeText = (bytes: Uint8Array): DecodedText => {
  const { encoding, bom } = encodingOf(bytes);
  const body = bytes.subarray(bom ? BOM_LENGTH[encoding] : 0);
  const raw = new TextDecoder(encoding, { ignoreBOM: true }).decode(body);
  return { text: raw.replace(/\r\n?/g, "\n"), form: { encoding, bom, lineEnding: lineEndingOf(raw) } };
};

/** Windows-1252's characters from 0x80 to 0x9F; the others are Latin-1 (TextDecoder "windows-1252"). */
const CP1252_HIGH = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";
const CP1252_BYTE = new Map([...CP1252_HIGH].map((character, index) => [character, 0x80 + index]));

const encodeWindows1252 = (text: string): EncodeResult => {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) {
    const character = text[index] ?? "";
    const code = character.charCodeAt(0);
    const byte = CP1252_BYTE.get(character) ?? (code < 0x80 || (code >= 0xa0 && code <= 0xff) ? code : null);
    if (byte === null) return { ok: false, character: String.fromCodePoint(text.codePointAt(index) ?? code) };
    bytes[index] = byte;
  }
  return { ok: true, bytes };
};

const encodeUtf16 = (text: string, littleEndian: boolean): Uint8Array => {
  const bytes = new Uint8Array(text.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < text.length; index++)
    view.setUint16(index * 2, text.charCodeAt(index), littleEndian);
  return bytes;
};

const BOM_BYTES: Record<TextEncoding, readonly number[]> = {
  "utf-8": UTF8_BOM,
  "utf-16le": UTF16LE_BOM,
  "utf-16be": UTF16BE_BOM,
  "windows-1252": [],
};

/**
 * The text in the given form. Fails with the first character the encoding has no byte for (an
 * emoji in a Windows-1252 file), so nothing is silently lost.
 */
export const encodeText = (text: string, { encoding, bom, lineEnding }: TextForm): EncodeResult => {
  const lines = text.replace(/\r\n?/g, "\n").replaceAll("\n", LINE_SEPARATOR[lineEnding]);
  const body =
    encoding === "windows-1252"
      ? encodeWindows1252(lines)
      : {
          ok: true as const,
          bytes:
            encoding === "utf-8"
              ? new TextEncoder().encode(lines)
              : encodeUtf16(lines, encoding === "utf-16le"),
        };
  if (!body.ok || !bom) return body;
  const prefix = BOM_BYTES[encoding];
  const bytes = new Uint8Array(prefix.length + body.bytes.length);
  bytes.set(prefix);
  bytes.set(body.bytes, prefix.length);
  return { ok: true, bytes };
};

/** How the status bar names the form. */
export const ENCODING_LABEL: Record<TextEncoding, string> = {
  "utf-8": "UTF-8",
  "utf-16le": "UTF-16 LE",
  "utf-16be": "UTF-16 BE",
  "windows-1252": "Windows-1252",
};

export const LINE_ENDING_LABEL: Record<LineEnding, string> = {
  lf: "LF",
  crlf: "CRLF",
  cr: "CR",
};

/** The bytes' SHA-256 in hex: what a save names as the version it was made over (files-api ifMatchOf). */
export const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
