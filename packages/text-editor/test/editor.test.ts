import { afterEach, describe, expect, it } from "vitest";
import { createTextEditor, TEXT_COMMANDS, type TextEditor, type TextEditorState } from "../src/editor";

let editor: TextEditor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const open = (text: string, markdown = true) => {
  const parent = document.createElement("div");
  document.body.append(parent);
  const changes: TextEditorState[] = [];
  editor = createTextEditor({
    parent,
    text,
    markdown,
    readOnly: false,
    onChange: (state) => changes.push(state),
  });
  return { editor, parent, changes };
};

describe("the text editor", () => {
  it("counts as modified after a change, and not once that text is saved", () => {
    const { editor, changes } = open("# Notiz\n");
    expect(editor.state().modified).toBe(false);
    editor.run(TEXT_COMMANDS.block("h2"));
    expect(editor.text()).toBe("## Notiz\n");
    expect(changes.at(-1)?.modified).toBe(true);
    expect(changes.at(-1)?.block).toBe("h2");
    editor.markSaved("## Notiz\n");
    expect(editor.state().modified).toBe(false);
  });

  it("measures 'modified' against what was stored, also when typing went on during the save", () => {
    const { editor } = open("a");
    editor.view.dispatch({ changes: { from: 1, insert: "b" } });
    const stored = editor.text();
    editor.view.dispatch({ changes: { from: 2, insert: "c" } });
    editor.markSaved(stored);
    expect(editor.state().modified).toBe(true);
  });

  it("shows headings as headings in the live view and hides their marks outside the edited line", () => {
    const { parent } = open("# Titel\n\nText mit **fett**");
    expect(parent.querySelector(".cm-md-h1")?.textContent).toBe("Titel");
    expect(parent.querySelector(".cm-live")).not.toBeNull();
  });

  it("opens a link whose title goes over two lines, showing that title", () => {
    const { parent } = open('Siehe [a](https://e.org "erste\nzweite") hier\n\nAnders');
    expect(parent.querySelector(".cm-content")?.textContent).toContain("zweite");
  });

  it("shows the plain text with its marks in the source view", () => {
    const { editor, parent } = open("# Titel");
    editor.setMode("source");
    expect(parent.querySelector(".cm-md-h1")).toBeNull();
    expect(parent.querySelector(".cm-content")?.textContent).toBe("# Titel");
    expect(parent.querySelector(".cm-source")).not.toBeNull();
  });

  it("puts in another text as the saved one, e.g. the newest version after a conflict", () => {
    const { editor } = open("alt");
    editor.view.dispatch({ changes: { from: 0, insert: "x" } });
    editor.replace("neu");
    expect(editor.text()).toBe("neu");
    expect(editor.state().modified).toBe(false);
  });

  it("has no Markdown in a plain text file", () => {
    const { editor, parent } = open("# kein Titel", false);
    expect(parent.querySelector(".cm-md-h1")).toBeNull();
    expect(editor.state().block).toBe("paragraph");
  });
});
