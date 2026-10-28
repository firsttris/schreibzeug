import type { PivotSummary } from "./cell-pivot";

/**
 * The texts editor-core puts in front of a person: what the engine draws or says itself and what
 * editor-core writes or reports. They come from the app (its messages), so the engine speaks the
 * interface's language; editor-core holds no language of its own but the engine's English.
 */
export type EngineTexts = {
  /**
   * The map the engine's API is created with (`translate`): the engine's English texts as keys
   * (placeholders, empty states, chart defaults, pivot captions, screen reader words), each with
   * the text to show. A key not in it stays English (common/editorscommon.js
   * CTranslateManager.getValue), so an empty map is the engine's own English. One map per editor:
   * the app passes the one for the editor it opens.
   */
  translate: Record<string, string>;
  /** Shown on the black page after the last slide (slide/api.js DemonstrationEndShowMessage). */
  slideShowEnd: string;
  /**
   * A pivot table value's name after its summary, as Excel names it ("Sum of Amount"); written
   * into the file, since the engine fills in "Sum" untranslated (cell-pivot.ts).
   */
  pivotValueName: (summary: PivotSummary, field: string) => string;
  /** Errors for the person: a drawn signature without strokes, or no page to put it on. */
  signatureEmpty: string;
  signatureNoPage: string;
  /** Errors for the person: a mail merge without recipients, or one the engine did not make. */
  mailMergeNoRecipients: string;
  mailMergeFailed: string;
};

/** Excel's English names of the summaries, as it names a value ("Sum of Amount"). */
const ENGLISH_SUMMARIES: Record<PivotSummary, string> = {
  sum: "Sum",
  count: "Count",
  average: "Average",
  max: "Max",
  min: "Min",
};

/** The engine's own language, where the app gives no texts. */
export const ENGLISH_TEXTS: EngineTexts = {
  translate: {},
  slideShowEnd: "End of slide show. Click to exit.",
  pivotValueName: (summary, field) => `${ENGLISH_SUMMARIES[summary]} of ${field}`,
  signatureEmpty: "The signature is empty.",
  signatureNoPage: "There is no page for the signature.",
  mailMergeNoRecipients: "No recipients are loaded.",
  mailMergeFailed: "The mail merge could not be put together.",
};

/** The texts a document opens with: the app's, else the engine's English. */
export const textsOf = (options: { texts?: EngineTexts }): EngineTexts => options.texts ?? ENGLISH_TEXTS;
