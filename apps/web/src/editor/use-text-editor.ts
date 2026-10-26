import {
  createTextEditor,
  type TextEditor,
  type TextEditorState,
  type TextViewMode,
} from "@schreibzeug/text-editor";
import { type RefObject, useEffect, useRef, useState } from "react";

const INITIAL_STATE: TextEditorState = {
  modified: false,
  line: 1,
  column: 1,
  block: "paragraph",
  marks: [],
  canUndo: false,
  canRedo: false,
};

/**
 * The text editor (packages/text-editor) in the container, for as long as the view is shown: its
 * state for the toolbar and the status, the text for the preview, and how often the text changed,
 * so the autosave waits for the last change.
 */
export const useTextEditor = (
  container: RefObject<HTMLDivElement | null>,
  {
    text,
    markdown,
    readOnly,
    mode,
    onSave,
  }: { text: string; markdown: boolean; readOnly: boolean; mode: TextViewMode; onSave: () => void },
) => {
  const [editor, setEditor] = useState<TextEditor | null>(null);
  const [state, setState] = useState<TextEditorState>(INITIAL_STATE);
  const [current, setCurrent] = useState({ text, revision: 0 });
  const save = useRef(onSave);
  save.current = onSave;

  // biome-ignore lint/correctness/useExhaustiveDependencies: made once per opened file; the page opens a new one for another text
  useEffect(() => {
    const parent = container.current;
    if (!parent) return;
    const created = createTextEditor({
      parent,
      text,
      markdown,
      readOnly,
      mode,
      onChange: setState,
      onText: (next) => setCurrent((previous) => ({ text: next, revision: previous.revision + 1 })),
      onSave: () => save.current(),
    });
    setEditor(created);
    setState(created.state());
    if (!readOnly) created.focus();
    return () => {
      created.destroy();
      setEditor(null);
    };
  }, []);

  useEffect(() => editor?.setMode(mode), [editor, mode]);

  return { editor, state, text: current.text, revision: current.revision };
};
