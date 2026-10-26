import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension, type Text } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  activeMarks,
  type BlockKind,
  blockAt,
  type InlineMark,
  insertLink,
  insertRule,
  insertTable,
  type LinePrefix,
  setBlock,
  type TextCommand,
  toggleInline,
  toggleLinePrefix,
} from "./commands";
import { livePreview } from "./live-preview";
import { GERMAN_PHRASES } from "./phrases";

/**
 * A Markdown or plain text file in CodeMirror 6, without a UI framework: the interface around it
 * (apps/web text-view.tsx) reads its state and calls its commands, as the other editors do with
 * editor-core. It holds the text with "\n" between lines; codec.ts turns it into the file's bytes.
 */

/**
 * How Markdown is shown: formatted with the marks only where the cursor is ("live"), as plain
 * source next to a preview ("split"), or as plain source alone ("source").
 */
export type TextViewMode = "live" | "split" | "source";

export type TextEditorState = {
  /** Changed since it was opened or last saved. */
  modified: boolean;
  line: number;
  column: number;
  /** For the toolbar: what the cursor's line is and which marks the cursor is in. */
  block: BlockKind;
  marks: InlineMark[];
  canUndo: boolean;
  canRedo: boolean;
};

export type TextEditorOptions = {
  parent: HTMLElement;
  text: string;
  /** Markdown with its toolbar and preview; else a plain text file, shown as it is. */
  markdown: boolean;
  readOnly: boolean;
  mode?: TextViewMode;
  /** Called after every change of text, cursor or focus. */
  onChange?: (state: TextEditorState) => void;
  /** Called with the text after every change of it, e.g. for the preview. */
  onText?: (text: string) => void;
  /** Ctrl+S, before the browser's own "save page". */
  onSave?: () => void;
};

/** Styles the Markdown by its syntax; text-view.css gives the classes their look. */
const markdownStyle = HighlightStyle.define([
  { tag: tags.strong, class: "cm-md-strong" },
  { tag: tags.emphasis, class: "cm-md-em" },
  { tag: tags.strikethrough, class: "cm-md-strike" },
  { tag: tags.monospace, class: "cm-md-code" },
  { tag: tags.link, class: "cm-md-link" },
  { tag: tags.url, class: "cm-md-url" },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.labelName], class: "cm-md-mark" },
  { tag: tags.quote, class: "cm-md-quote-text" },
]);

const modeExtension = (markdownFile: boolean, mode: TextViewMode): Extension =>
  markdownFile && mode === "live"
    ? [livePreview, EditorView.editorAttributes.of({ class: "cm-live" })]
    : EditorView.editorAttributes.of({ class: "cm-source" });

export const createTextEditor = ({
  parent,
  text,
  markdown: markdownFile,
  readOnly,
  mode = "live",
  onChange = () => {},
  onText = () => {},
  onSave = () => {},
}: TextEditorOptions) => {
  let saved: Text | null = null;
  const presentation = new Compartment();

  const stateOf = (state: EditorState): TextEditorState => {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    return {
      modified: saved !== null && !state.doc.eq(saved),
      line: line.number,
      column: head - line.from + 1,
      block: markdownFile ? blockAt(state) : "paragraph",
      marks: markdownFile ? activeMarks(state) : [],
      canUndo: undoDepth(state) > 0,
      canRedo: redoDepth(state) > 0,
    };
  };

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        EditorState.phrases.of(GERMAN_PHRASES),
        search({ top: true }),
        highlightSelectionMatches(),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              onSave();
              return true;
            },
          },
          ...(markdownFile
            ? [
                { key: "Mod-b", run: (target: EditorView) => apply(target, toggleInline("strong")) },
                { key: "Mod-i", run: (target: EditorView) => apply(target, toggleInline("emphasis")) },
                ...markdownKeymap,
              ]
            : []),
          ...searchKeymap,
          ...historyKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        markdownFile ? [markdown({ base: markdownLanguage }), syntaxHighlighting(markdownStyle)] : [],
        placeholder(
          markdownFile
            ? "Schreib los … Markdown wie **fett** oder # Überschrift geht auch."
            : "Schreib los …",
        ),
        presentation.of(modeExtension(markdownFile, mode)),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({ "aria-label": "Text", spellcheck: "true", lang: "de" }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onText(update.state.doc.toString());
          if (update.docChanged || update.selectionSet || update.focusChanged)
            onChange(stateOf(update.state));
        }),
      ],
    }),
  });
  saved = view.state.doc;

  return {
    view,
    state: () => stateOf(view.state),
    text: () => view.state.doc.toString(),
    /** The selected text, e.g. for a link's text. */
    selection: () => view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to),
    /** Runs a toolbar command and gives the focus back to the text. */
    run: (command: TextCommand) => {
      apply(view, command);
      view.focus();
    },
    setMode: (next: TextViewMode) =>
      view.dispatch({ effects: presentation.reconfigure(modeExtension(markdownFile, next)) }),
    /** The text as it was stored; "modified" is measured against it. */
    markSaved: (storedText: string) => {
      saved =
        view.state.doc.toString() === storedText
          ? view.state.doc
          : EditorState.create({ doc: storedText }).doc;
      onChange(stateOf(view.state));
    },
    /** Puts another text in, e.g. the newest version after a conflict; it counts as saved. */
    replace: (next: string) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      saved = view.state.doc;
      onChange(stateOf(view.state));
    },
    undo: () => {
      undo(view);
      view.focus();
    },
    redo: () => {
      redo(view);
      view.focus();
    },
    find: () => openSearchPanel(view),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
};

export type TextEditor = ReturnType<typeof createTextEditor>;

const apply = (view: EditorView, command: TextCommand): boolean => {
  if (view.state.readOnly) return false;
  const spec = command(view.state);
  if (!spec) return false;
  view.dispatch(view.state.update(spec, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

/** The toolbar's commands by name, so the interface needs no CodeMirror import. */
export const TEXT_COMMANDS = {
  inline: toggleInline,
  block: setBlock,
  prefix: (prefix: LinePrefix) => toggleLinePrefix(prefix),
  link: insertLink,
  table: insertTable,
  rule: insertRule,
};
