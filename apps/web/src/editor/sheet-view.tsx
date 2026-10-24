import { initialSheetState, openSheetDocument } from "@stapel/editor-core";
import { useRef } from "react";
import { SheetTabs } from "../sheets/sheet-tabs";
import { SheetToolbar } from "../toolbar/sheet-toolbar";
import { ContextMenu } from "../ui/context-menu";
import { clipboardHint } from "./common-menus";
import { DocumentArea } from "./document-area";
import { EditorHeader } from "./editor-header";
import { SHEET_SHORTCUTS } from "./help-dialogs";
import { downloadBytes, fileNameFor, MIME } from "./opened-file";
import type { EditorViewProps } from "./props";
import { type SheetMenuContext, sheetContextMenu, sheetMenus } from "./sheet-menus";
import { useDocumentSave } from "./use-document-save";
import { useEditorChrome } from "./use-editor-chrome";
import { useEngineEditor } from "./use-engine-editor";

/** A spreadsheet: title and menus, the toolbar above the grid (with the formula bar), the sheets below. */
export const SheetView = ({ file, name, onSave, fileActions, onRename }: EditorViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const { editor, state, failure } = useEngineEditor(
    container,
    file,
    "cell",
    openSheetDocument,
    initialSheetState,
  );
  const saving = useDocumentSave(editor, state, onSave, file.readOnly);
  const chrome = useEditorChrome(editor, container, name, file.readOnly);

  const download = async () => {
    if (editor) downloadBytes((await editor.save()).bytes, fileNameFor(name, "xlsx"), MIME.xlsx);
  };

  const context: SheetMenuContext = {
    state,
    commands: editor?.commands ?? null,
    sheets: editor?.sheets ?? null,
    view: editor?.view ?? null,
    onClipboardRefused: (action) => chrome.notify(clipboardHint(action)),
    onFind: chrome.searchBar.open,
    onInsertImage: chrome.insertImage,
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        name={name}
        format="xlsx"
        state={state}
        failure={failure}
        saving={saving}
        ready={editor !== null}
        readOnly={file.readOnly}
        file={fileActions}
        onRename={onRename}
        onDownload={download}
        pdf={chrome.pdf}
        menus={file.readOnly ? [] : sheetMenus(context)}
        shortcuts={SHEET_SHORTCUTS}
        notice={chrome.notice}
        toolbar={<SheetToolbar state={state} commands={editor?.commands ?? null} />}
      />
      <DocumentArea
        container={container}
        search={editor?.search ?? null}
        searchState={state.search}
        searchBar={chrome.searchBar}
        readOnly={file.readOnly}
      />
      <SheetTabs
        sheets={state.sheets}
        active={state.activeSheet}
        commands={file.readOnly ? null : (editor?.sheets ?? null)}
      />
      {chrome.menuAt && (
        <ContextMenu
          x={chrome.menuAt.x}
          y={chrome.menuAt.y}
          label="Kontextmenü"
          groups={sheetContextMenu(context)}
          onClose={chrome.closeMenu}
        />
      )}
    </div>
  );
};
