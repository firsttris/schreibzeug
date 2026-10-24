/**
 * Rules on cells: a dropdown list of allowed values (data validation) and quick conditional
 * formats, as web-apps' desktop spreadsheet editor sets them (spreadsheeteditor main
 * controller/DataTab.js onDataValidation with view/DataValidationDialog.js; controller/Toolbar.js
 * the data bar and colour scale pickers and "Regeln löschen").
 */
import type { CellEngineApi, CellWindow, EngineDataValidation } from "./engine-types";

/** The quick conditional formats: a blue data bar, or a green–yellow–red colour scale. */
export type QuickFormat = "dataBar" | "colorScale";

export type RuleCommands = {
  /** The values of the dropdown list on the selection, or null where there is none. */
  dropdown: () => string[] | null;
  /** Sets the selection's dropdown list; null takes it away. Empty entries are left out. */
  setDropdown: (values: string[] | null) => void;
  quickFormat: (format: QuickFormat) => void;
  /** Takes the conditional formats off the selected cells. */
  clearFormats: () => void;
};

type RuleConstants = Pick<
  CellWindow["Asc"],
  | "c_oAscEDataValidationType"
  | "CDataFormula"
  | "c_oAscCFRuleTypeSettings"
  | "c_oAscSelectionForCFType"
  | "c_oAscError"
>;

/**
 * The list's entries as the engine shows them: separated by the function argument separator of
 * the German format (asc_setLocale 0x0407), ";" (DataValidation.js toListPreview).
 */
const SEPARATOR = ";";

export const splitList = (value: string): string[] =>
  value
    .replace(/^"|"$/g, "")
    .split(SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);

/** The first preset of each of web-apps' pickers: "gradient-blue" and "green-yellow-red". */
const PRESET_INDEX = 0;

export const createRuleCommands = (api: CellEngineApi, Asc: RuleConstants): RuleCommands => {
  /**
   * The selection's data validation. Where it covers cells with different rules, or with a rule
   * and without, web-apps asks first; this takes the answer that makes one rule of the selection:
   * extend the rule (true), or start over where there are several (null).
   */
  const props = (): EngineDataValidation | null => {
    const first = api.asc_getDataValidationProps();
    if (typeof first === "object" && first !== null) return first;
    const again = api.asc_getDataValidationProps(
      first === Asc.c_oAscError.ID.MoreOneTypeDataValidate ? null : true,
    );
    return typeof again === "object" ? again : null;
  };
  return {
    dropdown: () => {
      const current = props();
      if (!current || current.asc_getType() !== Asc.c_oAscEDataValidationType.List) return null;
      return splitList(current.asc_getFormula1()?.asc_getValue() ?? "");
    },
    setDropdown: (values) => {
      const current = props();
      if (!current) return;
      const entries = (values ?? []).map((value) => value.trim()).filter(Boolean);
      if (entries.length === 0) {
        current.asc_setType(Asc.c_oAscEDataValidationType.None);
      } else {
        current.asc_setType(Asc.c_oAscEDataValidationType.List);
        const formula = new Asc.CDataFormula();
        formula.asc_setValue(entries.join(SEPARATOR));
        current.asc_setFormula1(formula);
        current.asc_setAllowBlank(true);
        current.asc_setShowErrorMessage(true);
      }
      api.asc_setDataValidation(current);
    },
    quickFormat: (format) => api.asc_setCF([], [], [Asc.c_oAscCFRuleTypeSettings[format], PRESET_INDEX]),
    clearFormats: () => api.asc_clearCF(Asc.c_oAscSelectionForCFType.selection),
  };
};
