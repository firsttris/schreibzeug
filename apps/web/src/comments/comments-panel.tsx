import type { Comment, CommentCommands, CommentEntry } from "@stapel/editor-core";
import { Check, MessageSquare, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatChanged } from "../lib/format";
import { Button } from "../ui/button";

/** A text field with a send button; Ctrl/⌘+Enter sends, as in most comment boxes. */
const Composer = ({
  label,
  submit,
  onSubmit,
  autoFocus = false,
}: {
  label: string;
  submit: string;
  onSubmit: (text: string) => void;
  autoFocus?: boolean;
}) => {
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);
  const send = () => {
    if (!text.trim()) return;
    onSubmit(text);
    setText("");
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <textarea
        ref={field}
        aria-label={label}
        placeholder={label}
        value={text}
        rows={2}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) send();
        }}
        className="resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm outline-none focus:border-[var(--foreground)]"
      />
      <Button variant="primary" type="submit" disabled={!text.trim()} className="self-end">
        {submit}
      </Button>
    </form>
  );
};

const Entry = ({ entry }: { entry: CommentEntry }) => (
  <div className="flex flex-col gap-0.5">
    <div className="flex items-baseline justify-between gap-2">
      <span className="truncate text-sm font-medium">{entry.author || "Unbekannt"}</span>
      <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
        {entry.time ? formatChanged(new Date(entry.time).toISOString()) : ""}
      </span>
    </div>
    <p className="m-0 text-sm break-words whitespace-pre-wrap">{entry.text}</p>
  </div>
);

const CommentCard = ({
  comment,
  active,
  commands,
}: {
  comment: Comment;
  active: boolean;
  commands: CommentCommands;
}) => (
  <article
    aria-label={`Kommentar von ${comment.author || "Unbekannt"}`}
    data-active={active}
    data-resolved={comment.resolved}
    className={`flex flex-col gap-3 rounded-lg border p-3 ${active ? "border-[var(--docx)] shadow-sm" : "border-[var(--border)]"} ${comment.resolved ? "opacity-60" : ""}`}
  >
    {comment.quote && (
      <button
        type="button"
        onClick={() => commands.select(comment.id)}
        className="truncate border-l-2 border-[var(--docx)] pl-2 text-left text-xs text-[var(--muted-foreground)] italic hover:text-[var(--foreground)]"
      >
        {comment.quote}
      </button>
    )}
    <Entry entry={comment} />
    {comment.replies.map((reply) => (
      <div key={`${reply.time}-${reply.authorId}`} className="border-l border-[var(--border)] pl-3">
        <Entry entry={reply} />
      </div>
    ))}
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        aria-label={comment.resolved ? "Wieder öffnen" : "Als erledigt markieren"}
        title={comment.resolved ? "Wieder öffnen" : "Erledigt"}
        onClick={() => commands.setResolved(comment.id, !comment.resolved)}
      >
        {comment.resolved ? <RotateCcw size={15} /> : <Check size={15} />}
      </Button>
      <Button
        variant="ghost"
        aria-label="Kommentar löschen"
        title="Löschen"
        onClick={() => commands.remove(comment.id)}
      >
        <Trash2 size={15} />
      </Button>
    </div>
    {!comment.resolved && (
      <Composer label="Antworten" submit="Antworten" onSubmit={(text) => commands.reply(comment.id, text)} />
    )}
  </article>
);

const COMPOSE_LABELS = {
  selection: "Kommentar zur Auswahl",
  slide: "Kommentar zur Folie",
  cell: "Kommentar zur Zelle",
} as const;

export type CommentsPanelProps = {
  comments: Comment[];
  active: string[];
  commands: CommentCommands | null;
  /** Show the field for a new comment on the selection, focused. */
  composing: boolean;
  /** What a new comment is on: the selected text, the current slide, or the active cell. */
  target?: "selection" | "slide" | "cell";
  onComposed: () => void;
  onClose: () => void;
};

/** The comments of the document beside it, open ones first; the ones at the cursor are marked. */
export const CommentsPanel = ({
  comments,
  active,
  commands,
  composing,
  target = "selection",
  onComposed,
  onClose,
}: CommentsPanelProps) => {
  const ordered = [
    ...comments.filter((comment) => !comment.resolved),
    ...comments.filter((comment) => comment.resolved),
  ];
  return (
    <aside
      aria-label="Kommentare"
      className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-[var(--border)] bg-[var(--background)] p-3"
    >
      <header className="flex items-center justify-between">
        <h2 className="m-0 text-sm font-semibold">Kommentare</h2>
        <Button variant="ghost" aria-label="Kommentare schließen" onClick={onClose}>
          <X size={16} />
        </Button>
      </header>
      {composing && commands && (
        <div className="rounded-lg border border-[var(--docx)] p-3">
          <Composer
            label={COMPOSE_LABELS[target]}
            submit="Kommentieren"
            autoFocus
            onSubmit={(text) => {
              commands.add(text);
              onComposed();
            }}
          />
        </div>
      )}
      {ordered.length === 0 && !composing && (
        <p className="m-0 flex flex-col items-center gap-2 py-10 text-center text-sm text-[var(--muted-foreground)]">
          <MessageSquare size={20} aria-hidden />
          Noch keine Kommentare. Markiere Text und wähle „Kommentar hinzufügen“.
        </p>
      )}
      {commands &&
        ordered.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            active={active.includes(comment.id)}
            commands={commands}
          />
        ))}
    </aside>
  );
};
