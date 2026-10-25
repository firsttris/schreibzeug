/** How the file list shows sizes, dates and kinds; German first, like the rest of the interface. */

const sizeFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const UNITS = ["Byte", "KB", "MB", "GB", "TB"] as const;

export const formatSize = (bytes: number | null): string => {
  if (bytes === null) return "–";
  const exponent =
    bytes < 1024 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  return `${sizeFormat.format(bytes / 1024 ** exponent)} ${UNITS[exponent]}`;
};

const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const dayThisYear = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" });
const dayOtherYear = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" });

const startOfDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "Heute, 11:20", "Gestern, 09:05", "20. Okt.", "3. März 2025": close dates read as time, older as day. */
export const formatChanged = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return `Heute, ${time.format(date)}`;
  if (days === 1) return `Gestern, ${time.format(date)}`;
  return (date.getFullYear() === now.getFullYear() ? dayThisYear : dayOtherYear).format(date);
};

/** "31. Okt.", or with the year when it is another one. */
export const formatDay = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso);
  return (date.getFullYear() === now.getFullYear() ? dayThisYear : dayOtherYear).format(date);
};

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

/** The editor a kind of file opens in. */
export type EditorOf = "word" | "sheet" | "slide" | "pdf";

const EDITOR_OF: Partial<Record<FileKind, EditorOf>> = {
  docx: "word",
  odt: "word",
  xlsx: "sheet",
  ods: "sheet",
  csv: "sheet",
  pptx: "slide",
  odp: "slide",
  pdf: "pdf",
};

export const editorOf = (kind: FileKind): EditorOf | null => EDITOR_OF[kind] ?? null;

/**
 * Office files: documents, spreadsheets (a CSV opens in the spreadsheet) and presentations, in the
 * Office formats and in OpenDocument, which are edited and saved as what they are.
 */
export const isOfficeFile = (node: { kind: "folder" | "file"; name: string }): boolean => {
  const editor = editorOf(kindOf(node));
  return editor !== null && editor !== "pdf";
};

/** Older formats Schreibzeug opens as a copy in the Office format (editor-core OFFICE_FORMAT_OF_LEGACY). */
export const isLegacyFile = (node: { kind: "folder" | "file"; name: string }): boolean => {
  const kind = kindOf(node);
  return kind === "doc" || kind === "rtf" || kind === "xls" || kind === "ppt";
};

/** The kinds Schreibzeug can open: the Office files, PDFs, and older formats, by a copy. */
export const isEditable = (node: { kind: "folder" | "file"; name: string }): boolean =>
  isOfficeFile(node) || kindOf(node) === "pdf" || isLegacyFile(node);
