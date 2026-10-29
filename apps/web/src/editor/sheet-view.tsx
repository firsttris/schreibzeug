import { initialSheetState, isOnSheet, openSheetDocument } from "@schreibzeug/editor-core";
import { useEffect, useRef, useState } from "react";
import { m } from "../paraglide/messages";
import { ColumnFilter, useColumnFilter } from "../sheets/column-filter";
import { DropdownDialog } from "../sheets/dropdown-dialog";
import { PivotDialog } from "../sheets/pivot-dialog";
import { PivotPanel } from "../sheets/pivot-panel";
import { SheetTabs } from "../sheets/sheet-tabs";
import { SheetToolbar } from "../toolbar/sheet-toolbar";
import { ContextMenu } from "../ui/context-menu";
import { clipboardHint } from "./common-menus";
import { DocumentArea } from "./document-area";
import { EditorHeader } from "./editor-header";
import { screenReaderSwitch } from "./file-menu";
import { SHEET_SHORTCUTS } from "./help-dialogs";
import { downloadBytes, fileNameFor, MIME, savedFormatOf } from "./opened-file";
import type { EditorViewProps } from "./props";
import { documentStatusOf } from "./save-status";
import {
  CHART_FAILURES,
  chartItems,
  type SheetMenuContext,
  sheetContextMenu,
  sheetMenus,
} from "./sheet-menus";
import { useAgent } from "./use-agent";
import { useCommentsPanel } from "./use-comments-panel";
import { useDocumentSave } from "./use-document-save";
import { useEditorChrome } from "./use-editor-chrome";
import { useEngineEditor } from "./use-engine-editor";

/** A spreadsheet: title and menus, the toolbar above the grid (with the formula bar), the sheets below. */
export const SheetView = ({
  file,
  fileId,
  name,
  onSave,
  fileActions,
  onRename,
  onCreateFile,
}: EditorViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const { editor, state, failure } = useEngineEditor(
    container,
    file,
    "cell",
    openSheetDocument,
    initialSheetState,
  );
  const saving = useDocumentSave(editor, state, onSave, file.readOnly);
  const agent = useAgent({
    fileId,
    editor,
    kind: "cell",
    state,
    readOnly: file.readOnly,
    save: saving.save,
    onCreateFile,
    name,
  });
  const chrome = useEditorChrome(editor, container, name, file.readOnly, () => void saving.save());
  // The comments of the sheet shown, as web-apps filters them (common/mobile Comments.jsx onFilterChange).
  const sheetId = state.sheets[state.activeSheet]?.id;
  const sheetComments = {
    comments: state.comments.filter((comment) => sheetId !== undefined && isOnSheet(comment, sheetId)),
    activeComments: state.activeComments,
  };
  const comments = useCommentsPanel(editor, sheetComments, file.readOnly, "cell");
  const filter = useColumnFilter(editor, container, file.readOnly);
  // The dropdown dialog with the selection's list when it opened; undefined while closed.
  const [dropdown, setDropdown] = useState<string[] | null | undefined>(undefined);
  const [pivotDialog, setPivotDialog] = useState(false);
  // The field list shows while the active cell is in a pivot table, unless closed there.
  const { pivot } = state.data;
  const [pivotPanelClosed, setPivotPanelClosed] = useState(false);
  const inPivot = pivot !== null;
  useEffect(() => {
    if (!inPivot) setPivotPanelClosed(false);
  }, [inPivot]);

  // A CSV stays one: it is saved and downloaded as the file it is (csv.ts).
  const format = savedFormatOf(file.name, "xlsx");
  const download = async () => {
    if (editor) downloadBytes((await editor.save()).bytes, fileNameFor(name, format), MIME[format]);
  };
  const downloadCsv = async () => {
    if (editor) downloadBytes(await editor.exportAs("csv"), fileNameFor(name, "csv"), MIME.csv);
  };
  // What a CSV keeps, said once it is open, as Excel warns when saving one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per opened editor
  useEffect(() => {
    if (editor && format === "csv" && !file.readOnly) chrome.notify(m.sheet_view_csv_notice());
  }, [editor]);

  const context: SheetMenuContext = {
    state,
    commands: editor?.commands ?? null,
    sheets: editor?.sheets ?? null,
    data: editor?.data ?? null,
    charts: editor?.charts ?? null,
    rules: editor?.rules ?? null,
    pivots: editor?.pivots ?? null,
    onInsertPivot: () => setPivotDialog(true),
    onDropdown: () => editor && setDropdown(editor.rules.dropdown()),
    onChartFailure: (failure) => chrome.notify(CHART_FAILURES[failure]),
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
        document={documentStatusOf(state)}
        failure={failure}
        saving={saving}
        ready={editor !== null}
        readOnly={file.readOnly}
        file={fileActions}
        onRename={onRename}
        onDownload={download}
        pdf={chrome.pdf}
        downloads={
          format !== "csv" ? [{ label: m.sheet_view_download_csv(), onSelect: () => void downloadCsv() }] : []
        }
        menus={file.readOnly ? [] : sheetMenus(context)}
        shortcuts={SHEET_SHORTCUTS}
        screenReader={screenReaderSwitch(editor, state)}
        notice={chrome.notice}
        actions={comments.button}
        toolbar={
          <SheetToolbar
            state={state}
            commands={editor?.commands ?? null}
            data={editor?.data ?? null}
            chartItems={chartItems(context, file.readOnly || state.status !== "ready")}
          />
        }
      />
      {agent.bar}
      {agent.dialog}
      <div className="flex min-h-0 flex-1">
        <DocumentArea
          container={container}
          search={editor?.search ?? null}
          searchState={state.search}
          searchBar={chrome.searchBar}
          readOnly={file.readOnly}
        />
        {pivot && editor && !file.readOnly && !pivotPanelClosed && (
          <PivotPanel pivot={pivot} pivots={editor.pivots} onClose={() => setPivotPanelClosed(true)} />
        )}
        {comments.panel}
      </div>
      <SheetTabs
        sheets={state.sheets}
        active={state.activeSheet}
        commands={file.readOnly ? null : (editor?.sheets ?? null)}
      />
      {dropdown !== undefined && editor && (
        <DropdownDialog values={dropdown} rules={editor.rules} onClose={() => setDropdown(undefined)} />
      )}
      {pivotDialog && editor && <PivotDialog pivots={editor.pivots} onClose={() => setPivotDialog(false)} />}
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
          label={m.sheet_view_context_menu()}
          groups={sheetContextMenu(context)}
          onClose={chrome.closeMenu}
        />
      )}
    </div>
  );
};
