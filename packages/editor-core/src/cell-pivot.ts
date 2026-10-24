/**
 * Pivot tables in the spreadsheet, as web-apps' desktop spreadsheet editor makes and arranges them
 * (spreadsheeteditor main controller/PivotTable.js onCreateClick, createSheetName, refresh;
 * view/PivotSettings.js the field list; view/ValueFieldSettingsDialog.js the summary of a value).
 * The engine keeps the table (cell/model/PivotTables.js CT_pivotTableDefinition): the cell info
 * names the one at the active cell, and its methods change it.
 */
import type { CellEngineApi, CellWindow, EngineCellInfo, EnginePivotTable } from "./engine-types";

/** Where a field of the source sits in the table: Excel's four areas. */
export type PivotArea = "filters" | "columns" | "rows" | "values";

export const PIVOT_AREAS: readonly PivotArea[] = ["filters", "columns", "rows", "values"];

/** How a value is summed up; Excel offers more, these are the ones people use. */
export type PivotSummary = "sum" | "count" | "average" | "max" | "min";

export const PIVOT_SUMMARIES: readonly PivotSummary[] = ["sum", "count", "average", "max", "min"];

/**
 * A field in one of the areas. `field` is its column in the source, or VALUES_FIELD for the
 * "Werte" entry the engine adds to the rows or columns once there are two values. A value carries
 * its place among the values and how it is summed up.
 */
export type PivotItem = {
  field: number;
  name: string;
  area: PivotArea;
  /** Its place among the values (values only). */
  value?: { index: number; summary: PivotSummary | null };
};

/** The pivot table at the active cell: the columns of its source, and what is in each area. */
export type PivotState = {
  fields: Array<{ index: number; name: string; used: boolean }>;
  items: PivotItem[];
};

/** cell/model/PivotTables.js st_VALUES: the "Werte" entry among the row or column fields. */
export const VALUES_FIELD = -2;

type PivotConstants = Pick<CellWindow["Asc"], "c_oAscDataConsolidateFunction">;

const SUMMARY_CODES = (Asc: PivotConstants): Record<PivotSummary, number> => ({
  sum: Asc.c_oAscDataConsolidateFunction.Sum,
  count: Asc.c_oAscDataConsolidateFunction.Count,
  average: Asc.c_oAscDataConsolidateFunction.Average,
  max: Asc.c_oAscDataConsolidateFunction.Max,
  min: Asc.c_oAscDataConsolidateFunction.Min,
});

/** Excel's German names of the summaries, as it names a value ("Summe von Betrag"). */
export const SUMMARY_NAMES: Record<PivotSummary, string> = {
  sum: "Summe",
  count: "Anzahl",
  average: "Mittelwert",
  max: "Max",
  min: "Min",
};

export const valueName = (summary: PivotSummary, field: string): string =>
  `${SUMMARY_NAMES[summary]} von ${field}`;

const summaryOf = (code: number | null, Asc: PivotConstants): PivotSummary | null => {
  const codes = SUMMARY_CODES(Asc);
  return PIVOT_SUMMARIES.find((summary) => codes[summary] === code) ?? null;
};

/** The field names as web-apps shows them: the pivot field's own name, else the source column's. */
const fieldNames = (pivot: EnginePivotTable): string[] => {
  const cache = pivot.asc_getCacheFields();
  return pivot
    .asc_getPivotFields()
    .map((field, index) => field.asc_getName() || cache[index]?.asc_getName() || "");
};

/** PivotSettings.js fillList: the row and column fields, with "Werte" (-2); the filters without. */
const placed = (fields: Array<{ asc_getIndex(): number }> | null, withValues: boolean): number[] =>
  (fields ?? [])
    .map((field) => field.asc_getIndex())
    .filter((index) => index > -1 || (withValues && index === VALUES_FIELD));

export const readPivot = (
  info: Pick<EngineCellInfo, "asc_getPivotTableInfo">,
  Asc: PivotConstants,
): PivotState | null => {
  const pivot = info.asc_getPivotTableInfo();
  if (!pivot) return null;
  const names = fieldNames(pivot);
  const nameOf = (index: number) => (index === VALUES_FIELD ? "Werte" : (names[index] ?? ""));
  const area = (fields: number[], where: PivotArea): PivotItem[] =>
    fields.map((field) => ({ field, name: nameOf(field), area: where }));
  const values: PivotItem[] = (pivot.asc_getDataFields() ?? [])
    .filter((value) => value.asc_getIndex() > -1)
    .map((value, index) => ({
      field: value.asc_getIndex(),
      name: value.asc_getName() ?? nameOf(value.asc_getIndex()),
      area: "values",
      value: { index, summary: summaryOf(value.asc_getSubtotal(), Asc) },
    }));
  const items = [
    ...area(placed(pivot.asc_getPageFields(), false), "filters"),
    ...area(placed(pivot.asc_getColumnFields(), true), "columns"),
    ...area(placed(pivot.asc_getRowFields(), true), "rows"),
    ...values,
  ];
  const used = new Set(items.map((item) => item.field));
  return { fields: names.map((name, index) => ({ index, name, used: used.has(index) })), items };
};

/** Why no pivot table could be made from the range. */
export type PivotFailure = "invalidRange";

export type PivotCommands = {
  /** The range a new pivot table would take: the table around the active cell ("Preise!$A$1:$D$4"). */
  sourceRange: () => string;
  /** A pivot table of the range on a new sheet; or why there is none. */
  insert: (source: string) => PivotFailure | null;
  /** Puts a column of the source into the table (numbers to the values, others to the rows), or out. */
  toggleField: (field: number, on: boolean) => void;
  /** Moves a field to another area. */
  move: (item: PivotItem, to: PivotArea) => void;
  /** How a value is summed up; it is named after it, as Excel does ("Anzahl von Kunde"). */
  setSummary: (item: PivotItem, summary: PivotSummary) => void;
  /** Reads the source again, after its data changed. */
  refresh: () => void;
};

/** "Pivot1", "Pivot2" …: the first name no sheet has (PivotTable.js createSheetName). */
export const newSheetName = (taken: string[]): string => {
  const lower = new Set(taken.map((name) => name.toLowerCase()));
  let index = 1;
  while (lower.has(`pivot${index}`)) index += 1;
  return `Pivot${index}`;
};

type CommandConstants = PivotConstants &
  Pick<CellWindow["Asc"], "CT_DataField" | "c_oAscSelectionDialogType" | "c_oAscError">;

/**
 * `changed` reads the table again: the engine changes it without a selection change, which is
 * what the state follows otherwise.
 */
export const createPivotCommands = (
  api: CellEngineApi,
  Asc: CommandConstants,
  changed: () => void,
): PivotCommands => {
  const current = () => api.asc_getCellInfo().asc_getPivotTableInfo();
  const withPivot = (change: (pivot: EnginePivotTable) => void) => {
    const pivot = current();
    if (!pivot) return;
    change(pivot);
    changed();
  };
  const sheetNames = () =>
    Array.from({ length: api.asc_getWorksheetsCount() }, (_, index) => api.asc_getWorksheetName(index));
  /** A new value is named in German at once; the engine would call it "Sum of …". */
  const nameValues = (pivot: EnginePivotTable) => {
    const names = fieldNames(pivot);
    (pivot.asc_getDataFields() ?? []).forEach((value, index) => {
      const summary = summaryOf(value.asc_getSubtotal(), Asc) ?? "sum";
      const name = valueName(summary, names[value.asc_getIndex()] ?? "");
      if (value.asc_getName() === name) return;
      const props = new Asc.CT_DataField();
      props.asc_setName(name);
      value.asc_set(api, pivot, index, props);
    });
  };
  return {
    sourceRange: () => api.asc_getAddPivotTableOptions()?.asc_getRange() ?? "",
    insert: (source) => {
      const check = api.asc_checkDataRange(Asc.c_oAscSelectionDialogType.PivotTableData, source, false);
      if (check === Asc.c_oAscError.ID.DataRangeError) return "invalidRange";
      const pivot = api.asc_insertPivotNewWorksheet(source, newSheetName(sheetNames()));
      if (!pivot) return "invalidRange";
      changed();
      return null;
    },
    toggleField: (field, on) =>
      withPivot((pivot) => {
        if (on) pivot.asc_addField(api, field);
        else pivot.asc_removeField(api, field);
        nameValues(pivot);
      }),
    move: (item, to) =>
      withPivot((pivot) => {
        const dataIndex = item.value?.index;
        if (to === "rows") pivot.asc_moveToRowField(api, item.field, dataIndex);
        else if (to === "columns") pivot.asc_moveToColField(api, item.field, dataIndex);
        else if (to === "filters") pivot.asc_moveToPageField(api, item.field, dataIndex);
        else pivot.asc_moveToDataField(api, item.field, dataIndex);
        nameValues(pivot);
      }),
    setSummary: (item, summary) =>
      withPivot((pivot) => {
        const value = item.value && pivot.asc_getDataFields()?.[item.value.index];
        if (!value || !item.value) return;
        const props = new Asc.CT_DataField();
        props.asc_setSubtotal(SUMMARY_CODES(Asc)[summary]);
        props.asc_setName(valueName(summary, fieldNames(pivot)[item.field] ?? ""));
        value.asc_set(api, pivot, item.value.index, props);
      }),
    refresh: () => withPivot((pivot) => pivot.asc_refresh(api)),
  };
};
