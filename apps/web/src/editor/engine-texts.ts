import type { EditorKind, EngineTexts, PivotSummary } from "@schreibzeug/editor-core";
import type { TextEditorTexts } from "@schreibzeug/text-editor";
import { m } from "../paraglide/messages";
import { getLocale } from "../paraglide/runtime";

/**
 * The texts the engine and the text editor show, from the messages (editor-core engine-texts.ts,
 * text-editor editor.ts). The engine looks its own up by their English text (its `translate` map),
 * so in English every message is its key and the map changes nothing.
 */

/** Texts the slide editor draws itself: placeholders, empty states, chart defaults. */
const slideTexts = (): Record<string, string> => ({
  "Click to add first slide": m.engine_texts_slide_first_slide(),
  "Click to add notes": m.engine_texts_slide_notes(),
  "Slide title": m.engine_texts_slide_title(),
  "Slide subtitle": m.engine_texts_slide_subtitle(),
  "Slide text": m.engine_texts_slide_text(),
  "Your text here": m.engine_texts_slide_your_text(),
  "Slide number": m.engine_texts_slide_number(),
  "Date and time": m.engine_texts_slide_date_time(),
  Header: m.engine_texts_slide_header(),
  Footer: m.engine_texts_slide_footer(),
  Chart: m.engine_texts_slide_chart(),
  Table: m.engine_texts_slide_table(),
  Image: m.engine_texts_slide_image(),
  Picture: m.engine_texts_slide_picture(),
  Media: m.engine_texts_slide_media(),
  "Diagram Title": m.engine_texts_slide_diagram_title(),
  Series: m.engine_texts_slide_series(),
  "X Axis": m.engine_texts_slide_x_axis(),
  "Y Axis": m.engine_texts_slide_y_axis(),
});

/**
 * The spreadsheet's texts: the captions of a pivot table (cell/model/PivotTables.js
 * GRAND_TOTAL_CAPTION, ROW_HEADER_CAPTION, …), named as Excel names them.
 */
const cellTexts = (): Record<string, string> => ({
  "Grand Total": m.engine_texts_cell_grand_total(),
  "Row Labels": m.engine_texts_cell_row_labels(),
  "Column Labels": m.engine_texts_cell_column_labels(),
  Values: m.engine_texts_cell_values(),
  "(All)": m.engine_texts_cell_all(),
  "(Multiple Items)": m.engine_texts_cell_multiple_items(),
  "(blank)": m.engine_texts_cell_blank(),
  "%1 of %2": m.engine_texts_cell_page_of(),
});

/** The words the screen reader support says around the text (common/workerspeech.js). */
const speechTexts = (): Record<string, string> => ({
  space: m.engine_texts_speech_space(),
  select: m.engine_texts_speech_select(),
  unselected: m.engine_texts_speech_unselected(),
  selected: m.engine_texts_speech_selected(),
  slide: m.engine_texts_speech_slide(),
  "slides added to selection": m.engine_texts_speech_slides_added(),
  "slides unselected": m.engine_texts_speech_slides_unselected(),
  "drawing select": m.engine_texts_speech_drawing_select(),
  "empty cell": m.engine_texts_speech_empty_cell(),
  empty: m.engine_texts_speech_empty(),
  "selected range select": m.engine_texts_speech_range_select(),
  "unselected range select": m.engine_texts_speech_range_unselect(),
  areas: m.engine_texts_speech_areas(),
  "empty sheet": m.engine_texts_speech_empty_sheet(),
  "end of sheet": m.engine_texts_speech_end_of_sheet(),
  cells: m.engine_texts_speech_cells(),
  objects: m.engine_texts_speech_objects(),
});

const translateFor = (kind: EditorKind): Record<string, string> => {
  if (kind === "slide") return { ...slideTexts(), ...speechTexts() };
  if (kind === "cell") return { ...cellTexts(), ...speechTexts() };
  if (kind === "word") return speechTexts();
  return {};
};

/** A pivot table's summary as Excel names it ("Summe"), for the name of a value. */
const pivotSummaryName = (summary: PivotSummary): string =>
  ({
    sum: m.engine_texts_pivot_sum,
    count: m.engine_texts_pivot_count,
    average: m.engine_texts_pivot_average,
    max: m.engine_texts_pivot_max,
    min: m.engine_texts_pivot_min,
  })[summary]();

/** The texts an engine editor of this kind opens with. */
export const engineTexts = (kind: EditorKind): EngineTexts => ({
  translate: translateFor(kind),
  slideShowEnd: m.engine_texts_slide_show_end(),
  pivotValueName: (summary, field) =>
    m.engine_texts_pivot_value_name({ summary: pivotSummaryName(summary), field }),
  signatureEmpty: m.engine_texts_signature_empty(),
  signatureNoPage: m.engine_texts_signature_no_page(),
  mailMergeNoRecipients: m.engine_texts_mail_merge_no_recipients(),
  mailMergeFailed: m.engine_texts_mail_merge_failed(),
});

/** CodeMirror's own words (search panel, screen reader announcements), by their English key. */
const textPhrases = (): Record<string, string> => ({
  Find: m.engine_texts_text_phrase_find(),
  Replace: m.engine_texts_text_phrase_replace(),
  next: m.engine_texts_text_phrase_next(),
  previous: m.engine_texts_text_phrase_previous(),
  all: m.engine_texts_text_phrase_all(),
  "match case": m.engine_texts_text_phrase_match_case(),
  regexp: m.engine_texts_text_phrase_regexp(),
  "by word": m.engine_texts_text_phrase_by_word(),
  replace: m.engine_texts_text_phrase_replace_one(),
  "replace all": m.engine_texts_text_phrase_replace_all(),
  close: m.engine_texts_text_phrase_close(),
  "current match": m.engine_texts_text_phrase_current_match(),
  "on line": m.engine_texts_text_phrase_on_line(),
  "replaced $ matches": m.engine_texts_text_phrase_replaced(),
  "replaced match on line $": m.engine_texts_text_phrase_replaced_on_line(),
  "Go to line": m.engine_texts_text_phrase_go_to_line(),
  go: m.engine_texts_text_phrase_go(),
  "Selection deleted": m.engine_texts_text_phrase_selection_deleted(),
  "Control character": m.engine_texts_text_phrase_control_character(),
});

/** The texts the text editor opens with; the text is spell-checked in the interface's language. */
export const textEditorTexts = (): TextEditorTexts => ({
  phrases: textPhrases(),
  placeholder: m.engine_texts_text_placeholder(),
  markdownPlaceholder: m.engine_texts_text_markdown_placeholder(),
  label: m.engine_texts_text_label(),
  lang: getLocale(),
});

/** A new Markdown table's header cell, by its number from 1. */
export const tableColumnHeading = (number: number): string => m.engine_texts_text_table_column({ number });
