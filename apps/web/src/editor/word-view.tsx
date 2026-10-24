import { type ContextMenuRequest, initialEditorState, openWordDocument } from "@stapel/editor-core";
import { MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CommentsPanel } from "../comments/comments-panel";
import { SizeGrid } from "../toolbar/table-menu";
import { Toolbar } from "../toolbar/toolbar";
import { Button } from "../ui/button";
import { ContextMenu } from "../ui/context-menu";
import { Dialog } from "../ui/dialog";
import { useNotice } from "../ui/use-notice";
import { EditorHeader } from "./editor-header";
import { WORD_SHORTCUTS } from "./help-dialogs";
import { downloadBytes, fileNameFor, MIME } from "./opened-file";
import type { EditorViewProps } from "./props";
import { SearchBar } from "./search-bar";
import { useDocumentSave } from "./use-document-save";
import { useEngineEditor } from "./use-engine-editor";
import { usePdf } from "./use-pdf";
import { useSearchBar } from "./use-search-bar";
import { useShortcuts } from "./use-shortcuts";
import { clipboardHint, type WordMenuContext, wordContextMenu, wordMenus } from "./word-menus";

/** Where the engine's frame sits in the window: context menu points come in frame coordinates. */
const toWindow = (container: HTMLElement | null, request: ContextMenuRequest) => {
  const frame = container?.querySelector("iframe")?.getBoundingClientRect();
  return { x: (frame?.left ?? 0) + request.x, y: (frame?.top ?? 0) + request.y };
};

/** A text document: title and menus, the toolbar above the page, comments beside it. */
export const WordView = ({ file, name, onSave, fileActions, onRename }: EditorViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const { editor, state, failure } = useEngineEditor(
    container,
    file,
    "word",
    openWordDocument,
    initialEditorState,
  );
  const saving = useDocumentSave(editor, state, onSave, file.readOnly);
  const [comments, setComments] = useState<"closed" | "open" | "composing">("closed");
  const [tableDialog, setTableDialog] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [notice, notify] = useNotice();
  const searchBar = useSearchBar(!file.readOnly);
  const pdf = usePdf(editor, name, notify);
  useShortcuts(editor, {
    find: () => searchBar.open("find"),
    replace: () => searchBar.open("replace"),
    ...(pdf ? { print: pdf.print } : {}),
  });
  const openComments = state.comments.filter((comment) => !comment.resolved).length;

  // The engine measures its frame only on resize; the panel takes width from it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the panel opens or closes
  useEffect(() => {
    editor?.resize();
  }, [editor, comments === "closed"]);

  // Someone who may only look gets no menu of changes.
  useEffect(() => {
    if (!editor || file.readOnly) return;
    return editor.onContextMenu((request) => setMenuAt(toWindow(container.current, request)));
  }, [editor, file.readOnly]);

  const download = async () => {
    if (editor) downloadBytes((await editor.save()).bytes, fileNameFor(name, "docx"), MIME.docx);
  };

  const context: WordMenuContext = {
    state,
    commands: editor?.commands ?? null,
    view: editor?.view ?? null,
    onClipboardRefused: (action) => notify(clipboardHint(action)),
    onAddComment: () => setComments("composing"),
    onInsertTable: () => setTableDialog(true),
    commentsOpen: comments !== "closed",
    onToggleComments: () => setComments(comments === "closed" ? "open" : "closed"),
    onFind: searchBar.open,
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        name={name}
        format="docx"
        state={state}
        failure={failure}
        saving={saving}
        ready={editor !== null}
        readOnly={file.readOnly}
        file={fileActions}
        onRename={onRename}
        onDownload={download}
        pdf={pdf}
        menus={file.readOnly ? [] : wordMenus(context)}
        shortcuts={WORD_SHORTCUTS}
        notice={notice}
        actions={
          <Button
            variant="toggle"
            aria-label="Kommentare"
            aria-pressed={comments !== "closed"}
            disabled={!editor}
            onClick={context.onToggleComments}
          >
            <MessageSquare size={16} />
            {openComments > 0 && <span className="text-xs tabular-nums">{openComments}</span>}
          </Button>
        }
        toolbar={
          <Toolbar
            state={state}
            commands={editor?.commands ?? null}
            onAddComment={() => setComments("composing")}
          />
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <div ref={container} className="h-full bg-[var(--muted)]" />
          {searchBar.mode && (
            <SearchBar
              search={editor?.search ?? null}
              state={state.search}
              mode={searchBar.mode}
              canReplace={!file.readOnly}
              onModeChange={searchBar.open}
              onClose={searchBar.close}
            />
          )}
        </div>
        {comments !== "closed" && (
          <CommentsPanel
            comments={state.comments}
            active={state.activeComments}
            commands={file.readOnly ? null : (editor?.comments ?? null)}
            composing={comments === "composing"}
            onComposed={() => setComments("open")}
            onClose={() => setComments("closed")}
          />
        )}
      </div>
      {menuAt && (
        <ContextMenu
          x={menuAt.x}
          y={menuAt.y}
          label="Kontextmenü"
          groups={wordContextMenu(context)}
          onClose={() => setMenuAt(null)}
        />
      )}
      <Dialog open={tableDialog} title="Tabelle einfügen" onClose={() => setTableDialog(false)}>
        <SizeGrid
          onPick={({ columns, rows }) => {
            editor?.commands.insertTable(columns, rows);
            setTableDialog(false);
          }}
        />
      </Dialog>
    </div>
  );
};
