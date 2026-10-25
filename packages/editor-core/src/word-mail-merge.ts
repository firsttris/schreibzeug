import type { Convert } from "./converter";
import type { WordEngineApi, WordWindow } from "./engine-types";
import { collectMedia } from "./media";

/**
 * Mail merge as the engine has it (word/api.js asc_StartMailMergeByList, asc_AddMailMergeField,
 * asc_PreviewMailMergeResult; word/Editor/Document.js Get_MailMergedDocument): merge fields are
 * MERGEFIELDs in the document, which Word reads too; the recipients are a table whose first row
 * names the fields. The letters for all recipients become one new document, each after a page
 * break, which the engine writes in its binary format and x2t turns into a .docx, without the
 * Document Server the engine's own download goes through.
 */
export type MailMergeCommands = {
  /** The recipients: the first row names the fields, every further row is one recipient. */
  setRecipients: (rows: string[][]) => void;
  /** A merge field at the cursor, showing «name» until the merge. */
  insertField: (name: string) => void;
  /** The names of the merge fields in the document, each once, in the order they come. */
  fieldsInDocument: () => string[];
  /** Shows the letter for one recipient, from 0; editing is off until endPreview. */
  preview: (index: number) => void;
  endPreview: () => void;
  /** All letters as one .docx. */
  mergedDocx: () => Promise<Uint8Array>;
};

export const createMailMergeCommands = (
  win: WordWindow,
  api: WordEngineApi,
  convert: Convert,
): MailMergeCommands => {
  const logic = () => api.WordControl.m_oLogicDocument;
  return {
    setRecipients: (rows) => {
      api.asc_StartMailMergeByList(rows.map((row) => [...row]));
      api.asc_SetHighlightMailMergeFields(true);
    },
    insertField: (name) => api.asc_AddMailMergeField(name),
    fieldsInDocument: () => [
      ...new Set(
        logic()
          .FieldsManager.GetAllFieldsByType(win.AscWord.fieldtype_MERGEFIELD)
          .map((field) => field.Get_Argument(0))
          .filter((name): name is string => Boolean(name)),
      ),
    ],
    preview: (index) => api.asc_PreviewMailMergeResult(index),
    endPreview: () => api.asc_EndPreviewMailMergeResult(),
    mergedDocx: async () => {
      if (api.asc_GetReceptionsCount() === 0) throw new Error("Es sind keine Empfänger geladen.");
      const merged = logic().Get_MailMergedDocument();
      if (!merged) throw new Error("Der Serienbrief ließ sich nicht zusammenstellen.");
      const binary = new TextEncoder().encode(new win.AscCommonWord.BinaryFileWriter(merged).Write());
      // The letters hold the template's images; they go along as for any save.
      const media = await collectMedia(win.AscCommon.g_oDocumentUrls, async (url) =>
        (await win.fetch(url)).arrayBuffer(),
      );
      return (await convert(binary, "bin", "docx", media)).bytes;
    },
  };
};
