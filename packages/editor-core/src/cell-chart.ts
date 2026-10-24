/**
 * Charts in the spreadsheet, as web-apps' mobile spreadsheet editor makes and changes them
 * (spreadsheeteditor/mobile controller/add/AddChart.jsx onInsertChart, controller/edit/EditChart.jsx
 * onType): the chart settings for the selection (asc_getChartSettings), checked
 * (asc_checkDataRange) and added (asc_addChartDrawingObject); a selected chart changes its type
 * through its own settings (asc_ChartSettings.changeType, common/apiCommon.js).
 */
import type { CellEngineApi, CellWindow, EngineCellInfo, EngineChartSettings } from "./engine-types";

/** The kinds of chart offered: columns, bars, lines, a pie, areas. */
export type ChartKind = "column" | "bar" | "line" | "pie" | "area";

export const CHART_KINDS: readonly ChartKind[] = ["column", "bar", "line", "pie", "area"];

/** common/commonDefines.js c_oAscChartTypeSettings, the plain (not stacked, not 3D) variant of each. */
type ChartTypes = {
  barNormal: number;
  hBarNormal: number;
  lineNormal: number;
  pie: number;
  areaNormal: number;
};

const engineType = (kind: ChartKind, types: ChartTypes): number =>
  ({
    column: types.barNormal,
    bar: types.hBarNormal,
    line: types.lineNormal,
    pie: types.pie,
    area: types.areaNormal,
  })[kind];

export const chartKindOf = (type: number, types: ChartTypes): ChartKind | null =>
  CHART_KINDS.find((kind) => engineType(kind, types) === type) ?? null;

/** Why a chart could not be made from the selection. */
export type ChartFailure = "noData" | "tooManySeries";

export type ChartCommands = {
  /** A chart of the selected cells; or the failure, for the message to show. */
  insert: (kind: ChartKind) => ChartFailure | null;
  /** Changes the selected chart to this kind. */
  changeKind: (kind: ChartKind) => void;
};

type ChartConstants = Pick<
  CellWindow["Asc"],
  "c_oAscChartTypeSettings" | "c_oAscSelectionDialogType" | "c_oAscError" | "c_oAscSelectionType"
>;

/** The settings of the selected chart, if a chart is selected (EditChart.jsx chartObject). */
const selectedChart = (api: CellEngineApi): EngineChartSettings | null => {
  for (const object of api.asc_getGraphicObjectProps() ?? []) {
    const chart = object.get_ObjectValue()?.get_ChartProperties?.();
    if (chart) return chart;
  }
  return null;
};

/** The kind of the selected chart, or null when no chart is selected (or one we do not offer). */
export const readSelectedChart = (
  api: CellEngineApi,
  info: Pick<EngineCellInfo, "asc_getSelectionType">,
  Asc: ChartConstants,
): ChartKind | null => {
  const type = info.asc_getSelectionType();
  const { RangeChart, RangeChartText } = Asc.c_oAscSelectionType;
  if (type !== RangeChart && type !== RangeChartText) return null;
  const chart = selectedChart(api);
  return chart ? chartKindOf(chart.getType(), Asc.c_oAscChartTypeSettings) : null;
};

export const createChartCommands = (api: CellEngineApi, Asc: ChartConstants): ChartCommands => ({
  insert: (kind) => {
    const settings = api.asc_getChartSettings(true);
    if (!settings) return "noData";
    settings.putType(engineType(kind, Asc.c_oAscChartTypeSettings));
    // web-apps adds an empty chart without a range; here the selection has to hold the data.
    const range = settings.getRange();
    if (!range) return "noData";
    const check = api.asc_checkDataRange(
      Asc.c_oAscSelectionDialogType.Chart,
      range,
      true,
      !settings.getInColumns(),
      settings.getType(),
    );
    if (check === Asc.c_oAscError.ID.MaxDataSeriesError) return "tooManySeries";
    if (check !== Asc.c_oAscError.ID.No) return "noData";
    api.asc_addChartDrawingObject(settings);
    return null;
  },
  changeKind: (kind) => {
    selectedChart(api)?.changeType(engineType(kind, Asc.c_oAscChartTypeSettings));
  },
});
