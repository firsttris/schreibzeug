import { initialSheetState, isOnSheet, openSheetDocument } from "@schreibzeug/editor-core";
import { useRef } from "react";
import { ColumnFilter, useColumnFilter } from "../sheets/column-filter";
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
import { useCommentsPanel } from "./use-comments-panel";
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
  const chrome = useEditorChrome(editor, container, name, file.readOnly, () => void saving.save());
  // The comments of the sheet shown, as web-apps filters them (common/mobile Comments.jsx onFilterChange).
  const sheetId = state.sheets[state.activeSheet]?.id;
  const sheetComments = {
    comments: state.comments.filter((comment) => sheetId !== undefined && isOnSheet(comment, sheetId)),
    activeComments: state.activeComments,
  };
  const comments = useCommentsPanel(editor, sheetComments, file.readOnly, "cell");
  const filter = useColumnFilter(editor, container, file.readOnly);

  const download = async () => {
    if (editor) downloadBytes((await editor.save()).bytes, fileNameFor(name, "xlsx"), MIME.xlsx);
  };

  const context: SheetMenuContext = {
    state,
    commands: editor?.commands ?? null,
    sheets: editor?.sheets ?? null,
    data: editor?.data ?? null,
    view: editor?.view ?? null,
    onClipboardRefused: (action) => chrome.notify(clipboardHint(action)),
    onFind: chrome.searchBar.open,
    onInsertImage: chrome.insertImage,
    onAddComment: comments.compose,
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
        actions={comments.button}
        toolbar={
          <SheetToolbar state={state} commands={editor?.commands ?? null} data={editor?.data ?? null} />
        }
      />
      <div className="flex min-h-0 flex-1">
        <DocumentArea
          container={container}
          search={editor?.search ?? null}
          searchState={state.search}
          searchBar={chrome.searchBar}
          readOnly={file.readOnly}
        />
        {comments.panel}
      </div>
      <SheetTabs
        sheets={state.sheets}
        active={state.activeSheet}
        commands={file.readOnly ? null : (editor?.sheets ?? null)}
      />
      {filter.open && (
        <ColumnFilter
          request={filter.open.request}
          x={filter.open.x}
          y={filter.open.y}
          onClose={filter.close}
        />
      )}
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
