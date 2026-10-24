import { initialSlideState, openPresentation } from "@stapel/editor-core";
import { useRef } from "react";
import { SlideToolbar } from "../toolbar/slide-toolbar";
import { EditorHeader } from "./editor-header";
import { downloadBytes, fileNameFor, MIME } from "./opened-file";
import type { EditorViewProps } from "./props";
import { useDocumentSave } from "./use-document-save";
import { useEngineEditor } from "./use-engine-editor";

/** A presentation: the toolbar above, the engine's slide list and the slide below. */
export const SlideView = ({ file, onClose, onSave, onShowVersions }: EditorViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const { editor, state, failure } = useEngineEditor(
    container,
    file,
    "slide",
    openPresentation,
    initialSlideState,
  );
  const saving = useDocumentSave(editor, state, onSave, file.readOnly);

  const download = async () => {
    if (editor) downloadBytes((await editor.save()).bytes, fileNameFor(file.name, "pptx"), MIME.pptx);
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        name={file.name}
        format="pptx"
        state={state}
        failure={failure}
        saving={saving}
        ready={editor !== null}
        readOnly={file.readOnly}
        onClose={onClose}
        onDownload={download}
        onShowVersions={onShowVersions}
        toolbar={<SlideToolbar state={state} commands={editor?.commands ?? null} />}
      />
      <div ref={container} className="min-h-0 flex-1 bg-[var(--muted)]" />
      <p
        data-testid="slide-position"
        className="m-0 border-t border-[var(--border)] px-4 py-1.5 text-xs text-[var(--muted-foreground)]"
      >
        Folie {Math.min(state.currentSlide + 1, Math.max(state.document.pages, 1))} von{" "}
        {Math.max(state.document.pages, 1)}
      </p>
    </div>
  );
};
