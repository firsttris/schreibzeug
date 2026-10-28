import type { ReviewCommands, Revision, RevisionKind } from "@schreibzeug/editor-core";
import { Check, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { initialsOf } from "../account/initials";
import { m } from "../paraglide/messages";
import { getLocale } from "../paraglide/runtime";
import { Button } from "../ui/button";

const KIND_LABELS: Record<RevisionKind, () => string> = {
  insert: m.revision_balloon_inserted,
  delete: m.revision_balloon_deleted,
  paragraphInsert: m.revision_balloon_paragraph_inserted,
  paragraphDelete: m.revision_balloon_paragraph_deleted,
  format: m.revision_balloon_formatted,
  other: m.revision_balloon_changed,
};

const formatTime = (time: number) =>
  new Date(time).toLocaleString(getLocale(), { dateStyle: "short", timeStyle: "short" });

/** Long inserted or deleted text is cut, as web-apps' balloon shows only the start. */
const MAX_TEXT = 120;
const shorten = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)} …` : text);

type RevisionBalloonProps = {
  revisions: Revision[];
  /** Where the first change is, in the window. */
  x: number;
  y: number;
  commands: ReviewCommands;
};

/**
 * The tracked change at the cursor with who made it and when, and the buttons to accept or reject
 * it, next to the text as web-apps' review balloon (common/main ReviewChanges.js onApiShowChange).
 */
export const RevisionBalloon = ({ revisions, x, y, commands }: RevisionBalloonProps) => {
  const ref = useRef<HTMLElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });
  // The engine puts it beside the page's right edge; in a narrow window it moves in over the page.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const margin = 8;
    setPlace({
      left: Math.max(margin, Math.min(x, window.innerWidth - box.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - box.height - margin)),
    });
  }, [x, y]);
  return (
    <section
      ref={ref}
      aria-label={m.revision_balloon_label()}
      style={{ left: place.left, top: place.top }}
      className="fixed z-20 flex w-72 flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm shadow-lg"
    >
      {revisions.map((revision, index) => (
        // A change has no id of its own; the list at the cursor does not change while it is shown.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <div key={index} className="flex gap-2">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-xs font-semibold"
          >
            {initialsOf(revision.author)}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium">{revision.author}</span>
            {revision.time !== null && (
              <span className="text-xs text-[var(--muted-foreground)]">{formatTime(revision.time)}</span>
            )}
            <span data-testid="revision-text" className="mt-1 break-words">
              <b>{KIND_LABELS[revision.kind]()}</b>
              {revision.text && m.revision_balloon_quoted({ text: shorten(revision.text) })}
            </span>
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          aria-label={m.revision_balloon_accept_label()}
          title={m.revision_balloon_accept()}
          onClick={commands.accept}
        >
          <Check size={16} />
        </Button>
        <Button
          variant="ghost"
          aria-label={m.revision_balloon_reject_label()}
          title={m.revision_balloon_reject()}
          onClick={commands.reject}
        >
          <X size={16} />
        </Button>
      </div>
    </section>
  );
};
