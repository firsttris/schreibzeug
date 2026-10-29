import type { BlankFormat } from "@schreibzeug/files-api";
import { m } from "../paraglide/messages";

/**
 * What "Neu" makes, in the files list and the editor's "Datei" menu, with the name dialog's words.
 * Read when the module loads: the language is fixed for a page load (changing it reloads).
 */
export const NEW_FILES: Record<BlankFormat, { item: string; title: string; label: string; name: string }> = {
  docx: {
    item: m.new_files_document(),
    title: m.new_files_document_title(),
    label: m.new_files_document_label(),
    name: m.new_files_document_name(),
  },
  xlsx: {
    item: m.new_files_spreadsheet(),
    title: m.new_files_spreadsheet_title(),
    label: m.new_files_spreadsheet_label(),
    name: m.new_files_spreadsheet_name(),
  },
  pptx: {
    item: m.new_files_presentation(),
    title: m.new_files_presentation_title(),
    label: m.new_files_presentation_label(),
    name: m.new_files_presentation_name(),
  },
  md: {
    item: m.new_files_note(),
    title: m.new_files_note_title(),
    label: m.new_files_note_label(),
    name: m.new_files_note_name(),
  },
  txt: {
    item: m.new_files_text(),
    title: m.new_files_text_title(),
    label: m.new_files_text_label(),
    name: m.new_files_text_name(),
  },
};

/** The Office files first, then the text files, each group under a line in a menu. */
export const NEW_FILE_GROUPS: BlankFormat[][] = [
  ["docx", "xlsx", "pptx"],
  ["md", "txt"],
];
