import type { BlankFormat } from "@schreibzeug/files-api";

/** What "Neu" makes, in the files list and the editor's "Datei" menu, with the name dialog's words. */
export const NEW_FILES: Record<BlankFormat, { item: string; title: string; label: string; name: string }> = {
  docx: {
    item: "Dokument",
    title: "Neues Dokument",
    label: "Name des Dokuments",
    name: "Unbenanntes Dokument",
  },
  xlsx: { item: "Tabelle", title: "Neue Tabelle", label: "Name der Tabelle", name: "Unbenannte Tabelle" },
  pptx: {
    item: "Präsentation",
    title: "Neue Präsentation",
    label: "Name der Präsentation",
    name: "Unbenannte Präsentation",
  },
  md: { item: "Notiz (Markdown)", title: "Neue Notiz", label: "Name der Notiz", name: "Unbenannte Notiz" },
  txt: { item: "Textdatei", title: "Neue Textdatei", label: "Name der Textdatei", name: "Unbenannter Text" },
};

/** The Office files first, then the text files, each group under a line in a menu. */
export const NEW_FILE_GROUPS: BlankFormat[][] = [
  ["docx", "xlsx", "pptx"],
  ["md", "txt"],
];
