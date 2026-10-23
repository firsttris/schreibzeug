import { describe, expect, it } from "vitest";
import { initialEditorState, reduceEditorState } from "../src/state";

describe("reduceEditorState", () => {
  it("starts loading with nothing selected", () => {
    expect(initialEditorState.status).toBe("loading");
    expect(initialEditorState.text.bold).toBe(false);
    expect(initialEditorState.document.canUndo).toBe(false);
  });

  it("applies text events to the text state only", () => {
    const state = reduceEditorState(initialEditorState, { type: "bold", value: true });
    expect(state.text.bold).toBe(true);
    expect(state.document).toBe(initialEditorState.document);
  });

  it("applies document events to the document state only", () => {
    const state = reduceEditorState(initialEditorState, { type: "canUndo", value: true });
    expect(state.document.canUndo).toBe(true);
    expect(state.text).toBe(initialEditorState.text);
  });

  it.each([
    [{ type: "italic", value: true } as const, { italic: true }],
    [{ type: "underline", value: true } as const, { underline: true }],
    [{ type: "fontSize", value: 14 } as const, { fontSize: 14 }],
    [{ type: "fontName", value: "Carlito" } as const, { fontName: "Carlito" }],
    [{ type: "align", value: "center" } as const, { align: "center" }],
  ])("maps %o into the text state", (event, expected) => {
    expect(reduceEditorState(initialEditorState, event).text).toMatchObject(expected);
  });

  it.each([
    [{ type: "canRedo", value: true } as const, { canRedo: true }],
    [{ type: "modified", value: true } as const, { modified: true }],
    [{ type: "pages", value: 3 } as const, { pages: 3 }],
  ])("maps %o into the document state", (event, expected) => {
    expect(reduceEditorState(initialEditorState, event).document).toMatchObject(expected);
  });

  it("marks the editor ready and clears an earlier error", () => {
    const failed = reduceEditorState(initialEditorState, { type: "error", message: "boom" });
    const ready = reduceEditorState(failed, { type: "ready" });
    expect(ready).toMatchObject({ status: "ready", error: null });
  });

  it("keeps the error message", () => {
    expect(reduceEditorState(initialEditorState, { type: "error", message: "boom" })).toMatchObject({
      status: "error",
      error: "boom",
    });
  });
});
