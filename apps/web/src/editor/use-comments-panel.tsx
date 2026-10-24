import type { Comment, CommentCommands } from "@schreibzeug/editor-core";
import { MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { CommentsPanel } from "../comments/comments-panel";
import { Button } from "../ui/button";

type CommentsSource = { comments: CommentCommands; resize: () => void };

type CommentsView = { comments: Comment[]; activeComments: string[] };

/**
 * The comments beside a document: the header button with the number of open comments, and the
 * panel, closed, open, or open with the field for a new comment. Someone who may only look reads
 * the comments without answering.
 */
export const useCommentsPanel = (
  editor: CommentsSource | null,
  state: CommentsView,
  readOnly: boolean,
  target: "selection" | "slide" | "cell" = "selection",
) => {
  const [mode, setMode] = useState<"closed" | "open" | "composing">("closed");
  const open = state.comments.filter((comment) => !comment.resolved).length;
  const toggle = () => setMode(mode === "closed" ? "open" : "closed");

  // The engine measures its frame only on resize; the panel takes width from it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the panel opens or closes
  useEffect(() => {
    editor?.resize();
  }, [editor, mode === "closed"]);

  const button = (
    <Button
      variant="toggle"
      aria-label="Kommentare"
      aria-pressed={mode !== "closed"}
      disabled={!editor}
      onClick={toggle}
    >
      <MessageSquare size={16} />
      {open > 0 && <span className="text-xs tabular-nums">{open}</span>}
    </Button>
  );

  const panel =
    mode === "closed" ? null : (
      <CommentsPanel
        comments={state.comments}
        active={state.activeComments}
        commands={readOnly ? null : (editor?.comments ?? null)}
        composing={mode === "composing"}
        target={target}
        onComposed={() => setMode("open")}
        onClose={() => setMode("closed")}
      />
    );

  return { isOpen: mode !== "closed", compose: () => setMode("composing"), toggle, button, panel };
};
