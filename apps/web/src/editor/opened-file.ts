import type { CollabChannel, DocumentFormat, ImageStore } from "@schreibzeug/editor-core";

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

export const MIME: Record<DocumentFormat | "csv", string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  pdf: "application/pdf",
};

/** Keeps the name the user knows and makes sure it ends in the format's extension. */
export const fileNameFor = (name: string, format: DocumentFormat | "csv"): string =>
  new RegExp(`\\.${format}$`, "i").test(name) ? name : `${name.replace(/\.[^.]*$/, "")}.${format}`;

export const downloadBytes = (bytes: Uint8Array, name: string, mime: string): void => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
