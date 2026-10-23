/** The formats the editors open, plus a few the file list should recognise. */
const MIME_BY_EXTENSION: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const FALLBACK = "application/octet-stream";

/** By extension, not by the browser's guess: the browser sends what the OS thinks, which varies. */
export const mimeOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return FALLBACK;
  return MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? FALLBACK;
};
