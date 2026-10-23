import type { CollabChannel, OfficeFormat } from "@stapel/editor-core";

export type OpenedFile = {
  name: string;
  bytes: Uint8Array;
  /** The editing session the file belongs to; absent for a file edited alone. */
  collaboration?: { channel: CollabChannel; documentId: string };
};

export const MIME: Record<OfficeFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Keeps the name the user knows and makes sure it ends in the format's extension. */
export const fileNameFor = (name: string, format: OfficeFormat): string =>
  new RegExp(`\\.${format}$`, "i").test(name) ? name : `${name.replace(/\.[^.]*$/, "")}.${format}`;

export const downloadBytes = (bytes: Uint8Array, name: string, mime: string): void => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
