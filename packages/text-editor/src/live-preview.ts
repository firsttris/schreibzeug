import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { toggleTask } from "./commands";

/**
 * Markdown shown formatted while it stays Markdown, as Obsidian's live preview does: the marks
 * (#, **, `, the link's address) are hidden in every line but the ones being edited, list marks
 * become bullets and task marks checkboxes. The text itself is never changed by this; it is only
 * how CodeMirror draws it (decorations, @codemirror/view).
 */

/** Marks hidden outside the lines being edited. */
const HIDDEN = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "StrikethroughMark",
  "QuoteMark",
  "LinkMark",
  "URL",
  "LinkTitle",
]);

/** Classes for whole lines, so headings and quotes look like them in every line. */
const LINE_CLASS: Record<string, string> = {
  ATXHeading1: "cm-md-h1",
  ATXHeading2: "cm-md-h2",
  ATXHeading3: "cm-md-h3",
  ATXHeading4: "cm-md-h4",
  ATXHeading5: "cm-md-h5",
  ATXHeading6: "cm-md-h6",
  Blockquote: "cm-md-quote",
  FencedCode: "cm-md-code-block",
  CodeBlock: "cm-md-code-block",
  Table: "cm-md-table",
};

// CodeMirror draws widgets from subclasses of WidgetType; these two are the only classes here.
class BulletWidget extends WidgetType {
  override eq() {
    return true;
  }
  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "cm-md-bullet";
    bullet.setAttribute("aria-hidden", "true");
    return bullet;
  }
}

class TaskWidget extends WidgetType {
  constructor(
    readonly done: boolean,
    readonly readOnly: boolean,
  ) {
    super();
  }
  override eq(other: TaskWidget) {
    return other.done === this.done && other.readOnly === this.readOnly;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-md-task";
    box.checked = this.done;
    box.disabled = this.readOnly;
    box.setAttribute("aria-label", this.done ? "Erledigt" : "Offen");
    box.addEventListener("mousedown", (event) => event.preventDefault());
    box.addEventListener("click", (event) => {
      event.preventDefault();
      const change = toggleTask(view.posAtDOM(box))(view.state);
      if (change) view.dispatch(change);
    });
    return box;
  }
  override ignoreEvent() {
    return true;
  }
}

/** The numbers of the lines a selection touches; those show their marks. */
const editedLines = (state: EditorState, focused: boolean): Set<number> => {
  const lines = new Set<number>();
  if (!focused) return lines;
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number;
    for (let number = state.doc.lineAt(range.from).number; number <= last; number++) lines.add(number);
  }
  return lines;
};

const decorationsOf = (view: EditorView): DecorationSet => {
  const { state } = view;
  const edited = editedLines(state, view.hasFocus);
  const readOnly = state.readOnly;
  const isEdited = (position: number) => edited.has(state.doc.lineAt(position).number);
  const ranges: Range<Decoration>[] = [];
  const lineClasses = new Map<number, Set<string>>();
  const addLineClass = (from: number, to: number, name: string) => {
    for (let line = state.doc.lineAt(from); ; line = state.doc.line(line.number + 1)) {
      const classes = lineClasses.get(line.from) ?? new Set();
      lineClasses.set(line.from, classes.add(name));
      if (line.to >= to || line.number === state.doc.lines) break;
    }
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const lineClass = LINE_CLASS[node.name];
        if (lineClass) addLineClass(node.from, node.to, lineClass);
        if (node.name === "ListMark" && !isEdited(node.from)) {
          const task = node.node.nextSibling?.name === "Task";
          const mark = state.sliceDoc(node.from, node.to);
          // A task's own mark is enough; an ordered list keeps its numbers.
          if (task) ranges.push(Decoration.replace({}).range(node.from, node.to + 1));
          else if (/^[-*+]$/.test(mark))
            ranges.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
        }
        if (node.name === "TaskMarker" && !isEdited(node.from)) {
          const done = /x/i.test(state.sliceDoc(node.from, node.to));
          ranges.push(
            Decoration.replace({ widget: new TaskWidget(done, readOnly) }).range(node.from, node.to),
          );
          if (done) addLineClass(node.from, node.from, "cm-md-task-done");
        }
        if (!HIDDEN.has(node.name) || isEdited(node.from)) return;
        // Inside code the marks are text; a link's address is hidden with its brackets only.
        const parent = node.node.parent?.name ?? "";
        if (node.name === "CodeMark" && parent !== "InlineCode") return;
        if ((node.name === "URL" || node.name === "LinkTitle") && parent !== "Link" && parent !== "Image")
          return;
        const end =
          node.name === "HeaderMark" || node.name === "QuoteMark" ? spaceAfter(state, node.to) : node.to;
        if (end > node.from) ranges.push(Decoration.replace({}).range(node.from, end));
      },
    });
  }
  for (const [from, classes] of lineClasses)
    ranges.push(Decoration.line({ class: [...classes].join(" ") }).range(from));
  return Decoration.set(ranges, true);
};

/** The position after the blank that follows a heading's or a quote's mark. */
const spaceAfter = (state: EditorState, position: number) =>
  /[ \t]/.test(state.sliceDoc(position, position + 1)) ? position + 1 : position;

export const livePreview = ViewPlugin.define(
  (view) => {
    const plugin = {
      decorations: decorationsOf(view),
      update: (update: ViewUpdate) => {
        const reparsed = syntaxTree(update.startState) !== syntaxTree(update.state);
        const moved = update.selectionSet || update.focusChanged || update.viewportChanged;
        if (update.docChanged || moved || reparsed) plugin.decorations = decorationsOf(update.view);
      },
    };
    return plugin;
  },
  { decorations: (plugin) => plugin.decorations },
);
