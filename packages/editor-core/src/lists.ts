import type { NumberingFormats, WordEngineApi } from "./engine-types";
import type { ListKind } from "./state";

/**
 * List presets for put_ListTypeCustom (word/api.js, parsed by AscWord.CNumInfo.Parse), taken from
 * web-apps documenteditor/mobile store/textSettings.js: the round bullet ("id-markers-1") and
 * "1." ("id-numbers-1"), the first entries Word offers too.
 */
export const LIST_PRESETS: Record<ListKind | "remove", object> = {
  bullet: {
    Type: "bullet",
    Lvl: [
      {
        lvlJc: "left",
        suff: "tab",
        numFmt: { val: "bullet" },
        lvlText: "·",
        rPr: { rFonts: { ascii: "Symbol", cs: "Symbol", eastAsia: "Symbol", hAnsi: "Symbol" } },
      },
    ],
  },
  number: {
    Type: "number",
    Lvl: [{ lvlJc: "right", suff: "tab", numFmt: { val: "decimal" }, lvlText: "%1." }],
  },
  remove: { Type: "remove" },
};

/**
 * The list the cursor is in, read the way web-apps does on asc_onFocusObject
 * (documenteditor/mobile controller/edit/EditText.jsx updateListType): the current numbering's
 * format at the current level; a bullet format is a bullet list, any other but None a numbered one.
 */
export const readListKind = (api: WordEngineApi, formats: NumberingFormats): ListKind | null => {
  const id = api.asc_GetCurrentNumberingId();
  if (id === null) return null;
  const format = api.asc_GetNumberingPr(id)?.get_Lvl(api.asc_GetCurrentNumberingLvl())?.get_Format();
  if (format === undefined || format === formats.None) return null;
  return format === formats.Bullet ? "bullet" : "number";
};
