import { describe, expect, it } from "vitest";
import type { Convert } from "../src/converter";
import type { WordEngineApi, WordWindow } from "../src/engine-types";
import { createMailMergeCommands } from "../src/word-mail-merge";

const MERGEFIELD = 1;

/** The parts of the engine a mail merge touches, recording what is asked of them. */
const fakes = (recipients = 2) => {
  const calls: unknown[][] = [];
  const merged = { merged: true };
  const fields = ["Name", "Ort", "Name", undefined].map((name) => ({ Get_Argument: () => name }));
  const api = {
    asc_StartMailMergeByList: (rows: string[][]) => calls.push(["start", rows]),
    asc_SetHighlightMailMergeFields: (on: boolean) => calls.push(["highlight", on]),
    asc_AddMailMergeField: (name: string) => calls.push(["field", name]),
    asc_PreviewMailMergeResult: (index: number) => calls.push(["preview", index]),
    asc_EndPreviewMailMergeResult: () => calls.push(["endPreview"]),
    asc_GetReceptionsCount: () => recipients,
    WordControl: {
      m_oLogicDocument: {
        Get_MailMergedDocument: () => merged,
        FieldsManager: {
          GetAllFieldsByType: (type: number) => (type === MERGEFIELD ? fields : []),
        },
      },
    },
  } as unknown as WordEngineApi;
  const win = {
    AscWord: { fieldtype_MERGEFIELD: MERGEFIELD },
    AscCommonWord: {
      BinaryFileWriter: function BinaryFileWriter(this: { Write: () => string }, document: unknown) {
        this.Write = () => (document === merged ? "DOCY;v5;3;abc" : "wrong");
      },
    },
    AscCommon: { g_oDocumentUrls: { getUrls: () => ({ "media/image1.png": "blob:image1" }) } },
    fetch: async () => new Response(new Uint8Array([7])),
  } as unknown as WordWindow;
  const conversions: unknown[][] = [];
  const convert: Convert = async (bytes, from, to, media) => {
    conversions.push([new TextDecoder().decode(bytes), from, to, media]);
    return { bytes: new Uint8Array([80, 75]), media: {} };
  };
  return { calls, conversions, commands: createMailMergeCommands(win, api, convert) };
};

describe("mail merge", () => {
  it("hands the recipients to the engine and shades the fields", () => {
    const { calls, commands } = fakes();
    commands.setRecipients([
      ["Name", "Ort"],
      ["Anna", "Bühl"],
    ]);
    expect(calls).toEqual([
      [
        "start",
        [
          ["Name", "Ort"],
          ["Anna", "Bühl"],
        ],
      ],
      ["highlight", true],
    ]);
  });

  it("inserts fields, previews a recipient and ends the preview", () => {
    const { calls, commands } = fakes();
    commands.insertField("Ort");
    commands.preview(1);
    commands.endPreview();
    expect(calls).toEqual([["field", "Ort"], ["preview", 1], ["endPreview"]]);
  });

  it("names the merge fields of the document once each", () => {
    expect(fakes().commands.fieldsInDocument()).toEqual(["Name", "Ort"]);
  });

  it("writes the merged letters in the binary format and has x2t make a .docx of them", async () => {
    const { conversions, commands } = fakes();
    expect(await commands.mergedDocx()).toEqual(new Uint8Array([80, 75]));
    expect(conversions).toEqual([["DOCY;v5;3;abc", "bin", "docx", { "image1.png": new Uint8Array([7]) }]]);
  });

  it("refuses to merge without recipients", async () => {
    await expect(fakes(0).commands.mergedDocx()).rejects.toThrow("Es sind keine Empfänger geladen.");
  });
});
