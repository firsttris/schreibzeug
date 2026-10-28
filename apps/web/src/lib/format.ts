/** How the file list shows sizes, dates and kinds, in the interface's language. */
import { m } from "../paraglide/messages";
import { getLocale } from "../paraglide/runtime";

/** The Intl locale for the interface's language: German as in Germany, English as in the US. */
const intlLocale = (): string => (getLocale() === "en" ? "en-US" : "de-DE");

const sizeFormat = () => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 });
const UNITS = [m.format_bytes, () => "KB", () => "MB", () => "GB", () => "TB"] as const;

/** The value as `sizeFormat` shows it, rounded to one decimal. */
const roundedTo = (bytes: number, exponent: number): number =>
  Math.round((bytes / 1024 ** exponent) * 10) / 10;

export const formatSize = (bytes: number | null): string => {
  if (bytes === null) return "–";
  const estimate =
    bytes < 1024 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  // The unit is chosen after rounding: 1023,97 KB shows as "1 MB", not "1.024 KB".
  const exponent =
    estimate < UNITS.length - 1 && roundedTo(bytes, estimate) >= 1024 ? estimate + 1 : estimate;
  return `${sizeFormat().format(bytes / 1024 ** exponent)} ${UNITS[exponent]?.()}`;
};

const time = (date: Date) =>
  new Intl.DateTimeFormat(intlLocale(), { hour: "2-digit", minute: "2-digit" }).format(date);

/** The day, with the year when it is not this one. */
const day = (date: Date, now: Date) =>
  new Intl.DateTimeFormat(intlLocale(), {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);

const startOfDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "Heute, 11:20", "Gestern, 09:05", "20. Okt.", "3. März 2025": close dates read as time, older as day. */
export const formatChanged = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return m.format_today({ time: time(date) });
  if (days === 1) return m.format_yesterday({ time: time(date) });
  return day(date, now);
};

/** "31. Okt.", or with the year when it is another one. */
export const formatDay = (iso: string, now: Date = new Date()): string => day(new Date(iso), now);

/** What a file is, by its extension: the formats Schreibzeug opens, a folder, or anything else. */
export type FileKind =
  | "docx"
  | "xlsx"
  | "pptx"
  | "csv"
  | "pdf"
  | "odt"
  | "ods"
  | "odp"
  | "doc"
  | "rtf"
  | "xls"
  | "ppt"
  | "md"
  | "txt"
  | "folder"
  | "other";

const KNOWN = new Set<FileKind>([
  "docx",
  "xlsx",
  "pptx",
  "csv",
  "pdf",
  "odt",
  "ods",
  "odp",
  "doc",
  "rtf",
  "xls",
  "ppt",
  "md",
  "txt",
]);

export const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export const kindOf = (node: { kind: "folder" | "file"; name: string }): FileKind => {
  if (node.kind === "folder") return "folder";
  const extension = extensionOf(node.name) as FileKind;
  return KNOWN.has(extension) ? extension : "other";
};

/** The editor a kind of file opens in; "text" is Markdown and plain text (packages/text-editor). */
export type EditorOf = "word" | "sheet" | "slide" | "pdf" | "text";

const EDITOR_OF: Partial<Record<FileKind, EditorOf>> = {
  docx: "word",
  odt: "word",
  xlsx: "sheet",
  ods: "sheet",
  csv: "sheet",
  pptx: "slide",
  odp: "slide",
  pdf: "pdf",
  md: "text",
  txt: "text",
};

export const editorOf = (kind: FileKind): EditorOf | null => EDITOR_OF[kind] ?? null;

/**
 * Office files: documents, spreadsheets (a CSV opens in the spreadsheet) and presentations, in the
 * Office formats and in OpenDocument, which are edited and saved as what they are.
 */
export const isOfficeFile = (node: { kind: "folder" | "file"; name: string }): boolean => {
  const editor = editorOf(kindOf(node));
  return editor !== null && editor !== "pdf" && editor !== "text";
};

/** Markdown and plain text, opened in the text editor rather than the engine. */
export const isTextFile = (node: { kind: "folder" | "file"; name: string }): boolean =>
  editorOf(kindOf(node)) === "text";

/** Older formats Schreibzeug opens as a copy in the Office format (editor-core OFFICE_FORMAT_OF_LEGACY). */
export const isLegacyFile = (node: { kind: "folder" | "file"; name: string }): boolean => {
  const kind = kindOf(node);
  return kind === "doc" || kind === "rtf" || kind === "xls" || kind === "ppt";
};

/** The kinds Schreibzeug can open: the Office files, PDFs, text files, and older formats, by a copy. */
export const isEditable = (node: { kind: "folder" | "file"; name: string }): boolean =>
  isOfficeFile(node) || kindOf(node) === "pdf" || isTextFile(node) || isLegacyFile(node);
