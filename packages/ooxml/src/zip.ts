import { strToU8, zipSync } from "fflate";

/** A fixed date for the zip entries, so the same content always gives the same bytes. */
const ZIP_DATE = new Date(1980, 0, 1);

/** An Office package from its parts, by path. */
export const officePackage = (parts: Record<string, string>): Uint8Array =>
  zipSync(Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)])), {
    mtime: ZIP_DATE,
  });

/**
 * What XML 1.0 has no character for (2.2 Characters): the C0 controls but tab, line feed and
 * carriage return, lone surrogates, U+FFFE and U+FFFF. Even as a reference they make the part
 * invalid, so they are left out.
 */
const NOT_XML = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

export const escapeXml = (text: string): string =>
  text
    .replace(NOT_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
