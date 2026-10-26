import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  activeMarks,
  blockAt,
  insertLink,
  insertRule,
  insertTable,
  setBlock,
  type TextCommand,
  toggleInline,
  toggleLinePrefix,
  toggleTask,
} from "../src/commands";
import { markdownHtml } from "../src/preview";

/** A state from text where "|" marks the cursor or "«" … "»" the selection. */
const stateOf = (marked: string) => {
  const from = marked.indexOf("«") >= 0 ? marked.indexOf("«") : marked.indexOf("|");
  const text = marked.replace(/[«»|]/g, "");
  const to = marked.indexOf("»") >= 0 ? marked.indexOf("»") - 1 : from;
  return EditorState.create({
    doc: text,
    selection: EditorSelection.range(from, to),
    extensions: markdown({ base: markdownLanguage }),
  });
};

const run = (command: TextCommand, marked: string) => {
  const state = stateOf(marked);
  const spec = command(state);
  if (!spec) return null;
  const next = state.update(spec).state;
  const { from, to } = next.selection.main;
  const text = next.doc.toString();
  return from === to
    ? `${text.slice(0, from)}|${text.slice(from)}`
    : `${text.slice(0, from)}«${text.slice(from, to)}»${text.slice(to)}`;
};

describe("the toolbar's Markdown", () => {
  it("puts marks around the selection, and takes them away again", () => {
    expect(run(toggleInline("strong"), "Ein «wichtiges» Wort")).toBe("Ein **«wichtiges»** Wort");
    expect(run(toggleInline("strong"), "Ein **«wichtiges»** Wort")).toBe("Ein «wichtiges» Wort");
    expect(run(toggleInline("emphasis"), "a «b» c")).toBe("a *«b»* c");
    expect(run(toggleInline("code"), "a «b» c")).toBe("a `«b»` c");
    expect(run(toggleInline("strikethrough"), "a «b» c")).toBe("a ~~«b»~~ c");
  });

  it("takes the marks away also with the cursor or selection on them", () => {
    expect(run(toggleInline("strong"), "**fett**|")).toBe("fett|");
    expect(run(toggleInline("strong"), "**fett**| x")).toBe("fett| x");
    expect(run(toggleInline("strong"), "«**fett**»")).toBe("«fett»");
    expect(run(toggleInline("emphasis"), "a *b|* c")).toBe("a b| c");
  });

  it("puts the cursor between the marks when nothing is selected", () => {
    expect(run(toggleInline("strong"), "Text |")).toBe("Text **|**");
  });

  it("knows which marks the cursor is in", () => {
    expect(activeMarks(stateOf("Ein **wich|tiges** Wort"))).toEqual(["strong"]);
    expect(activeMarks(stateOf("Ein ***bei|des*** Wort")).sort()).toEqual(["emphasis", "strong"]);
    expect(activeMarks(stateOf("Nichts | hier"))).toEqual([]);
  });

  it("makes a line a heading of a level, or a paragraph again", () => {
    expect(run(setBlock("h2"), "Offene |Punkte")).toBe("## Offene |Punkte");
    expect(run(setBlock("h1"), "### Offene |Punkte")).toBe("# Offene |Punkte");
    expect(run(setBlock("paragraph"), "## Offene |Punkte")).toBe("Offene |Punkte");
    expect(blockAt(stateOf("### Drei|"))).toBe("h3");
    expect(blockAt(stateOf("#Kein Titel|"))).toBe("paragraph");
  });

  it("makes lists of the selected lines and back, and turns one kind of list into another", () => {
    expect(run(toggleLinePrefix("bullet"), "«eins\nzwei»")).toBe("- «eins\n- zwei»");
    expect(run(toggleLinePrefix("bullet"), "«- eins\n- zwei»")).toBe("«eins\nzwei»");
    expect(run(toggleLinePrefix("ordered"), "«- eins\n- zwei»")).toBe("«1. eins\n2. zwei»");
    expect(run(toggleLinePrefix("task"), "«1. eins\n2. zwei»")).toBe("«- [ ] eins\n- [ ] zwei»");
    expect(run(toggleLinePrefix("bullet"), "  - [ ] |offen")).toBe("  - |offen");
    expect(run(toggleLinePrefix("quote"), "«Zitat»")).toBe("> «Zitat»");
    expect(run(toggleLinePrefix("quote"), "> «Zitat»")).toBe("«Zitat»");
  });

  it("puts the cursor after a new mark on an empty line, to type on", () => {
    expect(run(toggleLinePrefix("task"), "|")).toBe("- [ ] |");
    expect(run(setBlock("h1"), "|")).toBe("# |");
  });

  it("ticks and unticks a task", () => {
    expect(run(toggleTask(3), "- [ ] Scanner |testen")).toBe("- [x] Scanner |testen");
    expect(run(toggleTask(3), "- [x] Scanner |testen")).toBe("- [ ] Scanner |testen");
    expect(toggleTask(0)(stateOf("Kein |Task"))).toBeNull();
  });

  it("links the selection, or the address itself", () => {
    expect(run(insertLink("https://example.org"), "Siehe «hier»")).toBe("Siehe [hier](https://example.org)|");
    expect(run(insertLink("https://example.org", "Beispiel"), "«x»")).toBe(
      "[Beispiel](https://example.org)|",
    );
    expect(run(insertLink("https://example.org/a b"), "|")).toBe(
      "[https://example.org/a b](https://example.org/a%20b)|",
    );
  });

  it("puts a rule under a paragraph without making the paragraph a heading", () => {
    expect(run(insertRule, "Absatz\n|")).toBe("Absatz\n\n---\n|");
    expect(run(insertRule, "Absatz|")).toBe("Absatz\n\n---\n|");
    expect(run(insertRule, "|")).toBe("---\n|");
  });

  it("keeps the whole address and text in a link, also with brackets in them", () => {
    expect(run(insertLink("https://e.org/a)b"), "|")).toBe("[https://e.org/a)b](https://e.org/a%29b)|");
    expect(run(insertLink("https://e.org"), "«a]b»")).toBe("[a\\]b](https://e.org)|");
    expect(markdownHtml("[a\\]b](https://e.org/a%29b)")).toBe(
      '<p><a href="https://e.org/a%29b" target="_blank" rel="noopener noreferrer">a]b</a></p>',
    );
  });

  it("inserts a table on lines of its own, with the first cell selected", () => {
    expect(run(insertTable(2, 2), "Text|")).toBe(
      "Text\n\n| «Spalte 1» | Spalte 2 |\n| --- | --- |\n|     |     |\n",
    );
  });
});
