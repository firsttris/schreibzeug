/**
 * The page of a text document and the spacing of its paragraphs: orientation, paper size,
 * margins, line spacing and indents. The choices are those of web-apps' layout tab
 * (documenteditor main view/Toolbar.js: mnuPageSize, mnuPageMargins, the line spacing menu); the
 * calls are the ones its controller makes (controller/Toolbar.js onPageOrientSelect,
 * onPageSizeClick, onPageMarginsSelect, onLineSpaceClick).
 */

/** In millimetres, as sdkjs measures pages (word/Editor/api/document-section-props.js). */
export type Margins = { top: number; left: number; bottom: number; right: number };

export type PageLayout = {
  /** Width and height as the page lies, so a landscape A4 is 297 wide. */
  width: number;
  height: number;
  portrait: boolean;
  margins: Margins;
};

export type PaperSize = { id: string; width: number; height: number };

/** Upright sizes, as web-apps lists them; the engine turns them for a landscape page. */
export const PAPER_SIZES: readonly PaperSize[] = [
  { id: "A4", width: 210, height: 297 },
  { id: "A5", width: 148, height: 210 },
  { id: "Letter", width: 215.9, height: 279.4 },
  { id: "Legal", width: 215.9, height: 355.6 },
];

export type MarginPreset = { id: "normal" | "narrow" | "moderate" | "wide"; margins: Margins };

/** web-apps' presets; "normal" is its European one (top 2, left 3, bottom 2, right 1.5 cm). */
export const MARGIN_PRESETS: readonly MarginPreset[] = [
  { id: "normal", margins: { top: 20, left: 30, bottom: 20, right: 15 } },
  { id: "narrow", margins: { top: 12.7, left: 12.7, bottom: 12.7, right: 12.7 } },
  { id: "moderate", margins: { top: 25.4, left: 19.1, bottom: 25.4, right: 19.1 } },
  { id: "wide", margins: { top: 25.4, left: 50.8, bottom: 25.4, right: 50.8 } },
];

/** Multiples of a single line (linerule auto). */
export const LINE_SPACINGS: readonly number[] = [1, 1.15, 1.5, 2, 2.5, 3];

/** web-apps checks a preset when every value is within a tenth of a millimetre. */
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.1;

export const paperSizeOf = (page: PageLayout): PaperSize | null => {
  const [short, long] = [Math.min(page.width, page.height), Math.max(page.width, page.height)];
  return PAPER_SIZES.find((size) => near(size.width, short) && near(size.height, long)) ?? null;
};

export const marginPresetOf = (margins: Margins): MarginPreset["id"] | null =>
  MARGIN_PRESETS.find((preset) =>
    (Object.keys(margins) as Array<keyof Margins>).every((side) => near(preset.margins[side], margins[side])),
  )?.id ?? null;

/** Asc.CDocumentSectionProps (word/Editor/api/document-section-props.js), as far as read here. */
export type SectionProps = {
  get_W(): number;
  get_H(): number;
  get_Orientation(): number;
  get_TopMargin(): number;
  get_LeftMargin(): number;
  get_BottomMargin(): number;
  get_RightMargin(): number;
  put_TopMargin(value: number): void;
  put_LeftMargin(value: number): void;
  put_BottomMargin(value: number): void;
  put_RightMargin(value: number): void;
};

/** AscCommon.asc_CParagraphSpacing (common/apiCommon.js). */
export type ParagraphSpacing = { asc_getLine(): number; asc_getLineRule(): number };

export type LayoutConstants = {
  /** Asc.c_oAscPageOrientation.PagePortrait (common/commonDefines.js). */
  portrait: number;
  /** Asc.linerule_Auto: the line value is a multiple of a single line. */
  lineRuleAuto: number;
};

export const readSection = (props: SectionProps, constants: LayoutConstants): PageLayout => ({
  width: props.get_W(),
  height: props.get_H(),
  portrait: props.get_Orientation() === constants.portrait,
  margins: {
    top: props.get_TopMargin(),
    left: props.get_LeftMargin(),
    bottom: props.get_BottomMargin(),
    right: props.get_RightMargin(),
  },
});

/** The line spacing as a multiple, or null when it is exact or "at least" a height, or mixed. */
export const readLineSpacing = (spacing: ParagraphSpacing, constants: LayoutConstants): number | null => {
  const line = spacing.asc_getLine();
  return spacing.asc_getLineRule() === constants.lineRuleAuto && Number.isFinite(line) && line > 0
    ? Math.round(line * 100) / 100
    : null;
};

/** word/api.js, the calls behind the layout commands. */
export type LayoutApi = {
  change_PageOrient(isPortrait: boolean): void;
  /** Upright width and height; the engine swaps them for a landscape page. */
  change_DocSize(width: number, height: number): void;
  asc_SetSectionProps(props: SectionProps): void;
  put_PrLineSpacing(lineRule: number, value: number): void;
  IncreaseIndent(): void;
  DecreaseIndent(): void;
};

export type LayoutCommands = {
  setOrientation: (portrait: boolean) => void;
  setPaperSize: (size: PaperSize) => void;
  setMargins: (margins: Margins) => void;
  setLineSpacing: (multiple: number) => void;
  indent: (direction: "more" | "less") => void;
};

/** Section props with only the margins set: Set_SectionProps leaves what is undefined alone. */
export const createLayoutCommands = (
  api: LayoutApi,
  newSectionProps: () => SectionProps,
  constants: LayoutConstants,
): LayoutCommands => ({
  setOrientation: (portrait) => api.change_PageOrient(portrait),
  setPaperSize: ({ width, height }) => api.change_DocSize(width, height),
  setMargins: ({ top, left, bottom, right }) => {
    const props = newSectionProps();
    props.put_TopMargin(top);
    props.put_LeftMargin(left);
    props.put_BottomMargin(bottom);
    props.put_RightMargin(right);
    api.asc_SetSectionProps(props);
  },
  setLineSpacing: (multiple) => api.put_PrLineSpacing(constants.lineRuleAuto, multiple),
  indent: (direction) => (direction === "more" ? api.IncreaseIndent() : api.DecreaseIndent()),
});
