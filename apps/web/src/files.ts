import type { CollabChannel } from "@stapel/editor-core";

export type OpenedFile = {
  name: string;
  bytes: Uint8Array;
  /** The editing session the file belongs to; absent for a file edited alone. */
  collaboration?: { channel: CollabChannel; documentId: string };
};

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Keeps the name the user knows and makes sure it ends in .docx. */
export const docxName = (name: string): string =>
  /\.docx$/i.test(name) ? name : `${name.replace(/\.[^.]*$/, "")}.docx`;

export const downloadBytes = (bytes: Uint8Array, name: string, mime = DOCX_MIME): void => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
