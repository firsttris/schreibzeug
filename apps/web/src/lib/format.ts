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

export type FileKind = "docx" | "xlsx" | "pptx" | "pdf" | "folder" | "other";

export const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export const kindOf = (node: { kind: "folder" | "file"; name: string }): FileKind => {
  if (node.kind === "folder") return "folder";
  const extension = extensionOf(node.name);
  return extension === "docx" || extension === "xlsx" || extension === "pptx" || extension === "pdf"
    ? extension
    : "other";
};

/** The kinds Stapel can open in an editor today. */
export const isEditable = (node: { kind: "folder" | "file"; name: string }): boolean => {
  const kind = kindOf(node);
  return kind === "docx" || kind === "xlsx" || kind === "pptx";
};
