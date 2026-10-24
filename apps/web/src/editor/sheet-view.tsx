import { initialSheetState, openSheetDocument } from "@stapel/editor-core";
import { useRef } from "react";
import { SheetTabs } from "../sheets/sheet-tabs";
import { SheetToolbar } from "../toolbar/sheet-toolbar";
import { EditorHeader } from "./editor-header";
import { downloadBytes, fileNameFor, MIME } from "./opened-file";
import type { EditorViewProps } from "./props";
import { useDocumentSave } from "./use-document-save";
import { useEngineEditor } from "./use-engine-editor";

/** A spreadsheet: the toolbar above the grid (with the engine's formula bar), the sheets below. */
export const SheetView = ({ file, onClose, onSave, onShowVersions }: EditorViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const { editor, state, failure } = useEngineEditor(
    container,
    file,
    "cell",
    openSheetDocument,
    initialSheetState,
  );
  const saving = useDocumentSave(editor, state, onSave, file.readOnly);

  const download = async () => {
    if (editor) downloadBytes((await editor.save()).bytes, fileNameFor(file.name, "xlsx"), MIME.xlsx);
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        name={file.name}
        format="xlsx"
        state={state}
        failure={failure}
        saving={saving}
        ready={editor !== null}
        readOnly={file.readOnly}
        onClose={onClose}
        onDownload={download}
        onShowVersions={onShowVersions}
        toolbar={<SheetToolbar state={state} commands={editor?.commands ?? null} />}
      />
      <div ref={container} className="min-h-0 flex-1 bg-[var(--muted)]" />
      <SheetTabs
        sheets={state.sheets}
        active={state.activeSheet}
        commands={file.readOnly ? null : (editor?.sheets ?? null)}
      />
    </div>
  );
};
