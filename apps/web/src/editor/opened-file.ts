import type { CollabChannel, DocumentFormat, ImageStore, OpenDocumentFormat } from "@schreibzeug/editor-core";
import { kindOf } from "../lib/format";

export type OpenedFile = {
  name: string;
  bytes: Uint8Array;
  /** Opened to look at only: the user's role on it is "view". */
  readOnly: boolean;
  /** The editing session the file belongs to; absent for a file edited alone. */
  collaboration?: { channel: CollabChannel; documentId: string };
  /** Where images put into the document are kept (apps/server src/files/media.ts). */
  images?: ImageStore;
};

/** The formats a file is saved and downloaded in. */
export type SavedFormat = DocumentFormat | OpenDocumentFormat | "csv";

export const MIME: Record<SavedFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  pdf: "application/pdf",
};

/** Keeps the name the user knows and makes sure it ends in the format's extension. */
/**
 * The format the open file is saved in: its own when that is OpenDocument or CSV (they keep their
 * format), else the editor's.
 */
export const savedFormatOf = (name: string, editorFormat: DocumentFormat): SavedFormat => {
  const kind = kindOf({ kind: "file", name });
  return kind === "odt" || kind === "ods" || kind === "odp" || kind === "csv" ? kind : editorFormat;
};

export const fileNameFor = (name: string, format: SavedFormat): string =>
  new RegExp(`\\.${format}$`, "i").test(name) ? name : `${name.replace(/\.[^.]*$/, "")}.${format}`;

export const downloadBytes = (bytes: Uint8Array, name: string, mime: string): void => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
