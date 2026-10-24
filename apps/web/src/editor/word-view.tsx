import { initialEditorState, openWordDocument } from "@stapel/editor-core";
import { MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CommentsPanel } from "../comments/comments-panel";
import { Toolbar } from "../toolbar/toolbar";
import { Button } from "../ui/button";
import { EditorHeader } from "./editor-header";
import { downloadBytes, fileNameFor, MIME } from "./opened-file";
import type { EditorViewProps } from "./props";
import { useDocumentSave } from "./use-document-save";
import { useEngineEditor } from "./use-engine-editor";

/** A text document: the toolbar above the page, comments beside it. */
export const WordView = ({ file, onClose, onSave, onShowVersions }: EditorViewProps) => {
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
  const openComments = state.comments.filter((comment) => !comment.resolved).length;

  // The engine measures its frame only on resize; the panel takes width from it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the panel opens or closes
  useEffect(() => {
    editor?.resize();
  }, [editor, comments === "closed"]);

  const download = async () => {
    if (editor) downloadBytes((await editor.save()).bytes, fileNameFor(file.name, "docx"), MIME.docx);
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        name={file.name}
        format="docx"
        state={state}
        failure={failure}
        saving={saving}
        ready={editor !== null}
        readOnly={file.readOnly}
        onClose={onClose}
        onDownload={download}
        onShowVersions={onShowVersions}
        actions={
          <Button
            variant="toggle"
            aria-label="Kommentare"
            aria-pressed={comments !== "closed"}
            disabled={!editor}
            onClick={() => setComments(comments === "closed" ? "open" : "closed")}
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
        <div ref={container} className="min-w-0 flex-1 bg-[var(--muted)]" />
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
    </div>
  );
};
