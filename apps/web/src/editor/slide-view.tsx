import { initialSlideState, openPresentation } from "@schreibzeug/editor-core";
import { Presentation } from "lucide-react";
import { useRef } from "react";
import { SlideToolbar } from "../toolbar/slide-toolbar";
import { Button } from "../ui/button";
import { ContextMenu } from "../ui/context-menu";
import { clipboardHint } from "./common-menus";
import { DocumentArea } from "./document-area";
import { EditorHeader } from "./editor-header";
import { SLIDE_SHORTCUTS } from "./help-dialogs";
import { downloadBytes, fileNameFor, MIME } from "./opened-file";
import type { EditorViewProps } from "./props";
import { type SlideMenuContext, slideContextMenu, slideMenus } from "./slide-menus";
import { useCommentsPanel } from "./use-comments-panel";
import { useDocumentSave } from "./use-document-save";
import { useEditorChrome } from "./use-editor-chrome";
import { useEngineEditor } from "./use-engine-editor";
import { useSlideShow } from "./use-slide-show";

/** A presentation: title and menus, the toolbar above, the engine's slide list and the slide below. */
export const SlideView = ({ file, name, onSave, fileActions, onRename }: EditorViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const { editor, state, failure } = useEngineEditor(
    container,
    file,
    "slide",
    openPresentation,
    initialSlideState,
  );
  const saving = useDocumentSave(editor, state, onSave, file.readOnly);
  const chrome = useEditorChrome(editor, container, name, file.readOnly, () => void saving.save());
  const present = useSlideShow(editor, container, state.show.running);
  const comments = useCommentsPanel(editor, state, file.readOnly, "slide");

  const download = async () => {
    if (editor) downloadBytes((await editor.save()).bytes, fileNameFor(name, "pptx"), MIME.pptx);
  };

  const context: SlideMenuContext = {
    state,
    commands: editor?.commands ?? null,
    design: editor?.design ?? null,
    view: editor?.view ?? null,
    spelling: editor?.spelling ?? null,
    onClipboardRefused: (action) => chrome.notify(clipboardHint(action)),
    onFind: chrome.searchBar.open,
    onInsertImage: chrome.insertImage,
    onPresent: present,
    onAddComment: comments.compose,
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        name={name}
        format="pptx"
        state={state}
        failure={failure}
        saving={saving}
        ready={editor !== null}
        readOnly={file.readOnly}
        file={fileActions}
        onRename={onRename}
        onDownload={download}
        pdf={chrome.pdf}
        menus={file.readOnly ? [] : slideMenus(context)}
        shortcuts={SLIDE_SHORTCUTS}
        notice={chrome.notice}
        actions={
          <>
            {comments.button}
            <Button variant="outline" disabled={!present} onClick={() => void present?.("beginning")}>
              <Presentation size={16} />
              Präsentieren
            </Button>
          </>
        }
        toolbar={<SlideToolbar state={state} commands={editor?.commands ?? null} />}
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
      <p
        data-testid="slide-position"
        className="m-0 border-t border-[var(--border)] px-4 py-1.5 text-xs text-[var(--muted-foreground)]"
      >
        Folie {Math.min(state.currentSlide + 1, Math.max(state.document.pages, 1))} von{" "}
        {Math.max(state.document.pages, 1)}
      </p>
      {chrome.menuAt && (
        <ContextMenu
          x={chrome.menuAt.x}
          y={chrome.menuAt.y}
          label="Kontextmenü"
          groups={slideContextMenu(context, chrome.menuAt.area)}
          onClose={chrome.closeMenu}
        />
      )}
    </div>
  );
};
