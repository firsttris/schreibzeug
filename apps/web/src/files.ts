export type OpenedFile = { name: string; bytes: Uint8Array };

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const readFile = async (file: File): Promise<OpenedFile> => ({
  name: file.name,
  bytes: new Uint8Array(await file.arrayBuffer()),
});

/** Keeps the name the user knows and makes sure it ends in .docx. */
export const docxName = (name: string): string =>
  /\.docx$/i.test(name) ? name : `${name.replace(/\.[^.]*$/, "")}.docx`;

export const downloadBytes = (bytes: Uint8Array, name: string, mime = DOCX_MIME): void => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
