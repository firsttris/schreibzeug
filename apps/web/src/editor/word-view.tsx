import { initialEditorState, openWordDocument } from "@schreibzeug/editor-core";
import { useRef, useState } from "react";
import { m } from "../paraglide/messages";
import { SizeGrid } from "../toolbar/table-menu";
import { Toolbar } from "../toolbar/toolbar";
import { ContextMenu } from "../ui/context-menu";
import { Dialog } from "../ui/dialog";
import { clipboardHint } from "./common-menus";
import { DocumentArea } from "./document-area";
import { EditorHeader } from "./editor-header";
import { screenReaderSwitch } from "./file-menu";
import { WORD_SHORTCUTS } from "./help-dialogs";
import { LinkDialog } from "./link-dialog";
import { MailMergeBar } from "./mail-merge-bar";
import { downloadBytes, fileNameFor, MIME, savedFormatOf } from "./opened-file";
import type { EditorViewProps } from "./props";
import { RecipientsDialog } from "./recipients-dialog";
import { RevisionBalloon } from "./revision-balloon";
import { documentStatusOf } from "./save-status";
import { useAgent } from "./use-agent";
import { useCommentsPanel } from "./use-comments-panel";
import { useDocumentSave } from "./use-document-save";
import { useEInvoice } from "./use-e-invoice";
import { frameToWindow, useEditorChrome } from "./use-editor-chrome";
import { useEngineEditor } from "./use-engine-editor";
import { openLink, useLinks } from "./use-links";
import { useMailMerge } from "./use-mail-merge";
import { useMobileView } from "./use-mobile-view";
import { type WordMenuContext, wordContextMenu, wordMenus } from "./word-menus";

/** A text document: title and menus, the toolbar above the page, comments beside it. */
export const WordView = ({
  file,
  fileId,
  name,
  onSave,
  fileActions,
  onRename,
  onCreateFile,
  folderId = null,
}: EditorViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const { editor, state, failure } = useEngineEditor(
    container,
    file,
    "word",
    openWordDocument,
    initialEditorState,
  );
  const saving = useDocumentSave(editor, state, onSave, file.readOnly);
  const agent = useAgent({
    fileId,
    editor,
    kind: "word",
    state,
    readOnly: file.readOnly,
    save: saving.save,
    onCreateFile,
    name,
  });
  const chrome = useEditorChrome(editor, container, name, file.readOnly, () => void saving.save());
  const comments = useCommentsPanel(editor, state, file.readOnly);
  const mobileView = useMobileView(editor?.mobileView ?? null);
  const [tableDialog, setTableDialog] = useState(false);
  const links = useLinks(editor, file.readOnly, chrome.notify);
  const eInvoice = useEInvoice(editor, name, chrome.notify);
  const mailMerge = useMailMerge({
    mailMerge: editor?.mailMerge ?? null,
    name,
    onCreateFile,
    notify: chrome.notify,
  });

  // The change at the cursor, beside it while changes are marked (not in "Endgültig" or "Original").
  const [firstRevision] = state.review.atCursor;
  const balloonAt =
    firstRevision && state.review.display === "markup" && !file.readOnly
      ? frameToWindow(container.current, firstRevision)
      : null;

  const download = async () => {
    const format = savedFormatOf(file.name, "docx");
    if (editor) downloadBytes((await editor.save()).bytes, fileNameFor(name, format), MIME[format]);
  };

  const context: WordMenuContext = {
    state,
    commands: editor?.commands ?? null,
    layout: editor?.layout ?? null,
    headerFooter: editor?.headerFooter ?? null,
    insert: editor?.insert ?? null,
    links: editor?.links ?? null,
    review: editor?.review ?? null,
    spelling: editor?.spelling ?? null,
    onLink: links.request,
    onOpenLink: openLink,
    view: editor?.view ?? null,
    onClipboardRefused: (action) => chrome.notify(clipboardHint(action)),
    onAddComment: comments.compose,
    onInsertTable: () => setTableDialog(true),
    commentsOpen: comments.isOpen,
    onToggleComments: comments.toggle,
    mobileView,
    onFind: chrome.searchBar.open,
    onInsertImage: chrome.insertImage,
    onNotice: chrome.notify,
    mailMerge: mailMerge.menu,
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        name={name}
        format="docx"
        document={documentStatusOf(state)}
        failure={failure}
        saving={saving}
        ready={editor !== null}
        readOnly={file.readOnly}
        file={fileActions}
        onRename={onRename}
        onDownload={download}
        pdf={chrome.pdf}
        downloads={chrome.pdf ? [eInvoice.item] : []}
        menus={file.readOnly ? [] : wordMenus(context)}
        shortcuts={WORD_SHORTCUTS}
        screenReader={screenReaderSwitch(editor, state)}
        notice={chrome.notice}
        actions={comments.button}
        toolbar={
          <Toolbar
            state={state}
            commands={editor?.commands ?? null}
            layout={editor?.layout ?? null}
            marking={editor?.marking ?? null}
            review={editor?.review ?? null}
            onAddComment={comments.compose}
            onInsertImage={chrome.insertImage}
            onInsertLink={links.request}
          />
        }
      />
      {agent.bar}
      {agent.dialog}
      {mailMerge.bar && <MailMergeBar {...mailMerge.bar} />}
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
      {eInvoice.dialog}
      <RecipientsDialog
        open={mailMerge.choosing}
        folderId={folderId}
        onClose={mailMerge.closeChooser}
        onChoose={mailMerge.choose}
      />
      {balloonAt && editor && (
        <RevisionBalloon
          revisions={state.review.atCursor}
          x={balloonAt.x}
          y={balloonAt.y}
          commands={editor.review}
        />
      )}
      {chrome.menuAt && (
        <ContextMenu
          x={chrome.menuAt.x}
          y={chrome.menuAt.y}
          label={m.word_view_context_menu()}
          groups={wordContextMenu(context)}
          onClose={chrome.closeMenu}
        />
      )}
      <LinkDialog draft={links.draft} onClose={links.close} />
      <Dialog open={tableDialog} title={m.word_view_insert_table()} onClose={() => setTableDialog(false)}>
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
