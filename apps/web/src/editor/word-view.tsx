import { initialEditorState, openWordDocument } from "@stapel/editor-core";
import { MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CommentsPanel } from "../comments/comments-panel";
import { SizeGrid } from "../toolbar/table-menu";
import { Toolbar } from "../toolbar/toolbar";
import { Button } from "../ui/button";
import { ContextMenu } from "../ui/context-menu";
import { Dialog } from "../ui/dialog";
import { clipboardHint } from "./common-menus";
import { DocumentArea } from "./document-area";
import { EditorHeader } from "./editor-header";
import { WORD_SHORTCUTS } from "./help-dialogs";
import { downloadBytes, fileNameFor, MIME } from "./opened-file";
import type { EditorViewProps } from "./props";
import { useDocumentSave } from "./use-document-save";
import { useEditorChrome } from "./use-editor-chrome";
import { useEngineEditor } from "./use-engine-editor";
import { type WordMenuContext, wordContextMenu, wordMenus } from "./word-menus";

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
  const chrome = useEditorChrome(editor, container, name, file.readOnly);
  const [comments, setComments] = useState<"closed" | "open" | "composing">("closed");
  const [tableDialog, setTableDialog] = useState(false);
  const openComments = state.comments.filter((comment) => !comment.resolved).length;

  // The engine measures its frame only on resize; the panel takes width from it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the panel opens or closes
  useEffect(() => {
    editor?.resize();
  }, [editor, comments === "closed"]);

  const download = async () => {
    if (editor) downloadBytes((await editor.save()).bytes, fileNameFor(name, "docx"), MIME.docx);
  };

  const context: WordMenuContext = {
    state,
    commands: editor?.commands ?? null,
    view: editor?.view ?? null,
    onClipboardRefused: (action) => chrome.notify(clipboardHint(action)),
    onAddComment: () => setComments("composing"),
    onInsertTable: () => setTableDialog(true),
    commentsOpen: comments !== "closed",
    onToggleComments: () => setComments(comments === "closed" ? "open" : "closed"),
    onFind: chrome.searchBar.open,
    onInsertImage: chrome.insertImage,
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
        pdf={chrome.pdf}
        menus={file.readOnly ? [] : wordMenus(context)}
        shortcuts={WORD_SHORTCUTS}
        notice={chrome.notice}
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
            onInsertImage={chrome.insertImage}
          />
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
      {chrome.menuAt && (
        <ContextMenu
          x={chrome.menuAt.x}
          y={chrome.menuAt.y}
          label="Kontextmenü"
          groups={wordContextMenu(context)}
          onClose={chrome.closeMenu}
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
