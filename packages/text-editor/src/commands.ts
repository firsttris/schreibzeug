import { syntaxTree } from "@codemirror/language";
import {
  type ChangeSpec,
  EditorSelection,
  type EditorState,
  type Line,
  type TransactionSpec,
} from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

/**
 * What the toolbar does to Markdown: it writes the marks into the text, as someone typing them
 * would (CommonMark with GitHub's tables, task lists and strikethrough). Each command takes the
 * state and returns the change, or null when there is nothing to do, so they test without a view.
 */

export type InlineMark = "strong" | "emphasis" | "strikethrough" | "code";
export type BlockKind = "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type LinePrefix = "bullet" | "ordered" | "task" | "quote";

export type TextCommand = (state: EditorState) => TransactionSpec | null;

const MARK: Record<InlineMark, string> = { strong: "**", emphasis: "*", strikethrough: "~~", code: "`" };

/** The syntax node each inline mark is, in @lezer/markdown's names. */
const NODE_OF_MARK: Record<InlineMark, string> = {
  strong: "StrongEmphasis",
  emphasis: "Emphasis",
  strikethrough: "Strikethrough",
  code: "InlineCode",
};

/**
 * Bold, italic, strikethrough or code around the selection; taken away again when the selection is
 * already in it. With nothing selected, the marks go in with the cursor between them.
 */
export const toggleInline =
  (mark: InlineMark): TextCommand =>
  (state) => {
    const marker = MARK[mark];
    const size = marker.length;
    return state.changeByRange((range) => {
      const inside = enclosing(state, range.from, range.to, NODE_OF_MARK[mark]);
      if (inside) {
        return {
          changes: [
            { from: inside.from, to: inside.from + size },
            { from: inside.to - size, to: inside.to },
          ],
          range: EditorSelection.range(
            withoutMarks(range.from, inside, size),
            withoutMarks(range.to, inside, size),
          ),
        };
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(range.from + size, range.to + size),
      };
    });
  };

/** Where a position is once both marks of the span [from, to] (each `size` long) are gone. */
const withoutMarks = (position: number, { from, to }: { from: number; to: number }, size: number) => {
  const beforeOpen = Math.min(Math.max(position - from, 0), size);
  const beforeClose = Math.min(Math.max(position - (to - size), 0), size);
  return position - beforeOpen - beforeClose;
};

/** The node of that name around the range, from its opening mark to its closing one. */
const enclosing = (state: EditorState, from: number, to: number, name: string) => {
  const tree = syntaxTree(state);
  // Both sides: a cursor right after "**bold**" is in it as well as one right before.
  for (const side of [1, -1] as const) {
    for (let node: SyntaxNode | null = tree.resolveInner(from, side); node; node = node.parent)
      if (node.name === name && node.from <= from && node.to >= to) return { from: node.from, to: node.to };
  }
  return null;
};

/** The marks the cursor or selection is in, for the toolbar's pressed buttons. */
export const activeMarks = (state: EditorState): InlineMark[] => {
  const { from, to } = state.selection.main;
  return (Object.keys(NODE_OF_MARK) as InlineMark[]).filter((mark) =>
    enclosing(state, from, to, NODE_OF_MARK[mark]),
  );
};

/** The lines the selection covers, each once. */
const selectedLines = (state: EditorState): Line[] => {
  const lines = new Map<number, Line>();
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number;
    for (let number = state.doc.lineAt(range.from).number; number <= last; number++)
      lines.set(number, state.doc.line(number));
  }
  return [...lines.values()];
};

const HEADING = /^(#{1,6})[ \t]+/;
const HEADING_ONLY = /^#{1,6}$/;

export const blockOf = (text: string): BlockKind => {
  const match = HEADING.exec(text) ?? (HEADING_ONLY.test(text) ? [text, text] : null);
  return match ? (`h${match[1]?.length ?? 1}` as BlockKind) : "paragraph";
};

/** The kind of the line the cursor is in, for the dropdown. */
export const blockAt = (state: EditorState): BlockKind =>
  blockOf(state.doc.lineAt(state.selection.main.head).text);

/** Line changes with the cursor after what was put in front of it, as if the marks had been typed. */
const lineChanges = (state: EditorState, changes: ChangeSpec): TransactionSpec => {
  const set = state.changes(changes);
  return { changes: set, selection: state.selection.map(set, 1) };
};

/** Makes the selected lines headings of a level, or plain paragraphs again. */
export const setBlock =
  (kind: BlockKind): TextCommand =>
  (state) => {
    const prefix = kind === "paragraph" ? "" : `${"#".repeat(Number(kind.slice(1)))} `;
    const changes = selectedLines(state).map((line) => {
      const current = HEADING.exec(line.text)?.[0] ?? (HEADING_ONLY.test(line.text) ? line.text : "");
      return { from: line.from, to: line.from + current.length, insert: prefix };
    });
    return lineChanges(state, changes);
  };

const PREFIX_PATTERN: Record<LinePrefix, RegExp> = {
  task: /^(\s*)[-*+][ \t]+\[[ xX]\][ \t]+/,
  bullet: /^(\s*)[-*+][ \t]+(?!\[[ xX]\][ \t])/,
  ordered: /^(\s*)\d{1,9}[.)][ \t]+/,
  quote: /^(\s*)>[ \t]?/,
};
const LIST_PREFIXES: LinePrefix[] = ["task", "bullet", "ordered"];

/**
 * A list, a task list or a quote for the selected lines; taken away again when every line already
 * is one. A list of another kind becomes this kind, numbered from 1.
 */
export const toggleLinePrefix =
  (prefix: LinePrefix): TextCommand =>
  (state) => {
    const lines = selectedLines(state).filter((line, _, all) => all.length === 1 || line.text.trim() !== "");
    const remove = lines.every((line) => PREFIX_PATTERN[prefix].test(line.text));
    const others = prefix === "quote" ? [] : LIST_PREFIXES.filter((other) => other !== prefix);
    const changes = lines.map((line, index) => {
      const own = PREFIX_PATTERN[prefix].exec(line.text);
      if (remove && own) return { from: line.from + (own[1]?.length ?? 0), to: line.from + own[0].length };
      const other = others.map((kind) => PREFIX_PATTERN[kind].exec(line.text)).find(Boolean);
      const indent = (other ?? own)?.[1] ?? "";
      const insert = { bullet: "- ", ordered: `${index + 1}. `, task: "- [ ] ", quote: "> " }[prefix];
      const replaced = other ?? (own && prefix === "quote" ? own : null);
      return {
        from: line.from + indent.length,
        to: line.from + (replaced ? replaced[0].length : indent.length),
        insert,
      };
    });
    return lineChanges(state, changes);
  };

/** Ticks or unticks the task in the line at `position` ("- [ ]" ↔ "- [x]"). */
export const toggleTask =
  (position: number): TextCommand =>
  (state) => {
    const line = state.doc.lineAt(position);
    const match = /^(\s*[-*+][ \t]+\[)([ xX])\]/.exec(line.text);
    if (!match) return null;
    const at = line.from + (match[1]?.length ?? 0);
    return { changes: { from: at, to: at + 1, insert: match[2] === " " ? "x" : " " } };
  };

/** A link with that text (else the selection, else the address) in place of the selection. */
export const insertLink =
  (url: string, text = ""): TextCommand =>
  (state) =>
    state.changeByRange((range) => {
      const label = text || state.sliceDoc(range.from, range.to) || url;
      const insert = `[${label}](${url.replace(/[()\s]/g, encodeURIComponent)})`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + insert.length),
      };
    });

/** A table of the size with a header row, on lines of its own, with the cursor in the first cell. */
export const insertTable =
  (columns: number, rows: number): TextCommand =>
  (state) => {
    const { from } = state.selection.main;
    const line = state.doc.lineAt(from);
    const row = (cell: (column: number) => string) =>
      `| ${Array.from({ length: columns }, (_, column) => cell(column)).join(" | ")} |`;
    const table = [
      row((column) => `Spalte ${column + 1}`),
      `|${" --- |".repeat(columns)}`,
      ...Array.from({ length: Math.max(1, rows - 1) }, () => row(() => "   ")),
    ].join("\n");
    const before = line.text.trim() === "" ? (line.number > 1 ? "\n" : "") : "\n\n";
    const at = line.text.trim() === "" ? line.from : line.to;
    return {
      changes: { from: at, to: line.text.trim() === "" ? line.to : at, insert: `${before}${table}\n` },
      selection: EditorSelection.range(at + before.length + 2, at + before.length + 2 + "Spalte 1".length),
    };
  };

/** A horizontal rule on a line of its own. */
export const insertRule: TextCommand = (state) => {
  const line = state.doc.lineAt(state.selection.main.head);
  // Right under a paragraph "---" would make it a heading (setext): a blank line goes first.
  const afterText = line.number > 1 && state.doc.line(line.number - 1).text.trim() !== "";
  const insert = line.text.trim() === "" ? `${afterText ? "\n" : ""}---\n` : "\n\n---\n";
  const at = line.text.trim() === "" ? line.from : line.to;
  return {
    changes: { from: at, to: line.text.trim() === "" ? line.to : at, insert },
    selection: { anchor: at + insert.length },
  };
};
