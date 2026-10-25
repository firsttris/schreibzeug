import type { Cents, Millis } from "./types";

/*
 * Numbers, amounts and dates as Germans write them on invoices: "1.234,56 €", "2,5", "23.10.2026",
 * "23. Oktober 2026". Each parser gives undefined for text it cannot read.
 */

/** "1.234,5" or "1234.50" → 1234.5 as a decimal string "1234.5"; the last , or . is the decimal mark. */
const decimalText = (text: string): string | undefined => {
  const match = /-?\d[\d.,\s]*/.exec(text.replace(/ /g, " "));
  if (!match) return undefined;
  const raw = match[0].replace(/\s/g, "").replace(/[.,]$/, "");
  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  const mark = Math.max(lastComma, lastDot);
  // "1.234" is a thousand in German; a dot followed by exactly three digits and no comma is a separator.
  const isThousands = lastComma < 0 && lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(digits);
  const [whole, fraction] =
    mark < 0 || isThousands
      ? [digits.replace(/[.,]/g, ""), ""]
      : [digits.slice(0, mark).replace(/[.,]/g, ""), digits.slice(mark + 1)];
  if (!/^\d+$/.test(whole || "0") || !/^\d*$/.test(fraction)) return undefined;
  return `${negative ? "-" : ""}${whole || "0"}${fraction ? `.${fraction}` : ""}`;
};

/** A decimal string as an integer in 10^-scale, rounded half away from zero. */
const scaled = (decimal: string, scale: number): number => {
  const negative = decimal.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? decimal.slice(1) : decimal).split(".");
  const kept = fraction.slice(0, scale).padEnd(scale, "0");
  const roundUp = (fraction[scale] ?? "0") >= "5" ? 1 : 0;
  const value = Number(`${whole}${kept}`) + roundUp;
  return negative ? -value : value;
};

/** "1.234,56 €" → 123456. */
export const parseMoney = (text: string): Cents | undefined => {
  const decimal = decimalText(text);
  return decimal === undefined ? undefined : scaled(decimal, 2);
};

/** "2,5" → 2500. */
export const parseQuantity = (text: string): Millis | undefined => {
  const decimal = decimalText(text);
  return decimal === undefined ? undefined : scaled(decimal, 3);
};

/** "19 %" or "7,5" → 1900, 750. */
export const parseRate = (text: string): number | undefined => {
  const decimal = decimalText(text);
  return decimal === undefined ? undefined : scaled(decimal, 2);
};

const MONTHS = [
  "januar",
  "februar",
  "märz",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "dezember",
];

/** A date in the text: "23.10.2026", "23.10.26", "2026-10-23" or "23. Oktober 2026". */
export const DATE_PATTERN =
  /(\d{4}-\d{2}-\d{2}|\d{1,2}\.\s?\d{1,2}\.\s?(?:\d{4}|\d{2})(?!\d)|\d{1,2}\.\s?(?:januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+\d{4})/i;

/** "23.10.2026" → "2026-10-23"; undefined for what is no date. */
export const parseDate = (text: string): string | undefined => {
  const found = DATE_PATTERN.exec(text)?.[1];
  if (!found) return undefined;
  let year: number;
  let month: number;
  let day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(found);
  const numeric = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})$/.exec(found);
  const named = /^(\d{1,2})\.\s?(\S+)\s+(\d{4})$/.exec(found);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (numeric) {
    const short = Number(numeric[3]);
    [day, month, year] = [
      Number(numeric[1]),
      Number(numeric[2]),
      numeric[3]?.length === 2 ? 2000 + short : short,
    ];
  } else if (named) {
    const name = named[2]?.toLowerCase().replace("maerz", "märz") ?? "";
    [day, month, year] = [Number(named[1]), MONTHS.indexOf(name) + 1, Number(named[3])];
  } else return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return undefined;
  return date.toISOString().slice(0, 10);
};

/** The ISO date some days after another. */
export const addDays = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
